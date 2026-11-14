import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// In-memory cooldown store to prevent repeated accidental submissions
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

    // Rate-limiting check: 20-second cooldown per table per request type
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

    const supabase = await createServerSupabaseClient();
    let requestId = `req_${Date.now()}`;
    let insertedSuccessfully = false;

    // 1. Try real service_requests table
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
    } catch {
      // Continue to fallback
    }

    // 2. Resilient fallback: store call in orders table if service_requests table is missing
    if (!insertedSuccessfully) {
      try {
        const orderCallNum = `CALL-${Math.floor(1000 + Math.random() * 9000)}`;
        const notePayload = `CALL_WAITER: ${requestType} | ${notes || 'Customer requested assistance at table'}`;

        const { data: ordData, error: ordErr } = await supabase
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

        if (!ordErr && ordData) {
          requestId = ordData.id;
        }
      } catch (fallbackErr) {
        console.warn('Fallback call waiter store error:', fallbackErr);
      }
    }

    // 3. Send real-time broadcast alert to connected waiters
    try {
      const rtChannel = supabase.channel(`staff_realtime:${restaurantId}`, {
        config: { broadcast: { self: true } },
      });
      await rtChannel.subscribe();
      await rtChannel.send({
        type: 'broadcast',
        event: 'call_waiter',
        payload: {
          id: requestId,
          restaurant_id: restaurantId,
          table_id: tableId,
          request_type: requestType,
          notes: notes ? String(notes).slice(0, 500) : 'Customer called for waiter',
          requested_by_name: requestedByName || 'Guest',
          status: 'pending',
          created_at: new Date().toISOString(),
        },
      });
      supabase.removeChannel(rtChannel);
    } catch (broadcastErr) {
      // Non-blocking broadcast
    }

    // Record cooldown timestamp
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
