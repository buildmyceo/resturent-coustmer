import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { generateGuestToken } from '@/lib/guest-session';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      publicIdentifier,
      guestName,
      restaurantSlug,
      tableNumber,
      tableId: bodyTableId,
      restaurantId: bodyRestId,
    } = body;

    const trimmedToken = (publicIdentifier || '').trim();
    const safeGuestName = (guestName || 'Guest').trim().slice(0, 50);

    if (!trimmedToken && (!bodyRestId || !bodyTableId)) {
      return NextResponse.json(
        { success: false, error: 'QR token is required.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const issuedGuestToken = generateGuestToken();

    // 1. Try atomic database RPC first
    if (trimmedToken) {
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
              (rpcData.is_claim_permanent ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString()),
            isClaimPermanent: Boolean(rpcData.is_claim_permanent ?? rpcData.isClaimPermanent ?? false),
          };
          const response = NextResponse.json(normalized);
          response.cookies.set('zovo_guest_session_id', String(normalized.sessionId), {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 86400,
          });
          response.cookies.set('zovo_guest_token', String(normalized.guestToken), {
            path: '/',
            httpOnly: true,
            sameSite: 'lax',
            maxAge: 86400,
          });
          return response;
        }
      } catch {
        // Fallback to direct lookup below
      }
    }

    // 2. Query QR record from Supabase
    let table: any = null;
    let restaurant: any = null;

    if (trimmedToken) {
      const { data: qrRecord } = await supabase
        .from('table_qr_codes')
        .select('*, restaurant_tables(*), restaurants(*)')
        .eq('public_identifier', trimmedToken)
        .maybeSingle();

      if (qrRecord) {
        table = qrRecord.restaurant_tables;
        restaurant = qrRecord.restaurants;
      }
    }

    // Direct lookup by slug / tableId / restaurantId if table_qr_codes did not match
    if (!table || !restaurant) {
      if (bodyRestId) {
        const { data: r } = await supabase
          .from('restaurants')
          .select('*')
          .eq('id', bodyRestId)
          .maybeSingle();
        if (r) restaurant = r;
      }
      if (!restaurant && restaurantSlug) {
        const { data: r } = await supabase
          .from('restaurants')
          .select('*')
          .eq('slug', restaurantSlug)
          .maybeSingle();
        if (r) restaurant = r;
      }

      if (bodyTableId) {
        const { data: t } = await supabase
          .from('restaurant_tables')
          .select('*')
          .eq('id', bodyTableId)
          .maybeSingle();
        if (t) table = t;
      }
      if (!table && restaurant && tableNumber) {
        const cleanNum = tableNumber.replace(/^T-?0?/, '');
        const { data: tList } = await supabase
          .from('restaurant_tables')
          .select('*')
          .eq('restaurant_id', restaurant.id)
          .or(
            `table_number.ilike.${tableNumber},table_number.ilike.T-${tableNumber},table_number.ilike.Table ${tableNumber},table_number.ilike.%${cleanNum}%`
          )
          .limit(1);
        if (tList && tList.length > 0) table = tList[0];
      }
    }

    if (!restaurant || !table) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code or table not found.' },
        { status: 404 }
      );
    }

    const tableId = table.id;
    const tableNum = table.table_number;
    const tableName = table.table_name || `Table ${tableNum}`;
    const restaurantId = restaurant.id;
    const restaurantName = restaurant.name;
    const restSlug = restaurant.slug;

    // 3. Check for existing active session on table
    let sessionId: string | null = null;
    let isHost = false;
    let initialClaimExpiresAt: string | null = null;
    let isClaimPermanent = false;

    const { data: existingSession } = await supabase
      .from('table_sessions')
      .select('*')
      .eq('table_id', tableId)
      .in('status', ['occupied', 'payment_pending'])
      .maybeSingle();

    if (existingSession) {
      const isExpired =
        !existingSession.is_claim_permanent &&
        existingSession.initial_claim_expires_at &&
        new Date(existingSession.initial_claim_expires_at).getTime() < Date.now();

      if (isExpired) {
        await supabase
          .from('table_sessions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', existingSession.id);
      } else {
        sessionId = existingSession.id;
        initialClaimExpiresAt =
          existingSession.initial_claim_expires_at ||
          (existingSession.is_claim_permanent ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString());
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

    if (!sessionId) {
      isHost = true;
      initialClaimExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      isClaimPermanent = false;

      const { data: newSession, error: insertErr } = await supabase
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
        .single();

      if (insertErr || !newSession) {
        return NextResponse.json(
          { success: false, error: insertErr?.message || 'Failed to create table session.' },
          { status: 500 }
        );
      }

      sessionId = newSession.id;
      initialClaimExpiresAt = newSession.initial_claim_expires_at || initialClaimExpiresAt;
      isClaimPermanent = Boolean(newSession.is_claim_permanent ?? false);
    }

    let participantId = `part_${Date.now()}`;
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
      .maybeSingle();

    if (participantData) {
      participantId = participantData.id;
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
      initialClaimExpiresAt:
        initialClaimExpiresAt || (isClaimPermanent ? null : new Date(Date.now() + 60 * 60 * 1000).toISOString()),
      isClaimPermanent: Boolean(isClaimPermanent),
    };

    const response = NextResponse.json(payload, { status: 201 });
    response.cookies.set('zovo_guest_session_id', String(sessionId), {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 86400,
    });
    response.cookies.set('zovo_guest_token', String(issuedGuestToken), {
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
