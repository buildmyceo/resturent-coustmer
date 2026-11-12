import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId parameter is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch table session with restaurant & table joins
    let session: any = null;
    try {
      const { data } = await supabase
        .from('table_sessions')
        .select('*, restaurants(*), restaurant_tables(*)')
        .eq('id', sessionId)
        .maybeSingle();

      if (data) session = data;
    } catch {
      // Non-blocking
    }

    // 2. Fetch all orders and items belonging to this session
    let ordersData: any[] = [];
    try {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .or(`table_session_id.eq.${sessionId},id.eq.${sessionId}`)
        .neq('status', 'cancelled');

      if (data) ordersData = data;
    } catch {
      // Non-blocking
    }

    // 3. Aggregate historical price snapshot items
    const allItems: any[] = [];
    let itemsSubtotal = 0;

    for (const order of ordersData || []) {
      for (const item of order.order_items || []) {
        const itemTotal = Number(item.unit_price) * item.quantity;
        itemsSubtotal += itemTotal;
        allItems.push({
          id: item.id,
          orderId: order.id,
          orderNumber: order.order_number,
          orderTime: order.created_at,
          participantName: order.participant_name || 'Table Guest',
          dishName: item.dish_name,
          quantity: item.quantity,
          unitPrice: Number(item.unit_price),
          totalPrice: itemTotal,
          notes: item.notes,
          variantName: item.variant_name,
        });
      }
    }

    // 4. Fetch payments recorded for this session
    let totalPaid = 0;
    const paymentsList: any[] = [];
    try {
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('session_id', sessionId)
        .eq('status', 'completed');

      for (const p of paymentsData || []) {
        totalPaid += Number(p.amount);
        paymentsList.push({
          id: p.id,
          amount: Number(p.amount),
          paymentMethod: p.payment_method,
          transactionId: p.transaction_id,
          createdAt: p.created_at,
        });
      }
    } catch {
      // Non-blocking
    }

    // 5. Use session totals or calculated snapshot totals
    const sessionSubtotal = Number(session?.subtotal || itemsSubtotal);
    const taxAmount = Number(session?.tax_amount || (sessionSubtotal * 0.085).toFixed(2));
    const serviceFee = Number(session?.service_fee || (sessionSubtotal * 0.10).toFixed(2));
    const discountAmount = Number(session?.discount_amount || 0);
    const totalAmount = Number((sessionSubtotal + taxAmount + serviceFee - discountAmount).toFixed(2));
    const effectiveTotalPaid = Math.max(Number(session?.total_paid || 0), totalPaid);
    const outstandingBalance = Math.max(0, Number((totalAmount - effectiveTotalPaid).toFixed(2)));

    return NextResponse.json({
      success: true,
      bill: {
        sessionId: session?.id || sessionId,
        sessionStatus: session?.status || 'occupied',
        restaurantName: session?.restaurants?.name || 'Zovo Bistro & Lounge',
        restaurantCurrency: session?.restaurants?.currency || 'USD',
        tableNumber: session?.restaurant_tables?.table_number || 'Table 05',
        tableName: session?.restaurant_tables?.table_name || 'Executive Dining',
        guestCount: session?.guest_count || 1,
        openedAt: session?.opened_at || new Date().toISOString(),
        closedAt: session?.closed_at,
        items: allItems,
        subtotal: sessionSubtotal,
        taxAmount,
        serviceFee,
        discountAmount,
        totalAmount,
        totalPaid: effectiveTotalPaid,
        outstandingBalance,
        isFullyPaid: outstandingBalance <= 0 && allItems.length > 0,
        payments: paymentsList,
      },
    });
  } catch (err: any) {
    console.error('API /api/bill error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while calculating bill.' },
      { status: 500 }
    );
  }
}
