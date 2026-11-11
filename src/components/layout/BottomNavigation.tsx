'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCustomer } from '@/context/CustomerContext';
import { UtensilsCrossed, ShoppingBag, Clock, Receipt } from 'lucide-react';

export function BottomNavigation() {
  const pathname = usePathname();
  const { session, cartTotals, orders } = useCustomer();

  if (!session?.id) return null;

  const sessionId = session.id;

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
    },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-lg pb-safe">
      <div className="max-w-md mx-auto px-4 h-16 flex items-center justify-around">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all duration-150 select-none ${
                item.active ? 'text-blue-600 font-bold' : 'text-slate-500 hover:text-slate-900 font-medium'
              }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${item.active ? 'stroke-[2.5]' : 'stroke-2'}`} />

                {/* Cart Badge */}
                {item.badge !== null && item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 bg-blue-600 text-white text-[10px] font-extrabold w-4 h-4 rounded-full flex items-center justify-center shadow-xs animate-in zoom-in-50">
                    {item.badge > 9 ? '9+' : item.badge}
                  </span>
                )}

                {/* Orders Live Pulsing Dot */}
                {item.hasActive && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 border-2 border-white rounded-full animate-ping" />
                )}
                {item.hasActive && (
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 border-2 border-white rounded-full" />
                )}
              </div>

              <span className="text-[11px] mt-1 leading-none">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

