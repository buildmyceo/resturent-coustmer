import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { refundRazorpayPayment } from '@/lib/razorpay';
import { normalizePhone } from '@/lib/validation/customer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bookingId, bookingCode, guestToken, customerPhone, reason } = body;

    if (!bookingId || !bookingCode) {
      return NextResponse.json({ success: false, error: 'Missing bookingId or bookingCode' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: booking } = await admin
      .from('table_bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('booking_code', bookingCode)
      .maybeSingle();

    if (!booking) {
      return NextResponse.json({ success: false, error: 'Booking not found' }, { status: 404 });
    }

    const tokenMatches = guestToken && booking.guest_token && guestToken === booking.guest_token;
    const phoneMatches = customerPhone && normalizePhone(customerPhone) === booking.customer_phone;
    if (!tokenMatches && !phoneMatches) {
      return NextResponse.json({ success: false, error: 'Unauthorized to cancel this booking' }, { status: 403 });
    }

    if (!['pending_payment', 'confirmed'].includes(booking.status)) {
      return NextResponse.json({ success: false, error: 'Booking cannot be cancelled now' }, { status: 400 });
    }

    const { data: settings } = await admin
      .from('restaurant_settings')
      .select('booking_cancel_cutoff_mins, razorpay_settlement_mode')
      .eq('restaurant_id', booking.restaurant_id)
      .maybeSingle();

    const cutoffMs = Number(settings?.booking_cancel_cutoff_mins ?? 120) * 60 * 1000;
    const slotMs = new Date(booking.slot_start_at).getTime();
    const eligibleForRefund = Date.now() <= slotMs - cutoffMs;

    let nextStatus = 'cancelled';
    let nextPaymentStatus = booking.payment_status;

    if (eligibleForRefund && booking.payment_status === 'paid' && booking.razorpay_payment_id) {
      const refundRes = await refundRazorpayPayment({
        paymentId: booking.razorpay_payment_id,
        reason: reason || 'Customer cancelled before cutoff',
        reverseAll: settings?.razorpay_settlement_mode === 'platform_route',
      });
      await admin
        .from('payments')
        .update({
          status: 'refunded',
          refund_id: refundRes.id,
          refunded_amount: booking.booking_fee_amount,
        })
        .eq('gateway_payment_id', booking.razorpay_payment_id);
      nextStatus = 'refunded';
      nextPaymentStatus = 'refunded';
    }

    await admin
      .from('table_bookings')
      .update({
        status: nextStatus,
        payment_status: nextPaymentStatus,
        cancelled_at: new Date().toISOString(),
        cancelled_by_role: 'customer',
        cancellation_reason: reason || 'Cancelled by guest',
      })
      .eq('id', bookingId);

    return NextResponse.json({
      success: true,
      status: nextStatus,
      refunded: nextStatus === 'refunded',
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Cancel failed' }, { status: 500 });
  }
}
