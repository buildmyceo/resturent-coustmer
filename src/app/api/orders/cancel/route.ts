import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

const APPROVED_STATUSES = [
  'accepted',
  'confirmed',
  'waiter_accepted',
  'sent_to_kitchen',
  'accepted_by_kitchen',
  'preparing',
  'ready',
  'served',
  'completed',
];

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { orderId, reason, isAdmin } = body;

    if (!orderId) {
      return NextResponse.json(
        { success: false, error: 'Order ID is required.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 1. Fetch the order
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select('id, order_number, status, restaurant_id, table_id, table_session_id')
      .eq('id', orderId)
      .maybeSingle();

    if (fetchError || !order) {
      return NextResponse.json(
        { success: false, error: fetchError?.message || 'Order not found.' },
        { status: 404 }
      );
    }

    // 2. Validate current state
    if (order.status === 'cancelled') {
      return NextResponse.json(
        { success: false, error: 'This order is already cancelled.' },
        { status: 400 }
      );
    }

    if (order.status === 'completed' || order.status === 'served') {
      return NextResponse.json(
        { success: false, error: 'Cannot cancel an order that has already been delivered or completed.' },
        { status: 400 }
      );
    }

    // 3. User Rule Enforcement: Once approved, ONLY Admin/Cashier can cancel
    const isApproved = APPROVED_STATUSES.includes(String(order.status).toLowerCase());

    if (isApproved && !isAdmin) {
      return NextResponse.json(
        {
          success: false,
          isApproved: true,
          error:
            'This order has already been approved and sent to the kitchen. Once approved, the order can only be cancelled by the Cashier or Admin.',
        },
        { status: 403 }
      );
    }

    // 4. Update the order to cancelled
    const cancellationReason =
      reason?.trim() ||
      (isAdmin
        ? 'Cancelled by Cashier / Admin'
        : 'Cancelled by customer before cashier approval');

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        status: 'cancelled',
        rejection_reason: cancellationReason,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    // 5. Update items to cancelled as well
    try {
      await supabase
        .from('order_items')
        .update({ status: 'cancelled' })
        .eq('order_id', orderId);
    } catch {
      // Non-blocking item status update
    }

    // 6. Clean up any state marker rows
    try {
      const shortId = String(orderId).replace(/-/g, '').slice(0, 8);
      await supabase
        .from('orders')
        .delete()
        .or(`customer_note.like.ORDER_STATUS:${orderId}:%,order_number.like.ORD_STATE-${shortId}%`);
    } catch {
      // Non-blocking cleanup
    }

    // 7. Realtime broadcast to restaurant channel so Staff, Kitchen, and Admin update instantly
    if (order.restaurant_id) {
      try {
        const rtChannel = supabase.channel(`restaurant:${order.restaurant_id}`, {
          config: { broadcast: { self: true } },
        });
        rtChannel.subscribe(async (subStatus) => {
          if (subStatus === 'SUBSCRIBED') {
            const payload = {
              id: order.id,
              order_number: order.order_number,
              restaurant_id: order.restaurant_id,
              table_id: order.table_id,
              table_session_id: order.table_session_id,
              status: 'cancelled',
              rejection_reason: cancellationReason,
              updated_at: new Date().toISOString(),
            };

            await rtChannel.send({
              type: 'broadcast',
              event: 'ORDER_UPDATED',
              payload,
            });
            await rtChannel.send({
              type: 'broadcast',
              event: 'order_status_updated',
              payload,
            });

            setTimeout(() => {
              supabase.removeChannel(rtChannel);
            }, 1500);
          }
        });
      } catch {
        // Non-blocking broadcast
      }
    }

    return NextResponse.json({
      success: true,
      message: `Order #${order.order_number} has been cancelled successfully.`,
      status: 'cancelled',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Internal server error while cancelling order.' },
      { status: 500 }
    );
  }
}
