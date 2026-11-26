import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRazorpayOrder, buildRouteTransfers } from '@/lib/razorpay';
import { isValidPhone, isValidEmail } from '@/lib/validation/customer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      purpose = 'session_bill',
      restaurantId,
      sessionId,
      tableId,
      orderId,
      bookingId,
      customerDetails,
    } = body;

    if (!restaurantId) {
      return NextResponse.json({ success: false, error: 'Missing restaurantId' }, { status: 400 });
    }

    if (customerDetails) {
      if (customerDetails.phone && !isValidPhone(customerDetails.phone)) {
        return NextResponse.json({ success: false, error: 'Invalid customer phone number' }, { status: 400 });
      }
      if (customerDetails.email && !isValidEmail(customerDetails.email)) {
        return NextResponse.json({ success: false, error: 'Invalid customer email address' }, { status: 400 });
      }
    }

    const admin = createAdminClient();
    const { data: settings } = await admin
      .from('restaurant_settings')
      .select('razorpay_settlement_mode, razorpay_linked_account_id, platform_commission_bps')
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    let payableAmount = 0;
    let entityId = '';
    let receipt = '';
    const notes: Record<string, string> = {
      purpose,
      restaurant_id: restaurantId,
    };

    if (purpose === 'session_bill') {
      if (!sessionId) {
        return NextResponse.json({ success: false, error: 'Missing sessionId' }, { status: 400 });
      }
      const [{ data: sessionRow }, { data: sessionOrders }] = await Promise.all([
        admin.from('table_sessions').select('id, booking_fee_credit').eq('id', sessionId).maybeSingle(),
        admin
          .from('orders')
          .select('id, total_amount, status')
          .eq('table_session_id', sessionId)
          .neq('status', 'cancelled')
          .neq('status', 'rejected'),
      ]);

      const orderIds = (sessionOrders || []).map((o: any) => o.id);
      const effectiveTotal = (sessionOrders || []).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);

      let paidSum = 0;
      if (orderIds.length > 0) {
        const { data: payments } = await admin
          .from('payments')
          .select('amount, status, session_id, order_id')
          .in('status', ['completed', 'successful'])
          .or(`session_id.eq.${sessionId},order_id.in.(${orderIds.join(',')})`);
        paidSum = (payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      } else {
        const { data: payments } = await admin
          .from('payments')
          .select('amount, status')
          .eq('session_id', sessionId)
          .in('status', ['completed', 'successful']);
        paidSum = (payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      }

      const totalCreditedAndPaid = Number(sessionRow?.booking_fee_credit || 0) + paidSum;
      payableAmount = Math.max(0, Number((effectiveTotal - totalCreditedAndPaid).toFixed(2)));

      if (payableAmount === 0) {
        return NextResponse.json({
          success: true,
          zeroBalanceDue: true,
          payableAmount: 0,
        });
      }

      entityId = sessionId;
      receipt = `sess_${sessionId.slice(0, 12)}`;
      notes.session_id = sessionId;
    } else if (purpose === 'order') {
      if (!orderId) {
        return NextResponse.json({ success: false, error: 'Missing orderId' }, { status: 400 });
      }
      const { data: ord } = await admin
        .from('orders')
        .select('id, order_number, total_amount, payment_status')
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      if (!ord) {
        return NextResponse.json({ success: false, error: 'Order not found' }, { status: 404 });
      }
      if (ord.payment_status === 'paid') {
        return NextResponse.json({ success: false, error: 'Order is already paid' }, { status: 400 });
      }
      payableAmount = Number(ord.total_amount || 0);
      entityId = orderId;
      receipt = ord.order_number || `ord_${orderId.slice(0, 10)}`;
      notes.order_id = orderId;
    } else if (purpose === 'table_booking') {
      if (!bookingId) {
        return NextResponse.json({ success: false, error: 'Missing bookingId' }, { status: 400 });
      }
      const { data: bk } = await admin
        .from('table_bookings')
        .select('id, booking_code, booking_fee_amount, payment_status')
        .eq('id', bookingId)
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      if (!bk) {
        return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
      }
      payableAmount = Number(bk.booking_fee_amount || 0);
      entityId = bookingId;
      receipt = bk.booking_code || `bk_${bookingId.slice(0, 10)}`;
      notes.booking_id = bookingId;
    } else {
      return NextResponse.json({ success: false, error: 'Invalid payment purpose' }, { status: 400 });
    }

    const amountPaise = Math.round(payableAmount * 100);
    if (amountPaise < 100) {
      return NextResponse.json({ success: false, error: 'Payable amount must be at least ₹1.00' }, { status: 400 });
    }

    const transfers = buildRouteTransfers({
      settlementMode: settings?.razorpay_settlement_mode,
      linkedAccountId: settings?.razorpay_linked_account_id,
      commissionBps: settings?.platform_commission_bps,
      amountPaise,
      restaurantId,
      entityId,
      onHold: purpose === 'table_booking',
    });

    const { order: rzpOrder, keyId } = await createRazorpayOrder({
      amountPaise,
      currency: 'INR',
      receipt,
      notes,
      transfers,
    });

    await admin.from('payments').insert({
      restaurant_id: restaurantId,
      session_id: purpose === 'session_bill' ? sessionId : null,
      table_id: tableId || null,
      order_id: purpose === 'order' ? orderId : null,
      booking_id: purpose === 'table_booking' ? bookingId : null,
      payment_purpose: purpose,
      amount: payableAmount,
      currency: 'INR',
      payment_method: 'razorpay',
      status: 'pending',
      gateway_order_id: rzpOrder.id,
    });

    return NextResponse.json({
      success: true,
      gatewayOrderId: rzpOrder.id,
      keyId,
      amountPaise,
      currency: 'INR',
      payableAmount,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Failed to create payment intent' }, { status: 500 });
  }
}
