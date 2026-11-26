import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateDistanceMeters } from '@/lib/geofence';
import { checkIsRestaurantOpen } from '@/lib/schedule';
import {
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
} from '@/lib/validation/customer';
import {
  buildRouteTransfers,
  createRazorpayOrder,
} from '@/lib/razorpay';

// In-memory short-lived idempotency cache (backed by DB idempotency_key)
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
      bookingId,
      participantId,
      participantName,
      orderType: rawOrderType,
      paymentMethod: rawPaymentMethod,
      customerName,
      customerPhone,
      customerEmail,
      deliveryAddress,
      deliveryLandmark,
      deliveryLat,
      deliveryLng,
      items,
      customerNote,
      idempotencyKey,
      customerCoordinates,
      couponCode,
      guestToken: rawGuestToken,
    } = body;

    const orderType: 'dine_in' | 'delivery' =
      rawOrderType === 'delivery' ? 'delivery' : 'dine_in';

    // 1. Check In-Memory Idempotency Key
    if (idempotencyKey && idempotencyStore.has(idempotencyKey)) {
      const cached = idempotencyStore.get(idempotencyKey);
      return NextResponse.json(cached?.result, { status: 200 });
    }

    if (!restaurantId || !items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid order request: Missing restaurant or items.' },
        { status: 400 }
      );
    }

    if (orderType === 'dine_in' && !tableId) {
      return NextResponse.json(
        { success: false, error: 'Invalid dine-in order request: Missing tableId.' },
        { status: 400 }
      );
    }

    // R3: Mandatory Customer Phone & Email validation for dine-in and delivery
    const normalizedPhone = normalizePhone(String(customerPhone || ''));
    const normalizedEmail = normalizeEmail(String(customerEmail || ''));
    if (!isValidPhone(normalizedPhone)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid customer phone number (10-15 digits) before placing your order.',
        },
        { status: 400 }
      );
    }
    if (!isValidEmail(normalizedEmail)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please enter a valid customer email address before placing your order.',
        },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // 1b. Check DB Idempotency Key
    if (idempotencyKey) {
      const { data: existingIdemOrder } = await supabase
        .from('orders')
        .select('id, order_number, status, total_amount, subtotal, tax_amount, service_fee, delivery_fee, discount_amount, payment_status, payment_gateway, gateway_order_id, guest_token')
        .eq('restaurant_id', restaurantId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingIdemOrder) {
        return NextResponse.json(
          {
            success: true,
            duplicate: true,
            orderId: existingIdemOrder.id,
            orderNumber: existingIdemOrder.order_number,
            totalAmount: existingIdemOrder.total_amount,
            subtotal: existingIdemOrder.subtotal,
            taxAmount: existingIdemOrder.tax_amount,
            serviceFee: existingIdemOrder.service_fee,
            deliveryFee: existingIdemOrder.delivery_fee || 0,
            discountAmount: existingIdemOrder.discount_amount || 0,
            status: existingIdemOrder.status,
            paymentStatus: existingIdemOrder.payment_status,
            guestToken: existingIdemOrder.guest_token,
          },
          { status: 200 }
        );
      }
    }

    // 2. Validate Restaurant is active, has credits, and is OPEN
    const { data: restData } = await supabase
      .from('restaurants')
      .select('id, name, status, timezone, latitude, longitude')
      .eq('id', restaurantId)
      .maybeSingle();

    if (!restData) {
      return NextResponse.json(
        { success: false, error: 'Restaurant not found.' },
        { status: 404 }
      );
    }

    if (restData.status === 'inactive' || restData.status === 'suspended') {
      return NextResponse.json(
        { success: false, error: 'Restaurant is currently inactive or closed. No orders can be accepted.' },
        { status: 403 }
      );
    }

    const { data: orderingEnabled } = await supabase.rpc('is_restaurant_ordering_enabled', {
      p_restaurant_id: restaurantId,
    });

    if (orderingEnabled === false) {
      return NextResponse.json(
        {
          success: false,
          error: 'Digital ordering is temporarily paused for this restaurant. Please inform your server to order.',
          isCreditsPaused: true,
        },
        { status: 402 }
      );
    }

    const { data: settingsData } = await supabase
      .from('restaurant_settings')
      .select(
        'opening_hours, timezone, currency, tax_percentage, service_charge_percentage, tax_enabled, service_charge_enabled, receipt_footer, pay_first_enabled, geofence_enabled, geofence_radius_meters, delivery_enabled, delivery_radius_km, delivery_fee, free_delivery_min_order, delivery_min_order_amount, razorpay_settlement_mode, razorpay_linked_account_id, platform_fee_percent'
      )
      .eq('restaurant_id', restaurantId)
      .maybeSingle();

    const openCheck = checkIsRestaurantOpen(
      settingsData?.opening_hours,
      settingsData?.timezone || restData.timezone
    );

    if (!openCheck.isOpen) {
      return NextResponse.json(
        {
          success: false,
          error:
            openCheck.reason ||
            'The restaurant is currently closed. Ordering is paused until the next operating window.',
        },
        { status: 403 }
      );
    }

    // 3. Validate Table Session (dine_in only)
    if (orderType === 'dine_in' && tableSessionId) {
      const { data: sessionData, error: sessionErr } = await supabase
        .from('table_sessions')
        .select('id, status, is_claim_permanent, initial_claim_expires_at, booking_id')
        .eq('id', tableSessionId)
        .maybeSingle();

      if (!sessionErr && sessionData) {
        if (sessionData.status === 'completed' || sessionData.status === 'cancelled') {
          return NextResponse.json(
            { success: false, error: 'This dining session is closed. No new orders may be placed.' },
            { status: 403 }
          );
        }

        if (!sessionData.is_claim_permanent && sessionData.initial_claim_expires_at) {
          if (new Date(sessionData.initial_claim_expires_at).getTime() < Date.now()) {
            await supabase
              .from('table_sessions')
              .update({ status: 'cancelled', updated_at: new Date().toISOString() })
              .eq('id', tableSessionId);

            return NextResponse.json(
              {
                success: false,
                error:
                  'Your initial 15-minute table claim has expired. Please scan the QR code again to start a new session.',
              },
              { status: 410 }
            );
          }
        }
      }
    }

    // 4. Parse Settings (tax, service fee, coupons, pay-first, geofence, delivery)
    let taxRate = settingsData?.tax_enabled !== false ? Number(settingsData?.tax_percentage ?? 8.5) : 0;
    let serviceFeeRate =
      settingsData?.service_charge_enabled !== false
        ? Number(settingsData?.service_charge_percentage ?? 10.0)
        : 0;
    let storedCoupons: any[] = [];
    let isPayFirst = Boolean(settingsData?.pay_first_enabled);

    if (settingsData?.receipt_footer) {
      const paymentConfigMatch = settingsData.receipt_footer.match(/<!--ZOVO_PAYMENT_CONFIG:([\s\S]*?)-->/);
      if (paymentConfigMatch && paymentConfigMatch[1]) {
        try {
          const paymentConfig = JSON.parse(paymentConfigMatch[1]);
          const hasGst = Boolean(paymentConfig.gstNumber && paymentConfig.gstNumber.trim().length > 0);
          const isTaxOn = paymentConfig.taxEnabled !== false && hasGst;
          if (paymentConfig.taxRate !== undefined && isTaxOn) {
            taxRate = Number(paymentConfig.taxRate);
          } else if (!isTaxOn) {
            taxRate = 0;
          }
          if (paymentConfig.serviceChargeRate !== undefined) {
            serviceFeeRate = Number(paymentConfig.serviceChargeRate);
          }
          if (paymentConfig.serviceChargeEnabled === false) {
            serviceFeeRate = 0;
          }
          if (paymentConfig.payFirstEnabled !== undefined) {
            isPayFirst = Boolean(paymentConfig.payFirstEnabled);
          }
        } catch {}
      }

      const couponMatch = settingsData.receipt_footer.match(/<!--ZOVO_COUPONS_CONFIG:([\s\S]*?)-->/);
      if (couponMatch && couponMatch[1]) {
        try {
          const parsedC = JSON.parse(couponMatch[1]);
          if (Array.isArray(parsedC)) storedCoupons = parsedC;
        } catch {}
      }
    }

    // For delivery, service charge is not applied
    if (orderType === 'delivery') {
      serviceFeeRate = 0;
    }

    // 4b. Geofence Validation (dine_in) OR Delivery Zone Validation (delivery)
    let deliveryDistanceKm: number | null = null;
    const resolvedDeliveryLat =
      typeof deliveryLat === 'number'
        ? deliveryLat
        : typeof customerCoordinates?.latitude === 'number'
        ? customerCoordinates.latitude
        : null;
    const resolvedDeliveryLng =
      typeof deliveryLng === 'number'
        ? deliveryLng
        : typeof customerCoordinates?.longitude === 'number'
        ? customerCoordinates.longitude
        : null;

    if (orderType === 'dine_in') {
      const gfLat = restData.latitude;
      const gfLng = restData.longitude;
      const gfRadius = Number(settingsData?.geofence_radius_meters ?? 200);
      const gfEnabled = settingsData?.geofence_enabled === true;

      if (gfEnabled && typeof gfLat === 'number' && typeof gfLng === 'number') {
        if (
          !customerCoordinates ||
          typeof customerCoordinates.latitude !== 'number' ||
          typeof customerCoordinates.longitude !== 'number'
        ) {
          return NextResponse.json(
            {
              success: false,
              error: 'Visit restaurant to order food, or scan QR code if you are in a different restaurant.',
            },
            { status: 403 }
          );
        }

        const distance = calculateDistanceMeters(
          customerCoordinates.latitude,
          customerCoordinates.longitude,
          gfLat,
          gfLng
        );
        if (distance > gfRadius + 1000) {
          return NextResponse.json(
            {
              success: false,
              error: 'Visit restaurant to order food, or scan QR code if you are in a different restaurant.',
              distance: Math.round(distance),
              allowedRadius: gfRadius,
            },
            { status: 403 }
          );
        }
      }
    } else {
      // Delivery order validation
      if (!settingsData?.delivery_enabled) {
        return NextResponse.json(
          { success: false, error: 'Delivery ordering is currently disabled for this restaurant.' },
          { status: 403 }
        );
      }

      if (!deliveryAddress || String(deliveryAddress).trim().length < 5) {
        return NextResponse.json(
          { success: false, error: 'Please enter your complete delivery address.' },
          { status: 400 }
        );
      }

      const restLat = restData.latitude;
      const restLng = restData.longitude;
      if (typeof restLat !== 'number' || typeof restLng !== 'number') {
        return NextResponse.json(
          { success: false, error: 'Restaurant delivery location is not configured yet.' },
          { status: 400 }
        );
      }

      if (resolvedDeliveryLat === null || resolvedDeliveryLng === null) {
        return NextResponse.json(
          {
            success: false,
            error: 'Please share or pin your delivery location on the map to verify delivery availability.',
          },
          { status: 400 }
        );
      }

      const distanceMeters = calculateDistanceMeters(
        resolvedDeliveryLat,
        resolvedDeliveryLng,
        restLat,
        restLng
      );
      deliveryDistanceKm = Number((distanceMeters / 1000).toFixed(2));
      const maxRadiusKm = Math.min(20, Math.max(0.5, Number(settingsData.delivery_radius_km ?? 5)));

      if (deliveryDistanceKm > maxRadiusKm) {
        return NextResponse.json(
          {
            success: false,
            error: `Sorry, your address is ${deliveryDistanceKm} km away, outside the restaurant's ${maxRadiusKm} km delivery zone.`,
            distanceKm: deliveryDistanceKm,
            maxRadiusKm,
          },
          { status: 403 }
        );
      }
    }

    // 5. Fetch canonical dishes from Supabase
    const dishIds = items.map((i: any) => i.dishId).filter(Boolean);
    const { data: fetchedDishes } = await supabase
      .from('dishes')
      .select('id, name, price, category_id, preparation_time, is_available, is_archived, dish_variants(*), dish_addons(*)')
      .eq('restaurant_id', restaurantId)
      .in('id', dishIds);

    const dishMap = new Map((fetchedDishes || []).map((d: any) => [d.id, d]));

    let calculatedSubtotal = 0;
    const validatedOrderItems: any[] = [];

    for (const item of items) {
      const dbDish = dishMap.get(item.dishId);
      if (!dbDish) {
        return NextResponse.json(
          { success: false, error: `Dish "${item.dishName || item.dishId}" was not found.` },
          { status: 400 }
        );
      }
      if (!dbDish.is_available || dbDish.is_archived) {
        return NextResponse.json(
          { success: false, error: `"${dbDish.name}" is currently unavailable.` },
          { status: 400 }
        );
      }

      const quantity = Math.max(1, parseInt(item.quantity, 10) || 1);
      let unitPrice = Number(dbDish.price);
      let variantName: string | null = item.variantName || null;

      if (item.variantId && dbDish.dish_variants) {
        const dbVariant = dbDish.dish_variants.find((v: any) => v.id === item.variantId && v.is_active);
        if (dbVariant) {
          unitPrice = Number(dbVariant.price);
          variantName = dbVariant.name;
        }
      }

      let addonsSum = 0;
      const validatedAddons: { name: string; price: number }[] = [];
      const addonIds = Array.isArray(item.addonIds)
        ? item.addonIds
        : (item.selectedAddons || []).map((a: any) => a.id);

      if (Array.isArray(addonIds) && dbDish.dish_addons) {
        for (const addonId of addonIds) {
          const dbAddon = dbDish.dish_addons.find((a: any) => a.id === addonId && a.is_active);
          if (dbAddon) {
            addonsSum += Number(dbAddon.additional_price);
            validatedAddons.push({ name: dbAddon.name, price: Number(dbAddon.additional_price) });
          }
        }
      }

      const totalItemUnitPrice = unitPrice + addonsSum;
      calculatedSubtotal += totalItemUnitPrice * quantity;

      validatedOrderItems.push({
        dish_id: dbDish.id,
        dish_name: variantName ? `${dbDish.name} (${variantName})` : dbDish.name,
        quantity,
        unit_price: totalItemUnitPrice,
        notes: item.specialInstructions ? String(item.specialInstructions).slice(0, 500) : null,
      });
    }

    // 5b. Coupon Discount
    let calculatedDiscount = 0;
    let validatedCouponCode: string | null = null;

    if (couponCode && typeof couponCode === 'string') {
      const normalizedCode = couponCode.trim().toUpperCase();
      const matchedCoupon = storedCoupons.find(
        (c: any) => c.code?.toUpperCase() === normalizedCode && c.isActive
      );

      if (matchedCoupon && (!matchedCoupon.minOrderAmount || calculatedSubtotal >= matchedCoupon.minOrderAmount)) {
        if (matchedCoupon.appliesTo === 'category' && matchedCoupon.targetCategoryId) {
          let eligibleSubtotal = 0;
          for (const item of items) {
            const dbDish = dishMap.get(item.dishId);
            if (dbDish && dbDish.category_id === matchedCoupon.targetCategoryId) {
              eligibleSubtotal += Number(dbDish.price) * Math.max(1, parseInt(item.quantity, 10) || 1);
            }
          }
          if (eligibleSubtotal > 0) {
            calculatedDiscount =
              matchedCoupon.discountType === 'percentage'
                ? (eligibleSubtotal * matchedCoupon.discountValue) / 100
                : Math.min(matchedCoupon.discountValue, eligibleSubtotal);
            validatedCouponCode = matchedCoupon.code;
          }
        } else if (
          matchedCoupon.appliesTo === 'dishes' &&
          Array.isArray(matchedCoupon.targetDishIds) &&
          matchedCoupon.targetDishIds.length > 0
        ) {
          let eligibleSubtotal = 0;
          for (const item of items) {
            if (matchedCoupon.targetDishIds.includes(item.dishId)) {
              const dbDish = dishMap.get(item.dishId);
              if (dbDish) {
                eligibleSubtotal += Number(dbDish.price) * Math.max(1, parseInt(item.quantity, 10) || 1);
              }
            }
          }
          if (eligibleSubtotal > 0) {
            calculatedDiscount =
              matchedCoupon.discountType === 'percentage'
                ? (eligibleSubtotal * matchedCoupon.discountValue) / 100
                : Math.min(matchedCoupon.discountValue, eligibleSubtotal);
            validatedCouponCode = matchedCoupon.code;
          }
        } else {
          calculatedDiscount =
            matchedCoupon.discountType === 'percentage'
              ? (calculatedSubtotal * matchedCoupon.discountValue) / 100
              : Math.min(matchedCoupon.discountValue, calculatedSubtotal);
          validatedCouponCode = matchedCoupon.code;
        }

        if (matchedCoupon.maxDiscountAmount && calculatedDiscount > matchedCoupon.maxDiscountAmount) {
          calculatedDiscount = matchedCoupon.maxDiscountAmount;
        }
      }
    }

    calculatedDiscount = Number(Math.min(calculatedDiscount, calculatedSubtotal).toFixed(2));
    const discountedSubtotal = Math.max(0, calculatedSubtotal - calculatedDiscount);

    // 5c. Delivery Minimum Order & Delivery Charge Calculation
    let deliveryFee = 0;
    if (orderType === 'delivery') {
      const minOrder = Number(settingsData?.delivery_min_order_amount ?? 0);
      if (minOrder > 0 && discountedSubtotal < minOrder) {
        return NextResponse.json(
          {
            success: false,
            error: `Minimum order for delivery is ₹${minOrder.toFixed(2)}.`,
          },
          { status: 400 }
        );
      }

      const freeAbove =
        settingsData?.free_delivery_min_order !== null &&
        settingsData?.free_delivery_min_order !== undefined
          ? Number(settingsData.free_delivery_min_order)
          : null;
      const baseCharge = Number(settingsData?.delivery_fee ?? 0);
      deliveryFee = freeAbove !== null && discountedSubtotal >= freeAbove ? 0 : baseCharge;
    }

    const calculatedTax = Number(((discountedSubtotal * taxRate) / 100).toFixed(2));
    const calculatedServiceFee = Number(((discountedSubtotal * serviceFeeRate) / 100).toFixed(2));
    const calculatedTotal = Number(
      (discountedSubtotal + calculatedTax + calculatedServiceFee + deliveryFee).toFixed(2)
    );

    // Payment method: delivery defaults to razorpay; dine_in uses requested method or counter/pay_later
    const paymentMethod: 'razorpay' | 'counter' | 'pay_later' =
      rawPaymentMethod === 'razorpay' || orderType === 'delivery'
        ? 'razorpay'
        : isPayFirst
        ? 'counter'
        : 'pay_later';

    const orderNumber = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
    const guestToken = rawGuestToken ? String(rawGuestToken) : crypto.randomUUID();

    // 6. Waiter Assignment (only for non-Razorpay, non-pay-first dine_in orders)
    let assignedWaiterId: string | null = null;
    let assignedWaiterName: string | null = null;
    let assignmentStatus =
      paymentMethod === 'razorpay'
        ? 'razorpay_pending'
        : isPayFirst
        ? 'counter_pending'
        : 'unassigned';

    if (orderType === 'dine_in' && paymentMethod === 'pay_later') {
      try {
        const { data: waiters, error: wErr } = await supabase
          .from('restaurant_members')
          .select('user_id, profiles(id, full_name)')
          .eq('restaurant_id', restaurantId)
          .eq('role', 'waiter')
          .eq('approval_status', 'approved')
          .eq('is_active', true);

        if (!wErr && waiters && waiters.length > 0) {
          const waiterUserIds = waiters.map((w: any) => w.user_id);
          const { data: activeOrders } = await supabase
            .from('orders')
            .select('assigned_waiter_id')
            .eq('restaurant_id', restaurantId)
            .in('assigned_waiter_id', waiterUserIds)
            .in('status', [
              'waiting_for_waiter',
              'waiter_accepted',
              'sent_to_kitchen',
              'accepted_by_kitchen',
              'accepted',
              'preparing',
              'ready',
            ]);

          const workloadMap = new Map<string, number>();
          waiterUserIds.forEach((id: string) => workloadMap.set(id, 0));
          (activeOrders || []).forEach((o: any) => {
            if (o.assigned_waiter_id) {
              workloadMap.set(o.assigned_waiter_id, (workloadMap.get(o.assigned_waiter_id) || 0) + 1);
            }
          });

          const sortedWaiters = [...waiters].sort((a: any, b: any) => {
            const countA = workloadMap.get(a.user_id) || 0;
            const countB = workloadMap.get(b.user_id) || 0;
            if (countA !== countB) return countA - countB;
            return a.user_id.localeCompare(b.user_id);
          });

          const chosen: any = sortedWaiters[0];
          if (chosen) {
            assignedWaiterId = chosen.user_id;
            const profileObj = Array.isArray(chosen.profiles) ? chosen.profiles[0] : chosen.profiles;
            assignedWaiterName = profileObj?.full_name || 'Floor Waiter';
            assignmentStatus = 'assigned';
          }
        }
      } catch (assignErr) {
        console.warn('Waiter assignment error:', assignErr);
      }
    }

    const initialStatus =
      paymentMethod === 'razorpay'
        ? 'pending_payment'
        : isPayFirst
        ? 'pending'
        : 'waiting_for_waiter';

    const sessionTag = tableSessionId ? `[SESS:${tableSessionId}]` : '';
    const counterTag = paymentMethod === 'counter' ? '[PAY_FIRST:COUNTER]' : '';
    const noteParts = [
      counterTag,
      customerNote ? String(customerNote).slice(0, 450) : '',
      validatedCouponCode ? `Coupon: ${validatedCouponCode} (-${calculatedDiscount})` : '',
      sessionTag,
    ].filter(Boolean);
    const noteWithCoupon = noteParts.join(' ') || null;

    const orderPayload: Record<string, any> = {
      restaurant_id: restaurantId,
      table_id: orderType === 'dine_in' ? tableId : null,
      order_number: orderNumber,
      order_source: 'Customer',
      order_type: orderType,
      subtotal: calculatedSubtotal,
      tax_amount: calculatedTax,
      service_fee: calculatedServiceFee,
      delivery_fee: deliveryFee,
      discount_amount: calculatedDiscount,
      total_amount: calculatedTotal,
      status: initialStatus,
      customer_note: noteWithCoupon,
      payment_status: 'pending',
      payment_gateway: paymentMethod === 'razorpay' ? 'razorpay' : null,
      assigned_waiter_id: assignedWaiterId,
      assigned_at: assignedWaiterId ? new Date().toISOString() : null,
      assignment_method:
        paymentMethod === 'razorpay'
          ? 'razorpay'
          : isPayFirst
          ? 'counter_pay'
          : 'equal_distribution',
      assignment_status: assignmentStatus,
      customer_name: customerName ? String(customerName).trim().slice(0, 120) : participantName || null,
      customer_phone: normalizedPhone,
      customer_email: normalizedEmail,
      guest_token: guestToken,
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
      ...(tableSessionId ? { table_session_id: tableSessionId } : {}),
      ...(bookingId ? { booking_id: bookingId } : {}),
      ...(participantId ? { participant_id: participantId } : {}),
      ...(participantName ? { participant_name: participantName } : {}),
      ...(orderType === 'delivery'
        ? {
            delivery_address: String(deliveryAddress).trim().slice(0, 500),
            delivery_landmark: deliveryLandmark ? String(deliveryLandmark).trim().slice(0, 200) : null,
            delivery_lat: resolvedDeliveryLat,
            delivery_lng: resolvedDeliveryLng,
            delivery_distance_km: deliveryDistanceKm,
            delivery_status: 'pending',
          }
        : {}),
    };

    const { data: createdOrder, error: orderErr } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select('id, order_number, status, total_amount, created_at, assigned_waiter_id')
      .single();

    if (orderErr || !createdOrder) {
      throw new Error(orderErr?.message || 'Failed to insert order into database');
    }

    // 8. Insert Order Items
    const itemsPayload = validatedOrderItems.map((item) => ({
      order_id: createdOrder.id,
      dish_id: item.dish_id,
      dish_name: item.dish_name,
      quantity: item.quantity,
      unit_price: item.unit_price,
      notes: item.notes,
    }));
    await supabase.from('order_items').insert(itemsPayload);

    // 9. If Razorpay payment, create Razorpay Order and return checkout details WITHOUT alerting Staff/KDS yet
    let razorpayPayload: {
      keyId: string;
      orderId: string;
      amountPaise: number;
      currency: string;
    } | null = null;

    if (paymentMethod === 'razorpay') {
      const amountPaise = Math.max(100, Math.round(calculatedTotal * 100));
      const transfers = buildRouteTransfers({
        amountPaise,
        settlementMode: settingsData?.razorpay_settlement_mode,
        linkedAccountId: settingsData?.razorpay_linked_account_id,
        commissionBps: Math.round(Number(settingsData?.platform_fee_percent ?? 0) * 100),
        restaurantId,
        entityId: createdOrder.id,
      });

      const { order: rzpOrder, keyId } = await createRazorpayOrder({
        amountPaise,
        currency: settingsData?.currency || 'INR',
        receipt: orderNumber,
        notes: {
          purpose: 'order',
          order_id: createdOrder.id,
          restaurant_id: restaurantId,
          order_type: orderType,
        },
        transfers,
      });

      await supabase
        .from('orders')
        .update({ gateway_order_id: rzpOrder.id })
        .eq('id', createdOrder.id);

      razorpayPayload = {
        keyId,
        orderId: rzpOrder.id,
        amountPaise: rzpOrder.amount,
        currency: rzpOrder.currency,
      };
    }

    // 10. Update Table Session only for non-pending_payment dine_in orders
    if (orderType === 'dine_in' && tableSessionId && paymentMethod !== 'razorpay') {
      try {
        const { data: existingSession } = await supabase
          .from('table_sessions')
          .select('subtotal, tax_amount, service_fee, total_amount')
          .eq('id', tableSessionId)
          .maybeSingle();

        await supabase
          .from('table_sessions')
          .update({
            subtotal: Number(existingSession?.subtotal || 0) + calculatedSubtotal,
            tax_amount: Number(existingSession?.tax_amount || 0) + calculatedTax,
            service_fee: Number(existingSession?.service_fee || 0) + calculatedServiceFee,
            total_amount: Number(existingSession?.total_amount || 0) + calculatedTotal,
            status: 'occupied',
            is_claim_permanent: true,
            first_order_submitted_at: new Date().toISOString(),
            initial_claim_expires_at: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', tableSessionId);
      } catch {}
    }

    const responsePayload = {
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.order_number,
      orderType,
      totalAmount: createdOrder.total_amount,
      subtotal: calculatedSubtotal,
      discountAmount: calculatedDiscount,
      deliveryFee,
      taxAmount: calculatedTax,
      serviceFee: calculatedServiceFee,
      status: initialStatus,
      paymentMethod,
      assignedWaiterId,
      assignedWaiterName,
      assignmentStatus,
      isPayFirst,
      guestToken,
      razorpay: razorpayPayload,
      itemsCount: validatedOrderItems.reduce((acc, i) => acc + i.quantity, 0),
      message:
        paymentMethod === 'razorpay'
          ? 'Complete payment via Razorpay to send your order to the kitchen.'
          : isPayFirst
          ? 'Please visit the cashier counter with your Order ID to pay. Once confirmed, your order will be prepared directly by the kitchen.'
          : 'Your order has been submitted. Please wait while our staff confirms it.',
    };

    // 11. Broadcast ONLY if not pending_payment
    if (initialStatus !== 'pending_payment') {
      try {
        const rtChannel = supabase.channel(`restaurant:${restaurantId}`, {
          config: { broadcast: { self: true } },
        });
        rtChannel.subscribe(async (status) => {
          if (status === 'SUBSCRIBED') {
            const payloadData = {
              id: createdOrder.id,
              order_number: createdOrder.order_number,
              restaurant_id: restaurantId,
              table_id: tableId || null,
              order_type: orderType,
              status: initialStatus,
              assigned_waiter_id: assignedWaiterId,
              is_pay_first: isPayFirst,
              total_amount: createdOrder.total_amount,
              created_at: new Date().toISOString(),
            };
            await rtChannel.send({ type: 'broadcast', event: 'ORDER_CREATED', payload: payloadData });
            await rtChannel.send({ type: 'broadcast', event: 'new_order', payload: payloadData });
            setTimeout(() => {
              supabase.removeChannel(rtChannel);
            }, 1500);
          }
        });
      } catch {}
    }

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
