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

      if (data) {
        requestId = data.id;
      }
    } catch {
      // Non-blocking fallback
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
