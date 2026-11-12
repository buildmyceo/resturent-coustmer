'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useCustomer } from '@/context/CustomerContext';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
  Receipt,
  CreditCard,
  CheckCircle2,
  Users,
  ShieldCheck,
  RefreshCw,
  Plus,
  ArrowRight,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface BillPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function SharedTableBillPage({ params }: BillPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const { restaurant, table } = useCustomer();
  const [bill, setBill] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchBill = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/bill?sessionId=${sessionId}`);
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

  const currency = bill?.restaurantCurrency || restaurant?.currency || 'USD';

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-slate-800">Calculating Shared Table Bill...</h3>
        <p className="text-xs text-slate-400">Aggregating historical order snapshots from Supabase</p>
      </div>
    );
  }

  if (!bill || bill.items.length === 0) {
    return (
      <div className="px-4 py-20 text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
          <Receipt className="w-9 h-9 stroke-[1.75]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">No Bill Generated Yet</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Once items are ordered by your table, the shared itemized bill and outstanding balance will appear here.
          </p>
        </div>
        <div className="pt-2">
          <Link href={`/table/${sessionId}`}>
            <Button size="lg" className="shadow-md gap-2">
              <Plus className="w-4 h-4" />
              <span>Browse Menu & Order</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const isFullySettled = bill.outstandingBalance <= 0;

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Bill Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Shared Table Bill</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Table {bill.tableNumber} • Session #{sessionId.slice(0, 8)}
          </p>
        </div>

        <button
          onClick={fetchBill}
          className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
          title="Refresh bill"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Bill Status Banner */}
      {isFullySettled ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5 flex items-center gap-4 text-emerald-900 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div className="flex-1">
            <h3 className="font-extrabold text-sm text-emerald-950">Bill Paid in Full</h3>
            <p className="text-xs text-emerald-800 mt-0.5">
              All charges for this table have been settled. You may view or download your digital receipt.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-blue-50 border border-blue-200 rounded-3xl p-5 flex items-center justify-between shadow-xs">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block">
              Outstanding Table Balance
            </span>
            <div className="text-2xl font-black text-slate-900 mt-0.5">
              {formatCurrency(bill.outstandingBalance, currency)}
            </div>
          </div>
          <Link href={`/table/${sessionId}/payment`}>
            <Button size="lg" className="shadow-md gap-2">
              <CreditCard className="w-4 h-4" />
              <span>Pay Bill</span>
            </Button>
          </Link>
        </div>
      )}

      {/* Itemized Order Snapshots */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h2 className="font-bold text-sm text-slate-900">Ordered Items Breakdown</h2>
          <span className="text-xs text-slate-400">{bill.items.length} items</span>
        </div>

        <div className="divide-y divide-slate-100">
          {bill.items.map((item: any, idx: number) => (
            <div key={`${item.id}-${idx}`} className="py-2.5 flex items-start justify-between text-xs">
              <div className="flex-1 pr-3">
                <div className="font-semibold text-slate-900">
                  {item.quantity}x {item.dishName}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                  <span>Order #{item.orderNumber}</span>
                  {item.participantName && (
                    <>
                      <span>•</span>
                      <span className="text-blue-600 font-medium">{item.participantName}</span>
                    </>
                  )}
                  {item.variantName && (
                    <>
                      <span>•</span>
                      <span>{item.variantName}</span>
                    </>
                  )}
                </div>
              </div>
              <div className="font-bold text-slate-900 text-right shrink-0">
                {formatCurrency(item.totalPrice, currency)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-3 text-xs">
        <div className="flex justify-between text-slate-600">
          <span>Items Subtotal</span>
          <span>{formatCurrency(bill.subtotal, currency)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Sales Tax (8.5%)</span>
          <span>{formatCurrency(bill.taxAmount, currency)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Service Charge (10%)</span>
          <span>{formatCurrency(bill.serviceFee, currency)}</span>
        </div>
        {bill.discountAmount > 0 && (
          <div className="flex justify-between text-emerald-600 font-medium">
            <span>Discounts</span>
            <span>-{formatCurrency(bill.discountAmount, currency)}</span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-100 flex justify-between font-black text-slate-900 text-sm">
          <span>Total Bill</span>
          <span>{formatCurrency(bill.totalAmount, currency)}</span>
        </div>

        {bill.totalPaid > 0 && (
          <div className="flex justify-between text-emerald-700 font-semibold pt-1">
            <span>Payments Received</span>
            <span>-{formatCurrency(bill.totalPaid, currency)}</span>
          </div>
        )}

        <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-base text-slate-900">
          <span>Current Balance Due</span>
          <span className={bill.outstandingBalance > 0 ? 'text-blue-600' : 'text-emerald-600'}>
            {formatCurrency(bill.outstandingBalance, currency)}
          </span>
        </div>
      </div>

      {/* Security notice */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Historical order-item price snapshots locked at time of order</span>
      </div>

      {/* Actions */}
      <div className="pt-2 flex items-center gap-3">
        {!isFullySettled ? (
          <>
            <Link href={`/table/${sessionId}`} className="flex-1">
              <Button variant="outline" size="lg" className="w-full gap-2">
                <Plus className="w-4 h-4" />
                <span>Add More Dishes</span>
              </Button>
            </Link>
            <Link href={`/table/${sessionId}/payment`} className="flex-1">
              <Button size="lg" className="w-full gap-2 shadow-md">
                <CreditCard className="w-4 h-4" />
                <span>Pay {formatCurrency(bill.outstandingBalance, currency)}</span>
              </Button>
            </Link>
          </>
        ) : (
          <Link href={`/table/${sessionId}/receipt/${sessionId}`} className="w-full">
            <Button size="lg" className="w-full gap-2 shadow-md bg-emerald-600 hover:bg-emerald-700">
              <FileText className="w-4 h-4" />
              <span>View Digital Receipt</span>
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}

