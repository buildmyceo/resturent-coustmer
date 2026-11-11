import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const orderId = searchParams.get('orderId');

    if (!sessionId && !orderId) {
      return NextResponse.json(
        { success: false, error: 'sessionId or orderId parameter is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    let ordersData: any[] = [];
    try {
      if (sessionId) {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('table_session_id', sessionId)
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          ordersData = data;
        }
      } else if (orderId) {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('id', orderId)
          .order('created_at', { ascending: false });

        if (!error && data) ordersData = data;
      }
    } catch {
      // Non-blocking
    }

    // Fallback: If table_session_id column does not exist yet or yielded 0 rows, query recent orders
    if (ordersData.length === 0) {
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!error && data && data.length > 0) {
          ordersData = data;
        }
      } catch {
        // Non-blocking
      }
    }

    const formattedOrders = (ordersData || []).map((o: any) => ({
      id: o.id,
      restaurantId: o.restaurant_id,
      tableId: o.table_id,
      tableSessionId: o.table_session_id,
      participantId: o.participant_id,
      participantName: o.participant_name,
      orderNumber: o.order_number,
      tableNumber: o.table_number || '01',
      orderSource: o.order_source || 'Customer',
      subtotal: Number(o.subtotal || 0),
      taxAmount: Number(o.tax_amount || 0),
      serviceFee: Number(o.service_fee || 0),
      totalAmount: Number(o.total_amount || 0),
      status: o.status,
      orderTime: o.created_at,
      createdAt: o.created_at,
      customerNote: o.customer_note,
      paymentMethod: o.payment_method,
      paymentStatus: o.payment_status,
      items: (o.order_items || []).map((i: any) => ({
        id: i.id,
        orderId: i.order_id,
        dishId: i.dish_id,
        dishName: i.dish_name,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
        notes: i.notes,
        variantName: i.variant_name,
        addons: Array.isArray(i.addons) ? i.addons : [],
        status: i.status || 'pending',
      })),
    }));

    return NextResponse.json({
      success: true,
      orders: formattedOrders,
    });
  } catch (err: any) {
    console.error('API /api/orders/track error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while tracking orders.' },
      { status: 500 }
    );
  }
}
