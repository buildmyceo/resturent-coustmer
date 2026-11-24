'use client';

import React, { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { saveGuestSession, generateGuestToken } from '@/lib/guest-session';
import { Utensils, Users, ArrowRight, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PageProps {
  params: Promise<{
    restaurantSlug: string;
    tableNumber: string;
    uniqueCode: string;
  }>;
}

export default function TableLandingPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const { restaurantSlug, tableNumber, uniqueCode } = resolvedParams;
  const router = useRouter();

  const { setRestaurant, setTable, setSession, setParticipant } = useCustomer();

  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resolvedTableData, setResolvedTableData] = useState<any>(null);

  // Optional guest name input
  const [guestName, setGuestName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  // 1. Resolve Table & Restaurant via Server API
  useEffect(() => {
    async function resolveTable() {
      setIsLoading(true);
      setErrorMsg(null);

      try {
        const res = await fetch('/api/qr/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restaurantSlug,
            tableNumber,
            uniqueCode,
            token: uniqueCode,
          }),
        });

        const data = await res.json();

        if (!res.ok || !data.success || !data.table) {
          setErrorMsg(data?.error || 'Unable to resolve table or restaurant.');
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

    resolveTable();
  }, [restaurantSlug, tableNumber, uniqueCode]);

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
          publicIdentifier: uniqueCode,
          restaurantSlug: resolvedTableData.restaurantSlug || restaurantSlug,
          tableNumber: resolvedTableData.tableNumber || tableNumber,
          tableId: resolvedTableData.tableId,
          restaurantId: resolvedTableData.restaurantId,
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
        slug: data.restaurantSlug || resolvedTableData?.restaurantSlug || restaurantSlug,
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
            radiusMeters: 50,
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
        <h2 className="text-base font-bold text-slate-800">Connecting to Table {tableNumber}...</h2>
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
    <div className="min-h-screen bg-light-surface flex flex-col justify-between p-4 sm:p-6 font-body">
      <div className="max-w-md w-full mx-auto my-auto pt-6 pb-8 space-y-6">
        {/* Welcome Card */}
        <div className="bg-light-surface-container-lowest text-light-on-surface rounded-3xl p-6 shadow-xl border border-light-outline-variant/60 text-center space-y-5 animate-in fade-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-2xl bg-light-surface-container-low border border-light-outline-variant text-light-on-surface flex items-center justify-center mx-auto shadow-md font-black text-2xl overflow-hidden relative p-1.5">
            {resolvedTableData?.logoUrl ? (
              <Image src={resolvedTableData.logoUrl} alt={resolvedTableData.restaurantName} fill className="object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src="/ceova-logo.png" alt="Ceova" className="w-full h-full object-contain" />
            )}
          </div>

          <div>
            <h1 className="font-display text-2xl font-black text-light-on-surface tracking-tight">
              {resolvedTableData?.restaurantName}
            </h1>
            <p className="text-xs text-light-on-surface-variant font-medium mt-1">Welcome! Your digital dining table is ready.</p>
          </div>

          {/* Table Details Pill */}
          <div className="bg-light-surface-container-low rounded-2xl p-4 border border-light-outline-variant/60 flex items-center justify-around text-xs">
            <div className="text-center">
              <span className="text-light-on-surface-variant/80 block text-[10px] uppercase font-bold tracking-wider">
                Table
              </span>
              <span className="font-display font-bold text-light-on-surface text-sm">
                {resolvedTableData?.tableNumber}
              </span>
            </div>
            <div className="h-8 w-px bg-light-outline-variant" />
            <div className="text-center">
              <span className="text-light-on-surface-variant/80 block text-[10px] uppercase font-bold tracking-wider">
                Area
              </span>
              <span className="font-semibold text-light-on-surface text-xs">
                {resolvedTableData?.tableName}
              </span>
            </div>
            <div className="h-8 w-px bg-light-outline-variant" />
            <div className="text-center">
              <span className="text-light-on-surface-variant/80 block text-[10px] uppercase font-bold tracking-wider">
                Status
              </span>
              <span
                className={`font-bold text-xs ${
                  isExistingSession ? 'text-warning' : 'text-veg'
                }`}
              >
                {isExistingSession ? 'Active Session' : 'Ready'}
              </span>
            </div>
          </div>

          {/* Shared Table Notification if Session Exists */}
          {isExistingSession && (
            <div className="p-3 bg-amber-badge text-on-amber-badge border border-amber-badge/80 rounded-2xl text-left flex items-start gap-3">
              <Users className="w-5 h-5 text-on-amber-badge shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed font-medium">
                <strong>Shared Table Session:</strong> Guests are already dining at this table. You will
                join their shared bill and can add dishes to the table order.
              </div>
            </div>
          )}

          {/* Guest Name Form */}
          <form onSubmit={handleJoinSession} className="space-y-4 pt-2 text-left">
            <div>
              <label className="block text-xs font-bold text-light-on-surface mb-1.5">
                Your Name (Optional)
              </label>
              <input
                type="text"
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="e.g. Alex, Maya (or leave blank as Guest)"
                maxLength={30}
                className="w-full text-sm p-3.5 rounded-xl border border-light-outline-variant focus:outline-none focus:ring-2 focus:ring-light-primary/20 focus:border-light-primary transition-all placeholder:text-light-on-surface-variant/50 bg-light-surface-container-lowest text-light-on-surface"
              />
            </div>

            <Button
              type="submit"
              size="lg"
              isLoading={isJoining}
              className="w-full shadow-lg shadow-light-primary/20 gap-2"
            >
              <span>Check Menu</span>
              <ArrowRight className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

