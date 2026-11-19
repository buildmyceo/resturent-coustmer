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

  const navItems = [
    {
      label: 'Menu',
      href: `/table/${sessionId}`,
      icon: UtensilsCrossed,
      active: pathname === `/table/${sessionId}` || pathname.includes('/dish/'),
    },
    {
      label: 'Cart',
      href: `/table/${sessionId}/cart`,
      icon: ShoppingBag,
      active: pathname === `/table/${sessionId}/cart`,
      badge: cartTotals.itemCount > 0 ? cartTotals.itemCount : null,
    },
    {
      label: 'Orders',
      href: `/table/${sessionId}/orders`,
      icon: Clock,
      active: pathname === `/table/${sessionId}/orders`,
      hasActive: orders.some((o) => ['pending', 'accepted', 'preparing', 'ready'].includes(o.status)),
    },
    {
      label: 'My Bill',
      href: `/table/${sessionId}/bill`,
      icon: Receipt,
      active: pathname === `/table/${sessionId}/bill` || pathname.includes('/payment'),
      hasActive: hasUnpaidOrders,
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/90 backdrop-blur-xl border-t border-slate-200/60 shadow-[0_-8px_30px_rgba(0,0,0,0.06)] pb-safe">
      <div className="max-w-md mx-auto px-6 h-[68px] flex items-center justify-between">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={true}
              className={`group relative flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 select-none ${
                item.active ? 'text-blue-600 scale-[1.02]' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {/* Active pill background effect */}
              <div
                className={`relative flex items-center justify-center w-12 h-8 rounded-full transition-all duration-300 ${
                  item.active ? 'bg-blue-50/90 text-blue-600 shadow-xs' : 'group-hover:bg-slate-100/60'
                }`}
              >
                <Icon
                  className={`w-[22px] h-[22px] transition-transform duration-200 ${
                    item.active ? 'stroke-[2.4] scale-105' : 'stroke-[1.8] group-hover:scale-110'
                  }`}
                />

                {/* Cart Badge with floating pill */}
                {item.badge !== null && item.badge !== undefined && (
                  <span className="absolute -top-1 -right-1 bg-gradient-to-tr from-blue-600 to-indigo-600 text-white text-[10px] font-black min-w-4 h-4 px-1 rounded-full flex items-center justify-center shadow-sm ring-2 ring-white animate-in zoom-in-50">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}

                {/* Orders Live Pulsing Indicator */}
                {item.hasActive && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500 ring-2 ring-white" />
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[11px] mt-0.5 tracking-tight transition-all duration-200 ${
                  item.active ? 'font-bold text-blue-600' : 'font-medium text-slate-500 group-hover:text-slate-700'
                }`}
              >
                {item.label}
              </span>

              {/* Active bottom glow bar */}
              {item.active && (
                <span className="absolute bottom-0 w-5 h-1 bg-blue-600 rounded-full shadow-xs animate-in fade-in zoom-in-75 duration-200" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

