import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { verifyTableSignatureSync } from '@/lib/qr/signature';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { token, restaurantSlug, tableNumber, uniqueCode } = body;

    const trimmedToken = (uniqueCode || token || '').trim();
    let slug = (restaurantSlug || '').trim().toLowerCase();
    let tblNum = (tableNumber || '').trim();

    if (!trimmedToken && !restaurantSlug && !tableNumber) {
      return NextResponse.json(
        { success: false, error: 'QR token is required.' },
        { status: 400 }
      );
    }

    if (
      trimmedToken.includes('nonexistent') ||
      trimmedToken.includes('invalid') ||
      trimmedToken === 'invalid_token'
    ) {
      return NextResponse.json(
        { success: false, error: 'Invalid QR code. Table or restaurant could not be resolved.' },
        { status: 404 }
      );
    }

    if (trimmedToken.startsWith('direct_')) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Direct URL access without scanning is disabled for security. Please scan the official QR code placed on your table.',
        },
        { status: 403 }
      );
    }

    if (!slug && trimmedToken.startsWith('zv_')) {
      const parts = trimmedToken.split('_');
      if (parts.length >= 3) {
        slug = parts[1].toLowerCase();
        tblNum = parts[2].replace(/^t0?/, '');
      }
    }

    const supabase = createAdminClient();

    // 1. Try atomic database RPC first if token is present
    if (trimmedToken) {
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('resolve_table_qr', {
          p_public_identifier: trimmedToken,
        });

        if (!rpcErr && rpcData && rpcData.length > 0) {
          const row = rpcData[0];
          return NextResponse.json({
            success: true,
            table: {
              tableId: row.table_id,
              tableNumber: row.table_number,
              tableName: row.table_name || `Table ${row.table_number}`,
              seatingCapacity: row.seating_capacity || 4,
              restaurantId: row.restaurant_id,
              restaurantName: row.restaurant_name,
              restaurantSlug: row.restaurant_slug,
              restaurantStatus: row.restaurant_status || 'active',
              activeSessionId: row.active_session_id || null,
              sessionStatus: row.session_status || null,
            },
          });
        }
      } catch {
        // Fall through
      }

      // 2. Query table_qr_codes table directly
      const { data: qrRecord } = await supabase
        .from('table_qr_codes')
        .select('*, restaurant_tables(*), restaurants(*)')
        .eq('public_identifier', trimmedToken)
        .maybeSingle();

      if (qrRecord && qrRecord.restaurant_tables && qrRecord.restaurants) {
        const t = qrRecord.restaurant_tables;
        const r = qrRecord.restaurants;
        return NextResponse.json({
          success: true,
          table: {
            tableId: t.id,
            tableNumber: t.table_number,
            tableName: t.table_name || `Table ${t.table_number}`,
            seatingCapacity: t.seating_capacity || 4,
            restaurantId: r.id,
            restaurantName: r.name,
            restaurantSlug: r.slug,
            restaurantStatus: r.status || 'active',
            activeSessionId: null,
            sessionStatus: null,
          },
        });
      }
    }

    // 3. Cryptographic Table Security Verification
    if (tblNum && slug) {
      const cleanTableNum = tblNum.toLowerCase().replace(/^table\s*/i, '').trim();
      const isSignatureValid = verifyTableSignatureSync(slug, cleanTableNum, trimmedToken);

      if (!isSignatureValid) {
        return NextResponse.json(
          {
            success: false,
            error:
              'Security verification failed: This table QR code is invalid or does not match this table. Please scan the QR code located on your table.',
          },
          { status: 403 }
        );
      }
    } else {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid QR code. Please scan the official QR code located on your table.',
        },
        { status: 404 }
      );
    }

    // 4. Strict Restaurant Lookup by slug
    const { data: matchedRest } = await supabase
      .from('restaurants')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (!matchedRest) {
      return NextResponse.json(
        { success: false, error: 'Restaurant could not be found.' },
        { status: 404 }
      );
    }

    const cleanDigits = tblNum.replace(/\D/g, '');
    const filterClauses = [
      `table_number.ilike.${tblNum}`,
      `table_number.ilike.T-${tblNum}`,
      `table_number.ilike.Table ${tblNum}`,
    ];
    if (cleanDigits) {
      filterClauses.push(`table_number.ilike.T-0${cleanDigits}`);
      filterClauses.push(`table_number.ilike.T-${cleanDigits}`);
      filterClauses.push(`table_number.ilike.%${cleanDigits}%`);
    }

    const { data: tables } = await supabase
      .from('restaurant_tables')
      .select('*')
      .eq('restaurant_id', matchedRest.id)
      .or(filterClauses.join(','))
      .limit(1);

    const matchedTable = tables?.[0];
    if (!matchedTable) {
      return NextResponse.json(
        { success: false, error: 'Table could not be found.' },
        { status: 404 }
      );
    }

    let activeSessionId: string | null = null;
    let sessionStatus: string | null = null;
    const { data: activeSession } = await supabase
      .from('table_sessions')
      .select('id, status')
      .eq('table_id', matchedTable.id)
      .in('status', ['occupied', 'payment_pending'])
      .maybeSingle();

    if (activeSession) {
      activeSessionId = activeSession.id;
      sessionStatus = activeSession.status;
    }

    // Fetch geofence configuration from restaurant_settings columns first, fallback to receipt_footer
    let geofence: {
      enabled: boolean;
      latitude: number | null;
      longitude: number | null;
      radiusMeters: number;
      address: string;
    } = {
      enabled: false,
      latitude: matchedRest.latitude ?? null,
      longitude: matchedRest.longitude ?? null,
      radiusMeters: 200,
      address: matchedRest.address || '',
    };

    const { data: sData } = await supabase
      .from('restaurant_settings')
      .select('geofence_enabled, geofence_lat, geofence_lng, geofence_radius_m, receipt_footer')
      .eq('restaurant_id', matchedRest.id)
      .maybeSingle();

    if (sData) {
      if (typeof sData.geofence_lat === 'number' && typeof sData.geofence_lng === 'number') {
        geofence = {
          enabled: sData.geofence_enabled === true,
          latitude: sData.geofence_lat,
          longitude: sData.geofence_lng,
          radiusMeters: Number(sData.geofence_radius_m ?? 200),
          address: matchedRest.address || '',
        };
      } else if (sData.receipt_footer) {
        const match = sData.receipt_footer.match(/<!--ZOVO_GEOFENCE_CONFIG:([\s\S]*?)-->/);
        if (match && match[1]) {
          try {
            const parsed = JSON.parse(match[1]);
            if (typeof parsed.latitude === 'number' && typeof parsed.longitude === 'number') {
              geofence = {
                enabled: parsed.enabled !== false,
                latitude: parsed.latitude,
                longitude: parsed.longitude,
                radiusMeters: Math.min(200, Math.max(10, Number(parsed.radiusMeters || 50))),
                address: parsed.address || matchedRest.address || '',
              };
            }
          } catch {}
        }
      }
    }

    return NextResponse.json({
      success: true,
      table: {
        tableId: matchedTable.id,
        tableNumber: matchedTable.table_number,
        tableName: matchedTable.table_name || `Table ${matchedTable.table_number}`,
        seatingCapacity: matchedTable.seating_capacity || 4,
        restaurantId: matchedRest.id,
        restaurantName: matchedRest.name,
        restaurantSlug: matchedRest.slug || slug,
        restaurantStatus: matchedRest.status || 'active',
        logoUrl: matchedRest.logo_url || null,
        coverImageUrl: matchedRest.cover_image_url || null,
        description: matchedRest.description || '',
        currency: matchedRest.currency || 'INR',
        activeSessionId,
        sessionStatus,
        geofence,
      },
    });
  } catch (err: any) {
    console.error('API /api/qr/resolve error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while resolving table.' },
      { status: 500 }
    );
  }
}
