'use client';

import React, { useState } from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { Clock, Bell, RefreshCw, BookOpen } from 'lucide-react';

interface CustomerWaitingPageProps {
  restaurantName?: string;
  tableNumber?: string;
}

export function CustomerWaitingPage({
  restaurantName: propRestaurantName,
  tableNumber: propTableNumber,
}: CustomerWaitingPageProps) {
  const { restaurant, table, session, setIsCallWaiterModalOpen } = useCustomer();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const displayName = propRestaurantName || restaurant?.name || 'Restaurant';
  const displayTable = propTableNumber || table?.number || (session as any)?.tableNumber;

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex flex-col justify-between selection:bg-amber-100 selection:text-amber-900 font-sans">
      {/* Top Header / Brand Bar */}
      <header className="w-full max-w-xl mx-auto px-6 pt-6 sm:pt-8 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 p-1 flex items-center justify-center shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ceova-logo.png" alt="Ceova" className="w-full h-full object-contain" />
          </div>
          <div>
            <span className="font-extrabold text-sm text-slate-900 tracking-tight block leading-tight">
              Ceova
            </span>
            <span className="text-[10px] text-slate-500 font-medium block leading-tight">
              Dining Experience
            </span>
          </div>
        </div>

        {displayTable && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <span>Table {displayTable}</span>
          </div>
        )}
      </header>

      {/* Main Waiting Card */}
      <main className="w-full max-w-md mx-auto px-5 py-8 my-auto">
        <div className="bg-white border border-slate-200/90 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6 text-center">
          {/* Pause Status Icon */}
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto shadow-xs">
            <Clock className="w-7 h-7" />
          </div>

          {/* Heading & Notice */}
          <div className="space-y-2.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span>Service Temporarily Paused</span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {displayName}
            </h1>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-xs mx-auto">
              Digital table ordering is temporarily paused for this location. Our kitchen and dining room remain open to serve you in person.
            </p>
          </div>

          {/* In-Person Service Box */}
          <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 sm:p-5 text-left space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-xs sm:text-sm">
              <BookOpen className="w-4 h-4 text-amber-700 shrink-0" />
              <span>Physical Menu &amp; Table Service</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Please inform your server or waiter directly to place your food and beverage order. Printed menus are available at your table upon request.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2.5 pt-2">
            <button
              type="button"
              onClick={() => setIsCallWaiterModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-sm transition-colors shadow-xs cursor-pointer active:scale-[0.99]"
            >
              <Bell className="w-4 h-4 text-amber-400" />
              <span>Call Waiter to Table</span>
            </button>

            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-medium text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Checking Status...' : 'Check If Service Resumed'}</span>
            </button>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-xl mx-auto px-6 pb-6 sm:pb-8 text-center space-y-1">
        <p className="text-[11px] font-semibold text-slate-500">
          Powered by Ceova Restaurant Operating Suite
        </p>
        <p className="text-[10px] text-slate-400">
          Need immediate assistance? Please speak with your dining room server.
        </p>
      </footer>
    </div>
  );
}
