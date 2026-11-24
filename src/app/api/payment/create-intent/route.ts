import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { sessionId, paymentMethod, tableId, restaurantId } = body;

    const supabase = await createServerSupabaseClient();

    // 1. Resolve table & restaurant
    let realRest: any = null;
    let realTable: any = null;

    if (restaurantId && !restaurantId.startsWith('11111111')) {
      const { data: r } = await supabase.from('restaurants').select('*').eq('id', restaurantId).maybeSingle();
      if (r) realRest = r;
    }
    if (!realRest) {
      const { data: defaultRests } = await supabase.from('restaurants').select('*').eq('id', 'a9feec11-8dee-4202-be6e-a097e45266e6').maybeSingle();
      if (defaultRests) realRest = defaultRests;
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

    // 2. Fetch unpaid table orders strictly for this session/today
    let totalOutstanding = 0;
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_number, total_amount, payment_status, status, customer_note, created_at, order_items(id)')
        .eq('table_id', resolvedTableId)
        .neq('status', 'cancelled');

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

      if (orders && orders.length > 0) {
        for (const o of orders) {
          const num = o.order_number || '';
          const note = o.customer_note || '';

          // Exclude ghost tickets, status markers, and empty tickets
          if (
            num.startsWith('CALL-') ||
            num.startsWith('SR_STATE-') ||
            num.startsWith('ORD_STATE-') ||
            num.startsWith('ACK-') ||
            num.startsWith('TEST-') ||
            note.startsWith('SR_STATUS:') ||
            note.startsWith('ORDER_STATUS:') ||
            note.startsWith('CALL_WAITER:') ||
            note.startsWith('ACK:') ||
            !o.order_items ||
            o.order_items.length === 0
          ) {
            continue;
          }

          const orderCreatedTime = new Date(o.created_at).getTime();

          // Exclude orders from previous days
          if (orderCreatedTime < todayMidnight) {
            continue;
          }

          // Exclude orders created before this session
          if (sessionStartTime && orderCreatedTime < sessionStartTime - 2 * 60 * 1000) {
            continue;
          }

          if (o.payment_status !== 'paid' && o.status !== 'completed') {
            totalOutstanding += Number(o.total_amount || 0);
          }
        }
      }
    } catch {
      // Fallback
    }

    // Amount to charge
    const finalAmount = Math.max(0, Number(totalOutstanding.toFixed(2)));
    const gatewayOrderId = `order_zv_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    // Read saved payment settings from Supabase if configured by restaurant owner
    let configuredUpi = '';
    let configuredPayee = '';
    let acceptedMethods = { upi: true, cash: true, razorpay: false, card: true };

    try {
      const { data: s } = await supabase
        .from('restaurant_settings')
        .select('receipt_footer')
        .eq('restaurant_id', resolvedRestId)
        .maybeSingle();

      if (s?.receipt_footer) {
        const match = s.receipt_footer.match(/<!--ZOVO_PAYMENT_CONFIG:([\s\S]*?)-->/);
        if (match) {
          const cfg = JSON.parse(match[1]);
          if (cfg.upiId) configuredUpi = cfg.upiId;
          if (cfg.upiPayeeName) configuredPayee = cfg.upiPayeeName;
          if (cfg.acceptedMethods) acceptedMethods = cfg.acceptedMethods;
        }
      }
    } catch {}

    // Dynamic UPI deep link generation for zero-fee instant settlement
    const cleanPhone = (realRest?.phone || '').replace(/[^0-9]/g, '').slice(-10);
    const upiVpa = configuredUpi || (cleanPhone ? `${cleanPhone}@upi` : 'bikaner@icici');
    const upiPayeeName = configuredPayee || resolvedRestName;
    const upiDeepLink = `upi://pay?pa=${encodeURIComponent(upiVpa)}&pn=${encodeURIComponent(upiPayeeName)}&am=${finalAmount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Table_${realTable?.table_number || '1'}_Bill`)}`;

    return NextResponse.json({
      success: true,
      paymentIntent: {
        gatewayOrderId,
        sessionId: sessionId || `sess_${resolvedTableId}`,
        tableId: resolvedTableId,
        restaurantId: resolvedRestId,
        restaurantName: resolvedRestName,
        currency: resolvedCurrency,
        amount: finalAmount,
        amountInSubunits: Math.round(finalAmount * 100),
        paymentMethod: paymentMethod || 'razorpay',
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_zovo_demo',
        upiId: upiVpa,
        upiPayeeName,
        upiDeepLink,
        acceptedMethods,
      },
    });
  } catch (err: any) {
    console.error('API /api/payment/create-intent error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error creating payment intent.' },
      { status: 500 }
    );
  }
}
