'use client';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useCustomer } from '@/context/CustomerContext';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
  FileText,
  Printer,
  Mail,
  CheckCircle2,
  Utensils,
  ArrowLeft,
  Loader2,
  Share2,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ReceiptPageProps {
  params: Promise<{ sessionId: string; invoiceId: string }>;
}

export default function DigitalReceiptPage({ params }: ReceiptPageProps) {
  const resolvedParams = use(params);
  const { sessionId, invoiceId } = resolvedParams;

  const { restaurant } = useCustomer();
  const [receipt, setReceipt] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Email state
  const [emailInput, setEmailInput] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailStatus, setEmailStatus] = useState<{ sent: boolean; message: string } | null>(null);

  useEffect(() => {
    async function loadReceipt() {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/receipt/get?invoiceId=${invoiceId}&sessionId=${sessionId}`);
        const data = await res.json();
        if (data.success && data.receipt) {
          setReceipt(data.receipt);
          if (data.receipt.customerEmail) {
            setEmailInput(data.receipt.customerEmail);
          }
        }
      } catch (err) {
        console.warn('Error fetching digital receipt:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadReceipt();
  }, [invoiceId, sessionId]);

  const handlePrint = () => {
    window.print();
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput || !emailInput.includes('@')) return;

    setIsSendingEmail(true);
    setEmailStatus(null);

    try {
      const res = await fetch('/api/receipt/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: emailInput,
          invoiceId,
          invoiceNumber: receipt?.invoiceNumber,
        }),
      });

      const data = await res.json();
      if (data.success && data.emailSent) {
        setEmailStatus({ sent: true, message: data.message });
      } else {
        setEmailStatus({
          sent: false,
          message: data.error || 'Email service not configured. Please download PDF.',
        });
      }
    } catch (err: any) {
      setEmailStatus({ sent: false, message: 'Failed to send email.' });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const currency = restaurant?.currency || 'USD';

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-slate-800">Generating Digital Tax Invoice...</h3>
      </div>
    );
  }

  if (!receipt) {
    return (
      <div className="px-4 py-20 text-center space-y-4">
        <h2 className="text-lg font-bold text-slate-900">Receipt Not Found</h2>
        <p className="text-xs text-slate-500">Could not retrieve invoice records for this table session.</p>
        <Link href={`/table/${sessionId}/bill`}>
          <Button variant="outline" size="sm">
            Back to Bill
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-lg mx-auto">
      {/* Top Action Bar (hidden when printing) */}
      <div className="no-print flex items-center justify-between pb-3 border-b border-slate-100">
        <Link
          href={`/table/${sessionId}`}
          className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Return to Menu</span>
        </Link>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePrint}
            className="text-xs gap-1.5 shadow-xs"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print / PDF</span>
          </Button>
        </div>
      </div>

      {/* Official Printable Tax Invoice Card */}
      <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200/80 shadow-xl space-y-6 print:border-0 print:shadow-none print:p-0">
        {/* Receipt Header */}
        <div className="text-center space-y-1.5 pb-5 border-b border-dashed border-slate-200">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center mx-auto font-black text-xl mb-2">
            Z
          </div>
          <h1 className="text-lg font-black text-slate-900 tracking-tight">
            {receipt.restaurantName}
          </h1>
          <p className="text-xs text-slate-500">{receipt.restaurantAddress}</p>
          {receipt.restaurantPhone && (
            <p className="text-[11px] text-slate-400">Phone: {receipt.restaurantPhone}</p>
          )}

          <div className="pt-2">
            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-200">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Official Tax Receipt • PAID</span>
            </span>
          </div>
        </div>

        {/* Invoice Metadata Grid */}
        <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Invoice Number
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              {receipt.invoiceNumber}
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Date & Time
            </span>
            <span className="font-medium text-slate-700 text-xs">
              {formatDateTime(receipt.createdAt)}
            </span>
          </div>
          <div>
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Dining Table
            </span>
            <span className="font-bold text-slate-900 text-xs">{receipt.tableNumber}</span>
          </div>
          <div className="text-right">
            <span className="text-slate-400 block text-[10px] uppercase font-bold tracking-wider">
              Guest Name
            </span>
            <span className="font-semibold text-blue-600 text-xs truncate block">
              {receipt.customerName || 'Valued Guest'}
            </span>
          </div>
        </div>

        {/* Itemized Items */}
        <div className="space-y-3">
          <div className="flex justify-between text-xs font-bold text-slate-900 border-b border-slate-100 pb-2">
            <span>Dish Description</span>
            <span>Total</span>
          </div>

          <div className="divide-y divide-slate-100">
            {receipt.items.map((item: any, idx: number) => (
              <div key={idx} className="py-2.5 flex items-start justify-between text-xs">
                <div className="flex-1 pr-3">
                  <span className="font-semibold text-slate-900">
                    {item.quantity}x {item.dishName}
                  </span>
                  {item.variantName && (
                    <span className="text-slate-400 font-normal"> ({item.variantName})</span>
                  )}
                  <span className="block text-[11px] text-slate-400 mt-0.5">
                    {formatCurrency(item.unitPrice, currency)} each
                  </span>
                </div>
                <span className="font-bold text-slate-900 text-right">
                  {formatCurrency(item.totalPrice, currency)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Totals & Tax Breakdown */}
        <div className="pt-3 border-t border-dashed border-slate-200 space-y-2 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Subtotal</span>
            <span>{formatCurrency(receipt.subtotal, currency)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Sales Tax (8.5%)</span>
            <span>{formatCurrency(receipt.taxAmount, currency)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Service Fee (10%)</span>
            <span>{formatCurrency(receipt.serviceFee, currency)}</span>
          </div>
          {receipt.discountAmount > 0 && (
            <div className="flex justify-between text-emerald-600">
              <span>Discounts</span>
              <span>-{formatCurrency(receipt.discountAmount, currency)}</span>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-slate-900 text-sm">
            <span>Total Amount Paid</span>
            <span className="text-emerald-600 text-base">
              {formatCurrency(receipt.totalPaid || receipt.totalAmount, currency)}
            </span>
          </div>

          {receipt.paymentReference && (
            <div className="pt-2 text-[10px] text-slate-400 flex justify-between">
              <span>Payment Ref:</span>
              <span className="font-mono">{receipt.paymentReference}</span>
            </div>
          )}
        </div>

        {/* Receipt Footer Message */}
        <div className="text-center pt-4 border-t border-slate-100 text-[11px] text-slate-400 space-y-1">
          <p>{restaurant?.settings?.receiptFooter || 'Thank you for dining with us!'}</p>
          <p className="text-[10px]">ZOVO Restaurant SaaS Platform</p>
        </div>
      </div>

      {/* Email Dispatch Section (hidden on print) */}
      <div className="no-print bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
          <Mail className="w-4 h-4 text-blue-600" />
          <span>Email Receipt</span>
        </div>

        <form onSubmit={handleSendEmail} className="flex gap-2">
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            placeholder="Enter email address..."
            required
            className="flex-1 text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
          />
          <Button type="submit" size="sm" isLoading={isSendingEmail} className="text-xs">
            Send
          </Button>
        </form>

        {emailStatus && (
          <div
            className={`text-[11px] p-2.5 rounded-xl ${
              emailStatus.sent
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-800 border border-amber-200'
            }`}
          >
            {emailStatus.message}
          </div>
        )}
      </div>
    </div>
  );
}
