'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { UtensilsCrossed, User, Bell, Clock, AlertTriangle, Coffee } from 'lucide-react';

export function CustomerHeader() {
  const { restaurant, table, session, participant, setIsCallWaiterModalOpen, orders } = useCustomer();
  const [storedSession, setStoredSession] = useState<{ tableNumber?: string; restaurantSlug?: string; guestName?: string } | null>(null);

  useEffect(() => {
    const s = getGuestSession();
    if (s) queueMicrotask(() => setStoredSession(s));
  }, []);

  const displayName = restaurant?.name || (storedSession?.restaurantSlug ? storedSession.restaurantSlug.replace(/-.*$/, '') : 'Barista');
  const displayTable = table?.number || storedSession?.tableNumber || 'T-01';
  const displayGuestName = participant?.name || storedSession?.guestName || 'harshit';

  // 15-Minute Countdown Timer State
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isWarning, setIsWarning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const hasOrders = (orders && orders.length > 0) || session?.isClaimPermanent === true;
  const hasActiveOrders = orders.some((o) => ['pending', 'accepted', 'preparing', 'ready'].includes(o.status));

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
        setIsWarning(minutes < 3);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.initialClaimExpiresAt, hasOrders]);

  return (
    <header className="sticky top-0 z-40 bg-light-surface-container-lowest border-b border-light-outline-variant/60 shadow-xs">
      {/* 15-Minute Countdown Banner (Only shown before first order is placed) */}
      {!hasOrders && timeLeft && (
        <div
          className={`px-4 py-1.5 text-center text-xs font-semibold flex items-center justify-center gap-2 transition-colors ${
            isExpired
              ? 'bg-rose-600 text-white animate-pulse'
              : isWarning
              ? 'bg-amber-500 text-white animate-pulse'
              : 'bg-light-inverse-surface text-light-inverse-on-surface'
          }`}
        >
          {isExpired ? (
            <>
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>Initial 15-min table claim expired. Please scan table QR again to reserve.</span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Table reserved! Order within <strong className="font-mono text-sm underline">{timeLeft}</strong> to secure your table.
              </span>
            </>
          )}
        </div>
      )}

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
        {/* Brand Identity */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative w-10 h-10 rounded-full bg-light-primary text-light-on-primary flex items-center justify-center shrink-0 overflow-hidden shadow-xs">
            {restaurant?.logoUrl ? (
              <Image
                src={restaurant.logoUrl}
                alt={displayName}
                fill
                className="object-cover"
              />
            ) : (
              <Coffee className="w-5 h-5 text-light-on-primary" />
            )}
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-headline text-lg font-bold text-light-on-surface truncate">
                {displayName}
              </span>
              <span className="shrink-0 inline-flex items-center gap-1 bg-light-secondary-container text-light-on-secondary-container px-2 py-0.5 rounded-full text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-veg"></span>
                <span>Open</span>
              </span>
            </div>
            <span className="font-body text-xs text-light-on-surface-variant truncate">
              {restaurant?.description || 'Coffeehouse & Bistro'}
            </span>
          </div>
        </div>

        {/* Table & Guest Context */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="shrink-0 inline-flex items-center gap-1.5 bg-amber-badge text-on-amber-badge px-3 py-1.5 rounded-full whitespace-nowrap shadow-2xs">
            <UtensilsCrossed className="w-3.5 h-3.5 shrink-0" />
            <span className="font-mono text-xs font-bold tabular-nums">{displayTable}</span>
          </div>

          <div className="hidden sm:inline-flex items-center gap-1.5 bg-light-surface-container-low border border-light-outline-variant/70 text-light-on-surface px-3 py-1.5 rounded-full shrink-0 text-xs font-medium">
            <User className="w-3.5 h-3.5 text-light-on-surface-variant" />
            <span className="font-label truncate max-w-[100px]">{displayGuestName}</span>
          </div>

          <button
            onClick={() => setIsCallWaiterModalOpen(true)}
            type="button"
            aria-label="Call waiter or order notifications"
            className="relative shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-full bg-light-surface-container-lowest border border-light-outline-variant text-light-on-surface hover:bg-light-surface-container-low transition-colors shadow-2xs"
          >
            <Bell className="w-4 h-4" />
            {hasActiveOrders && (
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-warning animate-pulse"></span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
