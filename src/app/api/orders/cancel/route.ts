import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refundRazorpayPayment } from '@/lib/razorpay';

const APPROVED_STATUSES = [
  'accepted',
  'accepted_by_kitchen',
  'preparing',
  'ready',
  'served',
  'completed',
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orderId, guestToken, reason } = body;

    if (!orderId) {
      return NextResponse.json({ success: false, error: 'Missing orderId' }, { status: 400 });
    }

    const token = guestToken || req.cookies.get('zovo_guest_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: 'Unauthorized: guest token required' }, { status: 401 });
    }

    const admin = createAdminClient();
    const { data: order } = await admin
      .from('orders')
      .select('id, restaurant_id, table_session_id, status, payment_status, razorpay_payment_id, total_amount, guest_token')
      .eq('id', orderId)
      .maybeSingle();

    if (!order) {
      return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
    }

    let authorized = order.guest_token === token;
    if (!authorized && order.table_session_id) {
      const { data: part } = await admin
        .from('session_participants')
        .select('id')
        .eq('session_id', order.table_session_id)
        .eq('guest_token', token)
        .maybeSingle();
      authorized = Boolean(part);
    }

    if (!authorized) {
      return NextResponse.json({ success: false, error: 'Forbidden: you do not own this order' }, { status: 403 });
    }

    if (APPROVED_STATUSES.includes(order.status)) {
      return NextResponse.json(
        { success: false, error: 'Order has already been accepted by the restaurant and cannot be cancelled.' },
        { status: 403 }
      );
    }

    let nextPaymentStatus = order.payment_status;

    if (order.payment_status === 'paid' && order.razorpay_payment_id) {
      const { data: settings } = await admin
        .from('restaurant_settings')
        .select('razorpay_settlement_mode')
        .eq('restaurant_id', order.restaurant_id)
        .maybeSingle();

      const refundRes = await refundRazorpayPayment({
        paymentId: order.razorpay_payment_id,
        reason: reason || 'Customer cancelled before preparation',
        reverseAll: settings?.razorpay_settlement_mode === 'platform_route',
      });

      await admin
        .from('payments')
        .update({
          status: 'refunded',
          refund_id: refundRes.id,
          refunded_amount: order.total_amount,
        })
        .eq('gateway_payment_id', order.razorpay_payment_id);

      nextPaymentStatus = 'refunded';
    }

    const nowIso = new Date().toISOString();
    await admin
      .from('orders')
      .update({
        status: 'cancelled',
        payment_status: nextPaymentStatus,
        updated_at: nowIso,
      })
      .eq('id', orderId);

    await admin
      .from('order_items')
      .update({ status: 'cancelled' })
      .eq('order_id', orderId);

    try {
      const ch = admin.channel(`restaurant:${order.restaurant_id}`);
      await ch.subscribe();
      await ch.send({
        type: 'broadcast',
        event: 'ORDER_UPDATED',
        payload: { id: orderId, status: 'cancelled', payment_status: nextPaymentStatus },
      });
      admin.removeChannel(ch);
    } catch {}

    return NextResponse.json({
      success: true,
      status: 'cancelled',
      paymentStatus: nextPaymentStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Cancel failed' }, { status: 500 });
  }
}
