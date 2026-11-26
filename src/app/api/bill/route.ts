import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || '';
    let tableId = searchParams.get('tableId');
    let restaurantId = searchParams.get('restaurantId');

    if (!sessionId && !tableId) {
      return NextResponse.json(
        { success: false, error: 'sessionId or tableId is required.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    let sessionRecord: any = null;
    if (sessionId && !sessionId.startsWith('sess_')) {
      const { data: s } = await supabase
        .from('table_sessions')
        .select('*, restaurants(*), restaurant_tables(*)')
        .eq('id', sessionId)
        .maybeSingle();
      if (s) {
        sessionRecord = s;
        restaurantId = restaurantId || s.restaurant_id;
        tableId = tableId || s.table_id;
      }
    }

    let realRest: any = sessionRecord?.restaurants || null;
    let realTable: any = sessionRecord?.restaurant_tables || null;

    if (!realRest && restaurantId) {
      const { data: r } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .maybeSingle();
      if (r) realRest = r;
    }

    if (!realTable && tableId) {
      const { data: t } = await supabase
        .from('restaurant_tables')
        .select('*')
        .eq('id', tableId)
        .maybeSingle();
      if (t) {
        realTable = t;
        if (!realRest && t.restaurant_id) {
          const { data: r } = await supabase
            .from('restaurants')
            .select('*')
            .eq('id', t.restaurant_id)
            .maybeSingle();
          if (r) realRest = r;
        }
      }
    }

    if (!realRest || !realTable) {
      return NextResponse.json(
        { success: false, error: 'Session, table, or restaurant not found.' },
        { status: 404 }
      );
    }

    const resolvedRestId = realRest.id;
    const resolvedRestName = realRest.name;
    const resolvedCurrency = realRest.currency || 'INR';
    const resolvedTableId = realTable.id;
    const resolvedTableNumber = realTable.table_number;
    const resolvedTableName = realTable.table_name || `Table ${resolvedTableNumber}`;

    let rawOrders: any[] = [];
    if (sessionRecord) {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_session_id', sessionRecord.id)
        .neq('status', 'cancelled')
        .neq('status', 'pending_payment')
        .order('created_at', { ascending: true });
      if (data) rawOrders = data;
    } else {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_id', resolvedTableId)
        .neq('status', 'cancelled')
        .neq('status', 'pending_payment')
        .order('created_at', { ascending: true });
      if (data) rawOrders = data;
    }

    const stateMap = new Map<string, string>();
    const statusRank: Record<string, number> = {
      pending: 0,
      waiting_for_waiter: 1,
      confirmed: 2,
      accepted: 3,
      sent_to_kitchen: 3,
      accepted_by_kitchen: 3,
      preparing: 4,
      ready: 5,
      served: 6,
      completed: 7,
      cancelled: -1,
    };

    rawOrders.forEach((o: any) => {
      const note = o.customer_note || '';
      if (note.startsWith('ORDER_STATUS:')) {
        const parts = note.split(':');
        if (parts.length >= 3) {
          const ordId = parts[1];
          const st = parts[2];
          const currentBest = stateMap.get(ordId);
          const currentRank = currentBest ? statusRank[currentBest] ?? 0 : -1;
          const newRank = statusRank[st] ?? 0;
          if (newRank >= currentRank) stateMap.set(ordId, st);
        }
      }
    });

    const getEffectiveStatus = (baseStatus: string, ordId: string): string => {
      const base = baseStatus || 'pending';
      if (base === 'completed' || base === 'cancelled') return base;
      const overlay = stateMap.get(ordId);
      if (!overlay) return base;
      return (statusRank[overlay] ?? 0) > (statusRank[base] ?? 0) ? overlay : base;
    };

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const sessionFoodOrders = rawOrders.filter((order: any) => {
      const orderNum = order.order_number || '';
      const note = order.customer_note || '';
      if (
        orderNum.startsWith('CALL-') ||
        orderNum.startsWith('SR_STATE-') ||
        orderNum.startsWith('ORD_STATE-') ||
        orderNum.startsWith('ACK-') ||
        orderNum.startsWith('TEST-') ||
        note.startsWith('SR_STATUS:') ||
        note.startsWith('ORDER_STATUS:') ||
        note.startsWith('CALL_WAITER:') ||
        note.startsWith('ACK:') ||
        !order.order_items ||
        order.order_items.length === 0
      ) {
        return false;
      }

      if (sessionRecord && order.table_session_id === sessionRecord.id) return true;
      if (sessionId && (note.includes(`[SESS:${sessionId}]`) || note.includes(`SESSION:${sessionId}`))) {
        return true;
      }
      return new Date(order.created_at).getTime() >= todayMidnight;
    });

    const allItems: any[] = [];
    let itemsSubtotal = 0;
    let ordersSubtotal = 0;
    let ordersTax = 0;
    let ordersServiceFee = 0;
    let ordersTotal = 0;
    let totalPaid = 0;

    for (const order of sessionFoodOrders) {
      ordersSubtotal += Number(order.subtotal || 0);
      ordersTax += Number(order.tax_amount || 0);
      ordersServiceFee += Number(order.service_fee || 0);
      ordersTotal += Number(order.total_amount || 0);
      if (order.payment_status === 'paid') {
        totalPaid += Number(order.total_amount || 0);
      }

      for (const item of order.order_items || []) {
        const itemTotal = Number(item.unit_price) * (item.quantity || 1);
        itemsSubtotal += itemTotal;
        allItems.push({
          id: item.id,
          orderId: order.id,
          orderNumber: order.order_number,
          orderTime: order.created_at,
          orderStatus: getEffectiveStatus(order.status, order.id),
          dishName: item.dish_name,
          quantity: item.quantity || 1,
          unitPrice: Number(item.unit_price),
          totalPrice: itemTotal,
          notes: item.notes,
          paymentStatus: order.payment_status || 'pending',
        });
      }
    }

    // If session itself has additional recorded payments (session_bill)
    const sessionTotalPaid = Number(sessionRecord?.total_paid || 0);
    if (sessionTotalPaid > totalPaid) {
      totalPaid = sessionTotalPaid;
    }

    const effectiveSubtotal = ordersSubtotal > 0 ? ordersSubtotal : itemsSubtotal;
    const effectiveTax = ordersTax;
    const effectiveServiceFee = ordersServiceFee;
    const effectiveTotal = ordersTotal > 0 ? ordersTotal : Number((effectiveSubtotal + effectiveTax + effectiveServiceFee).toFixed(2));
    const bookingFeeCredit = Number(sessionRecord?.booking_fee_credit || 0);
    const payableAmount = Math.max(0, Number((effectiveTotal - bookingFeeCredit - totalPaid).toFixed(2)));
    const isFullyPaid = payableAmount <= 0;

    return NextResponse.json({
      success: true,
      bill: {
        sessionId: sessionRecord?.id || sessionId,
        sessionStatus: sessionRecord?.status || (isFullyPaid ? 'completed' : 'occupied'),
        restaurantId: resolvedRestId,
        restaurantName: resolvedRestName,
        restaurantCurrency: resolvedCurrency,
        tableId: resolvedTableId,
        tableNumber: resolvedTableNumber,
        tableName: resolvedTableName,
        guestCount: sessionRecord?.guest_count || 1,
        openedAt: sessionRecord?.opened_at || sessionFoodOrders[0]?.created_at || new Date().toISOString(),
        items: allItems,
        subtotal: effectiveSubtotal,
        taxAmount: effectiveTax,
        serviceFee: effectiveServiceFee,
        discountAmount: 0,
        bookingFeeCredit,
        totalAmount: effectiveTotal,
        totalPaid,
        payableAmount,
        outstandingBalance: payableAmount,
        isFullyPaid: isFullyPaid && allItems.length > 0,
        ordersCount: sessionFoodOrders.length,
        hasPendingPayment: payableAmount > 0 && allItems.length > 0,
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
