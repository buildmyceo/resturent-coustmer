'use client';

import React, { useEffect, useState, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { formatCurrency } from '@/lib/format';
import {
  Receipt,
  QrCode,
  CreditCard,
  Banknote,
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  Plus,
  FileText,
  Check,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface BillPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function SharedTableBillPage({ params }: BillPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;
  const router = useRouter();

  const { restaurant, table, orders, participant } = useCustomer();
  const [bill, setBill] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(orders.length > 0 ? true : false);
  const [selectedMethod, setSelectedMethod] = useState<'upi' | 'card' | 'counter'>('upi');

  const fetchBill = async () => {
    setIsLoading(true);
    try {
      const stored = getGuestSession();
      const queryParams = new URLSearchParams({ sessionId });
      if (table?.id || stored?.tableId) {
        queryParams.set('tableId', table?.id || stored?.tableId || '');
      }
      if (restaurant?.id || stored?.restaurantId) {
        queryParams.set('restaurantId', restaurant?.id || stored?.restaurantId || '');
      }
      const res = await fetch(`/api/bill?${queryParams.toString()}`);
      const data = await res.json();
      if (data.success && data.bill) {
        setBill(data.bill);
      }
    } catch (err) {
      console.warn('Error fetching bill:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    queueMicrotask(() => {
      fetchBill();
    });
  }, [sessionId]);

  const currency = bill?.restaurantCurrency || restaurant?.currency || 'INR';

  const isFullySettled = bill ? bill.outstandingBalance <= 0 : false;

  const ordersCount = useMemo(() => {
    if (!bill?.items) return 0;
    return new Set(bill.items.map((i: any) => i.orderNumber)).size;
  }, [bill?.items]);

  const billNumber = bill?.id ? bill.id.slice(0, 6).toUpperCase() : sessionId.slice(0, 8).toUpperCase();
  const tableNumberDisplay = table?.number || bill?.tableNumber || 'T-01';
  const guestName = participant?.name || 'harshit';

  if (isLoading) {
    return (
      <main className="flex-1 max-w-[960px] w-full mx-auto px-4 sm:px-6 pt-24 pb-36 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-light-primary animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-light-on-surface">Calculating Table Bill...</h3>
        <p className="text-xs text-light-on-surface-variant">Aggregating historical order snapshots</p>
      </main>
    );
  }

  // Empty State
  if (!bill || !bill.items || bill.items.length === 0) {
    return (
      <main className="flex-1 max-w-[960px] w-full mx-auto px-4 sm:px-6 pt-12 pb-36 flex flex-col gap-8">
        <section className="py-20 px-6 bg-light-surface-container-lowest border border-light-outline-variant/60 rounded-2xl flex flex-col items-center text-center gap-4 max-w-lg mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-full bg-light-secondary-container/70 text-light-primary flex items-center justify-center">
            <Receipt className="w-8 h-8 stroke-[1.75]" />
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h2 className="font-headline text-2xl text-light-on-surface">No Bill Generated Yet</h2>
            <p className="font-body text-xs sm:text-sm text-light-on-surface-variant text-pretty">
              Once items are ordered by your table, the shared itemized bill and outstanding balance will appear here.
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
      {/* Page Header */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-light-outline-variant/60 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-headline text-2xl sm:text-3xl text-light-on-surface">Table Bill</h1>
            <span className="font-mono text-xs font-semibold bg-light-surface-container-low border border-light-outline-variant/70 text-light-on-surface-variant px-2.5 py-0.5 rounded-full tabular-nums">
              #BILL-{billNumber}
            </span>
          </div>
          <p className="font-body text-xs sm:text-sm text-light-on-surface-variant">
            Live itemized ledger for Table {tableNumberDisplay} • Guest: {guestName}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={fetchBill}
            className="p-2 text-light-on-surface-variant hover:text-light-on-surface rounded-xl hover:bg-light-surface-container transition-colors cursor-pointer"
            title="Refresh bill"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {isFullySettled ? (
            <span className="inline-flex items-center gap-1.5 bg-light-secondary-container text-light-on-secondary-container px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-label font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-light-primary" />
              <span>Paid in Full</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 bg-amber-badge text-on-amber-badge px-3 py-1.5 rounded-full whitespace-nowrap text-xs font-label font-semibold">
              <span className="w-2 h-2 rounded-full bg-warning" aria-hidden="true" />
              <span>Balance Due</span>
            </span>
          )}
        </div>
      </section>

      {/* Itemized Order Ledger */}
      <section
        aria-label="Itemized table orders"
        className="bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl overflow-hidden shadow-xs"
      >
        <header className="px-5 sm:px-6 py-4 bg-light-surface-container-low/60 border-b border-light-outline-variant/50 flex items-center justify-between gap-2">
          <h2 className="font-title text-base sm:text-lg font-semibold text-light-on-surface">Ordered Items</h2>
          <span className="font-label text-xs sm:text-sm text-light-on-surface-variant tabular-nums">
            {bill.items.length} {bill.items.length === 1 ? 'item' : 'items'} across {ordersCount} {ordersCount === 1 ? 'order' : 'orders'}
          </span>
        </header>

        <ul className="divide-y divide-light-surface-container">
          {bill.items.map((item: any, idx: number) => {
            const isItemServed = item.orderStatus === 'served' || item.orderStatus === 'completed';
            const isItemReady = item.orderStatus === 'ready';

            return (
              <li key={`${item.id}-${idx}`} className="px-5 sm:px-6 py-3.5 flex items-center justify-between gap-4">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-title text-sm sm:text-base font-semibold text-light-on-surface">
                      {item.quantity}x {item.dishName}
                      {item.variantName && (
                        <span className="text-xs font-normal text-light-on-surface-variant ml-1">
                          ({item.variantName})
                        </span>
                      )}
                    </span>
                    <span
                      className={`font-label text-xs px-2 py-0.5 rounded-full ${
                        isItemServed
                          ? 'bg-light-surface-container-low text-light-on-surface-variant'
                          : isItemReady
                          ? 'bg-light-secondary-container text-light-on-secondary-container font-semibold'
                          : 'bg-light-secondary-container/50 text-light-primary'
                      }`}
                    >
                      {isItemServed ? 'Served' : isItemReady ? 'Ready' : 'In Kitchen'}
                    </span>
                  </div>
                  <span className="font-body text-xs text-light-on-surface-variant tabular-nums">
                    Order #{item.orderNumber} {item.participantName && `• ${item.participantName}`}
                  </span>
                </div>

                <span className="font-title text-sm sm:text-base font-semibold text-light-on-surface tabular-nums shrink-0">
                  {formatCurrency(item.totalPrice, currency)}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Bill Breakdown & Payment Method */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Totals Card */}
        <section
          aria-label="Bill breakdown"
          className="lg:col-span-7 bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-6 flex flex-col gap-4 shadow-xs"
        >
          <h2 className="font-headline text-lg sm:text-xl text-light-on-surface border-b border-light-surface-container pb-3">
            Bill Summary
          </h2>

          <dl className="flex flex-col gap-2.5 text-xs sm:text-sm">
            <div className="flex items-center justify-between">
              <dt className="font-body text-light-on-surface-variant">Items Subtotal</dt>
              <dd className="font-body text-light-on-surface tabular-nums">
                {formatCurrency(bill.subtotal, currency)}
              </dd>
            </div>

            {bill.discountAmount > 0 && (
              <div className="flex items-center justify-between text-light-primary font-medium">
                <dt className="font-body">Discounts</dt>
                <dd className="font-body tabular-nums">
                  -{formatCurrency(bill.discountAmount, currency)}
                </dd>
              </div>
            )}

            {bill.taxAmount > 0 && (
              <div className="flex items-center justify-between">
                <dt className="font-body text-light-on-surface-variant">
                  {restaurant?.settings?.taxName || 'GST / Tax'} ({restaurant?.settings?.taxPercentage ?? 5}%)
                </dt>
                <dd className="font-body text-light-on-surface tabular-nums">
                  {formatCurrency(bill.taxAmount, currency)}
                </dd>
              </div>
            )}

            {restaurant?.settings?.serviceChargeEnabled === true && bill.serviceFee > 0 && (
              <div className="flex items-center justify-between">
                <dt className="font-body text-light-on-surface-variant">
                  Service Charge ({restaurant?.settings?.serviceChargePercentage ?? 5}%)
                </dt>
                <dd className="font-body text-light-on-surface tabular-nums">
                  {formatCurrency(bill.serviceFee, currency)}
                </dd>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-light-surface-container">
              <dt className="font-title text-sm sm:text-base font-semibold text-light-on-surface">Total Bill</dt>
              <dd className="font-title text-sm sm:text-base font-semibold text-light-on-surface tabular-nums">
                {formatCurrency(bill.totalAmount, currency)}
              </dd>
            </div>

            {bill.totalPaid > 0 && (
              <div className="flex items-center justify-between text-veg font-medium">
                <dt className="font-body">Payments Received</dt>
                <dd className="font-body tabular-nums">
                  -{formatCurrency(bill.totalPaid, currency)}
                </dd>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-light-outline-variant/60">
              <dt className="font-title text-base font-semibold text-light-on-surface">Balance Due</dt>
              <dd className="font-headline text-2xl font-bold text-light-primary tabular-nums">
                {formatCurrency(bill.outstandingBalance, currency)}
              </dd>
            </div>
          </dl>

          <div className="mt-1 flex items-center gap-2 bg-light-surface-container-low px-3.5 py-2.5 rounded-xl text-light-on-surface-variant text-xs">
            <ShieldCheck className="w-4 h-4 text-veg shrink-0" />
            <span className="font-body text-xs">
              Historical order-item price snapshots locked at time of order
            </span>
          </div>
        </section>

        {/* Right Column: Payment Method & Settle Actions */}
        <aside
          aria-label="Settle table bill"
          className="lg:col-span-5 bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-6 flex flex-col gap-5 shadow-xs"
        >
          {!isFullySettled ? (
            <>
              <div className="flex flex-col gap-1">
                <h2 className="font-headline text-lg sm:text-xl text-light-on-surface">Payment Method</h2>
                <p className="font-body text-xs text-light-on-surface-variant">
                  Choose how you would like to pay the remaining balance.
                </p>
              </div>

              <div className="flex flex-col gap-2" role="radiogroup" aria-label="Select payment method">
                {/* Option 1: UPI */}
                <button
                  type="button"
                  onClick={() => setSelectedMethod('upi')}
                  aria-pressed={selectedMethod === 'upi'}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs sm:text-sm font-label transition-colors cursor-pointer ${
                    selectedMethod === 'upi'
                      ? 'border-light-primary bg-light-secondary-container/40 text-light-on-surface'
                      : 'border-light-outline-variant bg-light-surface-container-lowest hover:border-light-primary text-light-on-surface'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <QrCode className="w-5 h-5 text-light-primary" />
                    <span className="font-semibold">UPI / QR Pay</span>
                  </span>
                  {selectedMethod === 'upi' && (
                    <Check className="w-4 h-4 text-light-primary stroke-[2.5]" />
                  )}
                </button>

                {/* Option 2: Card */}
                <button
                  type="button"
                  onClick={() => setSelectedMethod('card')}
                  aria-pressed={selectedMethod === 'card'}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs sm:text-sm font-label transition-colors cursor-pointer ${
                    selectedMethod === 'card'
                      ? 'border-light-primary bg-light-secondary-container/40 text-light-on-surface'
                      : 'border-light-outline-variant bg-light-surface-container-lowest hover:border-light-primary text-light-on-surface'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <CreditCard className="w-5 h-5 text-light-on-surface-variant" />
                    <span className="font-semibold">Credit / Debit Card</span>
                  </span>
                  {selectedMethod === 'card' && (
                    <Check className="w-4 h-4 text-light-primary stroke-[2.5]" />
                  )}
                </button>

                {/* Option 3: Counter / Waiter */}
                <button
                  type="button"
                  onClick={() => setSelectedMethod('counter')}
                  aria-pressed={selectedMethod === 'counter'}
                  className={`flex items-center justify-between px-4 py-3 rounded-xl border text-xs sm:text-sm font-label transition-colors cursor-pointer ${
                    selectedMethod === 'counter'
                      ? 'border-light-primary bg-light-secondary-container/40 text-light-on-surface'
                      : 'border-light-outline-variant bg-light-surface-container-lowest hover:border-light-primary text-light-on-surface'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Banknote className="w-5 h-5 text-light-on-surface-variant" />
                    <span className="font-semibold">Pay at Counter / Waiter</span>
                  </span>
                  {selectedMethod === 'counter' && (
                    <Check className="w-4 h-4 text-light-primary stroke-[2.5]" />
                  )}
                </button>
              </div>

              <div className="flex flex-col gap-2 pt-1">
                <Link
                  href={`/table/${sessionId}/payment?method=${selectedMethod}`}
                  className="w-full inline-flex items-center justify-center gap-2 bg-light-primary text-light-on-primary hover:bg-light-primary-container active:scale-[0.99] px-5 py-3.5 rounded-full font-label text-sm font-semibold transition-all shadow-md shadow-light-primary/20 cursor-pointer"
                >
                  <Banknote className="w-4 h-4" />
                  <span>Pay {formatCurrency(bill.outstandingBalance, currency)}</span>
                </Link>

                <Link
                  href={`/table/${sessionId}`}
                  className="w-full inline-flex items-center justify-center gap-2 bg-light-surface-container-lowest text-light-on-surface border border-light-outline-variant hover:border-light-primary hover:text-light-primary px-5 py-2.5 rounded-full font-label text-sm font-semibold transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add More Dishes</span>
                </Link>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4 text-center py-4">
              <div className="w-12 h-12 rounded-full bg-light-secondary-container text-light-primary flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div className="flex flex-col gap-1">
                <h2 className="font-headline text-lg sm:text-xl text-light-on-surface">Bill Settled</h2>
                <p className="font-body text-xs text-light-on-surface-variant">
                  All charges for Table {tableNumberDisplay} have been settled in full.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Link
                  href={`/table/${sessionId}/receipt/${sessionId}`}
                  className="w-full inline-flex items-center justify-center gap-2 bg-light-primary text-light-on-primary hover:bg-light-primary-container px-5 py-3 rounded-full font-label text-sm font-semibold transition-colors shadow-xs"
                >
                  <FileText className="w-4 h-4" />
                  <span>View Digital Receipt</span>
                </Link>

                <Link
                  href={`/table/${sessionId}`}
                  className="w-full inline-flex items-center justify-center gap-2 bg-light-surface-container-lowest text-light-on-surface border border-light-outline-variant hover:border-light-primary hover:text-light-primary px-5 py-2.5 rounded-full font-label text-sm font-semibold transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  <span>Order More Food</span>
                </Link>
              </div>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
