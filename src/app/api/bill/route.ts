import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId') || '';
    let tableId = searchParams.get('tableId');
    let restaurantId = searchParams.get('restaurantId');

    const supabase = await createServerSupabaseClient();

    // 1. Resolve restaurant and table
    let realRest: any = null;
    let realTable: any = null;

    if (restaurantId && !restaurantId.startsWith('11111111')) {
      const { data: r } = await supabase.from('restaurants').select('*').eq('id', restaurantId).maybeSingle();
      if (r) realRest = r;
    }
    if (!realRest) {
      const { data: defaultRests } = await supabase.from('restaurants').select('*').order('created_at', { ascending: false }).limit(1);
      if (defaultRests && defaultRests.length > 0) realRest = defaultRests[0];
    }

    const resolvedRestId = realRest?.id || 'a9feec11-8dee-4202-be6e-a097e45266e6';
    const resolvedRestName = realRest?.name || 'bikaner';
    const resolvedCurrency = realRest?.currency || 'INR';

    if (tableId && !tableId.startsWith('44444444')) {
      const { data: t } = await supabase.from('restaurant_tables').select('*').eq('id', tableId).maybeSingle();
      if (t) realTable = t;
    }
    if (!realTable && realRest) {
      const { data: tList } = await supabase.from('restaurant_tables').select('*').eq('restaurant_id', realRest.id).order('table_number', { ascending: true }).limit(1);
      if (tList && tList.length > 0) realTable = tList[0];
    }

    const resolvedTableId = realTable?.id || '24f7b562-0d70-4f5e-bde4-9bd01639dbb6';
    const resolvedTableNumber = realTable?.table_number || 'T-01';
    const resolvedTableName = realTable?.table_name || 'Table 1';

    // 2. Fetch all orders strictly for this table (excluding cancelled)
    let rawOrders: any[] = [];
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_id', resolvedTableId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        rawOrders = data;
      }
    } catch {
      // Fallback
    }

    // Extract any ORDER_STATUS:* notes to overlay on real orders
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
          const currentRank = currentBest ? (statusRank[currentBest] ?? 0) : -1;
          const newRank = statusRank[st] ?? 0;
          if (newRank >= currentRank) {
            stateMap.set(ordId, st);
          }
        }
      }
    });

    // Parse session timestamp if available
    let sessionStartTime: number | null = null;
    if (sessionId) {
      const match = sessionId.match(/^sess_(\d+)/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > 1700000000000) {
          sessionStartTime = parsed;
        }
      }
    }

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    // 3. Filter to ONLY authentic food orders placed during this dining session / today
    const sessionFoodOrders = rawOrders.filter((order: any) => {
      const orderNum = order.order_number || '';
      const note = order.customer_note || '';

      // Strictly exclude service requests, status markers, test rows, and empty tickets
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

      const orderCreatedTime = new Date(order.created_at).getTime();

      // Explicit session tag match
      if (sessionId && (note.includes(`[SESS:${sessionId}]`) || note.includes(`SESSION:${sessionId}`))) {
        return true;
      }

      // If session start time is known, exclude orders placed before this session started
      if (sessionStartTime) {
        if (orderCreatedTime < sessionStartTime - 2 * 60 * 1000) {
          return false;
        }
      }

      // Exclude orders from previous calendar days (e.g. Nov 15, Nov 19)
      if (orderCreatedTime < todayMidnight) {
        return false;
      }

      // Exclude old completed & paid orders from previous meals
      const effStatus = stateMap.get(order.id) || order.status;
      if (effStatus === 'completed' && order.payment_status === 'paid' && sessionStartTime && orderCreatedTime < sessionStartTime) {
        return false;
      }

      return true;
    });

    // 4. Aggregate item breakdown & totals from authentic dish items
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

      const orderItems = order.order_items || [];
      for (const item of orderItems) {
        const itemTotal = Number(item.unit_price) * (item.quantity || 1);
        itemsSubtotal += itemTotal;
        allItems.push({
          id: item.id,
          orderId: order.id,
          orderNumber: order.order_number,
          orderTime: order.created_at,
          orderStatus: stateMap.get(order.id) || order.status,
          dishName: item.dish_name,
          quantity: item.quantity || 1,
          unitPrice: Number(item.unit_price),
          totalPrice: itemTotal,
          notes: item.notes,
          paymentStatus: order.payment_status || 'pending',
        });
      }
    }

    // Tax & Service rates from restaurant settings
    let defaultTaxRate = 0.05;
    let defaultServiceFeeRate = 0;
    try {
      const { data: settingsData } = await supabase
        .from('restaurant_settings')
        .select('tax_percentage, service_charge_percentage, tax_enabled, service_charge_enabled, receipt_footer')
        .eq('restaurant_id', resolvedRestId)
        .maybeSingle();

      if (settingsData) {
        let taxEnabled = settingsData.tax_enabled !== false;
        let taxPercent = Number(settingsData.tax_percentage ?? 5.0);
        let serviceFeeEnabled = settingsData.service_charge_enabled === true;
        let serviceFeePercent = Number(settingsData.service_charge_percentage ?? 0);

        if (settingsData.receipt_footer) {
          const paymentMatch = settingsData.receipt_footer.match(/<!--ZOVO_PAYMENT_CONFIG:([\s\S]*?)-->/);
          if (paymentMatch && paymentMatch[1]) {
            try {
              const pConfig = JSON.parse(paymentMatch[1]);
              if (pConfig.taxRate !== undefined) taxPercent = Number(pConfig.taxRate);
              if (pConfig.taxIncluded) taxEnabled = false;
              if (pConfig.serviceChargeRate !== undefined) serviceFeePercent = Number(pConfig.serviceChargeRate);
              if (pConfig.serviceChargeEnabled !== undefined) serviceFeeEnabled = Boolean(pConfig.serviceChargeEnabled);
            } catch {}
          }
        }

        defaultTaxRate = taxEnabled ? taxPercent / 100 : 0;
        defaultServiceFeeRate = serviceFeeEnabled ? serviceFeePercent / 100 : 0;
      }
    } catch {}

    const effectiveSubtotal = ordersSubtotal > 0 ? ordersSubtotal : itemsSubtotal;
    const effectiveTax = ordersTax > 0 ? ordersTax : Number((effectiveSubtotal * defaultTaxRate).toFixed(2));
    const effectiveServiceFee = ordersServiceFee > 0 ? ordersServiceFee : Number((effectiveSubtotal * defaultServiceFeeRate).toFixed(2));
    const effectiveTotal = ordersTotal > 0 ? ordersTotal : Number((effectiveSubtotal + effectiveTax + effectiveServiceFee).toFixed(2));

    const outstandingBalance = Math.max(0, Number((effectiveTotal - totalPaid).toFixed(2)));
    const isFullyPaid = outstandingBalance <= 0;

    return NextResponse.json({
      success: true,
      bill: {
        sessionId: sessionId || `sess_${resolvedTableId}`,
        sessionStatus: isFullyPaid ? 'completed' : 'occupied',
        restaurantId: resolvedRestId,
        restaurantName: resolvedRestName,
        restaurantCurrency: resolvedCurrency,
        tableId: resolvedTableId,
        tableNumber: resolvedTableNumber,
        tableName: resolvedTableName,
        guestCount: 1,
        openedAt: sessionFoodOrders[0]?.created_at || (sessionStartTime ? new Date(sessionStartTime).toISOString() : new Date().toISOString()),
        items: allItems,
        subtotal: effectiveSubtotal,
        taxAmount: effectiveTax,
        serviceFee: effectiveServiceFee,
        discountAmount: 0,
        totalAmount: effectiveTotal,
        totalPaid,
        outstandingBalance,
        isFullyPaid: isFullyPaid && allItems.length > 0,
        ordersCount: sessionFoodOrders.length,
        hasPendingPayment: outstandingBalance > 0 && allItems.length > 0,
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
