'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Clock, Flame, Loader2, Package, Truck, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/format';
import { StorefrontBottomNav } from '@/components/store/StorefrontBottomNav';
import { CustomerAuthModal } from '@/components/auth/CustomerAuthModal';

function getDeliveryProgress(order: any) {
  const status = String(order.status || 'pending').toLowerCase();
  const dStatus = String(order.delivery_status || '').toLowerCase();

  if (status === 'cancelled' || status === 'rejected') {
    return { step: -1, label: 'Cancelled', badgeClass: 'bg-rose-100 text-rose-700' };
  }
  if (dStatus === 'delivered') {
    return { step: 4, label: 'Delivered · Done', badgeClass: 'bg-emerald-100 text-emerald-800' };
  }
  if (
    order.order_type === 'delivery' &&
    (dStatus === 'out_for_delivery' || status === 'ready' || status === 'completed')
  ) {
    return { step: 3, label: 'Out for Delivery', badgeClass: 'bg-amber-100 text-amber-800' };
  }
  if (status === 'completed' || status === 'served') {
    return { step: 4, label: 'Completed', badgeClass: 'bg-emerald-100 text-emerald-800' };
  }
  if (status === 'ready') {
    return { step: 3, label: 'Food Ready', badgeClass: 'bg-emerald-100 text-emerald-800' };
  }
  if (status === 'preparing' || status === 'accepted') {
    return { step: 2, label: 'Preparing Food', badgeClass: 'bg-blue-100 text-blue-800' };
  }
  return { step: 1, label: 'Order Confirmed', badgeClass: 'bg-slate-100 text-slate-800' };
}

export default function StorefrontOrdersPage() {
  const params = useParams<{ restaurantSlug: string }>();
  const restaurantSlug = params?.restaurantSlug || '';
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const loadOrders = async (silent = false) => {
    if (!silent) setLoading(true);
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
    if (!silent) setLoading(false);
  };

  useEffect(() => {
    loadOrders();
    const interval = setInterval(() => loadOrders(true), 6000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug]);

  const steps = [
    { id: 1, title: 'Confirmed', icon: Clock },
    { id: 2, title: 'Preparing', icon: Flame },
    { id: 3, title: 'Out for Delivery', icon: Truck },
    { id: 4, title: 'Delivered', icon: CheckCircle2 },
  ];

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
          Order History
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
          <div className="space-y-4">
            {orders.map((o) => {
              const progress = getDeliveryProgress(o);
              return (
                <Link
                  key={o.id}
                  href={`/store/${restaurantSlug}/orders/${o.id}`}
                  className="block bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 hover:border-light-primary transition-colors shadow-2xs space-y-4"
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
                      <p className="text-xs text-slate-700 mt-1">
                        {(o.order_items || [])
                          .map((i: any) => `${i.quantity}× ${i.dish_name}`)
                          .join(', ')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase ${progress.badgeClass}`}
                      >
                        {progress.label}
                      </span>
                      <p className="text-sm font-bold text-slate-900 mt-1.5">
                        {formatCurrency(Number(o.total_amount || 0), 'INR')}
                      </p>
                    </div>
                  </div>

                  {/* Live 4-Step Progress Tracker */}
                  {progress.step > 0 && (
                    <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-100">
                      {steps.map((s) => {
                        const Icon = s.icon;
                        const done = progress.step >= s.id;
                        const active = progress.step === s.id;
                        return (
                          <div key={s.id} className="flex flex-col items-center text-center gap-1">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center border text-xs ${
                                done
                                  ? 'bg-emerald-600 border-emerald-600 text-white'
                                  : 'bg-slate-50 border-slate-200 text-slate-400'
                              } ${active ? 'ring-2 ring-emerald-200' : ''}`}
                            >
                              <Icon className="w-3.5 h-3.5" />
                            </div>
                            <span
                              className={`text-[10px] font-semibold leading-tight ${
                                done ? 'text-slate-900' : 'text-slate-400'
                              }`}
                            >
                              {s.title}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Link>
              );
            })}
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
