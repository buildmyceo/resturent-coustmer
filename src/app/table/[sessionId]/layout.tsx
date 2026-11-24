'use client';

import React, { useEffect, use } from 'react';
import { CustomerHeader } from '@/components/layout/CustomerHeader';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { CallWaiterFab } from '@/components/layout/CallWaiterFab';
import { DishModal } from '@/components/menu/DishModal';
import { CustomerWaitingPage } from '@/components/CustomerWaitingPage';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { Clock, QrCode } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface TableLayoutProps {
  children: React.ReactNode;
  params: Promise<{ sessionId: string }>;
}

export default function TableSessionLayout({ children, params }: TableLayoutProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const {
    session,
    setSession,
    table,
    setTable,
    participant,
    setParticipant,
    restaurant,
    setRestaurant,
    selectedDishModal,
    setSelectedDishModal,
    addToCart,
    isSessionDeactivated,
    setIsSessionDeactivated,
    clearSessionState,
  } = useCustomer();

  // Hydrate session if missing from React context (e.g. direct reload)
  useEffect(() => {
    async function hydrate() {
      if (!session?.id) {
        const stored = getGuestSession();
        try {
          const res = await fetch('/api/session/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              guestToken: stored?.guestToken,
            }),
          });
          const data = await res.json();

          if (data.isExpired || data.isDeactivated || data.sessionStatus === 'cancelled' || !data.success) {
            clearSessionState();
            setIsSessionDeactivated(true);
            return;
          }

          if (data.success && data.session) {
            setSession({
              id: data.session.id,
              restaurantId: data.session.restaurantId,
              tableId: data.session.tableId,
              status: data.session.status,
              guestCount: data.session.guestCount,
              customerName: stored?.guestName || 'Guest',
              openedAt: data.session.openedAt || new Date().toISOString(),
              subtotal: data.session.subtotal,
              taxAmount: data.session.taxAmount,
              serviceFee: data.session.serviceFee,
              discountAmount: 0,
              totalAmount: data.session.totalAmount,
              totalPaid: data.session.totalPaid,
              initialClaimExpiresAt: data.session.initialClaimExpiresAt,
              isClaimPermanent: data.session.isClaimPermanent,
            });

            if (data.session.tableId) {
              setTable({
                id: data.session.tableId,
                restaurantId: data.session.restaurantId,
                number: data.session.tableNumber || '01',
                name: data.session.tableName || 'Dining Table',
                capacity: 4,
                isActive: true,
              });
            }

            if (data.participant) {
              setParticipant({
                id: data.participant.id,
                sessionId,
                name: data.participant.name,
                isHost: data.participant.isHost,
                joinedAt: new Date().toISOString(),
              });
            }
          }
        } catch (err) {
          console.warn('Session hydration error:', err);
        }
      }
    }

    hydrate();
  }, [sessionId, session?.id, setSession, setTable, setParticipant, clearSessionState, setIsSessionDeactivated]);

  if (isSessionDeactivated || session?.status === 'cancelled') {
    return (
      <div className="min-h-screen bg-light-surface flex flex-col items-center justify-center p-4 text-center">
        <div className="w-full max-w-sm bg-light-surface-container-lowest rounded-3xl p-7 shadow-2xl border border-light-outline-variant/60 space-y-5 animate-in fade-in zoom-in-95 duration-200">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto shadow-xs">
            <Clock className="w-7 h-7" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-bold text-light-on-surface">Table Session Deactivated</h2>
            <p className="text-xs text-light-on-surface-variant leading-relaxed">
              You were online for more than 1 hour without placing an order. This table has been released so other guests can dine.
            </p>
          </div>

          <div className="p-3.5 bg-light-surface-container-low rounded-2xl border border-light-outline-variant/40 text-xs text-light-on-surface-variant text-left space-y-1">
            <div className="text-[10px] font-bold text-light-outline uppercase tracking-wider">
              Table Status
            </div>
            <div className="font-semibold text-rose-600 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span>Released &amp; Auto-Cancelled</span>
            </div>
          </div>

          <Button
            onClick={() => {
              clearSessionState();
              window.location.href = '/';
            }}
            size="lg"
            className="w-full gap-2 shadow-md bg-light-primary hover:bg-light-primary-container text-light-on-primary"
          >
            <QrCode className="w-4 h-4" />
            <span>Scan QR Code to Start</span>
          </Button>
        </div>
      </div>
    );
  }

  // If restaurant operational credits are exhausted or restaurant suspended, show company waiting page
  if (restaurant?.status === 'suspended' || (restaurant as any)?.isCreditsPaused) {
    return (
      <CustomerWaitingPage
        restaurantName={restaurant?.name}
        tableNumber={table?.number || (session as any)?.tableNumber}
      />
    );
  }

  return (
    <div className="min-h-screen bg-light-surface text-light-on-surface font-body antialiased flex flex-col">
      <CustomerHeader />

      <main className="flex-1 pb-24 w-full">{children}</main>

      <CallWaiterFab />
      <BottomNavigation />

      {/* Global Dish Customization Modal */}
      <DishModal
        dish={selectedDishModal}
        currency={restaurant?.currency || 'INR'}
        onClose={() => setSelectedDishModal(null)}
        onAddToCart={(dish, options) => {
          addToCart(dish, options);
          setSelectedDishModal(null);
        }}
      />
    </div>
  );
}

