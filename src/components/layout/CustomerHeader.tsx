'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { Utensils, Users, Bell, Clock, AlertTriangle } from 'lucide-react';

export function CustomerHeader() {
  const { restaurant, table, session, participant, setIsCallWaiterModalOpen, orders } = useCustomer();
  const [storedSession, setStoredSession] = useState<{ tableNumber?: string; restaurantSlug?: string } | null>(null);

  useEffect(() => {
    const s = getGuestSession();
    if (s) queueMicrotask(() => setStoredSession(s));
  }, []);

  const displayName = restaurant?.name || (storedSession?.restaurantSlug ? storedSession.restaurantSlug.replace(/-.*$/, '') : 'bikaner');
  const displayTable = table?.number || storedSession?.tableNumber || 'T-01';

  // 15-Minute Countdown Timer State
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isWarning, setIsWarning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const hasOrders = (orders && orders.length > 0) || session?.isClaimPermanent === true;

  useEffect(() => {
    // If order has already been placed, timer does NOT apply!
    if (hasOrders || !session?.initialClaimExpiresAt) {
      queueMicrotask(() => setTimeLeft(null));
      return;
    }

    const expiresTimestamp = new Date(session.initialClaimExpiresAt).getTime();

    const interval = setInterval(() => {
      const now = Date.now();
      const diffMs = expiresTimestamp - now;

      if (diffMs <= 0) {
        setTimeLeft('00:00');
        setIsExpired(true);
        clearInterval(interval);
      } else {
        const totalSeconds = Math.floor(diffMs / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        const formatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        setTimeLeft(formatted);
        setIsWarning(minutes < 3); // Under 3 mins left
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.initialClaimExpiresAt, hasOrders]);

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
      {/* 15-Minute Countdown Banner (Only shown before first order is placed) */}
      {!hasOrders && timeLeft && (
        <div
          className={`px-4 py-1.5 text-center text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
            isExpired
              ? 'bg-rose-600 text-white animate-pulse'
              : isWarning
              ? 'bg-amber-500 text-white animate-pulse'
              : 'bg-blue-600 text-white'
          }`}
        >
          {isExpired ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Initial 15-min table claim expired. Please scan table QR again to reserve.</span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5" />
              <span>
                Table reserved! Order within <strong className="font-mono text-sm underline">{timeLeft}</strong> to secure your table.
              </span>
            </>
          )}
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Restaurant Identity */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-blue-50 border border-slate-200 shrink-0 flex items-center justify-center">
            {restaurant?.logoUrl ? (
              <Image
                src={restaurant.logoUrl}
                alt={restaurant.name}
                fill
                className="object-cover"
              />
            ) : (
              <div className="w-full h-full bg-black flex items-center justify-center p-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/ceova-logo.png"
                  alt="Ceova"
                  className="w-full h-full object-contain"
                />
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
              {displayName}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/60">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Open
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-500 truncate">
                {restaurant?.restaurantType || 'Fine Dining'}
              </span>
            </div>
          </div>
        </div>

        {/* Table & Guest Identity */}
        <div className="flex items-center gap-2">
          <div className="bg-slate-100/90 border border-slate-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
            <Utensils className="w-3.5 h-3.5 text-blue-600" />
            <span className="text-xs font-bold text-slate-900">{displayTable}</span>
          </div>

          {participant && (
            <div
              title={`Logged in as ${participant.name}`}
              className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 bg-blue-50 text-blue-700 border border-blue-200/60 rounded-xl text-xs font-semibold"
            >
              <Users className="w-3.5 h-3.5" />
              <span className="truncate max-w-[80px]">{participant.name}</span>
            </div>
          )}

          {/* Quick Waiter Button */}
          <button
            onClick={() => setIsCallWaiterModalOpen(true)}
            className="p-2 text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl border border-slate-200 transition-colors"
            title="Call Waiter"
          >
            <Bell className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
