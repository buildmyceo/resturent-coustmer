import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

    const supabase = createAdminClient();

    const { data: session, error: sessErr } = await supabase
      .from('table_sessions')
      .select('*, restaurant_tables(*), restaurants(*)')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessErr || !session) {
      return NextResponse.json(
        {
          success: false,
          isDeactivated: true,
          error: 'Table session not found. Please scan the table QR code again.',
        },
        { status: 404 }
      );
    }

    if (session.status === 'completed' || session.status === 'cancelled') {
      return NextResponse.json({
        success: false,
        isClosed: true,
        isDeactivated: true,
        sessionStatus: session.status,
        error:
          session.status === 'cancelled'
            ? 'This table session has been deactivated. Please scan the table QR code to start.'
            : 'This dining session has ended. Please scan a new QR code.',
      });
    }

    let isExpired = false;
    let hasSubmittedOrders = session.is_claim_permanent === true;
    if (!hasSubmittedOrders) {
      const { data: ord } = await supabase
        .from('orders')
        .select('id')
        .eq('table_session_id', sessionId)
        .neq('status', 'cancelled')
        .neq('status', 'pending_payment')
        .limit(1);
      if (ord && ord.length > 0) {
        hasSubmittedOrders = true;
      }
    }

    if (!hasSubmittedOrders) {
      const expiresAt = session.initial_claim_expires_at
        ? new Date(session.initial_claim_expires_at).getTime()
        : new Date(session.opened_at || session.created_at).getTime() + 60 * 60 * 1000;

      if (Date.now() > expiresAt) {
        isExpired = true;
        await supabase
          .from('table_sessions')
          .update({ status: 'cancelled', updated_at: new Date().toISOString() })
          .eq('id', sessionId);

        return NextResponse.json({
          success: false,
          isExpired: true,
          isDeactivated: true,
          error:
            'Your temporary table session was deactivated after 1 hour without placing an order. Please scan the QR code again.',
        });
      }
    }

    let participant: any = null;
    if (guestToken) {
      const { data: partData } = await supabase
        .from('session_participants')
        .select('*')
        .eq('session_id', sessionId)
        .eq('guest_token', guestToken)
        .maybeSingle();

      if (partData) {
        participant = partData;
      }
    }

    return NextResponse.json({
      success: true,
      isExpired,
      session: {
        id: session.id,
        restaurantId: session.restaurant_id,
        restaurantName: session.restaurants?.name || 'Restaurant',
        restaurantSlug: session.restaurants?.slug || '',
        tableId: session.table_id,
        tableNumber: session.restaurant_tables?.table_number || '01',
        tableName: session.restaurant_tables?.table_name || 'Dining Table',
        status: session.status,
        guestCount: session.guest_count,
        openedAt: session.opened_at || session.created_at || new Date().toISOString(),
        subtotal: Number(session.subtotal || 0),
        taxAmount: Number(session.tax_amount || 0),
        serviceFee: Number(session.service_fee || 0),
        totalAmount: Number(session.total_amount || 0),
        totalPaid: Number(session.total_paid || 0),
        bookingFeeCredit: Number(session.booking_fee_credit || 0),
        bookingId: session.booking_id || null,
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
