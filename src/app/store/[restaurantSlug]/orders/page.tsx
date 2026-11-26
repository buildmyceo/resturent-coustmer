'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Clock, Loader2, Package, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/format';
import { StorefrontBottomNav } from '@/components/store/StorefrontBottomNav';
import { CustomerAuthModal } from '@/components/auth/CustomerAuthModal';

export default function StorefrontOrdersPage() {
  const params = useParams<{ restaurantSlug: string }>();
  const restaurantSlug = params?.restaurantSlug || '';
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      setUser(authData?.user || null);

      const infoRes = await fetch(
        `/api/restaurant/info?slug=${encodeURIComponent(restaurantSlug)}`
      );
      const infoJson = await infoRes.json();
      const restaurantId = infoJson?.restaurant?.id || '';

      let localIds = '';
      try {
        const saved = JSON.parse(localStorage.getItem('ceova_recent_order_ids') || '[]');
        if (Array.isArray(saved)) localIds = saved.join(',');
      } catch {}

      const qs = new URLSearchParams();
      if (restaurantId) qs.set('restaurantId', restaurantId);
      if (localIds) qs.set('orderIds', localIds);

      const res = await fetch(`/api/customer/history?${qs.toString()}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success) {
        setOrders(json.orders || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug]);

  return (
    <main className="min-h-screen bg-light-surface pb-24">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <Link
            href={`/store/${restaurantSlug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Menu
          </Link>

          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <User className="w-3.5 h-3.5 text-light-primary" />
            {user ? user.user_metadata?.full_name || user.email : 'Sign In'}
          </button>
        </div>

        <h1 className="font-headline text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Clock className="w-6 h-6 text-light-primary" />
          Your Orders
        </h1>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 text-light-primary animate-spin mx-auto" />
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
            <Package className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">No orders found yet</p>
            <p className="text-xs text-slate-500">
              {user
                ? 'Orders placed with your email or phone will appear here.'
                : 'Sign in with Google or Email to see all your past and active orders.'}
            </p>
            {!user && (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="px-4 py-2 rounded-xl bg-light-primary text-white text-xs font-semibold"
              >
                Sign In / Create Account
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Link
                key={o.id}
                href={`/store/${restaurantSlug}/orders/${o.id}`}
                className="block bg-white border border-slate-200 rounded-2xl p-4 hover:border-light-primary transition-colors shadow-2xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="font-mono text-xs font-bold text-light-primary">
                      #{o.order_number}
                    </span>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {new Date(o.created_at).toLocaleString()} ·{' '}
                      {o.order_type === 'delivery' ? 'Delivery' : 'Dine-In'}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase bg-slate-100 text-slate-800">
                      {o.delivery_status || o.status}
                    </span>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {formatCurrency(Number(o.total_amount || 0), 'INR')}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <StorefrontBottomNav restaurantSlug={restaurantSlug} />
      <CustomerAuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => loadOrders()}
      />
    </main>
  );
}
