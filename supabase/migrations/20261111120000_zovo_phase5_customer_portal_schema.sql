-- ==============================================================================
-- ZOVO RESTAURANT MANAGEMENT SAAS — PHASE 5 CUSTOMER PORTAL PRODUCTION SCHEMA
-- Migration: 20261111120000_zovo_phase5_customer_portal_schema.sql
-- Description: Complete schema, RLS policies, RPCs, and Realtime replication
--              for the Customer Portal QR Ordering, 15-Min Table Claim,
--              Waiter Equal-Distribution Assignment, and Payment System.
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 2. TABLE SESSIONS & PARTICIPANTS ENHANCEMENTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.table_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'occupied' CHECK (status IN ('occupied', 'payment_pending', 'completed', 'cancelled')),
    guest_count INT NOT NULL DEFAULT 1 CHECK (guest_count > 0),
    customer_name TEXT,
    opened_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    closed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    opened_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at TIMESTAMPTZ,
    notes TEXT,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    service_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (service_fee >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    total_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_paid >= 0),
    initial_claim_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes'),
    first_order_submitted_at TIMESTAMPTZ,
    is_claim_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Alter table to ensure new 15-minute rule columns exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'table_sessions' AND column_name = 'initial_claim_expires_at'
    ) THEN
        ALTER TABLE public.table_sessions ADD COLUMN initial_claim_expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '15 minutes');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'table_sessions' AND column_name = 'first_order_submitted_at'
    ) THEN
        ALTER TABLE public.table_sessions ADD COLUMN first_order_submitted_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'table_sessions' AND column_name = 'is_claim_permanent'
    ) THEN
        ALTER TABLE public.table_sessions ADD COLUMN is_claim_permanent BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_table_sessions_restaurant ON public.table_sessions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_table ON public.table_sessions(table_id);
CREATE INDEX IF NOT EXISTS idx_table_sessions_status ON public.table_sessions(restaurant_id, status);
CREATE INDEX IF NOT EXISTS idx_table_sessions_claim_expires ON public.table_sessions(initial_claim_expires_at) WHERE is_claim_permanent = FALSE;

-- STRICT CONCURRENCY CONSTRAINT: Only ONE active session allowed per table at any time
CREATE UNIQUE INDEX IF NOT EXISTS idx_table_sessions_one_active_per_table 
    ON public.table_sessions(table_id) 
    WHERE status IN ('occupied', 'payment_pending');

-- Session Participants Table
CREATE TABLE IF NOT EXISTS public.session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    guest_token TEXT,
    is_host BOOLEAN NOT NULL DEFAULT FALSE,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_participants_session ON public.session_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_session_participants_token ON public.session_participants(guest_token);

-- ==============================================================================
-- 3. ORDERS & ITEMS ENHANCEMENTS FOR SESSIONS & WAITER ASSIGNMENT
-- ==============================================================================

-- 3.1 Unify Order Status Check to Support Complete Workflow:
-- customer_submits -> waiting_for_waiter -> waiter_accepted -> sent_to_kitchen -> accepted -> preparing -> ready -> served -> completed -> cancelled / rejected
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check
    CHECK (status IN (
        'pending',
        'waiting_for_waiter',
        'waiter_accepted',
        'sent_to_kitchen',
        'accepted_by_kitchen',
        'accepted',
        'preparing',
        'ready',
        'served',
        'completed',
        'cancelled',
        'rejected'
    ));

-- 3.2 Add Waiter Assignment Columns
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'table_session_id'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN table_session_id UUID REFERENCES public.table_sessions(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_orders_table_session ON public.orders(table_session_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'participant_id'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN participant_id UUID REFERENCES public.session_participants(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_orders_participant ON public.orders(participant_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'participant_name'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN participant_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'assigned_waiter_id'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN assigned_waiter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_orders_assigned_waiter ON public.orders(assigned_waiter_id);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'assigned_at'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN assigned_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'assignment_method'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN assignment_method TEXT DEFAULT 'equal_distribution';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'assignment_status'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN assignment_status TEXT DEFAULT 'unassigned';
        CREATE INDEX IF NOT EXISTS idx_orders_assignment_status ON public.orders(assignment_status);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'rejection_reason'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN rejection_reason TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'rejected_at'
    ) THEN
        ALTER TABLE public.orders ADD COLUMN rejected_at TIMESTAMPTZ;
    END IF;
END $$;

-- 3.3 Order Items Variant, Addon, Status, and Serving Tracking
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'status'
    ) THEN
        ALTER TABLE public.order_items ADD COLUMN status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'served', 'cancelled'));
        CREATE INDEX IF NOT EXISTS idx_order_items_status ON public.order_items(status);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'variant_name'
    ) THEN
        ALTER TABLE public.order_items ADD COLUMN variant_name TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'addons'
    ) THEN
        ALTER TABLE public.order_items ADD COLUMN addons JSONB NOT NULL DEFAULT '[]'::jsonb;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'served_at'
    ) THEN
        ALTER TABLE public.order_items ADD COLUMN served_at TIMESTAMPTZ;
    END IF;
END $$;

-- ==============================================================================
-- 4. SERVICE REQUESTS (CALL WAITER / WATER / BILL)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.service_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    table_id UUID NOT NULL REFERENCES public.restaurant_tables(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.table_sessions(id) ON DELETE SET NULL,
    request_type TEXT NOT NULL CHECK (request_type IN ('call_waiter', 'water', 'assistance', 'request_bill', 'cleaning', 'other')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acknowledged', 'in_progress', 'resolved', 'cancelled')),
    notes TEXT,
    requested_by_name TEXT,
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    acknowledged_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_service_requests_restaurant ON public.service_requests(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_table ON public.service_requests(table_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status ON public.service_requests(restaurant_id, status);

-- ==============================================================================
-- 5. PAYMENTS & INVOICES
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'upi', 'online', 'razorpay', 'other')),
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    transaction_id TEXT,
    gateway_order_id TEXT,
    gateway_payment_id TEXT,
    gateway_signature TEXT,
    collected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_restaurant ON public.payments(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_payments_session ON public.payments(session_id);
CREATE INDEX IF NOT EXISTS idx_payments_gateway_payment ON public.payments(gateway_payment_id);

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_id UUID NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.table_sessions(id) ON DELETE CASCADE,
    invoice_number TEXT NOT NULL UNIQUE,
    table_number TEXT NOT NULL,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (subtotal >= 0),
    tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (tax_amount >= 0),
    service_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (service_fee >= 0),
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (discount_amount >= 0),
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_amount >= 0),
    total_paid NUMERIC(10, 2) NOT NULL DEFAULT 0.00 CHECK (total_paid >= 0),
    status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('draft', 'issued', 'paid', 'cancelled')),
    items_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    tax_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    payment_reference TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_restaurant ON public.invoices(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_invoices_session ON public.invoices(session_id);
CREATE INDEX IF NOT EXISTS idx_invoices_number ON public.invoices(invoice_number);

-- ==============================================================================
-- 6. TRUSTED ATOMIC RPC FUNCTIONS (SECURITY DEFINER)
-- ==============================================================================

-- 6.1 Secure QR Resolution Function
CREATE OR REPLACE FUNCTION public.resolve_table_qr(p_public_identifier TEXT)
RETURNS TABLE (
    table_id UUID,
    restaurant_id UUID,
    table_number TEXT,
    table_name TEXT,
    seating_capacity INT,
    restaurant_name TEXT,
    restaurant_slug TEXT,
    restaurant_status TEXT,
    active_session_id UUID,
    session_status TEXT
) AS $$
DECLARE
    v_table_id UUID;
    v_restaurant_id UUID;
BEGIN
    SELECT q.table_id, q.restaurant_id
    INTO v_table_id, v_restaurant_id
    FROM public.table_qr_codes q
    JOIN public.restaurant_tables t ON t.id = q.table_id
    JOIN public.restaurants r ON r.id = q.restaurant_id
    WHERE q.public_identifier = trim(p_public_identifier)
      AND q.is_active = TRUE
      AND q.revoked_at IS NULL
      AND (q.expires_at IS NULL OR q.expires_at > NOW())
      AND t.is_active = TRUE
      AND r.status = 'active';

    IF v_table_id IS NULL THEN
        RETURN;
    END IF;

    -- Clean up any expired unclaimed session before reporting status
    UPDATE public.table_sessions
    SET status = 'cancelled', updated_at = NOW()
    WHERE table_id = v_table_id
      AND status = 'occupied'
      AND is_claim_permanent = FALSE
      AND initial_claim_expires_at < NOW();

    RETURN QUERY
    SELECT
        t.id AS table_id,
        t.restaurant_id,
        t.table_number,
        t.table_name,
        t.seating_capacity,
        r.name AS restaurant_name,
        r.slug AS restaurant_slug,
        r.status AS restaurant_status,
        s.id AS active_session_id,
        s.status AS session_status
    FROM public.restaurant_tables t
    JOIN public.restaurants r ON r.id = t.restaurant_id
    LEFT JOIN public.table_sessions s 
           ON s.table_id = t.id 
          AND s.status IN ('occupied', 'payment_pending')
    WHERE t.id = v_table_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp;

-- 6.2 Atomic Concurrency-Safe Start Or Join Table Session with 15-Minute Rule
CREATE OR REPLACE FUNCTION public.start_or_join_table_session(
    p_public_identifier TEXT,
    p_guest_name TEXT,
    p_guest_token TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_qr RECORD;
    v_session RECORD;
    v_participant_id UUID;
    v_is_host BOOLEAN := FALSE;
    v_safe_name TEXT;
    v_safe_token TEXT;
BEGIN
    v_safe_name := COALESCE(NULLIF(trim(p_guest_name), ''), 'Guest');
    v_safe_token := COALESCE(NULLIF(trim(p_guest_token), ''), 'gt_' || substr(md5(random()::text), 1, 16));

    -- 1. Validate QR code
    SELECT q.table_id, q.restaurant_id, t.table_number, t.table_name, r.name AS restaurant_name, r.slug AS restaurant_slug
    INTO v_qr
    FROM public.table_qr_codes q
    JOIN public.restaurant_tables t ON t.id = q.table_id
    JOIN public.restaurants r ON r.id = q.restaurant_id
    WHERE q.public_identifier = trim(p_public_identifier)
      AND q.is_active = TRUE
      AND q.revoked_at IS NULL
      AND (q.expires_at IS NULL OR q.expires_at > NOW())
      AND t.is_active = TRUE
      AND r.status = 'active';

    IF v_qr.table_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid, expired, or inactive QR code.');
    END IF;

    -- 2. Concurrency Lock on Table to prevent duplicate sessions
    PERFORM pg_advisory_xact_lock(hashtext(v_qr.table_id::text));

    -- 3. Release any previous session on this table that expired under the 15-minute rule without orders
    UPDATE public.table_sessions
    SET status = 'cancelled', updated_at = NOW()
    WHERE table_id = v_qr.table_id
      AND status = 'occupied'
      AND is_claim_permanent = FALSE
      AND initial_claim_expires_at < NOW();

    -- 4. Check for active session
    SELECT * INTO v_session
    FROM public.table_sessions
    WHERE table_id = v_qr.table_id
      AND status IN ('occupied', 'payment_pending')
    LIMIT 1;

    IF v_session.id IS NULL THEN
        -- Create NEW session with 15-minute ordering deadline
        v_is_host := TRUE;
        INSERT INTO public.table_sessions (
            restaurant_id,
            table_id,
            status,
            guest_count,
            customer_name,
            opened_at,
            initial_claim_expires_at,
            is_claim_permanent
        )
        VALUES (
            v_qr.restaurant_id,
            v_qr.table_id,
            'occupied',
            1,
            v_safe_name,
            NOW(),
            NOW() + INTERVAL '15 minutes',
            FALSE
        )
        RETURNING * INTO v_session;
    ELSE
        -- Join existing active session
        UPDATE public.table_sessions
        SET guest_count = guest_count + 1,
            updated_at = NOW()
        WHERE id = v_session.id;
    END IF;

    -- 5. Create participant record
    INSERT INTO public.session_participants (
        session_id,
        name,
        guest_token,
        is_host,
        last_active_at,
        joined_at
    )
    VALUES (
        v_session.id,
        v_safe_name,
        v_safe_token,
        v_is_host,
        NOW(),
        NOW()
    )
    RETURNING id INTO v_participant_id;

    RETURN jsonb_build_object(
        'success', true,
        'session_id', v_session.id,
        'participant_id', v_participant_id,
        'guest_token', v_safe_token,
        'guest_name', v_safe_name,
        'is_host', v_is_host,
        'table_id', v_qr.table_id,
        'table_number', v_qr.table_number,
        'table_name', v_qr.table_name,
        'restaurant_id', v_qr.restaurant_id,
        'restaurant_name', v_qr.restaurant_name,
        'restaurant_slug', v_qr.restaurant_slug,
        'session_status', v_session.status,
        'initial_claim_expires_at', v_session.initial_claim_expires_at,
        'is_claim_permanent', v_session.is_claim_permanent
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6.3 Equal-Distribution Waiter Assignment Algorithm (RPC)
CREATE OR REPLACE FUNCTION public.assign_order_waiter(p_order_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_order RECORD;
    v_waiter RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Select eligible waiter with lowest active order count, with rotating tie-breaker
    SELECT 
        rm.user_id,
        p.full_name AS waiter_name,
        COUNT(o.id) AS active_orders_count,
        MAX(o.assigned_at) AS last_assigned_at
    INTO v_waiter
    FROM public.restaurant_members rm
    JOIN public.profiles p ON p.id = rm.user_id
    LEFT JOIN public.orders o 
           ON o.assigned_waiter_id = rm.user_id
          AND o.status IN ('waiting_for_waiter', 'waiter_accepted', 'sent_to_kitchen', 'accepted_by_kitchen', 'accepted', 'preparing', 'ready')
          AND o.restaurant_id = v_order.restaurant_id
    WHERE rm.restaurant_id = v_order.restaurant_id
      AND rm.role = 'waiter'
      AND rm.approval_status = 'approved'
      AND rm.is_active = TRUE
    GROUP BY rm.user_id, p.full_name
    ORDER BY COUNT(o.id) ASC, MAX(o.assigned_at) ASC NULLS FIRST, rm.user_id ASC
    LIMIT 1;

    IF v_waiter.user_id IS NOT NULL THEN
        UPDATE public.orders
        SET assigned_waiter_id = v_waiter.user_id,
            assigned_at = NOW(),
            assignment_method = 'equal_distribution',
            assignment_status = 'assigned'
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'assigned_waiter_id', v_waiter.user_id,
            'assigned_waiter_name', v_waiter.waiter_name,
            'assignment_status', 'assigned',
            'active_workload', v_waiter.active_orders_count + 1
        );
    ELSE
        UPDATE public.orders
        SET assignment_status = 'unassigned',
            assignment_method = 'equal_distribution'
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', false,
            'error', 'No active waiters currently available',
            'assignment_status', 'unassigned'
        );
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 6.4 Lock Dining Session & Remove 15-Minute Deadline Upon First Order Submission
CREATE OR REPLACE FUNCTION public.confirm_table_claim_on_first_order(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE public.table_sessions
    SET is_claim_permanent = TRUE,
        first_order_submitted_at = COALESCE(first_order_submitted_at, NOW()),
        initial_claim_expires_at = NULL,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES FOR CUSTOMERS & REALTIME
-- ==============================================================================

ALTER TABLE public.table_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Table Sessions
DROP POLICY IF EXISTS "Public can view table sessions" ON public.table_sessions;
CREATE POLICY "Public can view table sessions" ON public.table_sessions
    FOR SELECT TO anon, authenticated
    USING (true);

-- Session Participants
DROP POLICY IF EXISTS "Anyone can read session participants" ON public.session_participants;
CREATE POLICY "Anyone can read session participants" ON public.session_participants
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Anyone can join session as participant" ON public.session_participants;
CREATE POLICY "Anyone can join session as participant" ON public.session_participants
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Service Requests
DROP POLICY IF EXISTS "Public can create service requests" ON public.service_requests;
CREATE POLICY "Public can create service requests" ON public.service_requests
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can view service requests" ON public.service_requests;
CREATE POLICY "Public can view service requests" ON public.service_requests
    FOR SELECT TO anon, authenticated
    USING (true);

-- Orders
DROP POLICY IF EXISTS "Customer and Staff can view orders" ON public.orders;
CREATE POLICY "Customer and Staff can view orders" ON public.orders
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Customer and Staff can insert orders" ON public.orders;
CREATE POLICY "Customer and Staff can insert orders" ON public.orders
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Order Items
DROP POLICY IF EXISTS "Customer and Staff can view order items" ON public.order_items;
CREATE POLICY "Customer and Staff can view order items" ON public.order_items
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Customer and Staff can insert order items" ON public.order_items;
CREATE POLICY "Customer and Staff can insert order items" ON public.order_items
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- Payments & Invoices
DROP POLICY IF EXISTS "Anyone can view payments" ON public.payments;
CREATE POLICY "Anyone can view payments" ON public.payments
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Anyone can insert payments" ON public.payments;
CREATE POLICY "Anyone can insert payments" ON public.payments
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view invoices" ON public.invoices;
CREATE POLICY "Anyone can view invoices" ON public.invoices
    FOR SELECT TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Anyone can insert invoices" ON public.invoices;
CREATE POLICY "Anyone can insert invoices" ON public.invoices
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- GRANTS
GRANT SELECT, INSERT, UPDATE ON public.table_sessions TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.session_participants TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.service_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.orders TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.order_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.invoices TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_table_qr(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_or_join_table_session(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_order_waiter(UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_table_claim_on_first_order(UUID) TO anon, authenticated;

-- REALTIME PUBLICATION
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.table_sessions;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.service_requests;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
