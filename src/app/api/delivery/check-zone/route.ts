import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { calculateDistanceMeters } from '@/lib/geofence';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { restaurantId, customerLat, customerLng, discountedSubtotal = 0 } = body;

    if (!restaurantId || customerLat === undefined || customerLng === undefined) {
      return NextResponse.json({ success: false, error: 'Missing restaurantId or coordinates' }, { status: 400 });
    }

    const admin = createAdminClient();
    const [{ data: rest }, { data: settings }] = await Promise.all([
      admin.from('restaurants').select('latitude, longitude, status').eq('id', restaurantId).maybeSingle(),
      admin
        .from('restaurant_settings')
        .select(
          'delivery_enabled, delivery_radius_km, delivery_fee, free_delivery_min_order, delivery_min_order_amount, delivery_estimated_mins'
        )
        .eq('restaurant_id', restaurantId)
        .maybeSingle(),
    ]);

    if (!rest || rest.status !== 'active' || !settings?.delivery_enabled) {
      return NextResponse.json(
        { success: false, deliveryEnabled: false, error: 'Delivery is not enabled for this restaurant.' },
        { status: 400 }
      );
    }

    if (rest.latitude === null || rest.longitude === null) {
      return NextResponse.json(
        { success: false, error: 'Restaurant delivery origin coordinates are not configured.' },
        { status: 400 }
      );
    }

    const distanceMeters = calculateDistanceMeters(
      Number(customerLat),
      Number(customerLng),
      Number(rest.latitude),
      Number(rest.longitude)
    );
    const distanceKm = Math.round((distanceMeters / 1000) * 100) / 100;
    const maxRadiusKm = Math.min(20, Number(settings.delivery_radius_km || 5));
    const isWithinZone = distanceKm <= maxRadiusKm;

    const sub = Math.max(0, Number(discountedSubtotal || 0));
    const freeMin =
      settings.free_delivery_min_order !== null && settings.free_delivery_min_order !== undefined
        ? Number(settings.free_delivery_min_order)
        : null;
    const baseFee = Number(settings.delivery_fee || 0);
    const isFreeDelivery = freeMin !== null && sub >= freeMin;
    const appliedDeliveryFee = isFreeDelivery ? 0 : baseFee;
    const amountForFreeDelivery = freeMin !== null ? Math.max(0, Number((freeMin - sub).toFixed(2))) : null;

    return NextResponse.json({
      success: true,
      deliveryEnabled: true,
      isWithinZone,
      distanceKm,
      maxRadiusKm,
      deliveryFee: baseFee,
      appliedDeliveryFee,
      freeDeliveryMinOrder: freeMin,
      amountForFreeDelivery,
      minOrderAmount: Number(settings.delivery_min_order_amount || 0),
      estimatedMins: Number(settings.delivery_estimated_mins || 35),
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err?.message || 'Zone check failed' }, { status: 500 });
  }
}
