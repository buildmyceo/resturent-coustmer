'use client';

import React from 'react';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { Utensils, Users, Bell } from 'lucide-react';

export function CustomerHeader() {
  const { restaurant, table, participant, setIsCallWaiterModalOpen } = useCustomer();

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xs">
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
              <div className="w-full h-full bg-blue-600 flex items-center justify-center text-white font-black text-lg">
                Z
              </div>
            )}
          </div>

          <div className="min-w-0">
            <h1 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
              {restaurant?.name || 'Zovo Dining'}
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
          {table && (
            <div className="bg-slate-100/90 border border-slate-200/80 px-3 py-1.5 rounded-xl flex items-center gap-1.5">
              <Utensils className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-xs font-bold text-slate-900">{table.number}</span>
            </div>
          )}

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
