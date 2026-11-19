import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

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

    // 2. Fetch all orders for this table (excluding cancelled)
    let ordersData: any[] = [];
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*, order_items(*)')
        .eq('table_id', resolvedTableId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: true });

      if (!error && data && data.length > 0) {
        ordersData = data;
      }
    } catch {
      // Fallback
    }

    // Fallback: If query by tableId yielded 0, try querying by restaurantId
    if (ordersData.length === 0) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('restaurant_id', resolvedRestId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: true })
          .limit(10);

        if (!error && data) ordersData = data;
      } catch {
        // Fallback
      }
    }

    // 3. Aggregate item breakdown & totals
    const allItems: any[] = [];
    let itemsSubtotal = 0;
    let ordersSubtotal = 0;
    let ordersTax = 0;
    let ordersServiceFee = 0;
    let ordersTotal = 0;
    let totalPaid = 0;

    for (const order of ordersData) {
      ordersSubtotal += Number(order.subtotal || 0);
      ordersTax += Number(order.tax_amount || 0);
      ordersServiceFee += Number(order.service_fee || 0);
      ordersTotal += Number(order.total_amount || 0);

      if (order.payment_status === 'paid') {
        totalPaid += Number(order.total_amount || 0);
      }

      const orderItems = order.order_items || [];
      if (orderItems.length > 0) {
        for (const item of orderItems) {
          const itemTotal = Number(item.unit_price) * (item.quantity || 1);
          itemsSubtotal += itemTotal;
          allItems.push({
            id: item.id,
            orderId: order.id,
            orderNumber: order.order_number,
            orderTime: order.created_at,
            orderStatus: order.status,
            dishName: item.dish_name,
            quantity: item.quantity || 1,
            unitPrice: Number(item.unit_price),
            totalPrice: itemTotal,
            notes: item.notes,
            paymentStatus: order.payment_status || 'pending',
          });
        }
      } else {
        // If order had no order_items rows, create synthetic item from order summary
        const orderAmt = Number(order.subtotal || order.total_amount || 0);
        itemsSubtotal += orderAmt;
        allItems.push({
          id: `item_${order.id}`,
          orderId: order.id,
          orderNumber: order.order_number,
          orderTime: order.created_at,
          orderStatus: order.status,
          dishName: `Order #${order.order_number}`,
          quantity: 1,
          unitPrice: orderAmt,
          totalPrice: orderAmt,
          notes: order.customer_note,
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
    const isFullyPaid = outstandingBalance <= 0 && allItems.length > 0;

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
        openedAt: ordersData[0]?.created_at || new Date().toISOString(),
        items: allItems,
        subtotal: effectiveSubtotal,
        taxAmount: effectiveTax,
        serviceFee: effectiveServiceFee,
        discountAmount: 0,
        totalAmount: effectiveTotal,
        totalPaid,
        outstandingBalance,
        isFullyPaid,
        ordersCount: ordersData.length,
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
