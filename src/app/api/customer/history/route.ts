import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const restaurantId = searchParams.get('restaurantId');
    const orderIdsParam = searchParams.get('orderIds');

    const authClient = await createServerSupabaseClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();

    const userEmail = user?.email?.toLowerCase() || null;
    const userPhone = (user?.user_metadata?.phone as string | undefined) || null;
    const localOrderIds = orderIdsParam
      ? orderIdsParam
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 25)
      : [];

    if (!userEmail && !userPhone && localOrderIds.length === 0) {
      return NextResponse.json({ success: true, orders: [], bills: [] });
    }

    const admin = createAdminClient();
    let query = admin
      .from('orders')
      .select('*, order_items(*), restaurants(name, slug, currency)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (restaurantId) {
      query = query.eq('restaurant_id', restaurantId);
    }

    const orFilters: string[] = [];
    if (userEmail) orFilters.push(`customer_email.ilike.${userEmail}`);
    if (userPhone) orFilters.push(`customer_phone.eq.${userPhone}`);
    if (localOrderIds.length > 0) orFilters.push(`id.in.(${localOrderIds.join(',')})`);

    if (orFilters.length > 0) {
      query = query.or(orFilters.join(','));
    }

    const { data: orders, error } = await query;
    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    const cleanOrders = (orders || []).filter(
      (o: any) =>
        !String(o.order_number || '').startsWith('ORD_STATE-') &&
        !String(o.order_number || '').startsWith('CALL-') &&
        !String(o.order_number || '').startsWith('SR_STATE-')
    );

    const bills = cleanOrders.filter(
      (o: any) => o.payment_status === 'paid' || o.status === 'completed'
    );

    return NextResponse.json({
      success: true,
      orders: cleanOrders,
      bills,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to load customer history' },
      { status: 500 }
    );
  }
}
