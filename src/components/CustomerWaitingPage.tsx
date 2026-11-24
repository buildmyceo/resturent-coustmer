'use client';

import React from 'react';
import { Clock, UtensilsCrossed } from 'lucide-react';

interface CustomerWaitingPageProps {
  restaurantName?: string;
}

export function CustomerWaitingPage({ restaurantName }: CustomerWaitingPageProps) {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col justify-between p-6 sm:p-12 text-center">
      {/* Brand Header */}
      <div className="max-w-md w-full mx-auto flex items-center justify-center gap-2.5 pb-6 border-b border-slate-800">
        <div className="w-8 h-8 rounded-lg bg-white p-1 flex items-center justify-center shadow-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/ceova-logo.png" alt="Ceova" className="w-full h-full object-contain" />
        </div>
        <span className="font-extrabold text-base text-white tracking-tight">Ceova Restaurant</span>
      </div>

      {/* Main Waiting Block */}
      <div className="max-w-sm w-full mx-auto my-auto space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mx-auto shadow-xl">
          <Clock className="w-8 h-8 animate-pulse" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs text-amber-300 font-medium">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span>Service Temporarily Paused</span>
          </div>

          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            {restaurantName || 'Restaurant'}
          </h1>

          <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
            Digital ordering and digital menu services for this location are temporarily paused.
          </p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700/80 rounded-2xl p-5 text-xs text-slate-300 space-y-2">
          <p className="font-semibold text-white flex items-center justify-center gap-1.5">
            <UtensilsCrossed className="w-4 h-4 text-amber-400" />
            Dining Room Assistance
          </p>
          <p className="text-slate-400 leading-relaxed">
            Please inform your waiter or restaurant staff directly to place your order with a physical menu.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="max-w-md w-full mx-auto pt-6 border-t border-slate-800 text-[11px] text-slate-500">
        Powered by Ceova Restaurant Operating Suite
      </div>
    </div>
  );
}
