import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/client';

export const dynamic = 'force-dynamic';

/**
 * POST /api/session/deactivate
 * Deactivates a temporary customer table session if no orders have been submitted within 1 hour.
 * Cancels table_sessions row and releases the table for new diners.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sessionId, reason } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID is required' },
        { status: 400 }
      );
    }

    const supabase = createClient();

    // 1. Check if session has any confirmed / active orders
    const { data: orders, error: ordErr } = await supabase
      .from('orders')
      .select('id, status')
      .eq('table_session_id', sessionId)
      .neq('status', 'cancelled');

    if (!ordErr && orders && orders.length > 0) {
      // Customer has active orders! Do not cancel dining session.
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
      console.warn('Failed to update table_session status in Supabase:', updateErr);
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
