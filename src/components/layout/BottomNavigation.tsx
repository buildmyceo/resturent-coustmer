'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { UtensilsCrossed, ShoppingBag, Clock, Receipt } from 'lucide-react';

export function BottomNavigation() {
  const pathname = usePathname();
  const { session, cartTotals, orders } = useCustomer();

  const pathParts = (pathname || '').split('/');
  const routeSessionId = pathParts[1] === 'table' ? pathParts[2] : null;
  const sessionId = session?.id || routeSessionId || getGuestSession()?.sessionId;

  if (!sessionId) return null;

  const hasUnpaidOrders = orders.some((o) => o.paymentStatus !== 'paid');
  const hasActiveOrders = orders.some((o) => ['pending', 'accepted', 'preparing', 'ready'].includes(o.status));

  const isMenu = pathname === `/table/${sessionId}` || pathname.includes('/dish/');
  const isCart = pathname === `/table/${sessionId}/cart`;
  const isOrders = pathname === `/table/${sessionId}/orders`;
  const isBill = pathname === `/table/${sessionId}/bill` || pathname.includes('/payment') || pathname.includes('/receipt');

  const navItems = [
    {
      label: 'Menu',
      href: `/table/${sessionId}`,
      icon: UtensilsCrossed,
      active: isMenu,
      badge: null,
      dot: false,
    },
    {
      label: 'Cart',
      href: `/table/${sessionId}/cart`,
      icon: ShoppingBag,
      active: isCart,
      badge: cartTotals.itemCount > 0 ? (cartTotals.itemCount > 9 ? '9+' : cartTotals.itemCount) : null,
      dot: false,
    },
    {
      label: 'Orders',
      href: `/table/${sessionId}/orders`,
      icon: Clock,
      active: isOrders,
      badge: null,
      dot: hasActiveOrders,
    },
    {
      label: 'My Bill',
      href: `/table/${sessionId}/bill`,
      icon: Receipt,
      active: isBill,
      badge: null,
      dot: hasUnpaidOrders,
    },
  ];

  return (
    <nav
      aria-label="Primary table navigation"
      className="fixed bottom-0 inset-x-0 z-40 bg-light-surface-container-lowest border-t border-light-outline-variant/70 shadow-[0_-4px_20px_rgba(0,0,0,0.04)] pb-safe"
    >
      <div className="max-w-md mx-auto px-4 py-1.5 grid grid-cols-4 items-center">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`flex flex-col items-center justify-center gap-0.5 py-1 transition-colors select-none ${
                item.active
                  ? 'text-light-primary font-bold'
                  : 'text-light-on-surface-variant hover:text-light-on-surface font-medium'
              }`}
            >
              <span
                className={`relative px-3.5 py-1 rounded-full flex items-center justify-center transition-all ${
                  item.active ? 'bg-light-secondary-container/70 shadow-2xs' : ''
                }`}
              >
                <Icon className={`w-5 h-5 ${item.active ? 'stroke-[2.2]' : 'stroke-[1.8]'}`} />

                {item.badge && (
                  <span className="absolute -top-0.5 right-1 min-w-4 h-4 px-1 rounded-full bg-light-primary text-light-on-primary font-label text-[10px] font-bold flex items-center justify-center tabular-nums shadow-xs">
                    {item.badge}
                  </span>
                )}

                {item.dot && (
                  <span className="absolute top-0.5 right-2 w-2 h-2 rounded-full bg-warning animate-pulse shadow-xs" />
                )}
              </span>

              <span className="font-label text-xs tracking-tight">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
