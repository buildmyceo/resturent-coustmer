import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(req: NextRequest) {
  try {
    const restaurantId = req.nextUrl.searchParams.get('restaurantId');
    const date = req.nextUrl.searchParams.get('date');
    const partySize = Number(req.nextUrl.searchParams.get('partySize') || 2);

    if (!restaurantId || !date) {
      return NextResponse.json({ success: false, error: 'Missing restaurantId or date' }, { status: 400 });
    }

    const admin = createAdminClient();
    await admin.rpc('expire_stale_booking_holds', { p_restaurant_id: restaurantId });

    const [{ data: settings }, { data: tables }, { data: existingBookings }, { data: activeSessions }] =
      await Promise.all([
        admin.from('restaurant_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
        admin
          .from('restaurant_tables')
          .select('id, table_number, table_name, seating_capacity')
          .eq('restaurant_id', restaurantId)
          .eq('is_active', true)
          .gte('seating_capacity', partySize)
          .order('seating_capacity', { ascending: true }),
        admin
          .from('table_bookings')
          .select('table_id, slot_start_at, buffered_end_at')
          .eq('restaurant_id', restaurantId)
          .in('status', ['pending_payment', 'confirmed', 'checked_in'])
          .gte('booking_date', date),
        admin
          .from('table_sessions')
          .select('table_id')
          .eq('restaurant_id', restaurantId)
          .in('status', ['occupied', 'payment_pending']),
      ]);

    if (!settings?.booking_enabled) {
      return NextResponse.json({ success: true, bookingEnabled: false, slots: [] });
    }

    const slotDuration = Number(settings.booking_slot_duration_mins || 90);
    const bufferMins = Number(settings.booking_buffer_mins || 15);
    const minNoticeMs = Number(settings.booking_min_notice_mins || 60) * 60 * 1000;
    const now = Date.now();
    const isToday = new Date().toISOString().slice(0, 10) === date;

    const occupiedTableIds = new Set((activeSessions || []).map((s: any) => s.table_id));
    const slots: any[] = [];

    // Generate 30-min slots from 11:00 to 22:00 local-day baseline
    for (let hour = 11; hour <= 22; hour++) {
      for (const min of [0, 30]) {
        const hh = String(hour).padStart(2, '0');
        const mm = String(min).padStart(2, '0');
        const slotStart = new Date(`${date}T${hh}:${mm}:00+05:30`);
        if (isNaN(slotStart.getTime())) continue;
        if (slotStart.getTime() < now + minNoticeMs) continue;

        const slotEnd = new Date(slotStart.getTime() + slotDuration * 60 * 1000);
        const bufferedEnd = new Date(slotEnd.getTime() + bufferMins * 60 * 1000);

        const availableTables = (tables || []).filter((t: any) => {
          const hasBookingConflict = (existingBookings || []).some((b: any) => {
            if (b.table_id !== t.id) return false;
            const bStart = new Date(b.slot_start_at).getTime();
            const bEnd = new Date(b.buffered_end_at).getTime();
            return bStart < bufferedEnd.getTime() && bEnd > slotStart.getTime();
          });
          if (hasBookingConflict) return false;

          if (isToday && slotStart.getTime() <= now + 2 * 60 * 60 * 1000 && occupiedTableIds.has(t.id)) {
            return false;
          }
          return true;
        });

        slots.push({
          slotStartAt: slotStart.toISOString(),
          slotEndAt: slotEnd.toISOString(),
          label: slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
          available: availableTables.length > 0,
          availableTables: availableTables.map((t: any) => ({
            id: t.id,
            tableNumber: t.table_number,
            tableName: t.table_name,
            seatingCapacity: t.seating_capacity,
          })),
        });
      }
    }

    return NextResponse.json({
      success: true,
      bookingEnabled: true,
      bookingFeeAmount: Number(settings.booking_fee_amount || 0),
      bookingFeeCreditToBill: settings.booking_fee_credit_to_bill ?? true,
      allowTableSelection: settings.booking_allow_table_selection ?? true,
      slotDurationMins: slotDuration,
      cancelCutoffMins: Number(settings.booking_cancel_cutoff_mins || 120),
      slots,
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Server error' }, { status: 500 });
  }
}
