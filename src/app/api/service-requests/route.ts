import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

const cooldownStore = new Map<string, number>();

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { restaurantId, tableId, sessionId, requestType, notes, requestedByName } = body;

    if (!restaurantId || !tableId || !requestType) {
      return NextResponse.json(
        { success: false, error: 'restaurantId, tableId, and requestType are required.' },
        { status: 400 }
      );
    }

    const cooldownKey = `${tableId}_${requestType}`;
    const lastRequestTime = cooldownStore.get(cooldownKey);
    const now = Date.now();

    if (lastRequestTime && now - lastRequestTime < 20 * 1000) {
      const waitSecs = Math.ceil((20 * 1000 - (now - lastRequestTime)) / 1000);
      return NextResponse.json(
        {
          success: false,
          error: `Please wait ${waitSecs}s before submitting another "${requestType.replace('_', ' ')}" request.`,
        },
        { status: 429 }
      );
    }

    const supabase = createAdminClient();
    let requestId = `req_${Date.now()}`;
    let insertedSuccessfully = false;

    try {
      const { data, error } = await supabase
        .from('service_requests')
        .insert({
          restaurant_id: restaurantId,
          table_id: tableId,
          session_id: sessionId || null,
          request_type: requestType,
          status: 'pending',
          notes: notes ? String(notes).slice(0, 500) : null,
          requested_by_name: requestedByName ? String(requestedByName).slice(0, 50) : 'Guest',
        })
        .select('id, request_type, status, created_at')
        .maybeSingle();

      if (!error && data) {
        requestId = data.id;
        insertedSuccessfully = true;
      }
    } catch {}

    if (!insertedSuccessfully) {
      const orderCallNum = `CALL-${Math.floor(1000 + Math.random() * 9000)}`;
      const notePayload = `CALL_WAITER: ${requestType} | ${notes || 'Customer requested assistance at table'}`;

      const { data: ordData } = await supabase
        .from('orders')
        .insert({
          restaurant_id: restaurantId,
          table_id: tableId,
          order_number: orderCallNum,
          order_source: 'Customer',
          subtotal: 0,
          tax_amount: 0,
          service_fee: 0,
          total_amount: 0,
          status: 'pending',
          customer_note: notePayload,
          payment_status: 'pending',
        })
        .select('id')
        .maybeSingle();

      if (ordData) {
        requestId = ordData.id;
      }
    }

    let tableNumber = '';
    const { data: tbl } = await supabase
      .from('restaurant_tables')
      .select('table_number, table_name')
      .eq('id', tableId)
      .maybeSingle();
    if (tbl) {
      tableNumber = tbl.table_number || tbl.table_name || '';
    }

    try {
      const rtChannel = supabase.channel(`restaurant:${restaurantId}`, {
        config: { broadcast: { self: true } },
      });
      await new Promise<void>((resolve) => {
        rtChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') resolve();
        });
        setTimeout(resolve, 300);
      });

      const eventPayload = {
        id: requestId,
        restaurant_id: restaurantId,
        table_id: tableId,
        table_number: tableNumber,
        request_type: requestType,
        notes: notes ? String(notes).slice(0, 500) : 'Customer called for waiter',
        requested_by_name: requestedByName || 'Guest',
        status: 'pending',
        created_at: new Date().toISOString(),
      };
      await rtChannel.send({ type: 'broadcast', event: 'SERVICE_REQUEST', payload: eventPayload });
      await rtChannel.send({ type: 'broadcast', event: 'call_waiter', payload: eventPayload });
      setTimeout(() => {
        try {
          supabase.removeChannel(rtChannel);
        } catch {}
      }, 1000);
    } catch {}

    cooldownStore.set(cooldownKey, now);

    return NextResponse.json({
      success: true,
      message: 'Your request has been sent. Waiter notified.',
      request: {
        id: requestId,
        request_type: requestType,
        status: 'pending',
        created_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('API /api/service-requests error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while submitting service request.' },
      { status: 500 }
    );
  }
}
