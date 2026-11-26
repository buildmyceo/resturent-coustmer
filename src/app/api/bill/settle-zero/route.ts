import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { restaurantId, sessionId, guestToken } = body;

    if (!restaurantId || !sessionId || !guestToken) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: sessionRow } = await admin
      .from('table_sessions')
      .select('id, restaurant_id, booking_fee_credit, booking_id, guest_token, restaurant_tables(table_number)')
      .eq('id', sessionId)
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    if (!sessionRow) {
      return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
    }

    const { data: participant } = await admin
      .from('session_participants')
      .select('id')
      .eq('session_id', sessionId)
      .eq('guest_token', guestToken)
      .maybeSingle();

    if (sessionRow.guest_token !== guestToken && !participant) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { data: sessionOrders } = await admin
      .from('orders')
      .select('id, total_amount')
      .eq('table_session_id', sessionId)
      .neq('status', 'cancelled')
      .neq('status', 'rejected');

    const orderIds = (sessionOrders || []).map((o: any) => o.id);
    const effectiveTotal = (sessionOrders || []).reduce((s: number, o: any) => s + Number(o.total_amount || 0), 0);

    let paidSum = 0;
    if (orderIds.length > 0) {
      const { data: payments } = await admin
        .from('payments')
        .select('amount')
        .in('status', ['completed', 'successful'])
        .or(`session_id.eq.${sessionId},order_id.in.(${orderIds.join(',')})`);
      paidSum = (payments || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
    }

    const totalCreditedAndPaid = Number(sessionRow.booking_fee_credit || 0) + paidSum;
    const payableAmount = Math.max(0, Number((effectiveTotal - totalCreditedAndPaid).toFixed(2)));

    if (payableAmount > 0) {
      return NextResponse.json(
        { success: false, error: `Balance of ₹${payableAmount} is still due.` },
        { status: 400 }
      );
    }

    const nowIso = new Date().toISOString();
    if (orderIds.length > 0) {
      await admin
        .from('orders')
        .update({ payment_status: 'paid', status: 'completed', paid_at: nowIso, updated_at: nowIso })
        .in('id', orderIds);
    }

    await admin
      .from('table_sessions')
      .update({ status: 'completed', closed_at: nowIso, total_paid: totalCreditedAndPaid })
      .eq('id', sessionId);

    const tableNum = (sessionRow as any)?.restaurant_tables?.table_number || 'TABLE';
    const { data: invoice } = await admin
      .from('invoices')
      .insert({
        restaurant_id: restaurantId,
        session_id: sessionId,
        order_type: 'dine_in',
        table_number: tableNum,
        subtotal: effectiveTotal,
        total_paid: effectiveTotal,
        payment_method: 'razorpay',
        payment_reference: `BOOKING_CREDIT:${sessionRow.booking_id || sessionId.slice(0, 8)}`,
      })
      .select('id')
      .maybeSingle();

    try {
      const ch = admin.channel(`restaurant:${restaurantId}`);
      await ch.subscribe();
      await ch.send({ type: 'broadcast', event: 'BILL_SETTLED', payload: { sessionId, invoiceId: invoice?.id || null } });
      admin.removeChannel(ch);
    } catch {}

    return NextResponse.json({ success: true, invoiceId: invoice?.id || null });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Settlement failed' }, { status: 500 });
  }
}
