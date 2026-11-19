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
          .select('*, order_items(*, dishes(preparation_time, image_url))')
          .eq('id', orderId)
          .maybeSingle();
        if (data) ordersData = [data];
      } catch {
        const { data } = await supabase
          .from('orders')
          .select('*, order_items(*)')
          .eq('id', orderId)
          .maybeSingle();
        if (data) ordersData = [data];
      }

      // Also fetch any state markers for this order
      try {
        const shortId = String(orderId).replace(/-/g, '').slice(0, 8);
        const { data: stateRows } = await supabase
          .from('orders')
          .select('order_number, status, customer_note, updated_at')
          .like('order_number', `ORD_STATE-${shortId}%`);
        if (stateRows && stateRows.length > 0) {
          ordersData.push(...stateRows);
        }
      } catch {}
    }

    // 2. Query by table_id (most reliable for physical table dining)
    if (ordersData.length === 0) {
      const targetTableId = tableId || '24f7b562-0d70-4f5e-bde4-9bd01639dbb6';
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*, dishes(preparation_time, image_url))')
          .eq('table_id', targetTableId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false });

        if (!error && data && data.length > 0) {
          ordersData = data;
        } else {
          const { data: fallbackData } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('table_id', targetTableId)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false });
          if (fallbackData) ordersData = fallbackData;
        }
      } catch {}
    }

    // 3. Fallback: Query by restaurant_id
    if (ordersData.length === 0) {
      const targetRestId = restaurantId || 'a9feec11-8dee-4202-be6e-a097e45266e6';
      try {
        const { data, error } = await supabase
          .from('orders')
          .select('*, order_items(*, dishes(preparation_time, image_url))')
          .eq('restaurant_id', targetRestId)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(10);

        if (!error && data && data.length > 0) {
          ordersData = data;
        } else {
          const { data: fallbackData } = await supabase
            .from('orders')
            .select('*, order_items(*)')
            .eq('restaurant_id', targetRestId)
            .neq('status', 'cancelled')
            .order('created_at', { ascending: false })
            .limit(10);
          if (fallbackData) ordersData = fallbackData;
        }
      } catch {}
    }

    // Filter out internal service request / call marker rows
    // Only return actual food orders
    const foodOrders = (ordersData || []).filter((o: any) => {
      const orderNum = o.order_number || '';
      const note = o.customer_note || '';

      // Exclude service requests & status markers
      if (
        orderNum.startsWith('CALL-') ||
        orderNum.startsWith('SR_STATE-') ||
        orderNum.startsWith('ORD_STATE-') ||
        orderNum.startsWith('ACK-') ||
        orderNum.startsWith('TEST-') ||
        note.startsWith('SR_STATUS:') ||
        note.startsWith('ORDER_STATUS:') ||
        note.startsWith('CALL_WAITER:') ||
        note.startsWith('ACK:')
      ) {
        return false;
      }

      // If an order is completed OR marked paid, do NOT show it to new table visitors
      // unless specifically requested by exact orderId
      if (!orderId) {
        if (o.status === 'completed' || o.payment_status === 'paid') {
          return false;
        }
      }

      return true;
    });

    // Check status markers (ORD_STATE-*) to overlay live order progress
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
      completed: 6,
    };

    const stateMap = new Map<string, string>();
    (ordersData || []).forEach((row: any) => {
      const note = row.customer_note || '';
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

    const formattedOrders = foodOrders.map((o: any) => {
      const effectiveStatus = stateMap.get(o.id) || o.status;
      return {
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
        status: effectiveStatus,
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
          status: i.status || effectiveStatus,
          prepTime: Number(i.dishes?.preparation_time || i.preparation_time || 15),
          servedAt: i.served_at,
        })),
      };
    });

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
