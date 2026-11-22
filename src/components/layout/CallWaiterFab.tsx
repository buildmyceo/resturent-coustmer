'use client';

import React from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { Bell, ConciergeBell } from 'lucide-react';

export function CallWaiterFab() {
  const { setIsCallWaiterModalOpen, session } = useCustomer();

  if (!session?.id) return null;

  return (
    <button
      id="call-waiter-btn"
      onClick={() => setIsCallWaiterModalOpen(true)}
      type="button"
      className="fixed bottom-24 right-6 z-50 inline-flex items-center justify-center gap-2 bg-light-inverse-surface text-light-inverse-on-surface hover:bg-light-on-surface px-4 py-3 rounded-full shadow-xl transition-all duration-state-change ease-state-change focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-light-primary active:scale-95 cursor-pointer"
      title="Call Waiter"
    >
      <Bell className="w-4 h-4 text-warning fill-warning/20" />
      <span className="font-label text-sm font-semibold tracking-wide">Call Waiter</span>
    </button>
  );
}
