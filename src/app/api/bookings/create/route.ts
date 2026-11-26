import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRazorpayOrder, buildRouteTransfers } from '@/lib/razorpay';
import { isValidPhone, isValidEmail, normalizePhone, normalizeEmail } from '@/lib/validation/customer';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      restaurantId,
      bookingDate,
      slotStartAt,
      partySize,
      tableId,
      customerName,
      customerPhone,
      customerEmail,
      specialRequests,
      guestToken,
    } = body;

    if (!restaurantId || !bookingDate || !slotStartAt || !partySize) {
      return NextResponse.json({ success: false, error: 'Missing required booking fields' }, { status: 400 });
    }

    if (!customerName || !String(customerName).trim()) {
      return NextResponse.json({ success: false, error: 'Customer name is required' }, { status: 400 });
    }
    if (!isValidPhone(customerPhone)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid 10–15 digit phone number' }, { status: 400 });
    }
    if (!isValidEmail(customerEmail)) {
      return NextResponse.json({ success: false, error: 'Please enter a valid email address' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: enabled } = await admin.rpc('is_restaurant_ordering_enabled', {
      p_restaurant_id: restaurantId,
    });
    if (!enabled) {
      return NextResponse.json(
        { success: false, error: 'Restaurant is currently not accepting online bookings.' },
        { status: 403 }
      );
    }

    const normPhone = normalizePhone(customerPhone);
    const normEmail = normalizeEmail(customerEmail);

    const { data: holdRes, error: holdErr } = await admin.rpc('create_booking_hold', {
      p_restaurant_id: restaurantId,
      p_booking_date: bookingDate,
      p_slot_start_at: slotStartAt,
      p_party_size: Number(partySize),
      p_customer_name: String(customerName).trim(),
      p_customer_phone: normPhone,
      p_customer_email: normEmail,
      p_table_id: tableId || null,
      p_special_requests: specialRequests || null,
      p_guest_token: guestToken || null,
    });

    if (holdErr || !holdRes?.success) {
      return NextResponse.json(
        { success: false, error: holdErr?.message || holdRes?.error || 'Slot unavailable' },
        { status: 409 }
      );
    }

    const feeAmount = Number(holdRes.booking_fee_amount || 0);
    if (feeAmount > 0) {
      const { data: settings } = await admin
        .from('restaurant_settings')
        .select('razorpay_settlement_mode, razorpay_linked_account_id, platform_commission_bps')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      const amountPaise = Math.round(feeAmount * 100);
      const transfers = buildRouteTransfers({
        settlementMode: settings?.razorpay_settlement_mode,
        linkedAccountId: settings?.razorpay_linked_account_id,
        commissionBps: settings?.platform_commission_bps,
        amountPaise,
        restaurantId,
        entityId: holdRes.booking_id,
        onHold: true,
      });

      const { order: rzpOrder, keyId } = await createRazorpayOrder({
        amountPaise,
        currency: 'INR',
        receipt: holdRes.booking_code,
        notes: {
          purpose: 'table_booking',
          booking_id: holdRes.booking_id,
          restaurant_id: restaurantId,
        },
        transfers,
      });

      await admin
        .from('table_bookings')
        .update({ razorpay_order_id: rzpOrder.id })
        .eq('id', holdRes.booking_id);

      return NextResponse.json({
        success: true,
        requiresPayment: true,
        booking: holdRes,
        razorpay: {
          keyId,
          orderId: rzpOrder.id,
          amountPaise,
          currency: 'INR',
        },
      });
    }

    try {
      const ch = admin.channel(`restaurant:${restaurantId}`);
      await ch.subscribe();
      await ch.send({ type: 'broadcast', event: 'BOOKING_CREATED', payload: holdRes });
      admin.removeChannel(ch);
    } catch {}

    return NextResponse.json({
      success: true,
      requiresPayment: false,
      booking: holdRes,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Booking failed' }, { status: 500 });
  }
}
