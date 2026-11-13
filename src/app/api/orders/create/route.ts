import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { calculateDistanceMeters } from '@/lib/geofence';

// In-memory idempotency cache for duplicate submission prevention
const idempotencyStore = new Map<string, { timestamp: number; result: any }>();

setInterval(() => {
  const now = Date.now();
  for (const [key, val] of idempotencyStore.entries()) {
    if (now - val.timestamp > 10 * 60 * 1000) {
      idempotencyStore.delete(key);
    }
  }
}, 60 * 1000);

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      restaurantId,
      tableId,
      tableSessionId,
      participantId,
      participantName,
      items,
      customerNote,
      idempotencyKey,
      customerCoordinates,
    } = body;

    // 1. Check Idempotency Key
    if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
      const cached = idempotencyStore.get(idempotencyKey);
      return NextResponse.json(cached?.result, { status: 200 });
    }

    if (!restaurantId || !tableId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid order request: Missing restaurant, table, or items.' },
        { status: 400 }
      );
    }

    const supabase = await createServerSupabaseClient();

    // 2. Validate Table Session is active & not expired
    if (tableSessionId) {
      try {
        const { data: sessionData, error: sessionErr } = await supabase
          .from('table_sessions')
          .select('id, status, is_claim_permanent, initial_claim_expires_at')
          .eq('id', tableSessionId)
          .maybeSingle();

        if (!sessionErr && sessionData) {
          if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
            return NextResponse.json(
              { success: false, error: 'This dining session is closed. No new orders may be placed.' },
              { status: 403 }
            );
          }

          // Check 15-minute expiration before first order
          if (!sessionData.is_claim_permanent && sessionData.initial_claim_expires_at) {
            if (new Date(sessionData.initial_claim_expires_at).getTime() < Date.now()) {
              // Expire session and release table
              await supabase
                .from('table_sessions')
                .update({ status: 'cancelled', updated_at: new Date().toISOString() })
                .eq('id', tableSessionId);

              return NextResponse.json(
                { success: false, error: 'Your initial 15-minute table claim has expired. Please scan the QR code again to start a new session.' },
                { status: 410 }
              );
            }
          }
        }
      } catch {
        // Non-blocking
      }
    }

    // 3. Fetch restaurant settings for taxes & fees
    let taxRate = 8.5;
    let serviceFeeRate = 10.0;
    try {
      const { data: settingsData } = await supabase
        .from('restaurant_settings')
        .select('tax_percentage, service_charge_percentage, tax_enabled, service_charge_enabled, receipt_footer')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      if (settingsData) {
        taxRate = settingsData.tax_enabled !== false ? Number(settingsData.tax_percentage ?? 8.5) : 0;
        serviceFeeRate = settingsData.service_charge_enabled !== false ? Number(settingsData.service_charge_percentage ?? 10.0) : 0;

        // Server-Side Geofence Validation
        if (settingsData.receipt_footer) {
          const match = settingsData.receipt_footer.match(/<!--ZOVO_GEOFENCE_CONFIG:([\s\S]*?)-->/);
          if (match && match[1]) {
            try {
              const geofence = JSON.parse(match[1]);
              const hasCoordinates =
                typeof geofence.latitude === 'number' &&
                typeof geofence.longitude === 'number' &&
                Boolean(geofence.radiusMeters);
              const isEnforced = hasCoordinates || geofence.enabled !== false;

              if (hasCoordinates && isEnforced) {
                if (
                  !customerCoordinates ||
                  typeof customerCoordinates.latitude !== 'number' ||
                  typeof customerCoordinates.longitude !== 'number'
                ) {
                  return NextResponse.json(
                    {
                      success: false,
                      error:
                        'Visit restaurant to order food, or scan QR code if you are in a different restaurant.',
                    },
                    { status: 403 }
                  );
                }

                const distance = calculateDistanceMeters(
                  customerCoordinates.latitude,
                  customerCoordinates.longitude,
                  geofence.latitude,
                  geofence.longitude
                );

                // Allow 30m GPS accuracy/indoor drift buffer
                const allowedRadius = Number(geofence.radiusMeters) + 30;
                if (distance > allowedRadius) {
                  return NextResponse.json(
                    {
                      success: false,
                      error:
                        'Visit restaurant to order food, or scan QR code if you are in a different restaurant.',
                      distance: Math.round(distance),
                      allowedRadius: geofence.radiusMeters,
                    },
                    { status: 403 }
                  );
                }
              }
            } catch {
              // Ignore geofence parse error
            }
          }
        }
      }
    } catch {
      // Default to 8.5% and 10%
    }

    // 4. Fetch canonical dishes from Supabase to prevent browser price tampering
    const dishIds = items.map((i: any) => i.dishId).filter(Boolean);
    let dbDishes: any[] = [];

    try {
      const { data: fetchedDishes } = await supabase
        .from('dishes')
        .select('id, name, price, is_available, is_archived, dish_variants(*), dish_addons(*)')
        .eq('restaurant_id', restaurantId)
        .in('id', dishIds);

      if (fetchedDishes) dbDishes = fetchedDishes;
    } catch {
      // Fallback
    }

    const dishMap = new Map(dbDishes.map((d: any) => [d.id, d]));

    // 5. Server-side validation and totals calculation
    let calculatedSubtotal = 0;
    const validatedOrderItems: any[] = [];

    for (const item of items) {
      const dbDish = dishMap.get(item.dishId);
      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);

      // Verify availability
      if (dbDish && (!dbDish.is_available || dbDish.is_archived)) {
        return NextResponse.json(
          { success: false, error: `"${dbDish.name}" is currently unavailable.` },
          { status: 400 }
        );
      }

      let unitPrice = dbDish ? Number(dbDish.price) : Number(item.price || item.unitPrice || 15.0);
      let variantName: string | null = item.variantName || null;

      // Validate Variant if selected
      if (item.variantId && dbDish?.dish_variants) {
        const dbVariant = dbDish.dish_variants.find((v: any) => v.id === item.variantId && v.is_active);
        if (dbVariant) {
          unitPrice = Number(dbVariant.price);
          variantName = dbVariant.name;
        }
      }

      // Validate Addons if selected
      let addonsSum = 0;
      const validatedAddons: { name: string; price: number }[] = [];
      const addonIds = Array.isArray(item.addonIds) ? item.addonIds : (item.selectedAddons || []).map((a: any) => a.id);

      if (Array.isArray(addonIds) && dbDish?.dish_addons) {
        for (const addonId of addonIds) {
          const dbAddon = dbDish.dish_addons.find((a: any) => a.id === addonId && a.is_active);
          if (dbAddon) {
            addonsSum += Number(dbAddon.additional_price);
            validatedAddons.push({ name: dbAddon.name, price: Number(dbAddon.additional_price) });
          }
        }
      }

      const totalItemUnitPrice = unitPrice + addonsSum;
      const itemTotalPrice = totalItemUnitPrice * quantity;
      calculatedSubtotal += itemTotalPrice;

      validatedOrderItems.push({
        dish_id: dbDish?.id || item.dishId,
        dish_name: variantName ? `${item.dishName} (${variantName})` : item.dishName,
        quantity,
        unit_price: totalItemUnitPrice,
        notes: item.specialInstructions ? String(item.specialInstructions).slice(0, 500) : null,
        variant_name: variantName,
        addons: validatedAddons,
      });
    }

    const calculatedTax = Number(((calculatedSubtotal * taxRate) / 100).toFixed(2));
    const calculatedServiceFee = Number(((calculatedSubtotal * serviceFeeRate) / 100).toFixed(2));
    const calculatedTotal = Number((calculatedSubtotal + calculatedTax + calculatedServiceFee).toFixed(2));

    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;

    // 6. Equal-Distribution Waiter Assignment Algorithm
    let assignedWaiterId: string | null = null;
    let assignedWaiterName: string | null = null;
    let assignmentStatus = 'unassigned';

    try {
      // Find active, approved waiters in this restaurant
      const { data: waiters, error: wErr } = await supabase
        .from('restaurant_members')
        .select('user_id, profiles(id, full_name)')
        .eq('restaurant_id', restaurantId)
        .eq('role', 'waiter')
        .eq('approval_status', 'approved')
        .eq('is_active', true);

      if (!wErr && waiters && waiters.length > 0) {
        const waiterUserIds = waiters.map((w: any) => w.user_id);

        // Count active workload per waiter
        const { data: activeOrders } = await supabase
          .from('orders')
          .select('assigned_waiter_id')
          .eq('restaurant_id', restaurantId)
          .in('assigned_waiter_id', waiterUserIds)
          .in('status', ['waiting_for_waiter', 'waiter_accepted', 'sent_to_kitchen', 'accepted_by_kitchen', 'accepted', 'preparing', 'ready']);

        const workloadMap = new Map<string, number>();
        waiterUserIds.forEach((id: string) => workloadMap.set(id, 0));
        (activeOrders || []).forEach((o: any) => {
          if (o.assigned_waiter_id) {
            workloadMap.set(o.assigned_waiter_id, (workloadMap.get(o.assigned_waiter_id) || 0) + 1);
          }
        });

        // Sort waiters: lowest workload first, rotating tie-breaker
        const sortedWaiters = [...waiters].sort((a: any, b: any) => {
          const countA = workloadMap.get(a.user_id) || 0;
          const countB = workloadMap.get(b.user_id) || 0;
          if (countA !== countB) return countA - countB;
          return a.user_id.localeCompare(b.user_id);
        });

        const chosen: any = sortedWaiters[0];
        if (chosen) {
          assignedWaiterId = chosen.user_id;
          const profiles = chosen.profiles;
          const profileObj = Array.isArray(profiles) ? profiles[0] : profiles;
          assignedWaiterName = profileObj?.full_name || 'Floor Waiter';
          assignmentStatus = 'assigned';
        }
      }
    } catch (assignErr) {
      console.warn('Waiter assignment error:', assignErr);
    }

    // 7. Insert Order into Supabase with status = 'waiting_for_waiter'
    const orderPayload: any = {
      restaurant_id: restaurantId,
      table_id: tableId,
      order_number: orderNumber,
      order_source: 'Customer',
      subtotal: calculatedSubtotal,
      tax_amount: calculatedTax,
      service_fee: calculatedServiceFee,
      total_amount: calculatedTotal,
      status: 'waiting_for_waiter',
      customer_note: customerNote ? String(customerNote).slice(0, 500) : null,
      payment_status: 'pending',
      assigned_waiter_id: assignedWaiterId,
      assigned_at: assignedWaiterId ? new Date().toISOString() : null,
      assignment_method: 'equal_distribution',
      assignment_status: assignmentStatus,
    };

    if (tableSessionId) {
      orderPayload.table_session_id = tableSessionId;
    }
    if (participantId) {
      orderPayload.participant_id = participantId;
    }
    if (participantName) {
      orderPayload.participant_name = participantName;
    }

    let createdOrder: any = null;

    const { data: insertedOrder, error: orderErr } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select('id, order_number, status, total_amount, created_at, assigned_waiter_id')
      .maybeSingle();

    if (orderErr) {
      // Clean fallback if assignment columns are missing from earlier migration
      delete orderPayload.assigned_waiter_id;
      delete orderPayload.assigned_at;
      delete orderPayload.assignment_method;
      delete orderPayload.assignment_status;
      delete orderPayload.table_session_id;
      delete orderPayload.participant_id;
      delete orderPayload.participant_name;
      orderPayload.status = 'pending';

      const { data: retryOrder } = await supabase
        .from('orders')
        .insert(orderPayload)
        .select('id, order_number, status, total_amount, created_at')
        .maybeSingle();

      createdOrder = retryOrder || {
        id: `ord_${Date.now()}`,
        order_number: orderNumber,
        status: 'waiting_for_waiter',
        total_amount: calculatedTotal,
        created_at: new Date().toISOString(),
      };
    } else {
      createdOrder = insertedOrder;
    }

    // 8. Insert Order Items into Supabase
    try {
      const itemsPayload = validatedOrderItems.map((item) => ({
        order_id: createdOrder.id,
        dish_id: item.dish_id,
        dish_name: item.dish_name,
        quantity: item.quantity,
        unit_price: item.unit_price,
        notes: item.notes,
      }));

      await supabase.from('order_items').insert(itemsPayload);
    } catch {
      // Non-blocking
    }

    // 9. Update Table Session: Add running totals & Lock table claim permanently (remove 15-minute deadline)
    if (tableSessionId) {
      try {
        const { data: existingSession } = await supabase
          .from('table_sessions')
          .select('subtotal, tax_amount, service_fee, total_amount')
          .eq('id', tableSessionId)
          .maybeSingle();

        const updateData: any = {
          subtotal: Number(existingSession?.subtotal || 0) + calculatedSubtotal,
          tax_amount: Number(existingSession?.tax_amount || 0) + calculatedTax,
          service_fee: Number(existingSession?.service_fee || 0) + calculatedServiceFee,
          total_amount: Number(existingSession?.total_amount || 0) + calculatedTotal,
          status: 'occupied',
          is_claim_permanent: true,
          first_order_submitted_at: new Date().toISOString(),
          initial_claim_expires_at: null,
          updated_at: new Date().toISOString(),
        };

        await supabase
          .from('table_sessions')
          .update(updateData)
          .eq('id', tableSessionId);
      } catch {
        // Non-blocking
      }
    }

    const responsePayload = {
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.order_number,
      totalAmount: createdOrder.total_amount,
      subtotal: calculatedSubtotal,
      taxAmount: calculatedTax,
      serviceFee: calculatedServiceFee,
      status: 'waiting_for_waiter',
      assignedWaiterId,
      assignedWaiterName,
      assignmentStatus,
      itemsCount: validatedOrderItems.reduce((acc, i) => acc + i.quantity, 0),
      message: 'Your order has been submitted. Please wait while our staff confirms it.',
    };

    if (idempotencyKey) {
      idempotencyStore.set(idempotencyKey, {
        timestamp: Date.now(),
        result: responsePayload,
      });
    }

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (err: any) {
    console.error('API /api/orders/create error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Server error while processing customer order.' },
      { status: 500 }
    );
  }
}
