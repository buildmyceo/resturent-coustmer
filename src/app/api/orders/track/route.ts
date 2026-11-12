import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const orderId = searchParams.get('orderId');
    let tableId = searchParams.get('tableId');
    let restaurantId = searchParams.get('restaurantId');

    const supabase = await createServerSupabaseClient();

    let ordersData: any[] = [];

    // 1. If explicit orderId
    if (orderId) {
      try {
        const { data } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('id', orderId)
          .maybeSingle();
        if (data) ordersData = [data];
      } catch {}
    }

    // 2. Query by table_id (most reliable for physical table dining)
    if (ordersData.length === 0) {
      const targetTableId = tableId || 'ebfc2c24-6cf7-4adf-aef9-c0238b5eaa6a';
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('table_id', targetTableId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          ordersData = data;
        }
      } catch {}
    }

    // 3. Fallback: Query by restaurant_id
    if (ordersData.length === 0) {
      const targetRestId = restaurantId || '07e9a4c7-edae-4bf0-8786-fc220c152d43';
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('restaurant_id', targetRestId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!error && data && data.length > 0) {
          ordersData = data;
        }
      } catch {}
    }

    const formattedOrders = (ordersData || []).map((o: any) => ({
      id: o.id,
      restaurantId: o.restaurant_id,
      tableId: o.table_id,
      tableSessionId: sessionId || o.table_id,
      participantId: o.participant_id || 'guest',
      participantName: o.participant_name || 'Guest',
      orderNumber: o.order_number,
      tableNumber: o.table_number || 'T-01',
      orderSource: o.order_source || 'Customer',
      subtotal: Number(o.subtotal || 0),
      taxAmount: Number(o.tax_amount || 0),
      serviceFee: Number(o.service_fee || 0),
      totalAmount: Number(o.total_amount || 0),
      status: o.status,
      orderTime: o.created_at,
      createdAt: o.created_at,
      customerNote: o.customer_note,
      paymentMethod: o.payment_method || 'Online',
      paymentStatus: o.payment_status || 'pending',
      items: (o.order_items || []).map((i: any) => ({
        id: i.id,
        orderId: i.order_id,
        dishId: i.dish_id,
        dishName: i.dish_name,
        quantity: i.quantity || 1,
        unitPrice: Number(i.unit_price || 0),
        notes: i.notes,
        variantName: i.variant_name,
        addons: Array.isArray(i.addons) ? i.addons : [],
        status: o.status,
      })),
    }));

    return NextResponse.json({
      success: true,
      orders: formattedOrders,
    });
  } catch (err: any) {
    console.error('API /api/orders/track error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while fetching table orders.' },
      { status: 500 }
    );
  }
}
