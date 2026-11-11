import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { token } = body;

    const trimmedToken = (token || '').trim();
    if (!trimmedToken) {
      return NextResponse.json(
        { success: false, error: 'QR token is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. Try atomic RPC first
    const { data: rpcData, error: rpcErr } = await supabase.rpc('resolve_table_qr', {
      p_public_identifier: trimmedToken,
    });

    if (!rpcErr && rpcData && rpcData.length > 0) {
      const row = rpcData[0];
      return NextResponse.json({
        success: true,
        table: {
          tableId: row.table_id,
          tableNumber: row.table_number,
          tableName: row.table_name,
          seatingCapacity: row.seating_capacity,
          restaurantId: row.restaurant_id,
          restaurantName: row.restaurant_name,
          restaurantSlug: row.restaurant_slug,
          restaurantStatus: row.restaurant_status || 'active',
          activeSessionId: row.active_session_id || null,
          sessionStatus: row.session_status || null,
        },
      });
    }

    // 2. Query table_qr_codes joining restaurant_tables and restaurants
    const { data: qrRecord, error: qrErr } = await supabase
      .from('table_qr_codes')
      .select('*, restaurant_tables(*), restaurants(*)')
      .eq('public_identifier', trimmedToken)
      .maybeSingle();

    if (qrErr || !qrRecord) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code. Table or restaurant could not be resolved.' },
        { status: 404 }
      );
    }

    // 3. Validation checks
    if (!qrRecord.is_active || qrRecord.revoked_at) {
      return NextResponse.json(
        { success: false, error: 'This QR code has been revoked or deactivated.' },
        { status: 403 }
      );
    }

    if (qrRecord.expires_at && new Date(qrRecord.expires_at) < new Date()) {
      return NextResponse.json(
        { success: false, error: 'This QR code has expired.' },
        { status: 410 }
      );
    }

    const table = qrRecord.restaurant_tables;
    const restaurant = qrRecord.restaurants;

    if (!table || !table.is_active) {
      return NextResponse.json(
        { success: false, error: 'This table is currently inactive or out of service.' },
        { status: 403 }
      );
    }

    if (!restaurant || restaurant.status !== 'active') {
      return NextResponse.json(
        { success: false, error: `Restaurant is currently ${restaurant?.status || 'inactive'}.` },
        { status: 403 }
      );
    }

    // 4. Check for active session
    let activeSessionId: string | null = null;
    let sessionStatus: string | null = null;

    try {
      const { data: activeSession } = await supabase
        .from('table_sessions')
        .select('id, status')
        .eq('table_id', table.id)
        .in('status', ['occupied', 'payment_pending'])
        .maybeSingle();

      if (activeSession) {
        activeSessionId = activeSession.id;
        sessionStatus = activeSession.status;
      }
    } catch {
      // Non-blocking
    }

    return NextResponse.json({
      success: true,
      table: {
        tableId: table.id,
        tableNumber: table.table_number,
        tableName: table.table_name,
        seatingCapacity: table.seating_capacity,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        restaurantStatus: restaurant.status,
        activeSessionId,
        sessionStatus,
      },
    });
  } catch (err: any) {
    console.error('API /api/qr/resolve error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while resolving QR code.' },
      { status: 500 }
    );
  }
}
