import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const lat = Number(searchParams.get('lat'));
    const lng = Number(searchParams.get('lng'));

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return NextResponse.json({ success: false, error: 'Invalid lat/lng' }, { status: 400 });
    }

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(
        lat
      )}&lon=${encodeURIComponent(lng)}&addressdetails=1`,
      {
        headers: {
          'User-Agent': 'CeovaRestaurantMenu/1.0',
          'Accept-Language': 'en',
        },
        cache: 'no-store',
      }
    );

    if (!res.ok) {
      return NextResponse.json({ success: false, error: 'Reverse geocoding failed' }, { status: 502 });
    }

    const data = await res.json();
    const addr = data?.address || {};
    const parts = [
      addr.house_number,
      addr.road || addr.pedestrian || addr.neighbourhood,
      addr.suburb || addr.village || addr.town,
      addr.city || addr.state_district || addr.county,
      addr.state,
    ].filter(Boolean);

    const formattedAddress = parts.length > 0 ? parts.join(', ') : data?.display_name || '';
    const pincode = addr.postcode ? String(addr.postcode).trim() : '';

    return NextResponse.json({
      success: true,
      address: formattedAddress,
      pincode,
      raw: data?.display_name || '',
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || 'Reverse geocoding error' },
      { status: 500 }
    );
  }
}
