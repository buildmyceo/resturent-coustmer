import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyRazorpayWebhookSignature } from '@/lib/razorpay';
import { finalizeVerifiedPayment } from '@/lib/payment-finalization';

export async function POST(req: NextRequest) {
  const admin = createAdminClient();
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';

    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const event = payload?.event;
    const payment = payload?.payload?.payment?.entity;
    const refund = payload?.payload?.refund?.entity;
    const entityId = payment?.id || refund?.id || payload?.payload?.order?.entity?.id || Date.now().toString();
    const eventId = req.headers.get('x-razorpay-event-id') || `${event}:${entityId}`;

    const purpose = payment?.notes?.purpose;
    if (purpose === 'credit_purchase') {
      return NextResponse.json({ received: true, ignored: true, reason: 'SaaS credit_purchase' });
    }

    // DB-backed idempotency
    const { error: insertErr } = await admin.from('webhook_events').insert({
      event_id: eventId,
      provider: 'razorpay',
      event_type: event || 'unknown',
      razorpay_order_id: payment?.order_id || null,
      razorpay_payment_id: payment?.id || null,
      status: 'processing',
      payload,
    });

    if (insertErr && insertErr.code === '23505') {
      return NextResponse.json({ received: true, deduplicated: true });
    }

    if ((event === 'payment.captured' || event === 'order.paid') && payment) {
      const notes = payment.notes || {};
      const resolvedPurpose = notes.purpose as 'order' | 'session_bill' | 'table_booking';
      if (resolvedPurpose && notes.restaurant_id) {
        await finalizeVerifiedPayment({
          purpose: resolvedPurpose,
          restaurantId: notes.restaurant_id,
          razorpayOrderId: payment.order_id,
          razorpayPaymentId: payment.id,
          amountPaise: Number(payment.amount),
          orderId: notes.order_id || null,
          sessionId: notes.session_id || null,
          bookingId: notes.booking_id || null,
        });
      }
    } else if (event === 'payment.failed' && payment?.order_id) {
      await admin.from('payments').update({ status: 'failed' }).eq('gateway_order_id', payment.order_id);
      await admin
        .from('orders')
        .update({ payment_status: 'failed' })
        .eq('razorpay_order_id', payment.order_id)
        .eq('status', 'pending_payment');
      await admin
        .from('table_bookings')
        .update({ payment_status: 'failed' })
        .eq('razorpay_order_id', payment.order_id)
        .eq('status', 'pending_payment');
    } else if (event === 'refund.processed' && refund?.payment_id) {
      await admin
        .from('payments')
        .update({
          status: 'refunded',
          refund_id: refund.id,
          refunded_amount: Number((Number(refund.amount || 0) / 100).toFixed(2)),
        })
        .eq('gateway_payment_id', refund.payment_id);
    }

    await admin
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString() })
      .eq('event_id', eventId);

    return NextResponse.json({ received: true });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Webhook error' }, { status: 500 });
  }
}
