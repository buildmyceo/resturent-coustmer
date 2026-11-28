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
    let id = searchParams.get('id') || searchParams.get('restaurantId') || request.headers.get('x-tenant-restaurant-id');

    const admin = getAdminClient();
    const supabase = admin || (await createServerSupabaseClient());

    if (!id && !slug) {
      const rawHost = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
      const cleanHost = rawHost.split(':')[0].toLowerCase().trim();
      if (cleanHost && cleanHost !== 'localhost') {
        const { data: resolved } = await supabase.rpc('resolve_restaurant_by_host', { p_host: cleanHost });
        const row = Array.isArray(resolved) ? resolved[0] : resolved;
        if (row?.id) {
          id = row.id;
        }
      }
    }

    if (!id && !slug) {
      return NextResponse.json({ success: false, tenantResolved: false, restaurant: null }, { status: 404 });
    }

    // 1. Fetch restaurant
    let query = supabase.from('restaurants').select('*, restaurant_settings(*)');
    if (id) {
      query = query.eq('id', id);
    } else if (slug) {
      query = query.eq('slug', slug);
    }

    const { data: restaurants, error: rErr } = await query;
    const r = restaurants && restaurants.length > 0 ? restaurants[0] : null;

    if (rErr || !r) {
      return NextResponse.json({ success: false, tenantResolved: false, restaurant: null }, { status: 404 });
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

    // Landing Page Theme & Customization Configuration
    let landingPage = {
      themePreset: 'starbucks',
      primaryColor: '#006241',
      secondaryColor: '#1e3932',
      heroHeadline: '',
      tagline: '',
      subheadline: '',
      heroBadge: 'Open',
      heroImageUrl: '',
      showFeaturedCategories: true,
      featuredCategories: [
        { id: '1', name: 'Beverages', icon: '☕', active: true },
        { id: '2', name: 'Food', icon: '🍔', active: true },
        { id: '3', name: 'Desserts', icon: '🍰', active: true },
      ],
      showHelpline: true,
      helplineNumber: r.phone || '',
      showEmail: true,
      contactEmail: r.email || '',
      showAddress: true,
      socialLinks: {
        whatsapp: r.phone ? r.phone.replace(/[^0-9]/g, '') : '',
        instagram: '',
        facebook: '',
        twitter: '',
        youtube: '',
      },
      ctaText: 'Scan Table QR to Order',
      footerText: '',
    };

    let coupons: any[] = [];
    let taxRate = settingsObj?.tax_enabled !== false ? Number(settingsObj?.tax_percentage ?? 8.5) : 0;
    let taxEnabled = settingsObj?.tax_enabled !== false;

    if (settingsObj?.receipt_footer) {
      const footer = settingsObj.receipt_footer;
      const paymentConfigMatch = footer.match(/<!--ZOVO_PAYMENT_CONFIG:([\s\S]*?)-->/);
      if (paymentConfigMatch && paymentConfigMatch[1]) {
        try {
          const paymentConfig = JSON.parse(paymentConfigMatch[1]);
          const hasGst = Boolean(paymentConfig.gstNumber && paymentConfig.gstNumber.trim().length > 0);
          taxEnabled = paymentConfig.taxEnabled !== false && hasGst;
          if (paymentConfig.taxRate !== undefined && taxEnabled) {
            taxRate = Number(paymentConfig.taxRate);
          } else if (!taxEnabled) {
            taxRate = 0;
          }
        } catch {}
      }

      const couponMatch = footer.match(/<!--ZOVO_COUPONS_CONFIG:([\s\S]*?)-->/);
      if (couponMatch && couponMatch[1]) {
        try {
          const parsedC = JSON.parse(couponMatch[1]);
          if (Array.isArray(parsedC)) {
            coupons = parsedC.filter((c: any) => c && c.isActive !== false);
          }
        } catch {}
      }

      const geoMatch = footer.match(/<!--ZOVO_GEOFENCE_CONFIG:([\s\S]*?)-->/);
      if (geoMatch && geoMatch[1]) {
        try {
          const parsed = JSON.parse(geoMatch[1]);
          geofence = { ...geofence, ...parsed };
        } catch {
          // Non-blocking
        }
      }

      const landingMatch = footer.match(/<!--ZOVO_LANDING_CONFIG:([\s\S]*?)-->/);
      if (landingMatch && landingMatch[1]) {
        try {
          const parsedLanding = JSON.parse(landingMatch[1]);
          landingPage = {
            ...landingPage,
            ...parsedLanding,
            socialLinks: {
              ...landingPage.socialLinks,
              ...(parsedLanding.socialLinks || {}),
            },
          };
          if (parsedLanding.socialLinks) {
            socialLinks = { ...socialLinks, ...parsedLanding.socialLinks };
          }
          if (parsedLanding.helplineNumber) helpline = parsedLanding.helplineNumber;
          if (landingPage.footerText && landingPage.footerText.includes('Powered by Ceova')) {
            landingPage.footerText = '';
          }
        } catch {}
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

    // Check ordering enabled via boolean-only RPC
    let isCreditsPaused = false;
    try {
      const { data: orderingEnabled } = await supabase.rpc('is_restaurant_ordering_enabled', {
        p_restaurant_id: r.id,
      });
      if (orderingEnabled === false) {
        isCreditsPaused = true;
      }
    } catch {
      // Non-blocking fallback
    }

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
      status: isCreditsPaused ? 'suspended' : r.status,
      isCreditsPaused,
      latitude: r.latitude ?? null,
      longitude: r.longitude ?? null,
      primaryCustomDomain: r.primary_custom_domain || null,
      booking: {
        enabled: Boolean(settingsObj?.booking_enabled),
        feeAmount: Number(settingsObj?.booking_fee_amount ?? 0),
        creditToBill: settingsObj?.booking_fee_credit_to_bill ?? true,
        slotDurationMins: Number(settingsObj?.booking_slot_duration_mins ?? 90),
        allowTableSelection: settingsObj?.booking_allow_table_selection ?? true,
      },
      delivery: {
        enabled: Boolean(settingsObj?.delivery_enabled),
        radiusKm: Number(settingsObj?.delivery_radius_km ?? 5),
        fee: Number(settingsObj?.delivery_fee ?? 0),
        freeMinOrder:
          settingsObj?.free_delivery_min_order !== null && settingsObj?.free_delivery_min_order !== undefined
            ? Number(settingsObj.free_delivery_min_order)
            : null,
        minOrderAmount: Number(settingsObj?.delivery_min_order_amount ?? 0),
        estimatedMins: Number(settingsObj?.delivery_estimated_mins ?? 35),
      },
      razorpayEnabled: settingsObj?.razorpay_enabled ?? true,
      taxEnabled,
      taxRate,
      coupons,
      promoBanners: Array.isArray(settingsObj?.promo_banners) ? settingsObj.promo_banners : [],
      socialLinks: cached?.socialLinks || socialLinks,
      geofence: cached?.geofence || geofence,
      landingPage: cached?.landingPage || landingPage,
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
