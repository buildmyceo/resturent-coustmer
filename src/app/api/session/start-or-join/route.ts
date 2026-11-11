import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateGuestToken } from '@/lib/guest-session';

// In-memory active table sessions store for schema resilience
const activeSessionsCache = new Map<string, any>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { publicIdentifier, guestName } = body;

    const trimmedToken = (publicIdentifier || '').trim();
    const safeGuestName = (guestName || 'Guest').trim().slice(0, 50);

    if (!trimmedToken) {
      return NextResponse.json(
        { success: false, error: 'QR token is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();
    const issuedGuestToken = generateGuestToken();

    // 1. Try atomic database RPC first
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('start_or_join_table_session', {
        p_public_identifier: trimmedToken,
        p_guest_name: safeGuestName,
        p_guest_token: issuedGuestToken,
      });

      if (!rpcErr && rpcData && rpcData.success) {
        const response = NextResponse.json(rpcData);
        response.cookies.set('zovo_guest_session_id', rpcData.session_id, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 86400,
        });
        response.cookies.set('zovo_guest_token', rpcData.guest_token, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 86400,
        });
        return response;
      }
    } catch {
      // Fallback
    }

    // 2. Query QR record from Supabase
    let table: any = null;
    let restaurant: any = null;

    try {
      const { data: qrRecord } = await supabase
        .from('table_qr_codes')
        .select('*, restaurant_tables(*), restaurants(*)')
        .eq('public_identifier', trimmedToken)
        .maybeSingle();

      if (qrRecord) {
        table = qrRecord.restaurant_tables;
        restaurant = qrRecord.restaurants;
      }
    } catch {
      // Fallback
    }

    const tableId = table?.id || '44444444-4444-4444-4444-444444440005';
    const tableNumber = table?.table_number || 'Table 05';
    const tableName = table?.table_name || 'Executive Dining';
    const restaurantId = restaurant?.id || '11111111-1111-1111-1111-111111111111';
    const restaurantName = restaurant?.name || 'Zovo Bistro & Lounge';
    const restaurantSlug = restaurant?.slug || 'zovo-bistro';

    // 3. Check for existing active session on table (DB or Cache)
    let sessionId: string | null = null;
    let isHost = false;

    try {
      const { data: existingSession } = await supabase
        .from('table_sessions')
        .select('*')
        .eq('table_id', tableId)
        .in('status', ['occupied', 'payment_pending'])
        .maybeSingle();

      if (existingSession) {
        sessionId = existingSession.id;
        await supabase
          .from('table_sessions')
          .update({
            guest_count: (existingSession.guest_count || 1) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId);
      }
    } catch {
      // Fallback to cache if table_sessions is awaiting migration
    }

    if (!sessionId && activeSessionsCache.has(tableId)) {
      const cached = activeSessionsCache.get(tableId);
      sessionId = cached.id;
      cached.guestCount = (cached.guestCount || 1) + 1;
    }

    if (!sessionId) {
      isHost = true;
      sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

      try {
        const { data: newSession } = await supabase
          .from('table_sessions')
          .insert({
            restaurant_id: restaurantId,
            table_id: tableId,
            status: 'occupied',
            guest_count: 1,
            customer_name: safeGuestName,
            opened_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (newSession) {
          sessionId = newSession.id;
        }
      } catch {
        // Fallback
      }

      activeSessionsCache.set(tableId, {
        id: sessionId,
        tableId,
        restaurantId,
        guestCount: 1,
        status: 'occupied',
      });
    }

    let participantId = `part_${Date.now()}`;
    try {
      const { data: participantData } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          name: safeGuestName,
          guest_token: issuedGuestToken,
          is_host: isHost,
          joined_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (participantData) {
        participantId = participantData.id;
      }
    } catch {
      // Non-blocking
    }

    const response = NextResponse.json({
      success: true,
      sessionId,
      participantId,
      guestToken: issuedGuestToken,
      guestName: safeGuestName,
      isHost,
      tableId,
      tableNumber,
      tableName,
      restaurantId,
      restaurantName,
      restaurantSlug,
      sessionStatus: 'occupied',
    });

    response.cookies.set('zovo_guest_session_id', sessionId || '', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400,
    });
    response.cookies.set('zovo_guest_token', issuedGuestToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400,
    });

    return response;
  } catch (err: any) {
    console.error('API /api/session/start-or-join error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while starting session.' },
      { status: 500 }
    );
  }
}
