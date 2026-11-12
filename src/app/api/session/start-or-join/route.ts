import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateGuestToken } from '@/lib/guest-session';

// In-memory active table sessions store for schema resilience
const activeSessionsCache = new Map<string, any>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { publicIdentifier, guestName, restaurantSlug, tableNumber, tableId: bodyTableId, restaurantId: bodyRestId } = body;

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
        const normalized = {
          ...rpcData,
          sessionId: rpcData.session_id || rpcData.sessionId,
          participantId: rpcData.participant_id || rpcData.participantId,
          guestToken: rpcData.guest_token || rpcData.guestToken,
          guestName: rpcData.guest_name || rpcData.guestName,
          isHost: rpcData.is_host ?? rpcData.isHost,
          tableId: rpcData.table_id || rpcData.tableId,
          tableNumber: rpcData.table_number || rpcData.tableNumber,
          tableName: rpcData.table_name || rpcData.tableName,
          restaurantId: rpcData.restaurant_id || rpcData.restaurantId,
          restaurantName: rpcData.restaurant_name || rpcData.restaurantName,
          restaurantSlug: rpcData.restaurant_slug || rpcData.restaurantSlug,
          sessionStatus: rpcData.session_status || rpcData.sessionStatus,
          initialClaimExpiresAt:
            rpcData.initial_claim_expires_at ??
            rpcData.initialClaimExpiresAt ??
            (rpcData.is_claim_permanent ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString()),
          isClaimPermanent: Boolean(rpcData.is_claim_permanent ?? rpcData.isClaimPermanent ?? false),
        };
        const response = NextResponse.json(normalized);
        response.cookies.set('zovo_guest_session_id', normalized.sessionId, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 86400,
        });
        response.cookies.set('zovo_guest_token', normalized.guestToken, {
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

    // Direct lookup by slug / tableId / restaurantId if table_qr_codes did not match
    if (!table || !restaurant) {
      try {
        if (bodyRestId) {
          const { data: r } = await supabase.from('restaurants').select('*').eq('id', bodyRestId).maybeSingle();
          if (r) restaurant = r;
        } else if (restaurantSlug) {
          const { data: rList } = await supabase.from('restaurants').select('*').or(`slug.ilike.${restaurantSlug},name.ilike.${restaurantSlug}`).limit(1);
          if (rList && rList.length > 0) restaurant = rList[0];
        }

        if (bodyTableId) {
          const { data: t } = await supabase.from('restaurant_tables').select('*').eq('id', bodyTableId).maybeSingle();
          if (t) table = t;
        } else if (restaurant && tableNumber) {
          const { data: tList } = await supabase.from('restaurant_tables').select('*').eq('restaurant_id', restaurant.id).or(`table_number.ilike.${tableNumber},table_number.ilike.T-${tableNumber},table_number.ilike.Table ${tableNumber}`).limit(1);
          if (tList && tList.length > 0) table = tList[0];
        }
      } catch {
        // Fallback
      }
    }

    const tableId = table?.id || bodyTableId || '44444444-4444-4444-4444-444444440005';
    const tableNum = table?.table_number || tableNumber || 'Table 01';
    const tableName = table?.table_name || `Table ${tableNum}`;
    const restaurantId = restaurant?.id || bodyRestId || '11111111-1111-1111-1111-111111111111';
    const restaurantName = restaurant?.name || (restaurantSlug ? restaurantSlug.charAt(0).toUpperCase() + restaurantSlug.slice(1) : 'ZOVO Restaurant');
    const restSlug = restaurant?.slug || restaurantSlug || 'restaurant';

    // 3. Check for existing active session on table (DB or Cache)
    let sessionId: string | null = null;
    let isHost = false;
    let initialClaimExpiresAt: string | null = null;
    let isClaimPermanent = false;

    try {
      const { data: existingSession } = await supabase
        .from('table_sessions')
        .select('*')
        .eq('table_id', tableId)
        .in('status', ['occupied', 'payment_pending'])
        .maybeSingle();

      if (existingSession) {
        // Enforce 15-minute expiration before first order
        const isExpired =
          !existingSession.is_claim_permanent &&
          existingSession.initial_claim_expires_at &&
          new Date(existingSession.initial_claim_expires_at).getTime() < Date.now();

        if (isExpired) {
          // Release table
          await supabase
            .from('table_sessions')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', existingSession.id);
          // New session will be created below
        } else {
          sessionId = existingSession.id;
          initialClaimExpiresAt =
            existingSession.initial_claim_expires_at ||
            (existingSession.is_claim_permanent ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString());
          isClaimPermanent = Boolean(existingSession.is_claim_permanent);

          await supabase
            .from('table_sessions')
            .update({
              guest_count: (existingSession.guest_count || 1) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq('id', sessionId);
        }
      }
    } catch {
      // Fallback to cache if table_sessions is awaiting migration
    }

    if (!sessionId && activeSessionsCache.has(tableId)) {
      const cached = activeSessionsCache.get(tableId);
      // Check cache 15-min expiration
      if (!cached.isClaimPermanent && cached.initialClaimExpiresAt && new Date(cached.initialClaimExpiresAt).getTime() < Date.now()) {
        activeSessionsCache.delete(tableId);
      } else {
        sessionId = cached.id;
        initialClaimExpiresAt = cached.initialClaimExpiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString();
        isClaimPermanent = Boolean(cached.isClaimPermanent);
        cached.guestCount = (cached.guestCount || 1) + 1;
        cached.initialClaimExpiresAt = initialClaimExpiresAt;
      }
    }

    if (!sessionId) {
      isHost = true;
      initialClaimExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      isClaimPermanent = false;
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
            initial_claim_expires_at: initialClaimExpiresAt,
            is_claim_permanent: false,
          })
          .select('id, initial_claim_expires_at, is_claim_permanent')
          .maybeSingle();

        if (newSession) {
          sessionId = newSession.id;
          initialClaimExpiresAt = newSession.initial_claim_expires_at || initialClaimExpiresAt;
          isClaimPermanent = newSession.is_claim_permanent ?? false;
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
        initialClaimExpiresAt,
        isClaimPermanent: false,
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

    const payload = {
      success: true,
      sessionId,
      participantId,
      guestToken: issuedGuestToken,
      guestName: safeGuestName,
      isHost,
      tableId,
      tableNumber: tableNum,
      tableName,
      restaurantId,
      restaurantName,
      restaurantSlug: restSlug,
      sessionStatus: 'occupied',
      initialClaimExpiresAt: initialClaimExpiresAt || (isClaimPermanent ? null : new Date(Date.now() + 15 * 60 * 1000).toISOString()),
      isClaimPermanent: Boolean(isClaimPermanent),
    };

    const response = NextResponse.json(payload, { status: 201 });
    response.cookies.set('zovo_guest_session_id', String(sessionId || ''), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400,
    });
    response.cookies.set('zovo_guest_token', String(issuedGuestToken || ''), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400,
    });

    return response;
  } catch (err: any) {
    console.error('API /api/session/start-or-join error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while starting/joining session.' },
      { status: 500 }
    );
  }
}
