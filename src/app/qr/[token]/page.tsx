'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { saveGuestSession, generateGuestToken } from '@/lib/guest-session';
import { Utensils, Users, ArrowRight, Loader2, AlertCircle, Sparkles, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function QRScanResolverPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;
  const router = useRouter();

  const { setRestaurant, setTable, setSession, setParticipant } = useCustomer();

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolvedTableData, setResolvedTableData] = useState<any>(null);

  // Optional guest name input
  const [guestName, setGuestName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // 1. Resolve QR token securely via server API
  useEffect(() => {
    async function resolveToken() {
      if (!token) return;
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const res = await fetch('/api/qr/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setErrorMsg(data.error || 'Invalid or expired QR code.');
          setIsLoading(false);
          return;
        }

        setResolvedTableData(data.table);
        setIsLoading(false);
      } catch (err: any) {
        setErrorMsg('Network error connecting to restaurant. Please try scanning again.');
        setIsLoading(false);
      }
    }

    resolveToken();
  }, [token]);

  // 2. Join or Start Table Session
  const handleJoinSession = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resolvedTableData || isJoining) return;

    setIsJoining(true);
    setErrorMsg(null);

    const safeName = (guestName || 'Guest').trim();
    const guestToken = generateGuestToken();

    try {
      const res = await fetch('/api/session/start-or-join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          publicIdentifier: token,
          guestName: safeName,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Failed to initialize table session.');
        setIsJoining(false);
        return;
      }

      // Persist scoped guest session in localStorage & cookies
      saveGuestSession({
        sessionId: data.sessionId,
        participantId: data.participantId,
        guestToken: data.guestToken,
        guestName: data.guestName,
        isHost: data.isHost,
        tableId: data.tableId,
        tableNumber: data.tableNumber,
        restaurantId: data.restaurantId,
        restaurantSlug: data.restaurantSlug,
      });

      // Update React context
      setTable({
        id: data.tableId,
        restaurantId: data.restaurantId,
        number: data.tableNumber,
        name: data.tableName,
        capacity: 4,
        isActive: true,
      });

      setRestaurant({
        id: data.restaurantId,
        name: data.restaurantName || resolvedTableData?.restaurantName || 'bikaner',
        slug: data.restaurantSlug || resolvedTableData?.restaurantSlug || 'bikaner-w7bt',
        description: resolvedTableData?.description || '',
        logoUrl: resolvedTableData?.logoUrl || null,
        coverImageUrl: resolvedTableData?.coverImageUrl || null,
        restaurantType: 'Restaurant',
        phone: '',
        email: '',
        address: '',
        city: '',
        state: '',
        country: '',
        postalCode: '',
        currency: resolvedTableData?.currency || 'INR',
        timezone: 'Asia/Kolkata',
        status: 'active',
        settings: {
          taxEnabled: true,
          taxPercentage: 5,
          serviceChargeEnabled: false,
          serviceChargePercentage: 0,
          currency: resolvedTableData?.currency || 'INR',
          timezone: 'Asia/Kolkata',
          receiptFooter: 'Thank you for dining with us!',
          geofence: (resolvedTableData as any)?.geofence || {
            enabled: true,
            latitude: 25.618193,
            longitude: 85.039305,
            radiusMeters: 200,
            address: 'sagunamore',
          },
        },
      });

      setSession({
        id: data.sessionId,
        restaurantId: data.restaurantId,
        tableId: data.tableId,
        status: data.sessionStatus || 'occupied',
        guestCount: 1,
        customerName: data.guestName,
        openedAt: new Date().toISOString(),
        subtotal: 0,
        taxAmount: 0,
        serviceFee: 0,
        discountAmount: 0,
        totalAmount: 0,
        totalPaid: 0,
      });

      setParticipant({
        id: data.participantId,
        sessionId: data.sessionId,
        name: data.guestName,
        guestToken: data.guestToken,
        isHost: data.isHost,
        joinedAt: new Date().toISOString(),
      });

      // Seamless redirect into table dining hub
      router.push(`/table/${data.sessionId}`);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Error joining table session. Please try again.');
      setIsJoining(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
        </div>
        <h2 className="text-base font-bold text-slate-800">Connecting to Dining Table...</h2>
        <p className="text-xs text-slate-500 mt-1">Verifying restaurant security credentials</p>
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-xl border border-slate-100 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 border border-rose-100 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Unable to Open Menu</h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{errorMsg}</p>
          </div>
          <div className="pt-2">
            <Button
              variant="outline"
              onClick={() => router.push('/')}
              className="w-full text-xs"
            >
              Back to Home
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isExistingSession = !!resolvedTableData?.activeSessionId;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-between p-4 sm:p-6">
      <div className="max-w-md w-full mx-auto my-auto pt-6 pb-8 space-y-6">
        {/* Welcome Card */}
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 text-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-2xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-md shadow-blue-500/20 font-black text-2xl">
            Z
          </div>

          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-200/60 mb-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Verified Table QR Code</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              {resolvedTableData?.restaurantName}
            </h1>
            <p className="text-xs text-slate-500 mt-1">Welcome! Your digital dining table is ready.</p>
          </div>

          {/* Table Details Pill */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex items-center justify-around text-xs">
            <div className="text-center">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                Table
              </span>
              <span className="font-bold text-slate-900 text-sm">
                {resolvedTableData?.tableNumber}
              </span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                Section / Area
              </span>
              <span className="font-semibold text-slate-700 text-xs">
                {resolvedTableData?.tableName}
              </span>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center">
              <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
                Session
              </span>
              <span
                className={`font-bold text-xs ${
                  isExistingSession ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {isExistingSession ? 'Active Session' : 'New Table'}
              </span>
            </div>
          </div>

          {/* Shared Table Notification if Session Exists */}
          {isExistingSession && (
            <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-2xl text-left flex items-start gap-3">
              <Users className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <strong>Shared Table Session:</strong> Guests are already dining at this table. You will
                join their shared bill and can add dishes to the table order.
              </div>
            </div>
          )}

          {/* Guest Name Form */}
          <form onSubmit={handleJoinSession} className="space-y-4 pt-2 text-left">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Your Name (Optional)
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Alex, Maya (or leave blank as Guest)"
                maxLength={30}
                className="w-full text-sm p-3.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all placeholder:text-slate-400 bg-white"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Helps your friends at the table and the waiter identify who ordered each dish.
              </p>
            </div>

            <Button
              type="submit"
              size="lg"
              isLoading={isJoining}
              className="w-full shadow-lg shadow-blue-500/20 gap-2"
            >
              <span>{isExistingSession ? 'Join Table & View Menu' : 'Start Table Session'}</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </div>

        <div className="text-center text-[11px] text-slate-400 flex items-center justify-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
          <span>Powered by ZOVO Restaurant Cloud Platform</span>
        </div>
      </div>
    </div>
  );
}

