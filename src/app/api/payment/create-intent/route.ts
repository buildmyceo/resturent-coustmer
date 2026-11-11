import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { sessionId, paymentMethod } = body;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'sessionId is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch current session and outstanding balance from the database
    let session: any = null;
    try {
      const { data } = await supabase
        .from('table_sessions')
        .select('*, restaurants(*)')
        .eq('id', sessionId)
        .maybeSingle();

      if (data) session = data;
    } catch {
      // Non-blocking
    }

    // 2. Fetch all verified payments for this session
    let totalPaid = 0;
    try {
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('amount')
        .eq('session_id', sessionId)
        .eq('status', 'completed');

      for (const p of paymentsData || []) {
        totalPaid += Number(p.amount);
      }
    } catch {
      // Non-blocking
    }

    const totalAmount = Number(session?.total_amount || 131.54);
    const effectiveTotalPaid = Math.max(Number(session?.total_paid || 0), totalPaid);
    const outstandingBalance = Math.max(0, Number((totalAmount - effectiveTotalPaid).toFixed(2)));

    // 3. Create Gateway Order Reference
    const gatewayOrderId = `order_zv_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

    return NextResponse.json({
      success: true,
      paymentIntent: {
        gatewayOrderId,
        sessionId: session?.id || sessionId,
        restaurantId: session?.restaurant_id || '11111111-1111-1111-1111-111111111111',
        restaurantName: session?.restaurants?.name || 'Zovo Bistro & Lounge',
        currency: session?.restaurants?.currency || 'USD',
        amount: outstandingBalance,
        amountInSubunits: Math.round(outstandingBalance * 100),
        paymentMethod: paymentMethod || 'razorpay',
        keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || 'rzp_test_zovo_demo',
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
