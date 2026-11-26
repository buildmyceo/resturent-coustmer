'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Loader2, LogOut, Receipt, User } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { formatCurrency } from '@/lib/format';
import { StorefrontBottomNav } from '@/components/store/StorefrontBottomNav';
import { CustomerAuthModal } from '@/components/auth/CustomerAuthModal';

export default function StorefrontBillsPage() {
  const params = useParams<{ restaurantSlug: string }>();
  const restaurantSlug = params?.restaurantSlug || '';
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const loadBills = async () => {
    setLoading(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      setUser(authData?.user || null);

      const infoRes = await fetch(
        `/api/restaurant/info?slug=${encodeURIComponent(restaurantSlug)}`
      );
      const infoJson = await infoRes.json();
      const restaurantId = infoJson?.restaurant?.id || '';

      const qs = new URLSearchParams();
      if (restaurantId) qs.set('restaurantId', restaurantId);

      const res = await fetch(`/api/customer/history?${qs.toString()}`, {
        cache: 'no-store',
      });
      const json = await res.json();
      if (json.success) {
        setBills(json.bills || []);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadBills();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantSlug]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setBills([]);
  };

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

          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-light-primary text-white text-xs font-semibold"
            >
              <User className="w-3.5 h-3.5" />
              Sign In
            </button>
          )}
        </div>

        {user && (
          <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-slate-900">
                {user.user_metadata?.full_name || 'Customer'}
              </p>
              <p className="text-xs text-slate-500">
                {user.email}
                {user.user_metadata?.phone ? ` · ${user.user_metadata.phone}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="text-xs font-semibold text-light-primary hover:underline"
            >
              Edit Name / Phone
            </button>
          </div>
        )}

        <h1 className="font-headline text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Receipt className="w-6 h-6 text-light-primary" />
          Bill History &amp; Receipts
        </h1>

        {loading ? (
          <div className="py-16 text-center">
            <Loader2 className="w-8 h-8 text-light-primary animate-spin mx-auto" />
          </div>
        ) : bills.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center space-y-3">
            <Receipt className="w-10 h-10 text-slate-300 mx-auto" />
            <p className="text-sm font-semibold text-slate-800">No paid bills yet</p>
            <p className="text-xs text-slate-500">
              {user
                ? 'Your completed & paid bills will appear here.'
                : 'Sign in with Google or Email to view your bill history.'}
            </p>
            {!user && (
              <button
                type="button"
                onClick={() => setAuthOpen(true)}
                className="px-4 py-2 rounded-xl bg-light-primary text-white text-xs font-semibold"
              >
                Sign In with Google / Email
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {bills.map((b) => (
              <div
                key={b.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2 shadow-2xs"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-xs font-bold text-slate-900">
                      #{b.order_number}
                    </span>
                    <p className="text-xs text-slate-500">
                      {new Date(b.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                      PAID
                    </span>
                    <p className="text-sm font-bold text-slate-900 mt-1">
                      {formatCurrency(Number(b.total_amount || 0), 'INR')}
                    </p>
                  </div>
                </div>
                <div className="text-xs text-slate-600 border-t border-slate-100 pt-2">
                  {(b.order_items || [])
                    .map((i: any) => `${i.quantity}× ${i.dish_name}`)
                    .join(', ')}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <StorefrontBottomNav restaurantSlug={restaurantSlug} />
      <CustomerAuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => loadBills()}
      />
    </main>
  );
}
