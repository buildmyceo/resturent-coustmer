import { createClient } from './client';
import {
  RestaurantProfile,
  Category,
  Dish,
  TableSession,
  Order,
  OrderItem,
  ServiceRequest,
  ServiceRequestType,
  Invoice,
  PaymentRecord,
} from '@/types';

const supabase = createClient();

/**
 * 1. SECURE SERVER/CLIENT QR RESOLUTION
 */
export async function resolveTableQRDB(publicIdentifier: string): Promise<{
  success: boolean;
  error?: string;
  table?: {
    tableId: string;
    tableNumber: string;
    tableName: string;
    seatingCapacity: number;
    restaurantId: string;
    restaurantName: string;
    restaurantSlug: string;
    restaurantStatus: string;
    activeSessionId?: string | null;
    sessionStatus?: string | null;
  };
}> {
  try {
    const trimmedId = (publicIdentifier || '').trim();
    if (!trimmedId) {
      return { success: false, error: 'Missing QR code identifier.' };
    }

    // Try calling trusted database RPC if installed
    const { data: rpcData, error: rpcError } = await supabase.rpc('resolve_table_qr', {
      p_public_identifier: trimmedId,
    });

    if (!rpcError && rpcData && rpcData.length > 0) {
      const row = rpcData[0];
      return {
        success: true,
        table: {
          tableId: row.table_id,
          tableNumber: row.table_number,
          tableName: row.table_name,
          seatingCapacity: row.seating_capacity,
          restaurantId: row.restaurant_id,
          restaurantName: row.restaurant_name,
          restaurantSlug: row.restaurant_slug,
          restaurantStatus: row.restaurant_status || 'active',
          activeSessionId: row.active_session_id || null,
          sessionStatus: row.session_status || null,
        },
      };
    }

    // Fallback: Query table_qr_codes joining restaurant_tables and restaurants
    const { data: qrData, error: qrError } = await supabase
      .from('table_qr_codes')
      .select('*, restaurant_tables(*), restaurants(*)')
      .eq('public_identifier', trimmedId)
      .single();

    if (qrError || !qrData) {
      return { success: false, error: 'QR Code not found in system or unrecognized format.' };
    }

    // Check QR Active & Not Revoked
    if (!qrData.is_active || qrData.revoked_at) {
      return { success: false, error: 'This QR code has been revoked or deactivated by restaurant management.' };
    }

    // Check QR Expiration
    if (qrData.expires_at && new Date(qrData.expires_at) < new Date()) {
      return { success: false, error: 'This QR code has expired. Please ask the waiter for a fresh QR code.' };
    }

    const table = qrData.restaurant_tables;
    const restaurant = qrData.restaurants;

    if (!table || !table.is_active) {
      return { success: false, error: 'This dining table is currently marked inactive or closed.' };
    }

    if (!restaurant || restaurant.status !== 'active') {
      return { success: false, error: `Restaurant is currently ${restaurant?.status || 'inactive'}. Ordering unavailable.` };
    }

    // Check whether an active session already exists on this table
    let activeSessionId: string | null = null;
    let sessionStatus: string | null = null;

    try {
      const { data: sessionData } = await supabase
        .from('table_sessions')
        .select('id, status')
        .eq('table_id', table.id)
        .in('status', ['occupied', 'payment_pending'])
        .maybeSingle();

      if (sessionData) {
        activeSessionId = sessionData.id;
        sessionStatus = sessionData.status;
      }
    } catch {
      // Non-blocking if table_sessions schema is fresh
    }

    return {
      success: true,
      table: {
        tableId: table.id,
        tableNumber: table.table_number,
        tableName: table.table_name,
        seatingCapacity: table.seating_capacity,
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        restaurantSlug: restaurant.slug,
        restaurantStatus: restaurant.status,
        activeSessionId,
        sessionStatus,
      },
    };
  } catch (err: any) {
    console.warn('Supabase resolveTableQRDB error:', err);
    return { success: false, error: err?.message || 'Failed to resolve QR token with server.' };
  }
}

/**
 * 2. START OR JOIN TABLE SESSION
 */
export async function startOrJoinTableSessionDB(params: {
  publicIdentifier: string;
  tableId: string;
  restaurantId: string;
  guestName: string;
  guestToken: string;
}): Promise<{
  success: boolean;
  error?: string;
  sessionId?: string;
  participantId?: string;
  guestToken?: string;
  isHost?: boolean;
}> {
  try {
    // 1. Try atomic database RPC first
    const { data: rpcData, error: rpcError } = await supabase.rpc('start_or_join_table_session', {
      p_public_identifier: params.publicIdentifier,
      p_guest_name: params.guestName,
      p_guest_token: params.guestToken,
    });

    if (!rpcError && rpcData && rpcData.success) {
      return {
        success: true,
        sessionId: rpcData.session_id,
        participantId: rpcData.participant_id,
        guestToken: rpcData.guest_token,
        isHost: rpcData.is_host,
      };
    }

    // 2. Fallback resilient implementation
    // Check if active session exists on table
    const { data: existingSession } = await supabase
      .from('table_sessions')
      .select('*')
      .eq('table_id', params.tableId)
      .in('status', ['occupied', 'payment_pending'])
      .maybeSingle();

    let sessionId: string;
    let isHost = false;

    if (existingSession) {
      sessionId = existingSession.id;
      // Increment guest count
      await supabase
        .from('table_sessions')
        .update({
          guest_count: (existingSession.guest_count || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
    } else {
      isHost = true;
      const { data: newSession, error: newSessionErr } = await supabase
        .from('table_sessions')
        .insert({
          restaurant_id: params.restaurantId,
          table_id: params.tableId,
          status: 'occupied',
          guest_count: 1,
          customer_name: params.guestName,
          opened_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (newSessionErr || !newSession) {
        // If unique index conflict occurred from concurrent scan, fetch the newly created session
        const { data: retrySession } = await supabase
          .from('table_sessions')
          .select('id')
          .eq('table_id', params.tableId)
          .in('status', ['occupied', 'payment_pending'])
          .single();

        if (retrySession) {
          sessionId = retrySession.id;
        } else {
          return { success: false, error: newSessionErr?.message || 'Failed to create dining table session.' };
        }
      } else {
        sessionId = newSession.id;
      }
    }

    // Create participant record
    let participantId = `part_${Date.now()}`;
    try {
      const { data: participantData } = await supabase
        .from('session_participants')
        .insert({
          session_id: sessionId,
          name: params.guestName,
          guest_token: params.guestToken,
          is_host: isHost,
          joined_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (participantData) {
        participantId = participantData.id;
      }
    } catch {
      // Non-blocking
    }

    return {
      success: true,
      sessionId,
      participantId,
      guestToken: params.guestToken,
      isHost,
    };
  } catch (err: any) {
    console.warn('startOrJoinTableSessionDB error:', err);
    return { success: false, error: err?.message || 'Failed to establish guest table session.' };
  }
}

/**
 * 3. FETCH RESTAURANT PROFILE & MENU
 */
export async function fetchRestaurantAndMenuDB(restaurantId: string): Promise<{
  restaurant: RestaurantProfile | null;
  categories: Category[];
  dishes: Dish[];
}> {
  try {
    // Parallel fetch for optimal latency
    const [restRes, settingsRes, catsRes, dishesRes] = await Promise.all([
      supabase.from('restaurants').select('*').eq('id', restaurantId).single(),
      supabase.from('restaurant_settings').select('*').eq('restaurant_id', restaurantId).maybeSingle(),
      supabase
        .from('categories')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('dishes')
        .select('*, dish_variants(*), dish_addons(*)')
        .eq('restaurant_id', restaurantId)
        .eq('is_archived', false)
        .eq('is_available', true),
    ]);

    const r = restRes.data;
    const s = settingsRes.data;

    let restaurant: RestaurantProfile | null = null;
    if (r) {
      let geofence = {
        enabled: true,
        latitude: 25.618193,
        longitude: 85.039305,
        radiusMeters: 50,
        address: r.address || 'sagunamore, patna',
      };
      if (s?.receipt_footer) {
        const match = s.receipt_footer.match(/<!--ZOVO_GEOFENCE_CONFIG:([\s\S]*?)-->/);
        if (match && match[1]) {
          try {
            const parsed = JSON.parse(match[1]);
            geofence = {
              ...geofence,
              ...parsed,
              enabled:
                typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number'
                  ? true
                  : parsed.enabled !== false,
              latitude: parsed.latitude || 25.618193,
              longitude: parsed.longitude || 85.039305,
              radiusMeters: Math.min(200, Math.max(10, parsed.radiusMeters || 50)),
            };
          } catch {}
        }
      }

      restaurant = {
        id: r.id,
        name: r.name,
        slug: r.slug,
        description: r.description,
        logoUrl: r.logo_url,
        coverImageUrl: r.cover_image_url,
        restaurantType: r.restaurant_type,
        phone: r.phone,
        email: r.email,
        address: r.address,
        city: r.city,
        state: r.state,
        country: r.country,
        postalCode: r.postal_code,
        currency: r.currency || 'USD',
        timezone: r.timezone || 'America/Los_Angeles',
        status: r.status,
        settings: {
          taxEnabled: s?.tax_enabled ?? true,
          taxPercentage: Number(s?.tax_percentage ?? 8.5),
          serviceChargeEnabled: s?.service_charge_enabled ?? true,
          serviceChargePercentage: Number(s?.service_charge_percentage ?? 10.0),
          currency: s?.currency || r.currency || 'USD',
          timezone: s?.timezone || r.timezone || 'America/Los_Angeles',
          receiptFooter: s?.receipt_footer || 'Thank you for dining with us!',
          openingHours: s?.opening_hours || undefined,
          geofence,
        },
      };
    }

    const categories: Category[] = (catsRes.data || []).map((c: any) => ({
      id: c.id,
      restaurantId: c.restaurant_id,
      name: c.name,
      description: c.description,
      image: c.image_url,
      displayOrder: c.sort_order || 1,
      isActive: c.is_active,
    }));

    const dishes: Dish[] = (dishesRes.data || []).map((d: any) => ({
      id: d.id,
      restaurantId: d.restaurant_id,
      name: d.name,
      description: d.description || '',
      price: Number(d.price || 0),
      categoryId: d.category_id || '',
      image: d.image_url || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
      prepTime: d.preparation_time || 15,
      dietaryType: d.dietary_type || 'vegetarian',
      allergens: Array.isArray(d.allergens) ? d.allergens : [],
      isAvailable: d.is_available,
      isArchived: d.is_archived,
      variants: (d.dish_variants || [])
        .filter((v: any) => v.is_active)
        .map((v: any) => ({
          id: v.id,
          dishId: v.dish_id,
          name: v.name,
          price: Number(v.price),
          isActive: v.is_active,
        })),
      addons: (d.dish_addons || [])
        .filter((a: any) => a.is_active)
        .map((a: any) => ({
          id: a.id,
          dishId: a.dish_id,
          name: a.name,
          additionalPrice: Number(a.additional_price),
          isActive: a.is_active,
        })),
      ordersCount: d.orders_count || 0,
      createdAt: d.created_at,
    }));

    return { restaurant, categories, dishes };
  } catch (err) {
    console.warn('fetchRestaurantAndMenuDB error:', err);
    return { restaurant: null, categories: [], dishes: [] };
  }
}

/**
 * 4. FETCH TABLE SESSION ORDERS (WITH LIVE REALTIME DATA)
 */
export async function fetchTableSessionOrdersDB(sessionId: string): Promise<Order[]> {
  try {
    const { data: ordersData, error } = await supabase
      .from('orders')
      .select('*, order_items(*), assigned_waiter:profiles!assigned_waiter_id(full_name)')
      .eq('table_session_id', sessionId)
      .order('created_at', { ascending: false });

    if (error || !ordersData) {
      return [];
    }

    return ordersData.map((o: any) => ({
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
      assignedWaiterId: o.assigned_waiter_id || null,
      assignedWaiterName: o.assigned_waiter?.full_name || null,
      assignedAt: o.assigned_at || null,
      assignmentMethod: o.assignment_method || undefined,
      assignmentStatus: o.assignment_status || undefined,
      rejectionReason: o.rejection_reason || null,
      rejectedAt: o.rejected_at || null,
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
  } catch (err) {
    console.warn('fetchTableSessionOrdersDB error:', err);
    return [];
  }
}

/**
 * 5. CREATE SERVICE REQUEST (CALL WAITER, WATER, BILL)
 */
export async function createServiceRequestDB(params: {
  restaurantId: string;
  tableId: string;
  sessionId: string;
  requestType: ServiceRequestType;
  notes?: string;
  requestedByName?: string;
}): Promise<{ success: boolean; error?: string; requestId?: string }> {
  try {
    const { data, error } = await supabase
      .from('service_requests')
      .insert({
        restaurant_id: params.restaurantId,
        table_id: params.tableId,
        session_id: params.sessionId,
        request_type: params.requestType,
        status: 'pending',
        notes: params.notes || null,
        requested_by_name: params.requestedByName || 'Guest',
      })
      .select('id')
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, requestId: data.id };
  } catch (err: any) {
    console.warn('createServiceRequestDB error:', err);
    return { success: false, error: err?.message || 'Failed to submit service request.' };
  }
}

/**
 * 6. FETCH INVOICE OR RECEIPT
 */
export async function fetchInvoiceDB(invoiceIdOrSessionId: string): Promise<Invoice | null> {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .or(`id.eq.${invoiceIdOrSessionId},session_id.eq.${invoiceIdOrSessionId},invoice_number.eq.${invoiceIdOrSessionId}`)
      .order('created_at', { ascending: false })
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      restaurantId: data.restaurant_id,
      sessionId: data.session_id,
      invoiceNumber: data.invoice_number,
      tableNumber: data.table_number,
      customerName: data.customer_name,
      customerEmail: data.customer_email,
      customerPhone: data.customer_phone,
      subtotal: Number(data.subtotal),
      taxAmount: Number(data.tax_amount),
      serviceFee: Number(data.service_fee),
      discountAmount: Number(data.discount_amount || 0),
      totalAmount: Number(data.total_amount),
      totalPaid: Number(data.total_paid),
      status: data.status,
      itemsSnapshot: data.items_snapshot || [],
      taxBreakdown: data.tax_breakdown || {
        taxRate: 8.5,
        taxAmount: Number(data.tax_amount),
        serviceFeeRate: 10,
        serviceFeeAmount: Number(data.service_fee),
      },
      paymentReference: data.payment_reference,
      createdAt: data.created_at,
    };
  } catch (err) {
    console.warn('fetchInvoiceDB error:', err);
    return null;
  }
}

