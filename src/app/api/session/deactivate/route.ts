import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId, reason, guestToken } = body;
    const cookieToken = req.cookies.get('zovo_guest_token')?.value;
    const token = guestToken || cookieToken;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify caller holds a valid guestToken for this session if participants exist
    if (token) {
      const { data: part } = await supabase
        .from('session_participants')
        .select('id')
        .eq('session_id', sessionId)
        .eq('guest_token', token)
        .maybeSingle();

      if (!part) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized session deactivation request.' },
          { status: 403 }
        );
      }
    }

    // 1. Check if session has any confirmed / active orders
    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id, status')
      .eq('table_session_id', sessionId)
      .neq('status', 'cancelled')
      .neq('status', 'pending_payment');

    if (!ordErr && orders && orders.length > 0) {
      return NextResponse.json({
        success: false,
        deactivated: false,
        message: 'Cannot deactivate session with active submitted orders.',
      });
    }

    // 2. Mark table session as cancelled in database to release the table
    const { error: updateErr } = await supabase
      .from('table_sessions')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateErr) {
      return NextResponse.json(
        { success: false, error: updateErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      deactivated: true,
      reason: reason || '1 hour temporary customer inactivity without ordering',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('API /api/session/deactivate error:', error);
    return NextResponse.json(
      { success: false, error: error?.message || 'Server error deactivating session.' },
      { status: 500 }
    );
  }
}
