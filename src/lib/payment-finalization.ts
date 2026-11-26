import { createAdminClient } from '@/lib/supabase/admin';
import { refundRazorpayPayment } from '@/lib/razorpay';

export interface FinalizePaymentInput {
  purpose: 'order' | 'session_bill' | 'table_booking';
  restaurantId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature?: string;
  amountPaise: number;
  orderId?: string | null;
  sessionId?: string | null;
  bookingId?: string | null;
  customerDetails?: {
    name?: string;
    phone?: string;
    email?: string;
  };
}

export async function finalizeVerifiedPayment(input: FinalizePaymentInput) {
  const admin = createAdminClient();
  const nowIso = new Date().toISOString();
  const amountInr = Number((input.amountPaise / 100).toFixed(2));

  const { data: settings } = await admin
    .from('restaurant_settings')
    .select('pay_first_enabled, razorpay_settlement_mode')
    .eq('restaurant_id', input.restaurantId)
    .maybeSingle();

  const isRoute = settings?.razorpay_settlement_mode === 'platform_route';

  // 1. TABLE BOOKING
  if (input.purpose === 'table_booking' && input.bookingId) {
    const { data: booking } = await admin
      .from('table_bookings')
      .select('*')
      .eq('id', input.bookingId)
      .maybeSingle();

    if (!booking) {
      return { success: false, error: 'Booking not found' };
    }
    if (booking.status === 'confirmed' && booking.payment_status === 'paid') {
      return { success: true, alreadyFinalized: true, booking };
    }

    const { data: updatedBooking, error: updErr } = await admin
      .from('table_bookings')
      .update({
        status: 'confirmed',
        payment_status: 'paid',
        razorpay_order_id: input.razorpayOrderId,
        razorpay_payment_id: input.razorpayPaymentId,
        hold_expires_at: null,
        updated_at: nowIso,
      })
      .eq('id', input.bookingId)
      .select()
      .maybeSingle();

    if (updErr) {
      // Expired hold race (23P01 exclusion_violation): auto-refund
      if (updErr.code === '23P01') {
        try {
          const refundRes = await refundRazorpayPayment({
            paymentId: input.razorpayPaymentId,
            reason: 'Table slot expired before payment capture',
            reverseAll: isRoute,
          });
          await admin
            .from('table_bookings')
            .update({
              status: 'refunded',
              payment_status: 'refunded',
              razorpay_payment_id: input.razorpayPaymentId,
              updated_at: nowIso,
            })
            .eq('id', input.bookingId);
          await admin.from('payments').upsert(
            {
              restaurant_id: input.restaurantId,
              booking_id: input.bookingId,
              payment_purpose: 'table_booking',
              amount: amountInr,
              payment_method: 'razorpay',
              status: 'refunded',
              gateway_order_id: input.razorpayOrderId,
              gateway_payment_id: input.razorpayPaymentId,
              gateway_signature: input.razorpaySignature || null,
              refund_id: refundRes.id,
              refunded_amount: amountInr,
            },
            { onConflict: 'gateway_payment_id' }
          );
        } catch {}
        return { success: true, refundedDueToExpiredHold: true };
      }
      return { success: false, error: updErr.message };
    }

    await admin.from('payments').upsert(
      {
        restaurant_id: input.restaurantId,
        booking_id: input.bookingId,
        payment_purpose: 'table_booking',
        amount: amountInr,
        payment_method: 'razorpay',
        status: 'completed',
        gateway_order_id: input.razorpayOrderId,
        gateway_payment_id: input.razorpayPaymentId,
        gateway_signature: input.razorpaySignature || null,
      },
      { onConflict: 'gateway_payment_id' }
    );

    try {
      const ch = admin.channel(`restaurant:${input.restaurantId}`);
      await ch.subscribe();
      await ch.send({
        type: 'broadcast',
        event: 'BOOKING_CREATED',
        payload: updatedBooking,
      });
      admin.removeChannel(ch);
    } catch {}

    return { success: true, booking: updatedBooking };
  }

  // 2. SINGLE ORDER (Delivery or Pay-First Dine-In)
  if (input.purpose === 'order' && input.orderId) {
    const { data: order } = await admin
      .from('orders')
      .select('*')
      .eq('id', input.orderId)
      .maybeSingle();

    if (!order) {
      return { success: false, error: 'Order not found' };
    }
    if (order.payment_status === 'paid') {
      return { success: true, alreadyFinalized: true, order };
    }

    const postPayStatus =
      order.order_type === 'dine_in' && !settings?.pay_first_enabled ? 'waiting_for_waiter' : 'pending';

    const { data: updatedOrder, error: ordErr } = await admin
      .from('orders')
      .update({
        payment_status: 'paid',
        payment_method: 'RAZORPAY',
        razorpay_order_id: input.razorpayOrderId,
        razorpay_payment_id: input.razorpayPaymentId,
        paid_at: nowIso,
        status: postPayStatus,
        delivery_status: order.order_type === 'delivery' ? 'pending' : null,
        updated_at: nowIso,
      })
      .eq('id', input.orderId)
      .neq('payment_status', 'paid')
      .select()
      .maybeSingle();

    if (ordErr) {
      return { success: false, error: ordErr.message };
    }

    await admin.from('payments').upsert(
      {
        restaurant_id: input.restaurantId,
        order_id: input.orderId,
        session_id: order.table_session_id || null,
        table_id: order.table_id || null,
        payment_purpose: 'order',
        amount: amountInr,
        payment_method: 'razorpay',
        status: 'completed',
        gateway_order_id: input.razorpayOrderId,
        gateway_payment_id: input.razorpayPaymentId,
        gateway_signature: input.razorpaySignature || null,
      },
      { onConflict: 'gateway_payment_id' }
    );

    const { data: invoice } = await admin
      .from('invoices')
      .insert({
        restaurant_id: input.restaurantId,
        session_id: order.table_session_id || null,
        order_id: order.id,
        order_type: order.order_type || 'dine_in',
        table_number: order.order_type === 'delivery' ? 'DELIVERY' : 'TABLE',
        subtotal: order.subtotal || 0,
        tax_amount: order.tax_amount || 0,
        service_fee: order.service_fee || 0,
        delivery_fee: order.delivery_fee || 0,
        delivery_address: order.delivery_address || null,
        discount_amount: order.discount_amount || 0,
        total_paid: amountInr,
        payment_method: 'razorpay',
        payment_reference: input.razorpayPaymentId,
      })
      .select('id')
      .maybeSingle();

    try {
      const ch = admin.channel(`restaurant:${input.restaurantId}`);
      await ch.subscribe();
      const payload = {
        ...updatedOrder,
        id: input.orderId,
        order_number: order.order_number,
        status: postPayStatus,
        payment_status: 'paid',
      };
      await ch.send({ type: 'broadcast', event: 'ORDER_CREATED', payload });
      await ch.send({ type: 'broadcast', event: 'new_order', payload });
      await ch.send({ type: 'broadcast', event: 'PAYMENT_VERIFIED', payload });
      admin.removeChannel(ch);
    } catch {}

    return { success: true, order: updatedOrder, invoiceId: invoice?.id || null };
  }

  // 3. SESSION BILL (Post-Meal Dine-In)
  if (input.purpose === 'session_bill' && input.sessionId) {
    const { data: sessionOrders } = await admin
      .from('orders')
      .select('id, total_amount, status, payment_status')
      .eq('table_session_id', input.sessionId)
      .neq('status', 'cancelled')
      .neq('status', 'rejected');

    const orderIds = (sessionOrders || []).map((o: any) => o.id);
    const effectiveTotal = (sessionOrders || []).reduce((sum: number, o: any) => sum + Number(o.total_amount || 0), 0);

    const { data: sessionRow } = await admin
      .from('table_sessions')
      .select('id, table_id, booking_fee_credit, restaurant_tables(table_number)')
      .eq('id', input.sessionId)
      .maybeSingle();

    await admin.from('payments').upsert(
      {
        restaurant_id: input.restaurantId,
        session_id: input.sessionId,
        table_id: sessionRow?.table_id || null,
        payment_purpose: 'session_bill',
        amount: amountInr,
        payment_method: 'razorpay',
        status: 'completed',
        gateway_order_id: input.razorpayOrderId,
        gateway_payment_id: input.razorpayPaymentId,
        gateway_signature: input.razorpaySignature || null,
      },
      { onConflict: 'gateway_payment_id' }
    );

    if (orderIds.length > 0) {
      await admin
        .from('orders')
        .update({
          payment_status: 'paid',
          status: 'completed',
          paid_at: nowIso,
          updated_at: nowIso,
        })
        .in('id', orderIds)
        .neq('payment_status', 'paid');
    }

    await admin
      .from('table_sessions')
      .update({
        status: 'completed',
        closed_at: nowIso,
        total_paid: effectiveTotal,
      })
      .eq('id', input.sessionId);

    const tableNum = (sessionRow as any)?.restaurant_tables?.table_number || 'TABLE';

    const { data: invoice } = await admin
      .from('invoices')
      .insert({
        restaurant_id: input.restaurantId,
        session_id: input.sessionId,
        order_type: 'dine_in',
        table_number: tableNum,
        subtotal: effectiveTotal,
        total_paid: amountInr,
        payment_method: 'razorpay',
        payment_reference: input.razorpayPaymentId,
      })
      .select('id')
      .maybeSingle();

    try {
      const ch = admin.channel(`restaurant:${input.restaurantId}`);
      await ch.subscribe();
      await ch.send({
        type: 'broadcast',
        event: 'BILL_SETTLED',
        payload: { sessionId: input.sessionId, invoiceId: invoice?.id || null },
      });
      await ch.send({
        type: 'broadcast',
        event: 'ORDER_UPDATED',
        payload: { sessionId: input.sessionId, status: 'completed', payment_status: 'paid' },
      });
      admin.removeChannel(ch);
    } catch {}

    return { success: true, invoiceId: invoice?.id || null };
  }

  return { success: false, error: 'Invalid payment purpose or missing entity ID' };
}
