import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const invoiceId = searchParams.get('invoiceId');
    const sessionId = searchParams.get('sessionId');
    const orderId = searchParams.get('orderId');

    if (!invoiceId && !sessionId && !orderId) {
      return NextResponse.json(
        { success: false, error: 'invoiceId, sessionId, or orderId parameter is required.' },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    let invoiceQuery = supabase.from('invoices').select('*, restaurants(*)');
    if (invoiceId) {
      invoiceQuery = invoiceQuery.eq('id', invoiceId);
    } else if (sessionId) {
      invoiceQuery = invoiceQuery.eq('session_id', sessionId);
    } else if (orderId) {
      invoiceQuery = invoiceQuery.eq('order_id', orderId);
    }

    const { data: invoice } = await invoiceQuery
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (invoice) {
      return NextResponse.json({
        success: true,
        receipt: {
          id: invoice.id,
          invoiceNumber: invoice.invoice_number,
          restaurantName: invoice.restaurants?.name || 'Restaurant',
          restaurantLogoUrl: invoice.restaurants?.logo_url || null,
          restaurantAddress: invoice.restaurants?.address || '',
          restaurantPhone: invoice.restaurants?.phone || '',
          restaurantEmail: invoice.restaurants?.email || '',
          tableNumber: invoice.table_number,
          customerName: invoice.customer_name,
          customerEmail: invoice.customer_email,
          customerPhone: invoice.customer_phone,
          subtotal: Number(invoice.subtotal),
          taxAmount: Number(invoice.tax_amount),
          serviceFee: Number(invoice.service_fee),
          discountAmount: Number(invoice.discount_amount || 0),
          totalAmount: Number(invoice.total_amount),
          totalPaid: Number(invoice.total_paid),
          status: invoice.status,
          items: invoice.items_snapshot || [],
          taxBreakdown: invoice.tax_breakdown,
          paymentReference: invoice.payment_reference,
          createdAt: invoice.created_at,
        },
      });
    }

    // Fallback: synthesize strictly from orders belonging to the requested sessionId or orderId
    let ordQuery = supabase
      .from('orders')
      .select('*, order_items(*), restaurants(*), restaurant_tables(*)')
      .neq('status', 'cancelled')
      .neq('status', 'pending_payment');

    if (orderId) {
      ordQuery = ordQuery.eq('id', orderId);
    } else if (sessionId) {
      ordQuery = ordQuery.eq('table_session_id', sessionId);
    } else {
      return NextResponse.json(
        { success: false, error: 'Invoice not found.' },
        { status: 404 }
      );
    }

    const { data: dbOrders } = await ordQuery.order('created_at', { ascending: true });

    if (!dbOrders || dbOrders.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No orders or receipt found for this session.' },
        { status: 404 }
      );
    }

    const firstOrd = dbOrders[0];
    const actualItems: any[] = [];
    let calculatedSubtotal = 0;
    let taxAmount = 0;
    let serviceFee = 0;
    let deliveryFee = 0;
    let discountAmount = 0;
    let totalAmount = 0;

    for (const ord of dbOrders) {
      calculatedSubtotal += Number(ord.subtotal || 0);
      taxAmount += Number(ord.tax_amount || 0);
      serviceFee += Number(ord.service_fee || 0);
      deliveryFee += Number(ord.delivery_fee || 0);
      discountAmount += Number(ord.discount_amount || 0);
      totalAmount += Number(ord.total_amount || 0);

      for (const it of ord.order_items || []) {
        const q = Number(it.quantity) || 1;
        const p = Number(it.unit_price) || 0;
        actualItems.push({
          dishName: it.dish_name,
          quantity: q,
          unitPrice: p,
          totalPrice: q * p,
        });
      }
    }

    const invoiceNumber = `INV-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

    return NextResponse.json({
      success: true,
      receipt: {
        id: invoiceId || sessionId || orderId,
        invoiceNumber,
        restaurantName: firstOrd.restaurants?.name || 'Restaurant',
        restaurantLogoUrl: firstOrd.restaurants?.logo_url || null,
        restaurantAddress: firstOrd.restaurants?.address || '',
        restaurantPhone: firstOrd.restaurants?.phone || '',
        restaurantEmail: firstOrd.restaurants?.email || '',
        tableNumber: firstOrd.restaurant_tables?.table_number || (firstOrd.order_type === 'delivery' ? 'DELIVERY' : ''),
        customerName: firstOrd.customer_name || firstOrd.participant_name || 'Guest',
        customerEmail: firstOrd.customer_email || '',
        customerPhone: firstOrd.customer_phone || '',
        subtotal: calculatedSubtotal,
        taxAmount,
        serviceFee,
        deliveryFee,
        discountAmount,
        totalAmount,
        totalPaid: totalAmount,
        status: firstOrd.payment_status === 'paid' ? 'paid' : 'pending',
        items: actualItems,
        paymentReference: firstOrd.gateway_payment_id || firstOrd.order_number,
        createdAt: firstOrd.created_at,
      },
    });
  } catch (err: any) {
    console.error('API /api/receipt/get error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error fetching receipt.' },
      { status: 500 }
    );
  }
}
