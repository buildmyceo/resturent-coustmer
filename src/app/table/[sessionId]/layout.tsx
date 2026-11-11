'use client';

import React, { useEffect, use } from 'react';
import { CustomerHeader } from '@/components/layout/CustomerHeader';
import { BottomNavigation } from '@/components/layout/BottomNavigation';
import { CallWaiterFab } from '@/components/layout/CallWaiterFab';
import { DishModal } from '@/components/menu/DishModal';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';

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
          if (data.success && data.session) {
            setSession({
              id: data.session.id,
              restaurantId: data.session.restaurantId,
              tableId: data.session.tableId,
              status: data.session.status,
              guestCount: data.session.guestCount,
              customerName: stored?.guestName || 'Guest',
              openedAt: new Date().toISOString(),
              subtotal: data.session.subtotal,
              taxAmount: data.session.taxAmount,
              serviceFee: data.session.serviceFee,
              discountAmount: 0,
              totalAmount: data.session.totalAmount,
              totalPaid: data.session.totalPaid,
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
  }, [sessionId, session?.id, setSession, setTable, setParticipant]);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <CustomerHeader />

      <main className="flex-1 pb-24 max-w-4xl w-full mx-auto">{children}</main>

      <CallWaiterFab />
      <BottomNavigation />

      {/* Global Dish Customization Modal */}
      <DishModal
        dish={selectedDishModal}
        currency={restaurant?.currency || 'USD'}
        onClose={() => setSelectedDishModal(null)}
        onAddToCart={(dish, options) => {
          addToCart(dish, options);
          setSelectedDishModal(null);
        }}
      />
    </div>
  );
}
