'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UtensilsCrossed, ShoppingBag, Clock, Receipt, User } from 'lucide-react';
import { useCustomer } from '@/context/CustomerContext';

interface StorefrontBottomNavProps {
  restaurantSlug: string;
}

export function StorefrontBottomNav({ restaurantSlug }: StorefrontBottomNavProps) {
  const pathname = usePathname();
  const { cartTotals } = useCustomer();

  const items = [
    {
      label: 'Menu',
      href: `/store/${restaurantSlug}`,
      isActive:
        pathname === '/' ||
        pathname === `/store/${restaurantSlug}` ||
        pathname === `/${restaurantSlug}`,
      icon: UtensilsCrossed,
    },
    {
      label: 'Cart',
      href: `/store/${restaurantSlug}/checkout`,
      isActive: pathname.endsWith('/checkout'),
      icon: ShoppingBag,
      badge: cartTotals.itemCount > 0 ? cartTotals.itemCount : undefined,
    },
    {
      label: 'Orders',
      href: `/store/${restaurantSlug}/orders`,
      isActive: pathname.includes('/orders'),
      icon: Clock,
    },
    {
      label: 'Bill History',
      href: `/store/${restaurantSlug}/bills`,
      isActive: pathname.endsWith('/bills'),
      icon: Receipt,
    },
    {
      label: 'Profile',
      href: `/store/${restaurantSlug}/profile`,
      isActive: pathname.endsWith('/profile'),
      icon: User,
    },
  ];

  return (
    <nav
      aria-label="Storefront Navigation"
      className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-2 py-1.5 shadow-lg"
    >
      <div className="max-w-lg mx-auto grid grid-cols-5 gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              prefetch={true}
              className={`relative flex flex-col items-center justify-center py-1.5 px-2 rounded-xl text-[11px] font-semibold transition-all active:scale-95 ${
                item.isActive
                  ? 'text-light-primary bg-light-secondary-container/60'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
                {item.badge !== undefined && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-4 h-4 px-1 rounded-full bg-light-primary text-white text-[10px] font-bold flex items-center justify-center">
                    {item.badge}
                  </span>
                )}
              </div>
              <span className="mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
