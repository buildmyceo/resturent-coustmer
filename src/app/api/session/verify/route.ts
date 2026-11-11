import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, guestToken } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    let session: any = null;
    try {
      const { data } = await supabase
        .from('table_sessions')
        .select('*, restaurant_tables(*), restaurants(*)')
        .eq('id', sessionId)
        .maybeSingle();
      if (data) session = data;
    } catch {
      // Fallback
    }

    if (!session) {
      return NextResponse.json({
        success: true,
        isExpired: false,
        session: {
          id: sessionId,
          restaurantId: '11111111-1111-1111-1111-111111111111',
          restaurantName: 'Zovo Bistro & Lounge',
          restaurantSlug: 'zovo-bistro',
          tableId: '44444444-4444-4444-4444-444444440005',
          tableNumber: 'Table 05',
          tableName: 'Executive Dining',
          status: 'occupied',
          guestCount: 1,
          subtotal: 0,
          taxAmount: 0,
          serviceFee: 0,
          totalAmount: 0,
          totalPaid: 0,
          initialClaimExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          isClaimPermanent: false,
        },
        participant: {
          id: `part_${Date.now()}`,
          name: 'Guest',
          isHost: true,
        },
      });
    }

    if (session.status === 'completed' || session.status === 'cancelled') {
      return NextResponse.json({
        success: false,
        isClosed: true,
        sessionStatus: session.status,
        error: 'This dining session has ended. Please scan a new QR code.',
      });
    }

    let isExpired = false;

    // Check if session has placed any orders
    let hasSubmittedOrders = session.is_claim_permanent === true;
    if (!hasSubmittedOrders) {
      try {
        const { data: ord } = await supabase
          .from('orders')
          .select('id')
          .eq('table_session_id', sessionId)
          .neq('status', 'cancelled')
          .limit(1);
        if (ord && ord.length > 0) {
          hasSubmittedOrders = true;
        }
      } catch {
        // Non-blocking
      }
    }

    // 15-minute expiration applies ONLY before first order is submitted
    if (!hasSubmittedOrders) {
      const expiresAt = session.initial_claim_expires_at
        ? new Date(session.initial_claim_expires_at).getTime()
        : new Date(session.opened_at || session.created_at).getTime() + 15 * 60 * 1000;

      if (Date.now() > expiresAt) {
        isExpired = true;
        // Release table
        await supabase
          .from('table_sessions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', sessionId);

        return NextResponse.json({
          success: false,
          isExpired: true,
          error: 'Your initial 15-minute table claim has expired. Please scan the QR code again.',
        });
      }
    } else {
      isExpired = false; // Never expire active dining sessions
    }

    let participant: any = null;
    if (guestToken) {
      try {
        const { data: partData } = await supabase
          .from('session_participants')
          .select('*')
          .eq('session_id', sessionId)
          .eq('guest_token', guestToken)
          .maybeSingle();

        if (partData) {
          participant = partData;
        }
      } catch {
        // Non-blocking
      }
    }

    return NextResponse.json({
      success: true,
      isExpired: false,
      session: {
        id: session.id,
        restaurantId: session.restaurant_id,
        restaurantName: session.restaurants?.name || 'Zovo Bistro',
        restaurantSlug: session.restaurants?.slug || 'zovo-bistro',
        tableId: session.table_id,
        tableNumber: session.restaurant_tables?.table_number || '01',
        tableName: session.restaurant_tables?.table_name || 'Dining Table',
        status: session.status,
        guestCount: session.guest_count,
        subtotal: Number(session.subtotal || 0),
        taxAmount: Number(session.tax_amount || 0),
        serviceFee: Number(session.service_fee || 0),
        totalAmount: Number(session.total_amount || 0),
        totalPaid: Number(session.total_paid || 0),
        initialClaimExpiresAt: session.initial_claim_expires_at,
        isClaimPermanent: hasSubmittedOrders,
      },
      participant: participant
        ? {
            id: participant.id,
            name: participant.name,
            isHost: participant.is_host,
          }
        : null,
    });
  } catch (err: any) {
    console.error('API /api/session/verify error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while verifying session.' },
      { status: 500 }
    );
  }
}
