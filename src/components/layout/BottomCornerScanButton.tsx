'use client';

import React from 'react';
import { QrCode, Sparkles } from 'lucide-react';
import { playTap } from '@/lib/audio';

interface BottomCornerScanButtonProps {
  onClick: () => void;
  label?: string;
}

export function BottomCornerScanButton({
  onClick,
  label = 'Scan QR',
}: BottomCornerScanButtonProps) {
  return (
    <div className="fixed bottom-6 right-5 z-40 flex items-center gap-2 group">
      {/* Floating Pill Label */}
      <span className="hidden sm:inline-block px-3 py-1.5 rounded-full bg-slate-900/90 text-white text-[11px] font-bold shadow-xl backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none">
        {label}
      </span>

      {/* Floating Action Button */}
      <button
        onClick={() => {
          playTap();
          onClick();
        }}
        aria-label="Scan Table QR Code"
        className="relative w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:scale-105 active:scale-95 transition-all duration-200 ring-4 ring-white border border-blue-400/40"
      >
        {/* Radar Ping Glow */}
        <span className="absolute inset-0 rounded-2xl bg-blue-500/20 animate-ping pointer-events-none" />

        <QrCode className="w-6 h-6 text-white drop-shadow-sm transition-transform group-hover:rotate-6" />

        {/* Small corner sparkle */}
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[9px] shadow-sm">
          <Sparkles className="w-2.5 h-2.5" />
        </span>
      </button>
    </div>
  );
}

