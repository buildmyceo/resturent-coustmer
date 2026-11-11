-- ==============================================================================
-- ZOVO RESTAURANT MANAGEMENT SAAS — PHASE 5 SEED DATA
-- Target Supabase Project: uxnswzyljpwenpinxqee
-- URL: https://supabase.com/dashboard/project/uxnswzyljpwenpinxqee/sql
-- Description: Seeds commercial restaurant "Zovo Bistro & Lounge", tables,
--              QR codes, categories, dishes, variants, addons, and settings.
-- ==============================================================================

DO $$
DECLARE
    v_owner_id UUID;
    v_rest_id UUID;
    v_cat_starters UUID;
    v_cat_mains UUID;
    v_cat_pastas UUID;
    v_cat_drinks UUID;
    v_cat_desserts UUID;
    v_dish_burrata UUID;
    v_dish_steak UUID;
    v_dish_pappardelle UUID;
    v_dish_salmon UUID;
    v_dish_cocktail UUID;
    v_tbl_01 UUID;
    v_tbl_02 UUID;
    v_tbl_03 UUID;
    v_tbl_04 UUID;
    v_tbl_05 UUID;
    v_tbl_06 UUID;
    v_tbl_07 UUID;
    v_tbl_08 UUID;
BEGIN
    -- 1. Get or create a system profile for restaurant ownership
    SELECT id INTO v_owner_id FROM auth.users LIMIT 1;
    
    IF v_owner_id IS NULL THEN
        -- If no auth users exist yet, use a fixed demo UUID and insert profile
        v_owner_id := '00000000-0000-0000-0000-000000000001'::uuid;
    END IF;

    -- Ensure owner profile exists
    INSERT INTO public.profiles (id, full_name, email, phone)
    VALUES (v_owner_id, 'Zovo Executive Chef', 'executive@zovo.internal', '+1 (555) 019-2834')
    ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name;

    -- 2. Create Restaurant: Zovo Bistro & Lounge
    INSERT INTO public.restaurants (
        id,
        owner_user_id,
        name,
        slug,
        description,
        restaurant_type,
        logo_url,
        cover_image_url,
        phone,
        email,
        address,
        city,
        state,
        country,
        postal_code,
        currency,
        timezone,
        status
    )
    VALUES (
        '11111111-1111-1111-1111-111111111111'::uuid,
        v_owner_id,
        'Zovo Bistro & Lounge',
        'zovo-bistro',
        'Contemporary European farm-to-table cuisine, artisanal wood-fired mains, and crafted botanical cocktails in a refined minimalist setting.',
        'Fine Dining & Lounge',
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=300&auto=format&fit=crop&q=80',
        'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1600&auto=format&fit=crop&q=80',
        '+1 (415) 890-3412',
        'contact@zovobistro.com',
        '482 Montgomery St, Suite 100',
        'San Francisco',
        'CA',
        'United States',
        '94104',
        'USD',
        'America/Los_Angeles',
        'active'
    )
    ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        status = 'active',
        description = EXCLUDED.description
    RETURNING id INTO v_rest_id;

    -- 3. Restaurant Settings
    INSERT INTO public.restaurant_settings (
        restaurant_id,
        opening_hours,
        tax_enabled,
        tax_percentage,
        service_charge_enabled,
        service_charge_percentage,
        currency,
        timezone,
        receipt_footer
    )
    VALUES (
        v_rest_id,
        '{
            "monday": {"open": "11:00", "close": "23:00", "closed": false},
            "tuesday": {"open": "11:00", "close": "23:00", "closed": false},
            "wednesday": {"open": "11:00", "close": "23:00", "closed": false},
            "thursday": {"open": "11:00", "close": "23:30", "closed": false},
            "friday": {"open": "11:00", "close": "00:30", "closed": false},
            "saturday": {"open": "10:00", "close": "00:30", "closed": false},
            "sunday": {"open": "10:00", "close": "22:00", "closed": false}
        }'::jsonb,
        TRUE,
        8.50,
        TRUE,
        10.00,
        'USD',
        'America/Los_Angeles',
        'Thank you for dining at Zovo Bistro & Lounge. Follow us @zovobistro'
    )
    ON CONFLICT (restaurant_id) DO UPDATE SET
        tax_percentage = 8.50,
        service_charge_percentage = 10.00;

    -- 4. Categories
    INSERT INTO public.categories (id, restaurant_id, name, description, image_url, sort_order, is_active)
    VALUES 
    ('22222222-2222-2222-2222-222222220001'::uuid, v_rest_id, 'Starters & Tapas', 'Crisp small plates, carpaccio, and shared botanical appetizers.', 'https://images.unsplash.com/photo-1541544741938-0af808871cc0?w=600&auto=format&fit=crop&q=80', 1, TRUE),
    ('22222222-2222-2222-2222-222222220002'::uuid, v_rest_id, 'Artisanal Pastas', 'Daily hand-rolled pasta, slow-simmered ragùs and emulsions.', 'https://images.unsplash.com/photo-1621996346565-e3d5d6281691?w=600&auto=format&fit=crop&q=80', 2, TRUE),
    ('22222222-2222-2222-2222-222222220003'::uuid, v_rest_id, 'Wood-Fired Mains', 'Prime dry-aged cuts, roasted poultry, and sustainably sourced seafood.', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&auto=format&fit=crop&q=80', 3, TRUE),
    ('22222222-2222-2222-2222-222222220004'::uuid, v_rest_id, 'Craft Cocktails & Wine', 'Smoked botanicals, organic vintages, and zero-proof elixirs.', 'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80', 4, TRUE),
    ('22222222-2222-2222-2222-222222220005'::uuid, v_rest_id, 'Artisanal Desserts', 'Handcrafted pastries, house gelatos, and espresso reductions.', 'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&auto=format&fit=crop&q=80', 5, TRUE)
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

    v_cat_starters := '22222222-2222-2222-2222-222222220001'::uuid;
    v_cat_pastas   := '22222222-2222-2222-2222-222222220002'::uuid;
    v_cat_mains    := '22222222-2222-2222-2222-222222220003'::uuid;
    v_cat_drinks   := '22222222-2222-2222-2222-222222220004'::uuid;
    v_cat_desserts := '22222222-2222-2222-2222-222222220005'::uuid;

    -- 5. Dishes
    -- 5.1 Truffle Burrata
    INSERT INTO public.dishes (
        id, restaurant_id, category_id, name, description, image_url, price, preparation_time, dietary_type, allergens, is_available, is_archived
    ) VALUES (
        '33333333-3333-3333-3333-333333330001'::uuid,
        v_rest_id,
        v_cat_starters,
        'Truffle Burrata & Heirloom Figs',
        'Pugliese creamy burrata, mission figs, aged Modena balsamico, toasted pine nuts, and grilled rustic sourdough crisps.',
        'https://images.unsplash.com/photo-1592417817098-8f3d6910985b?w=600&auto=format&fit=crop&q=80',
        21.50,
        12,
        'vegetarian',
        '["Dairy", "Gluten", "Nuts"]'::jsonb,
        TRUE,
        FALSE
    ) ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_dish_burrata;

    -- 5.2 Yellowfin Tuna Tartare
    INSERT INTO public.dishes (
        id, restaurant_id, category_id, name, description, image_url, price, preparation_time, dietary_type, allergens, is_available, is_archived
    ) VALUES (
        '33333333-3333-3333-3333-333333330002'::uuid,
        v_rest_id,
        v_cat_starters,
        'Yellowfin Tuna Tartare',
        'Sashimi-grade Ahi tuna, Haas avocado mousse, Meyer lemon ponzu, sesame crisps, and micro cilantro.',
        'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80',
        24.00,
        10,
        'non_vegetarian',
        '["Fish", "Sesame", "Soy"]'::jsonb,
        TRUE,
        FALSE
    ) ON CONFLICT (id) DO NOTHING;

    -- 5.3 Hand-Cut Pappardelle Wild Boar
    INSERT INTO public.dishes (
        id, restaurant_id, category_id, name, description, image_url, price, preparation_time, dietary_type, allergens, is_available, is_archived
    ) VALUES (
        '33333333-3333-3333-3333-333333330003'::uuid,
        v_rest_id,
        v_cat_pastas,
        'Hand-Cut Pappardelle Wild Boar',
        '36-hour slow-braised wild boar shank ragù, San Marzano tomatoes, rosemary pangrattato, and 24-month aged Pecorino Romano.',
        'https://images.unsplash.com/photo-1551183053-bf91a1d81141?w=600&auto=format&fit=crop&q=80',
        34.00,
        18,
        'non_vegetarian',
        '["Gluten", "Dairy", "Eggs"]'::jsonb,
        TRUE,
        FALSE
    ) ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_dish_pappardelle;

    -- 5.4 Lobster & Saffron Risotto
    INSERT INTO public.dishes (
        id, restaurant_id, category_id, name, description, image_url, price, preparation_time, dietary_type, allergens, is_available, is_archived
    ) VALUES (
        '33333333-3333-3333-3333-333333330004'::uuid,
        v_rest_id,
        v_cat_pastas,
        'Lobster & Saffron Risotto',
        'Acquerello carnaroli rice, butter-poached Maine lobster tail, Spanish saffron broth, chives, and parmesan crisp.',
        'https://images.unsplash.com/photo-1633964913295-ceb43826e7c9?w=600&auto=format&fit=crop&q=80',
        42.00,
        22,
        'non_vegetarian',
        '["Shellfish", "Dairy"]'::jsonb,
        TRUE,
        FALSE
    ) ON CONFLICT (id) DO NOTHING;

    -- 5.5 Prime Dry-Aged Ribeye (16oz)
    INSERT INTO public.dishes (
        id, restaurant_id, category_id, name, description, image_url, price, preparation_time, dietary_type, allergens, is_available, is_archived
    ) VALUES (
        '33333333-3333-3333-3333-333333330005'::uuid,
        v_rest_id,
        v_cat_mains,
        'Prime Dry-Aged Ribeye (16oz)',
        '45-day dry-aged USDA Prime bone-in ribeye, charred bone marrow butter, roasted shallots, and Maldon smoked sea salt.',
        'https://images.unsplash.com/photo-1558030006-450675393462?w=600&auto=format&fit=crop&q=80',
        68.00,
        24,
        'non_vegetarian',
        '["Dairy"]'::jsonb,
        TRUE,
        FALSE
    ) ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_dish_steak;

    -- 5.6 Pan-Seared Chilean Sea Bass
    INSERT INTO public.dishes (
        id, restaurant_id, category_id, name, description, image_url, price, preparation_time, dietary_type, allergens, is_available, is_archived
    ) VALUES (
        '33333333-3333-3333-3333-333333330006'::uuid,
        v_rest_id,
        v_cat_mains,
        'Pan-Seared Chilean Sea Bass',
        'Wild caught sea bass, braised baby leeks, saffron-fennel velouté, and crispy caperberries.',
        'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=600&auto=format&fit=crop&q=80',
        52.00,
        20,
        'non_vegetarian',
        '["Fish", "Dairy"]'::jsonb,
        TRUE,
        FALSE
    ) ON CONFLICT (id) DO NOTHING;

    -- 5.7 Smoked Old Fashioned
    INSERT INTO public.dishes (
        id, restaurant_id, category_id, name, description, image_url, price, preparation_time, dietary_type, allergens, is_available, is_archived
    ) VALUES (
        '33333333-3333-3333-3333-333333330007'::uuid,
        v_rest_id,
        v_cat_drinks,
        'Smoked Bourbon Old Fashioned',
        'Single-barrel bourbon, raw Demerara cube, Angostura & house orange bitters, smoked with cherry wood in a decanter.',
        'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&auto=format&fit=crop&q=80',
        18.50,
        5,
        'vegan',
        '[]'::jsonb,
        TRUE,
        FALSE
    ) ON CONFLICT (id) DO NOTHING
    RETURNING id INTO v_dish_cocktail;

    -- 5.8 Valrhona Dark Chocolate Soufflé
    INSERT INTO public.dishes (
        id, restaurant_id, category_id, name, description, image_url, price, preparation_time, dietary_type, allergens, is_available, is_archived
    ) VALUES (
        '33333333-3333-3333-3333-333333330008'::uuid,
        v_rest_id,
        v_cat_desserts,
        'Valrhona Dark Chocolate Soufflé',
        '70% Guanaja chocolate molten center, Madagascar bourbon vanilla bean crème anglaise, and gold leaf.',
        'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?w=600&auto=format&fit=crop&q=80',
        16.00,
        15,
        'vegetarian',
        '["Dairy", "Eggs", "Gluten"]'::jsonb,
        TRUE,
        FALSE
    ) ON CONFLICT (id) DO NOTHING;

    -- 6. Dish Variants & Addons
    -- Ribeye Doneness Variants
    INSERT INTO public.dish_variants (dish_id, name, price, is_active)
    VALUES
    ('33333333-3333-3333-3333-333333330005'::uuid, 'Medium Rare (Recommended)', 68.00, TRUE),
    ('33333333-3333-3333-3333-333333330005'::uuid, 'Medium', 68.00, TRUE),
    ('33333333-3333-3333-3333-333333330005'::uuid, 'Medium Well', 68.00, TRUE),
    ('33333333-3333-3333-3333-333333330005'::uuid, 'Rare', 68.00, TRUE)
    ON CONFLICT DO NOTHING;

    -- Ribeye Addons
    INSERT INTO public.dish_addons (dish_id, name, additional_price, is_active)
    VALUES
    ('33333333-3333-3333-3333-333333330005'::uuid, 'Butter-Poached Lobster Tail', 24.00, TRUE),
    ('33333333-3333-3333-3333-333333330005'::uuid, 'Shaved Winter Black Truffles', 16.00, TRUE),
    ('33333333-3333-3333-3333-333333330005'::uuid, 'Roasted Bone Marrow Canoe', 12.00, TRUE)
    ON CONFLICT DO NOTHING;

    -- Pappardelle Addons
    INSERT INTO public.dish_addons (dish_id, name, additional_price, is_active)
    VALUES
    ('33333333-3333-3333-3333-333333330003'::uuid, 'Fresh Buffalo Burrata Top', 8.50, TRUE),
    ('33333333-3333-3333-3333-333333330003'::uuid, 'Gluten-Free Hand-Cut Pasta', 3.00, TRUE)
    ON CONFLICT DO NOTHING;

    -- 7. Restaurant Tables & Secure QR Codes
    -- Table 01
    INSERT INTO public.restaurant_tables (id, restaurant_id, table_name, table_number, seating_capacity, is_active)
    VALUES ('44444444-4444-4444-4444-444444440001'::uuid, v_rest_id, 'Window Table 1', 'Table 01', 2, TRUE)
    ON CONFLICT (restaurant_id, table_number) DO UPDATE SET is_active = TRUE
    RETURNING id INTO v_tbl_01;

    INSERT INTO public.table_qr_codes (restaurant_id, table_id, public_identifier, token_hash, is_active)
    VALUES (v_rest_id, v_tbl_01, 'zv_zovo-bistro_t01_e8a1d2f4', crypt('zv_sec_t01', gen_salt('bf')), TRUE)
    ON CONFLICT (public_identifier) DO UPDATE SET is_active = TRUE;

    -- Table 02
    INSERT INTO public.restaurant_tables (id, restaurant_id, table_name, table_number, seating_capacity, is_active)
    VALUES ('44444444-4444-4444-4444-444444440002'::uuid, v_rest_id, 'Main Dining Booth 2', 'Table 02', 4, TRUE)
    ON CONFLICT (restaurant_id, table_number) DO UPDATE SET is_active = TRUE
    RETURNING id INTO v_tbl_02;

    INSERT INTO public.table_qr_codes (restaurant_id, table_id, public_identifier, token_hash, is_active)
    VALUES (v_rest_id, v_tbl_02, 'zv_zovo-bistro_t02_c9b4e5a7', crypt('zv_sec_t02', gen_salt('bf')), TRUE)
    ON CONFLICT (public_identifier) DO UPDATE SET is_active = TRUE;

    -- Table 03
    INSERT INTO public.restaurant_tables (id, restaurant_id, table_name, table_number, seating_capacity, is_active)
    VALUES ('44444444-4444-4444-4444-444444440003'::uuid, v_rest_id, 'Patio Garden 3', 'Table 03', 4, TRUE)
    ON CONFLICT (restaurant_id, table_number) DO UPDATE SET is_active = TRUE
    RETURNING id INTO v_tbl_03;

    INSERT INTO public.table_qr_codes (restaurant_id, table_id, public_identifier, token_hash, is_active)
    VALUES (v_rest_id, v_tbl_03, 'zv_zovo-bistro_t03_f3a7d1b8', crypt('zv_sec_t03', gen_salt('bf')), TRUE)
    ON CONFLICT (public_identifier) DO UPDATE SET is_active = TRUE;

    -- Table 04
    INSERT INTO public.restaurant_tables (id, restaurant_id, table_name, table_number, seating_capacity, is_active)
    VALUES ('44444444-4444-4444-4444-444444440004'::uuid, v_rest_id, 'Wine Cellar Table 4', 'Table 04', 6, TRUE)
    ON CONFLICT (restaurant_id, table_number) DO UPDATE SET is_active = TRUE
    RETURNING id INTO v_tbl_04;

    INSERT INTO public.table_qr_codes (restaurant_id, table_id, public_identifier, token_hash, is_active)
    VALUES (v_rest_id, v_tbl_04, 'zv_zovo-bistro_t04_b2d8c4e9', crypt('zv_sec_t04', gen_salt('bf')), TRUE)
    ON CONFLICT (public_identifier) DO UPDATE SET is_active = TRUE;

    -- Table 05 (Prime Dining Table for Multi-Guest testing)
    INSERT INTO public.restaurant_tables (id, restaurant_id, table_name, table_number, seating_capacity, is_active)
    VALUES ('44444444-4444-4444-4444-444444440005'::uuid, v_rest_id, 'Executive Booth 5', 'Table 05', 8, TRUE)
    ON CONFLICT (restaurant_id, table_number) DO UPDATE SET is_active = TRUE
    RETURNING id INTO v_tbl_05;

    INSERT INTO public.table_qr_codes (restaurant_id, table_id, public_identifier, token_hash, is_active)
    VALUES (v_rest_id, v_tbl_05, 'zv_zovo-bistro_t05_a1e9f4c3', crypt('zv_sec_t05', gen_salt('bf')), TRUE)
    ON CONFLICT (public_identifier) DO UPDATE SET is_active = TRUE;

    RAISE NOTICE 'ZOVO Phase 5 commercial restaurant data seeded successfully!';
END $$;

