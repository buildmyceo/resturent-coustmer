'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { UtensilsCrossed, User, Bell, Clock, AlertTriangle, Coffee } from 'lucide-react';

export function CustomerHeader() {
  const { restaurant, table, session, participant, setIsCallWaiterModalOpen, orders, deactivateSession } = useCustomer();
  const [storedSession, setStoredSession] = useState<{ tableNumber?: string; restaurantSlug?: string; guestName?: string; lastActiveTimestamp?: number } | null>(null);

  useEffect(() => {
    const s = getGuestSession();
    if (s) queueMicrotask(() => setStoredSession(s));
  }, []);

  const displayName = restaurant?.name || (storedSession?.restaurantSlug ? storedSession.restaurantSlug.replace(/-.*$/, '') : 'Barista');
  const displayTable = table?.number || storedSession?.tableNumber || 'T-01';
  const displayGuestName = participant?.name || storedSession?.guestName || 'harshit';

  // 1-Hour Temporary Customer Session Timeout State
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  const [isWarning, setIsWarning] = useState(false);
  const [isExpired, setIsExpired] = useState(false);

  const hasOrders = (orders && orders.length > 0) || session?.isClaimPermanent === true;
  const hasActiveOrders = orders.some((o) => ['pending', 'accepted', 'preparing', 'ready'].includes(o.status));

  useEffect(() => {
    // If an order has been placed, 1-hour temporary expiration does NOT apply!
    if (hasOrders) {
      queueMicrotask(() => setTimeLeft(null));
      return;
    }

    // Determine target expiration: 1 hour (60 min) from session claim or opening
    const expiresTimestamp = session?.initialClaimExpiresAt
      ? new Date(session.initialClaimExpiresAt).getTime()
      : session?.openedAt
      ? new Date(session.openedAt).getTime() + 60 * 60 * 1000
      : storedSession?.lastActiveTimestamp
      ? storedSession.lastActiveTimestamp + 60 * 60 * 1000
      : null;

    if (!expiresTimestamp) return;

    const interval = setInterval(() => {
      const now = Date.now();
      const diffMs = expiresTimestamp - now;

      if (diffMs <= 0) {
        setTimeLeft('00:00');
        setIsExpired(true);
        clearInterval(interval);
        // Automatically deactivate session & reload page per user request
        deactivateSession('1 hour online without placing an order');
      } else {
        const totalSeconds = Math.floor(diffMs / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        const formatted =
          hours > 0
            ? `${hours}h ${String(minutes).padStart(2, '0')}m`
            : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        setTimeLeft(formatted);
        setIsWarning(hours === 0 && minutes < 5);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [session?.initialClaimExpiresAt, session?.openedAt, storedSession?.lastActiveTimestamp, hasOrders, deactivateSession]);

  return (
    <header className="sticky top-0 z-40 bg-light-surface-container-lowest border-b border-light-outline-variant/60 shadow-xs">
      {/* 1-Hour Countdown Banner (Only shown before first order is placed) */}
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
              <span>Session expired after 1 hour without ordering. Deactivating and reloading page...</span>
            </>
          ) : (
            <>
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Table reserved! Order within <strong className="font-mono text-sm underline">{timeLeft}</strong> or table session will automatically deactivate.
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
