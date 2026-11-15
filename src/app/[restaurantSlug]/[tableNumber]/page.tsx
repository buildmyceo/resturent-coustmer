'use client';

import React, { use } from 'react';
import { useRouter } from 'next/navigation';
import { QrCode, ShieldAlert, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PageProps {
  params: Promise<{
    restaurantSlug: string;
    tableNumber: string;
  }>;
}

export default function TableLandingWithoutToken({ params }: PageProps) {
  const resolved = use(params);
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-center">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-lg font-bold text-slate-900">Physical QR Code Required</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            For security, dining tables cannot be accessed by typing table numbers in the browser address bar. Every table has a protected secret QR code.
          </p>
        </div>

        <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 text-left text-xs text-slate-600 space-y-1">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
            Attempted Table
          </div>
          <div className="font-mono font-bold text-slate-800">
            {resolved.restaurantSlug} / {resolved.tableNumber}
          </div>
        </div>

        <div className="pt-2 space-y-2">
          <Button
            onClick={() => router.push('/')}
            size="lg"
            className="w-full gap-2 shadow-lg shadow-blue-500/20"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan Official Table QR</span>
          </Button>

          <Button
            onClick={() => router.push('/')}
            variant="ghost"
            size="sm"
            className="w-full gap-1.5 text-slate-500"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Home</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
