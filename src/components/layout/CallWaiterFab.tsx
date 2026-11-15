'use client';

import React from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { Bell } from 'lucide-react';

export function CallWaiterFab() {
  const { setIsCallWaiterModalOpen, session, cartTotals } = useCustomer();

  if (!session?.id) return null;

  return (
    <div
      className={`fixed right-4 z-40 transition-all duration-300 ${
        cartTotals.itemCount > 0 ? 'bottom-36' : 'bottom-20'
      }`}
    >
      <button
        onClick={() => setIsCallWaiterModalOpen(true)}
        className="group flex items-center gap-1.5 px-3 py-2 bg-slate-900/95 hover:bg-slate-900 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 active:scale-95 border border-slate-700/80 backdrop-blur-md cursor-pointer"
        title="Call Waiter"
      >
        <div className="relative">
          <Bell className="w-4 h-4 text-amber-400 group-hover:rotate-12 transition-transform duration-200" />
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-amber-400 rounded-full" />
        </div>
        <span className="text-xs font-semibold tracking-wide">Call Waiter</span>
      </button>
    </div>
  );
}

