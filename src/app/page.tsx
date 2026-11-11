'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getGuestSession, clearGuestSession, GuestSessionState } from '@/lib/guest-session';
import { QrCode, Utensils, ArrowRight, ShieldCheck, Sparkles, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export default function CustomerLandingPage() {
  const router = useRouter();
  const [activeSession, setActiveSession] = useState<GuestSessionState | null>(null);
  const [inputToken, setInputToken] = useState('zv_zovo-bistro_t01_e8a1d2f4');

  useEffect(() => {
    const session = getGuestSession();
    if (session && session.sessionId) {
      setActiveSession(session);
    }
  }, []);

  const handleManualScan = (e: React.FormEvent) => {
    e.preventDefault();
    const token = inputToken.trim();
    if (token) {
      router.push(`/qr/${token}`);
    }
  };

  const sampleQRs = [
    { label: 'Table 01 (Window Table)', token: 'zv_zovo-bistro_t01_e8a1d2f4' },
    { label: 'Table 02 (Booth 2)', token: 'zv_zovo-bistro_t02_c9b4e5a7' },
    { label: 'Table 05 (Shared Table)', token: 'zv_zovo-bistro_t05_a1e9f4c3' },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6">
      <div className="max-w-md w-full mx-auto my-auto space-y-6 pt-8 pb-12">
        {/* Brand Header */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-xl shadow-blue-500/20 font-black text-3xl">
            Z
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">ZOVO GUEST PORTAL</h1>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            Contactless dining, interactive digital menus, live order tracking, and table bills.
          </p>
        </div>

        {/* 1. Resume Active Session Card (if user has active session) */}
        {activeSession && (
          <div className="bg-white rounded-3xl p-6 shadow-xl border border-blue-200 ring-2 ring-blue-500/10 space-y-4 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                <span>Active Table Session</span>
              </span>
              <button
                onClick={() => {
                  clearGuestSession();
                  setActiveSession(null);
                }}
                className="text-[11px] text-slate-400 hover:text-slate-600 underline"
              >
                Leave Table
              </button>
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {activeSession.tableNumber} • {activeSession.guestName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                You have an active dining session open at this table.
              </p>
            </div>

            <Link href={`/table/${activeSession.sessionId}`} className="block">
              <Button size="lg" className="w-full gap-2 shadow-md">
                <span>Resume Dining Session</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}

        {/* 2. QR Scanner & Manual Token Input Card */}
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Table QR Scanner</h2>
              <p className="text-xs text-slate-500">Scan table code or enter your secure token below.</p>
            </div>
          </div>

          <form onSubmit={handleManualScan} className="space-y-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                Enter QR Code Token
              </label>
              <input
                type="text"
                value={inputToken}
                onChange={(e) => setInputToken(e.target.value)}
                placeholder="zv_restaurant_table_xxxx"
                className="w-full text-xs font-mono p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50 focus:bg-white transition-all text-slate-900"
              />
            </div>

            <Button type="submit" size="lg" className="w-full gap-2 shadow-md">
              <span>View Restaurant Menu</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>

          {/* Quick Demo Table Links */}
          <div className="pt-2 border-t border-slate-100 space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
              Quick Test Tables
            </div>
            <div className="grid grid-cols-1 gap-1.5">
              {sampleQRs.map((sample) => (
                <button
                  key={sample.token}
                  onClick={() => router.push(`/qr/${sample.token}`)}
                  className="flex items-center justify-between p-2.5 rounded-xl hover:bg-slate-50 border border-slate-100 text-left transition-colors text-xs text-slate-700"
                >
                  <span className="font-medium">{sample.label}</span>
                  <span className="text-[10px] text-blue-600 font-mono bg-blue-50 px-2 py-0.5 rounded-md">
                    Scan
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security & Feature Badges */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-2xs">
            <Utensils className="w-4 h-4 text-blue-600 mx-auto mb-1" />
            <div className="text-[10px] font-bold text-slate-800">Fresh Menu</div>
            <div className="text-[9px] text-slate-400">Live Prices</div>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-2xs">
            <RefreshCw className="w-4 h-4 text-emerald-600 mx-auto mb-1" />
            <div className="text-[10px] font-bold text-slate-800">Live KDS</div>
            <div className="text-[9px] text-slate-400">Sync with Kitchen</div>
          </div>
          <div className="bg-white p-3 rounded-2xl border border-slate-100 shadow-2xs">
            <ShieldCheck className="w-4 h-4 text-indigo-600 mx-auto mb-1" />
            <div className="text-[10px] font-bold text-slate-800">Shared Bill</div>
            <div className="text-[9px] text-slate-400">Digital Receipts</div>
          </div>
        </div>

        <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          <span>ZOVO Hospitality Management SaaS • Customer Experience</span>
        </div>
      </div>
    </div>
  );
}

