'use client';

import React, { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/Button';

function QRErrorContent() {
  const searchParams = useSearchParams();
  const reason = searchParams.get('reason') || 'Invalid or revoked QR code.';

  return (
    <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-5 text-center">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-600 border border-amber-200/60 flex items-center justify-center mx-auto shadow-xs">
        <AlertTriangle className="w-8 h-8" />
      </div>

      <div>
        <h1 className="text-xl font-bold text-slate-900">QR Code Error</h1>
        <p className="text-xs text-slate-600 mt-2 leading-relaxed">{reason}</p>
      </div>

      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 text-xs text-slate-500 text-left space-y-1">
        <div className="font-semibold text-slate-700">What should you do?</div>
        <p>• Please ask your floor waiter for assistance.</p>
        <p>• Make sure the QR code sticker on your table is clean and undamaged.</p>
      </div>

      <div className="pt-2">
        <Link href="/">
          <Button variant="outline" className="w-full text-xs gap-2">
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Home</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default function QRErrorPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <Suspense fallback={<div className="text-xs text-slate-400">Loading error details...</div>}>
        <QRErrorContent />
      </Suspense>
    </div>
  );
}
