'use client';

import React, { use, useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { formatCurrency, formatTime } from '@/lib/format';
import { OrderProgressStepper } from '@/components/orders/OrderProgressStepper';
import { cancelOrderDB } from '@/lib/supabase/service';
import { Order } from '@/types';
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
  XCircle,
  AlertTriangle,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface OrdersPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function OrderTrackingPage({ params }: OrdersPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const { orders, refreshOrders, isOrdersLoading, restaurant, table, showToast } = useCustomer();
  const currency = restaurant?.currency || 'INR';

  // Order Cancellation State
  const [cancellingOrder, setCancellingOrder] = useState<Order | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('Changed my mind');
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Live timer tick every 10 seconds to update countdowns smoothly
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(timer);
  }, []);

  const totalTableBill = useMemo(() => {
    return orders
      .filter((o) => o.status !== 'cancelled' && o.status !== 'rejected')
      .reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  }, [orders]);

  const activeOrders = useMemo(() => {
    return orders.filter((o) => o.status !== 'cancelled' && o.status !== 'rejected');
  }, [orders]);

  const handleConfirmCancel = async () => {
    if (!cancellingOrder) return;
    setIsCancelling(true);
    try {
      const res = await cancelOrderDB(cancellingOrder.id, cancelReason, false);
      if (res.success) {
        showToast(
          'Order Cancelled',
          `Order #${cancellingOrder.orderNumber} has been cancelled.`,
          'info'
        );
        setCancellingOrder(null);
        await refreshOrders();
      } else {
        showToast(
          'Cannot Cancel Order',
          res.error || 'Failed to cancel order.',
          'error'
        );
        if (res.isApproved) {
          setCancellingOrder(null);
          await refreshOrders();
        }
      }
    } catch (err: any) {
      showToast('Error', err?.message || 'Failed to cancel order.', 'error');
    } finally {
      setIsCancelling(false);
    }
  };

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
          const approvedStatuses = [
            'accepted',
            'confirmed',
            'waiter_accepted',
            'sent_to_kitchen',
            'accepted_by_kitchen',
            'preparing',
            'ready',
            'served',
            'completed',
          ];
          const isCancelled = order.status === 'cancelled' || order.status === 'rejected';
          const isApproved = approvedStatuses.includes(String(order.status).toLowerCase());
          const canCustomerCancel = !isApproved && !isCancelled;

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
                    {isCancelled && (
                      <span className="inline-flex items-center gap-1 bg-rose-100 text-rose-800 border border-rose-300 px-2.5 py-0.5 rounded-full text-xs font-label font-semibold">
                        <XCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>Cancelled</span>
                      </span>
                    )}
                  </div>
                  <span className="font-body text-xs text-light-on-surface-variant tabular-nums">
                    Placed at {formatTime(order.orderTime || order.createdAt)}
                  </span>
                </div>

                <div className="flex sm:flex-col items-center sm:items-end justify-between gap-0.5">
                  <span className={`font-title text-lg font-bold tabular-nums ${isCancelled ? 'line-through text-slate-400' : 'text-light-on-surface'}`}>
                    {formatCurrency(order.totalAmount, currency)}
                  </span>
                  <span className="font-body text-xs text-light-on-surface-variant tabular-nums">
                    {itemCount} {itemCount === 1 ? 'item' : 'items'}
                  </span>
                </div>
              </header>

              {/* Pay First: Prominent Callout Banners (Only when active) */}
              {!isCancelled && isPending && isPayFirst && (
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

              {!isCancelled && isPreparing && isPayFirst && (
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

              {!isCancelled && isReady && isPayFirst && (
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
              {!isCancelled ? (
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
              ) : (
                <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl text-xs sm:text-sm font-medium bg-rose-50 border border-rose-200 text-rose-800">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <p className="font-body">
                    Order cancelled. Items have been removed from your dining bill.
                  </p>
                </div>
              )}

              {/* Order Progress Stepper */}
              <OrderProgressStepper
                status={order.status}
                rejectionReason={order.rejectionReason}
                assignedWaiterName={order.assignedWaiterName}
                isPayFirst={isPayFirst}
              />

              {/* Customer Cancellation Option (Allowed only BEFORE approval) */}
              {canCustomerCancel && (
                <div className="p-3 sm:p-3.5 bg-rose-50/70 border border-rose-200/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-rose-900 text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>
                      Need to change dishes? You can cancel this order before cashier approval.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCancellingOrder(order);
                      setCancelReason('Changed my mind');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-700 bg-white hover:bg-rose-100 border border-rose-300 transition-colors shrink-0 shadow-2xs cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-600" />
                    <span>Cancel Order</span>
                  </button>
                </div>
              )}

              {/* Locked Notice (Once Approved: Only Admin / Cashier can cancel) */}
              {isApproved && !isCancelled && (
                <div className="p-3 sm:p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl flex items-center gap-2.5 text-xs text-amber-900">
                  <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>
                    <strong>Order Approved &amp; Sent to Kitchen:</strong> Once approved, orders can only be cancelled by the Cashier or Admin. Please speak with staff if you need assistance.
                  </span>
                </div>
              )}

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

      {/* Cancel Order Confirmation Modal */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-light-surface-container-lowest border border-light-outline-variant/80 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div className="space-y-1">
                <h3 className="font-headline text-lg font-bold text-light-on-surface">
                  Cancel Order #{cancellingOrder.orderNumber}?
                </h3>
                <p className="font-body text-xs text-light-on-surface-variant">
                  This order has not been approved yet. Cancelling will remove all items from your dining bill.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2 border-t border-light-surface-container">
              <label className="font-label text-xs font-semibold text-light-on-surface">
                Reason for cancellation:
              </label>
              <div className="flex flex-col gap-1.5">
                {[
                  'Changed my mind',
                  'Ordered wrong dishes / duplicate',
                  'Taking too long',
                  'Leaving the table',
                  'Other reason',
                ].map((reason) => (
                  <label
                    key={reason}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border text-xs cursor-pointer transition-colors ${
                      cancelReason === reason
                        ? 'border-rose-400 bg-rose-50 text-rose-950 font-semibold'
                        : 'border-light-outline-variant/60 bg-light-surface-container-low hover:bg-light-surface-container text-light-on-surface'
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancelReason"
                      value={reason}
                      checked={cancelReason === reason}
                      onChange={() => setCancelReason(reason)}
                      className="text-rose-600 focus:ring-rose-500 accent-rose-600"
                    />
                    <span>{reason}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-light-surface-container">
              <Button
                variant="outline"
                size="sm"
                disabled={isCancelling}
                onClick={() => setCancellingOrder(null)}
              >
                Keep Order
              </Button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancel}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Cancelling...</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Confirm Cancel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
