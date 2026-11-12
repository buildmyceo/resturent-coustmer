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
      const { data: defaultRests } = await supabase.from('restaurants').select('*').order('created_at', { ascending: false }).limit(1);
      if (defaultRests && defaultRests.length > 0) realRest = defaultRests[0];
    }

    const resolvedRestId = realRest?.id || '07e9a4c7-edae-4bf0-8786-fc220c152d43';
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

    const resolvedTableId = realTable?.id || 'ebfc2c24-6cf7-4adf-aef9-c0238b5eaa6a';

    // 2. Fetch all unpaid table orders
    let totalOutstanding = 0;
    try {
      const { data: orders } = await supabase
        .from('orders')
        .select('total_amount, payment_status, status')
        .eq('table_id', resolvedTableId)
        .neq('status', 'cancelled');

      if (orders && orders.length > 0) {
        for (const o of orders) {
          if (o.payment_status !== 'paid') {
            totalOutstanding += Number(o.total_amount || 0);
          }
        }
      }
    } catch {
      // Fallback
    }

    // Fallback if 0: default to ₹1.00 minimum
    const finalAmount = Math.max(0, Number(totalOutstanding.toFixed(2))) || 1.0;
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
