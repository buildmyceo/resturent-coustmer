import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const orderId = searchParams.get('orderId');
    const tableId = searchParams.get('tableId');
    const guestToken = searchParams.get('guestToken') || request.headers.get('x-guest-token');

    if (!orderId && !tableId && !sessionId) {
      return NextResponse.json(
        { success: false, error: 'orderId, tableId, or sessionId is required.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    let ordersData: any[] = [];

    if (orderId) {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*, dishes(preparation_time, image_url)), restaurants(name, slug, phone, address)')
        .eq('id', orderId)
        .maybeSingle();

      if (data) {
        if (data.order_type === 'delivery' && data.guest_token && guestToken && data.guest_token !== guestToken) {
          return NextResponse.json(
            { success: false, error: 'Invalid guestToken for this order.' },
            { status: 403 }
          );
        }
        ordersData = [data];
      }

      const shortId = String(orderId).replace(/-/g, '').slice(0, 8);
      const { data: stateRows } = await supabase
        .from('orders')
        .select('order_number, status, customer_note, updated_at')
        .like('order_number', `ORD_STATE-${shortId}%`);
      if (stateRows && stateRows.length > 0) {
        ordersData.push(...stateRows);
      }
    } else if (sessionId) {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*, dishes(preparation_time, image_url))')
        .eq('table_session_id', sessionId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (data) ordersData = data;
    } else if (tableId) {
      const { data } = await supabase
        .from('orders')
        .select('*, order_items(*, dishes(preparation_time, image_url))')
        .eq('table_id', tableId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false });
      if (data) ordersData = data;
    }

    const statusRank: Record<string, number> = {
      pending_payment: -1,
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
      cancelled: -2,
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
          const currentRank = currentBest ? statusRank[currentBest] ?? 0 : -1;
          const newRank = statusRank[st] ?? 0;
          if (newRank >= currentRank) {
            stateMap.set(ordId, st);
          }
        }
      }
    });

    const getEffectiveStatus = (baseStatus: string, ordId: string): string => {
      const base = baseStatus || 'pending';
      if (base === 'completed' || base === 'cancelled' || base === 'pending_payment') return base;
      const overlay = stateMap.get(ordId);
      if (!overlay) return base;
      const baseRank = statusRank[base] ?? 0;
      const overlayRank = statusRank[overlay] ?? 0;
      return overlayRank > baseRank ? overlay : base;
    };

    const now = new Date();
    const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    const foodOrders = (ordersData || []).filter((o: any) => {
      const orderNum = o.order_number || '';
      const note = o.customer_note || '';

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
        !o.order_items ||
        o.order_items.length === 0
      ) {
        return false;
      }

      if (orderId && o.id === orderId) return true;
      if (sessionId && o.table_session_id === sessionId) return true;
      if (sessionId && (note.includes(`[SESS:${sessionId}]`) || note.includes(`SESSION:${sessionId}`))) {
        return true;
      }

      const orderCreatedTime = new Date(o.created_at).getTime();
      if (orderCreatedTime < todayMidnight) return false;

      const effectiveStatus = getEffectiveStatus(o.status, o.id);
      if ((effectiveStatus === 'completed' || o.payment_status === 'paid') && !sessionId) {
        return false;
      }

      return true;
    });

    const formattedOrders = foodOrders.map((o: any) => {
      const effectiveStatus = getEffectiveStatus(o.status, o.id);
      return {
        id: o.id,
        restaurantId: o.restaurant_id,
        restaurantName: o.restaurants?.name || null,
        restaurantSlug: o.restaurants?.slug || null,
        restaurantPhone: o.restaurants?.phone || null,
        restaurantAddress: o.restaurants?.address || null,
        tableId: o.table_id,
        tableSessionId: o.table_session_id || sessionId || null,
        participantId: o.participant_id || 'guest',
        participantName: o.participant_name || o.customer_name || 'Guest',
        orderNumber: o.order_number,
        orderType: o.order_type || 'dine_in',
        deliveryStatus: o.delivery_status || null,
        deliveryAddress: o.delivery_address || null,
        deliveryLandmark: o.delivery_landmark || null,
        deliveryDistanceKm: o.delivery_distance_km ? Number(o.delivery_distance_km) : null,
        deliveryFee: Number(o.delivery_fee || 0),
        discountAmount: Number(o.discount_amount || 0),
        dispatchedAt: o.dispatched_at || null,
        deliveredAt: o.delivered_at || null,
        orderSource: o.order_source || 'Customer',
        subtotal: Number(o.subtotal || 0),
        taxAmount: Number(o.tax_amount || 0),
        serviceFee: Number(o.service_fee || 0),
        totalAmount: Number(o.total_amount || 0),
        status: effectiveStatus,
        orderTime: o.created_at,
        createdAt: o.created_at,
        customerNote: o.customer_note,
        customerName: o.customer_name || null,
        customerPhone: o.customer_phone || null,
        customerEmail: o.customer_email || null,
        paymentMethod: o.payment_gateway || o.payment_method || 'Online',
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
