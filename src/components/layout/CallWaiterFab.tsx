'use client';

import React from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { Bell } from 'lucide-react';

export function CallWaiterFab() {
  const { setIsCallWaiterModalOpen, session } = useCustomer();

  if (!session?.id) return null;

  return (
    <div className="fixed bottom-20 right-4 z-40">
      <button
        onClick={() => setIsCallWaiterModalOpen(true)}
        className="group flex items-center gap-2 pl-3.5 pr-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full shadow-xl hover:shadow-2xl transition-all duration-200 active:scale-95 border border-slate-700/60"
        title="Call Waiter"
      >
        <div className="relative">
          <Bell className="w-5 h-5 text-amber-400 group-hover:rotate-12 transition-transform duration-200" />
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full" />
        </div>
        <span className="text-xs font-bold tracking-wide">Call Waiter</span>
      </button>
    </div>
  );
}
