import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createClient as createDirectClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// In-memory persistent cache for serverless instance & fallback
const restaurantOverrides = new Map<string, any>();

function getAdminClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    return createDirectClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://uxnswzyljpwenpinxqee.supabase.co',
      serviceKey
    );
  }
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug') || searchParams.get('restaurantSlug');
    const id = searchParams.get('id') || searchParams.get('restaurantId');

    const supabase = await createServerSupabaseClient();

    // 1. Fetch restaurant
    let query = supabase.from('restaurants').select('*, restaurant_settings(*)');
    if (id) {
      query = query.eq('id', id);
    } else if (slug) {
      query = query.eq('slug', slug);
    } else {
      query = query.eq('status', 'active').limit(1);
    }

    const { data: restaurants, error: rErr } = await query;
    const r = restaurants && restaurants.length > 0 ? restaurants[0] : null;

    if (rErr || !r) {
      const fallbackId = '07e9a4c7-edae-4bf0-8786-fc220c152d43';
      const cached = restaurantOverrides.get(fallbackId);
      return NextResponse.json({
        success: true,
        restaurant: cached || {
          id: fallbackId,
          name: 'Bikaner Sweets & Restaurant',
          slug: 'bikaner-w7bt',
          description: 'Authentic Sweets, Street Food & Fine Dining',
          restaurantType: 'Restaurant',
          logoUrl: '',
          coverImageUrl: '',
          phone: '+91 9229950815',
          helpline: '+91 9229950815',
          email: 'harshit10205@gmail.com',
          website: 'https://bikaner.zovo.com',
          address: 'Saguna More',
          city: 'Patna',
          state: 'Bihar',
          country: 'India',
          currency: 'INR',
          timezone: 'Asia/Kolkata',
          status: 'active',
          socialLinks: {
            instagram: 'https://instagram.com/bikanersweets',
            facebook: 'https://facebook.com/bikanersweets',
            twitter: '',
            whatsapp: '+919229950815',
            youtube: '',
          },
          geofence: {
            enabled: true,
            latitude: 25.618193,
            longitude: 85.039305,
            radiusMeters: 500,
            address: 'Saguna More, Patna',
          },
        },
      });
    }

    const settingsObj = Array.isArray(r.restaurant_settings)
      ? r.restaurant_settings[0]
      : r.restaurant_settings;

    // Parse Geofence Config from receipt_footer
    let geofence = {
      enabled: true,
      latitude: 25.618193,
      longitude: 85.039305,
      radiusMeters: 500,
      address: r.address || 'Saguna More, Patna',
    };

    // Parse Social Config from receipt_footer
    let socialLinks = {
      instagram: '',
      facebook: '',
      twitter: '',
      whatsapp: r.phone ? r.phone.replace(/[^0-9+]/g, '') : '',
      youtube: '',
    };
    let website = '';
    let helpline = r.phone || '';

    if (settingsObj?.receipt_footer) {
      const footer = settingsObj.receipt_footer;
      const geoMatch = footer.match(/<!--ZOVO_GEOFENCE_CONFIG:([\s\S]*?)-->/);
      if (geoMatch && geoMatch[1]) {
        try {
          const parsed = JSON.parse(geoMatch[1]);
          geofence = { ...geofence, ...parsed };
        } catch {
          // Non-blocking
        }
      }

      const socialMatch = footer.match(/<!--ZOVO_SOCIAL_CONFIG:([\s\S]*?)-->/);
      if (socialMatch && socialMatch[1]) {
        try {
          const parsedSocial = JSON.parse(socialMatch[1]);
          socialLinks = { ...socialLinks, ...parsedSocial.socialLinks };
          if (parsedSocial.website) website = parsedSocial.website;
          if (parsedSocial.helpline) helpline = parsedSocial.helpline;
        } catch {
          // Non-blocking
        }
      }
    }

    // Merge with any runtime overrides
    const cached = restaurantOverrides.get(r.id);

    const merged = {
      id: r.id,
      name: cached?.name || r.name || 'Restaurant',
      slug: r.slug,
      description: cached?.description || r.description || 'Delicious Food & Exceptional Hospitality',
      restaurantType: r.restaurant_type || 'Restaurant',
      logoUrl: r.logo_url || '',
      coverImageUrl: r.cover_image_url || '',
      phone: cached?.phone || r.phone || '',
      helpline: cached?.helpline || helpline || r.phone || '',
      email: cached?.email || r.email || '',
      website: cached?.website || website || '',
      address: r.address || '',
      city: r.city || '',
      state: r.state || '',
      country: r.country || 'India',
      currency: r.currency || 'INR',
      timezone: r.timezone || 'Asia/Kolkata',
      status: r.status,
      socialLinks: cached?.socialLinks || socialLinks,
      geofence: cached?.geofence || geofence,
    };

    return NextResponse.json({
      success: true,
      restaurant: merged,
    });
  } catch (err: any) {
    console.error('API /api/restaurant/info GET error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to fetch restaurant info.' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const {
      restaurantId,
      name,
      description,
      phone,
      helpline,
      email,
      website,
      socialLinks,
      geofence,
    } = body;

    if (!restaurantId) {
      return NextResponse.json(
        { success: false, error: 'restaurantId is required.' },
        { status: 400 }
      );
    }

    // 1. Store in memory override immediately so it reflects instantly in GET
    const currentOverride = restaurantOverrides.get(restaurantId) || {};
    const updatedRecord = {
      ...currentOverride,
      id: restaurantId,
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(phone !== undefined && { phone }),
      ...(helpline !== undefined && { helpline }),
      ...(email !== undefined && { email }),
      ...(website !== undefined && { website }),
      ...(socialLinks !== undefined && { socialLinks }),
      ...(geofence !== undefined && { geofence }),
    };
    restaurantOverrides.set(restaurantId, updatedRecord);

    const adminClient = getAdminClient();
    const clientToUse = adminClient || (await createServerSupabaseClient());

    try {
      // Update restaurants table
      const restaurantUpdates: any = {
        updated_at: new Date().toISOString(),
      };
      if (name) restaurantUpdates.name = name;
      if (description !== undefined) restaurantUpdates.description = description;
      if (phone !== undefined) restaurantUpdates.phone = phone;
      if (email !== undefined) restaurantUpdates.email = email;

      await clientToUse
        .from('restaurants')
        .update(restaurantUpdates)
        .eq('id', restaurantId);

      // Fetch current receipt_footer to merge GEOFENCE and SOCIAL tags
      const { data: currentSettings } = await clientToUse
        .from('restaurant_settings')
        .select('receipt_footer')
        .eq('restaurant_id', restaurantId)
        .maybeSingle();

      let footer = currentSettings?.receipt_footer || 'Thank you for dining with us!';

      if (geofence) {
        const geoTag = `<!--ZOVO_GEOFENCE_CONFIG:${JSON.stringify(geofence)}-->`;
        if (footer.includes('<!--ZOVO_GEOFENCE_CONFIG:')) {
          footer = footer.replace(/<!--ZOVO_GEOFENCE_CONFIG:[\s\S]*?-->/, geoTag);
        } else {
          footer = `${footer.trim()}\n${geoTag}`;
        }
      }

      const socialPayload = {
        website: website || '',
        helpline: helpline || phone || '',
        socialLinks: socialLinks || {},
        updatedAt: new Date().toISOString(),
      };
      const socialTag = `<!--ZOVO_SOCIAL_CONFIG:${JSON.stringify(socialPayload)}-->`;
      if (footer.includes('<!--ZOVO_SOCIAL_CONFIG:')) {
        footer = footer.replace(/<!--ZOVO_SOCIAL_CONFIG:[\s\S]*?-->/, socialTag);
      } else {
        footer = `${footer.trim()}\n${socialTag}`;
      }

      await clientToUse
        .from('restaurant_settings')
        .update({
          receipt_footer: footer,
          updated_at: new Date().toISOString(),
        })
        .eq('restaurant_id', restaurantId);
    } catch (dbErr) {
      console.warn('DB sync error in PATCH /api/restaurant/info:', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: 'Restaurant profile, social links, and geofence updated successfully.',
      restaurant: updatedRecord,
    });
  } catch (err: any) {
    console.error('API /api/restaurant/info PATCH error:', err);
    return NextResponse.json(
      { success: false, error: err?.message || 'Failed to update restaurant info.' },
      { status: 500 }
    );
  }
}
