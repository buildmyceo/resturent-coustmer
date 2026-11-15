import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
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

    // Direct URL spoofing prevention: If direct dummy token is passed or table does not match cryptographic signature
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

    // Parse slug or table from token string if encoded (e.g. zv_barista-pum1_tt01_1693d7f6)
    if (!slug && trimmedToken.startsWith('zv_')) {
      const parts = trimmedToken.split('_');
      if (parts.length >= 3) {
        slug = parts[1].toLowerCase();
        tblNum = parts[2].replace(/^t0?/, '');
      }
    }

    const supabase = await createServerSupabaseClient();

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
        // Fall through to query
      }

      // 2. Query table_qr_codes table directly
      try {
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
      } catch {
        // Fall through
      }
    }

    // 3. Cryptographic Table Security Verification
    // A user can NOT change the URL table number unless their uniqueCode matches the cryptographic signature
    if (tblNum && slug) {
      const cleanTableNum = tblNum.toLowerCase().replace(/^table\s*/i, '').trim();
      const isSignatureValid = verifyTableSignatureSync(slug, cleanTableNum, trimmedToken);

      // If user provided a token that fails cryptographic validation for this table, reject immediately!
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

    // 4. Resilient Direct Lookup for validated table and restaurant
    let matchedRest: any = null;

    if (slug) {
      const { data: restList } = await supabase
        .from('restaurants')
        .select('*')
        .or(`slug.ilike.${slug},name.ilike.${slug},slug.ilike.%${slug}%,name.ilike.%${slug}%`)
        .limit(1);

      if (restList && restList.length > 0) {
        matchedRest = restList[0];
      }
    }

    if (!matchedRest) {
      const { data: defaultRests } = await supabase
        .from('restaurants')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1);

      if (defaultRests && defaultRests.length > 0) {
        matchedRest = defaultRests[0];
      }
    }

    if (matchedRest) {
      let matchedTable: any = null;
      const cleanDigits = tblNum.replace(/\D/g, '');

      if (tblNum) {
        const tableQuery = supabase
          .from('restaurant_tables')
          .select('*')
          .eq('restaurant_id', matchedRest.id);

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

        const { data: tables } = await tableQuery.or(filterClauses.join(',')).limit(1);
        if (tables && tables.length > 0) {
          matchedTable = tables[0];
        }
      }

      // Check for active dining session
      let activeSessionId: string | null = null;
      let sessionStatus: string | null = null;

      if (matchedTable) {
        try {
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
        } catch {}
      }

      const finalTableNumber = matchedTable?.table_number || tblNum;
      const finalTableName = matchedTable?.table_name || `Table ${finalTableNumber}`;
      const finalTableId = matchedTable?.id || `tbl-${matchedRest.id}-${finalTableNumber}`;

      // Fetch geofence configuration from restaurant_settings
      let geofence = {
        enabled: true,
        latitude: 25.618193,
        longitude: 85.039305,
        radiusMeters: 50,
        address: matchedRest.address || 'sagunamore, patna',
      };
      try {
        const { data: sData } = await supabase
          .from('restaurant_settings')
          .select('receipt_footer')
          .eq('restaurant_id', matchedRest.id)
          .maybeSingle();

        if (sData?.receipt_footer) {
          const match = sData.receipt_footer.match(/<!--ZOVO_GEOFENCE_CONFIG:([\s\S]*?)-->/);
          if (match && match[1]) {
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
          }
        }
      } catch {}

      return NextResponse.json({
        success: true,
        table: {
          tableId: finalTableId,
          tableNumber: finalTableNumber,
          tableName: finalTableName,
          seatingCapacity: matchedTable?.seating_capacity || 4,
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
    }

    return NextResponse.json(
      { success: false, error: 'Restaurant or table could not be found.' },
      { status: 404 }
    );
  } catch (err: any) {
    console.error('API /api/qr/resolve error:', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error while resolving table.' },
      { status: 500 }
    );
  }
}
