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
      )}&lon=${encodeURIComponent(lng)}&zoom=18&addressdetails=1`,
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
    const rawParts = [
      addr.house_number,
      addr.amenity || addr.building || addr.shop || addr.office,
      addr.road ||
        addr.pedestrian ||
        addr.residential ||
        addr.neighbourhood ||
        addr.quarter ||
        addr.locality,
      addr.suburb || addr.village || addr.town || addr.hamlet || addr.city_district,
      addr.city || addr.state_district || addr.county,
      addr.state,
    ]
      .map((p) => (p ? String(p).trim() : ''))
      .filter(Boolean);

    const dedupedParts: string[] = [];
    for (const p of rawParts) {
      if (!dedupedParts.some((existing) => existing.toLowerCase() === p.toLowerCase())) {
        dedupedParts.push(p);
      }
    }

    const pincode = addr.postcode ? String(addr.postcode).trim() : '';
    let formattedAddress =
      dedupedParts.length >= 3
        ? dedupedParts.join(', ')
        : data?.display_name || dedupedParts.join(', ');

    if (pincode && formattedAddress.includes(pincode)) {
      formattedAddress = formattedAddress
        .replace(new RegExp(`[,\\s]*${pincode}[,\\s]*`, 'g'), ', ')
        .replace(/,\s*India$/i, '')
        .replace(/,\s*$/, '')
        .trim();
    }

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
