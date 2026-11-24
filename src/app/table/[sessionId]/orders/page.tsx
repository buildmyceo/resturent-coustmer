'use client';

import React, { use, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { formatCurrency, formatTime } from '@/lib/format';
import { OrderProgressStepper } from '@/components/orders/OrderProgressStepper';
import {
  Clock,
  Sparkles,
  Receipt,
  Plus,
  RefreshCw,
  User,
  CheckCircle2,
  FileText,
  ShoppingBag,
  UtensilsCrossed,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface OrdersPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function OrderTrackingPage({ params }: OrdersPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const { orders, refreshOrders, isOrdersLoading, restaurant, table } = useCustomer();
  const currency = restaurant?.currency || 'INR';

  // Live timer tick every 10 seconds to update countdowns smoothly
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const totalTableBill = useMemo(() => {
    return orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [orders]);

  const tableNumberDisplay = table?.number || 'T-01';

  // Empty State
  if (orders.length === 0 && !isOrdersLoading) {
    return (
      <main className="flex-1 max-w-[960px] w-full mx-auto px-4 sm:px-6 pt-12 pb-36 flex flex-col gap-8">
        <section className="py-20 px-6 bg-light-surface-container-lowest border border-light-outline-variant/60 rounded-2xl flex flex-col items-center text-center gap-4 max-w-lg mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-full bg-light-secondary-container/70 text-light-primary flex items-center justify-center">
            <Clock className="w-8 h-8 stroke-[1.75]" />
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h2 className="font-headline text-2xl text-light-on-surface">No Orders Placed Yet</h2>
            <p className="font-body text-xs sm:text-sm text-light-on-surface-variant text-pretty">
              Dishes placed by anyone at Table {tableNumberDisplay} will appear here in real time.
            </p>
          </div>
          <Link
            href={`/table/${sessionId}`}
            className="mt-2 inline-flex items-center justify-center gap-2 bg-light-primary text-light-on-primary hover:bg-light-primary-container px-6 py-3 rounded-full font-label text-xs sm:text-sm font-semibold transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Browse Menu &amp; Order</span>
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-[960px] w-full mx-auto px-4 sm:px-6 pt-6 pb-36 flex flex-col gap-8">
      {/* Table Bill Generated Banner */}
      {orders.length > 0 && (
        <section
          aria-label="Table bill status"
          className="bg-light-primary text-light-on-primary rounded-2xl p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center justify-between gap-6 shadow-md"
        >
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-light-on-primary-container" />
              <span className="font-label text-xs uppercase tracking-wider text-light-on-primary-container font-semibold">
                Table Bill Generated
              </span>
            </div>
            <h1 className="font-headline text-2xl sm:text-3xl text-light-on-primary tabular-nums">
              {formatCurrency(totalTableBill, currency)} Total
            </h1>
            <p className="font-body text-xs sm:text-sm text-light-on-primary/90 text-pretty max-w-prose">
              Food is being prepared and served! You can review items and settle your bill anytime.
            </p>
          </div>

          <Link
            href={`/table/${sessionId}/bill`}
            className="shrink-0 inline-flex items-center justify-center gap-2 bg-light-on-primary text-light-primary hover:bg-light-secondary-container px-5 py-3 rounded-full transition-colors whitespace-nowrap font-label text-xs sm:text-sm font-semibold shadow-xs"
          >
            <Receipt className="w-4 h-4" />
            <span>View Table Bill</span>
          </Link>
        </section>
      )}

      {/* Active Orders List */}
      <div className="flex flex-col gap-6">
        {orders.map((order) => {
          const isPayFirst = Boolean(
            order.isPayFirst ||
            restaurant?.settings?.payFirstEnabled ||
            (restaurant as any)?.payFirstEnabled ||
            order.assignmentMethod === 'counter_pay' ||
            (order.customerNote && order.customerNote.includes('[PAY_FIRST:COUNTER]'))
          );
          const isPending = order.status === 'pending';
          const isReady = order.status === 'ready';
          const isServed = order.status === 'served' || order.status === 'completed';
          const isPreparing = order.status === 'preparing';
          const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

          return (
            <section
              key={order.id}
              aria-label={`Order #${order.orderNumber}`}
              className="bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-6 flex flex-col gap-6 shadow-xs"
            >
              {/* Order Header */}
              <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-light-surface-container pb-4">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-headline text-xl sm:text-2xl text-light-on-surface tabular-nums">
                      Order #{order.orderNumber}
                    </h2>
                    {order.participantName && (
                      <span className="inline-flex items-center gap-1 bg-amber-badge text-on-amber-badge px-2.5 py-0.5 rounded-full text-xs font-label font-medium">
                        <User className="w-3 h-3" />
                        <span>{order.participantName}</span>
                      </span>
                    )}
                  </div>
                  <span className="font-body text-xs text-light-on-surface-variant tabular-nums">
                    Placed at {formatTime(order.orderTime || order.createdAt)}
                  </span>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-0.5">
                  <span className="font-title text-lg font-bold text-light-on-surface tabular-nums">
                    {formatCurrency(order.totalAmount, currency)}
                  </span>
                  <span className="font-body text-xs text-light-on-surface-variant tabular-nums">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </header>

              {/* Pay First: Prominent Callout Banners */}
              {isPending && isPayFirst && (
                <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-xl flex items-start gap-3 shadow-xs">
                  <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-900 flex items-center justify-center shrink-0 font-bold">
                    <Receipt className="w-5 h-5 text-amber-700" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-title text-sm font-bold text-amber-950">
                      Step 1: Show Receipt to Cashier / Admin
                    </h3>
                    <p className="font-body text-xs text-amber-900 leading-relaxed">
                      Please show this screen or receipt for <strong>Order #{order.orderNumber}</strong> to the Cashier. Once approved by the cashier, your order is sent directly to the kitchen to begin preparing!
                    </p>
                  </div>
                </div>
              )}

              {isPreparing && isPayFirst && (
                <div className="p-4 bg-blue-50 border-2 border-blue-200 rounded-xl flex items-start gap-3 shadow-xs">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-900 flex items-center justify-center shrink-0 font-bold">
                    <UtensilsCrossed className="w-5 h-5 text-blue-700" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-title text-sm font-bold text-blue-950">
                      Step 2: Receipt Approved • Cooking in Kitchen
                    </h3>
                    <p className="font-body text-xs text-blue-900 leading-relaxed">
                      The cashier approved your order! Kitchen chefs are preparing your fresh food. You and your waiter will receive an alert once ready!
                    </p>
                  </div>
                </div>
              )}

              {isReady && isPayFirst && (
                <div className="p-4 bg-emerald-50 border-2 border-emerald-400 rounded-xl flex items-start gap-3 shadow-xs animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0 font-bold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="font-title text-sm font-bold text-emerald-950">
                      Step 3: Food Prepared! Waiter &amp; Table Notified
                    </h3>
                    <p className="font-body text-xs text-emerald-900 leading-relaxed">
                      Your dishes are prepared! Both you and your waiter have been notified, and food is being delivered to Table {tableNumberDisplay}.
                    </p>
                  </div>
                </div>
              )}

              {/* Live Kitchen Status Callout */}
              <div
                className={`flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs sm:text-sm font-medium ${
                  isReady
                    ? 'bg-light-secondary-container/70 border border-light-primary/30 text-light-on-secondary-container'
                    : isPreparing
                    ? 'bg-amber-badge/60 border border-warning/30 text-on-amber-badge'
                    : isServed
                    ? 'bg-light-surface-container-low border border-light-outline-variant/60 text-light-on-surface'
                    : 'bg-light-secondary-container/40 border border-light-primary/20 text-light-on-secondary-container'
                }`}
              >
                <Sparkles className="w-5 h-5 text-light-primary shrink-0" />
                <p className="font-body">
                  {isPayFirst ? (
                    isReady
                      ? `Food Prepared! Order #${order.orderNumber} is ready. Waiter notified to serve to Table ${tableNumberDisplay}.`
                      : isPreparing
                      ? 'Approved by cashier! Kitchen chefs are actively cooking your order.'
                      : isServed
                      ? 'Order Delivered! Enjoy your meal.'
                      : `Awaiting Cashier Approval. Please show Order #${order.orderNumber} receipt to the cashier.`
                  ) : (
                    isReady
                      ? `Ready! Staff is currently serving your fresh food to Table ${tableNumberDisplay}.`
                      : isPreparing
                      ? 'Preparing! Our kitchen chefs are actively crafting your order.'
                      : isServed
                      ? `Served! All items have been delivered to Table ${tableNumberDisplay}. Enjoy your meal!`
                      : 'Submitted! Order received and sent for table confirmation.'
                  )}
                </p>
              </div>

              {/* Order Progress Stepper */}
              <OrderProgressStepper
                status={order.status}
                rejectionReason={order.rejectionReason}
                assignedWaiterName={order.assignedWaiterName}
                isPayFirst={isPayFirst}
              />

              {/* Ordered Dishes List */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="flex items-center justify-between text-light-on-surface-variant pb-1.5 border-b border-light-surface-container text-xs font-label uppercase tracking-wider font-semibold">
                  <span>Ordered Dishes</span>
                  <span>Kitchen Status</span>
                </div>

                {order.items.map((item) => {
                  const prepMins = item.prepTime || 12;
                  const orderPlacedEpoch = new Date(order.orderTime || order.createdAt || Date.now()).getTime();
                  const targetFinishEpoch = orderPlacedEpoch + prepMins * 60 * 1000;
                  const remainingMinutes = Math.max(0, Math.ceil((targetFinishEpoch - now) / 60000));

                  const isItemServed = isServed || item.status === 'served';
                  const isItemReady = isReady || item.status === 'ready';

                  return (
                    <article
                      key={item.id}
                      className="bg-light-surface-container-low/60 border border-light-outline-variant/50 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-lg bg-light-surface-container flex items-center justify-center text-light-primary shrink-0 border border-light-outline-variant/30">
                          <UtensilsCrossed className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <h3 className="font-title text-sm sm:text-base font-semibold text-light-on-surface truncate">
                            {item.quantity}x {item.dishName}
                            {item.variantName && (
                              <span className="text-light-on-surface-variant font-normal text-xs ml-1">
                                ({item.variantName})
                              </span>
                            )}
                          </h3>
                          <span className="font-body text-xs text-light-on-surface-variant tabular-nums">
                            {formatCurrency(item.unitPrice * item.quantity, currency)}
                          </span>
                        </div>
                      </div>

                      {/* Status pill on right */}
                      <div className="shrink-0 sm:text-right">
                        {isItemServed ? (
                          <span className="inline-flex items-center gap-1 bg-light-surface-container-high text-light-on-surface px-3 py-1 rounded-full whitespace-nowrap text-xs font-label font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-light-primary" />
                            <span>Served</span>
                          </span>
                        ) : isItemReady ? (
                          <span className="inline-flex items-center gap-1 bg-light-secondary-container text-light-on-secondary-container px-3 py-1 rounded-full whitespace-nowrap text-xs font-label font-semibold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-light-primary" />
                            <span>Ready to Serve</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 bg-light-surface-container text-light-on-surface-variant px-3 py-1 rounded-full whitespace-nowrap text-xs font-label">
                            <Clock className="w-3.5 h-3.5 text-light-primary animate-pulse" />
                            <span>{remainingMinutes > 0 ? `~${remainingMinutes}m prep` : 'Preparing'}</span>
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}

                {/* Customer Order Note */}
                {order.customerNote && (
                  <div className="bg-light-surface-container-low border border-light-outline-variant/50 rounded-xl px-3.5 py-2.5 flex items-center gap-2 mt-1">
                    <FileText className="w-4 h-4 text-light-on-surface-variant shrink-0" />
                    <p className="font-body text-xs text-light-on-surface-variant">
                      <strong>Note:</strong> {order.customerNote}
                    </p>
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* Bottom Action Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link
          href={`/table/${sessionId}`}
          className="inline-flex items-center justify-center gap-2 bg-light-surface-container-lowest text-light-on-surface border border-light-outline-variant hover:border-light-primary hover:text-light-primary px-5 py-3 rounded-full font-label text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Order More Dishes</span>
        </Link>

        <Link
          href={`/table/${sessionId}/bill`}
          className="inline-flex items-center justify-center gap-2 bg-light-primary text-light-on-primary hover:bg-light-primary-container px-5 py-3 rounded-full font-label text-sm font-semibold transition-colors shadow-xs"
        >
          <Receipt className="w-4 h-4" />
          <span>View Table Bill</span>
        </Link>
      </div>
    </main>
  );
}
