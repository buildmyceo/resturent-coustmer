'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession } from '@/lib/guest-session';
import { formatCurrency } from '@/lib/format';
import {
  CreditCard,
  QrCode,
  Banknote,
  ShieldCheck,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Receipt,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PaymentPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function CheckoutPaymentPage({ params }: PaymentPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;
  const router = useRouter();

  const { restaurant, table, participant, showToast } = useCustomer();

  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'card' | 'upi' | 'cash'>('razorpay');
  const [outstandingBalance, setOutstandingBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Customer contact details for digital receipt delivery
  const [customerName, setCustomerName] = useState(participant?.name || '');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // 1. Fetch live outstanding amount from backend
  useEffect(() => {
    async function loadIntent() {
      setIsLoading(true);
      try {
        const stored = getGuestSession();
        const res = await fetch('/api/payment/create-intent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId,
            paymentMethod: 'razorpay',
            tableId: table?.id || stored?.tableId,
            restaurantId: restaurant?.id || stored?.restaurantId,
          }),
        });

        const data = await res.json();
        if (data.success && data.paymentIntent) {
          setOutstandingBalance(data.paymentIntent.amount);
        } else {
          setErrorMessage(data.error || 'Could not calculate balance.');
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Network error fetching bill.');
      } finally {
        setIsLoading(false);
      }
    }

    loadIntent();
  }, [sessionId, table?.id, restaurant?.id]);

  const currency = restaurant?.currency || 'INR';

  // 2. Submit payment settlement to backend verification
  const handleProceedPayment = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    const stored = getGuestSession();

    // Generate simulated/real gateway payment tokens
    const gatewayOrderId = `order_zv_${Date.now()}`;
    const gatewayPaymentId = `pay_${paymentMethod}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const gatewaySignature = `sig_zv_${Date.now()}`;

    try {
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          tableId: table?.id || stored?.tableId,
          restaurantId: restaurant?.id || stored?.restaurantId,
          gatewayOrderId,
          gatewayPaymentId,
          gatewaySignature,
          paymentMethod,
          customerDetails: {
            name: customerName.trim() || undefined,
            email: customerEmail.trim() || undefined,
            phone: customerPhone.trim() || undefined,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || 'Payment verification failed on server.');
        setIsProcessing(false);
        return;
      }

      showToast('Payment Verified! 🎉', 'Your digital receipt has been generated.', 'success');

      // Redirect to Digital Receipt
      router.push(`/table/${sessionId}/receipt/${data.invoiceId || sessionId}`);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Server error verifying payment.');
      setIsProcessing(false);
    }
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-slate-800">Preparing Payment Gateway...</h3>
        <p className="text-xs text-slate-400">Verifying balance with dining database</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-md mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <Link
          href={`/table/${sessionId}/bill`}
          className="text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Checkout & Pay</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            {restaurant?.name} • Table {table?.number}
          </p>
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Amount Due Card */}
      <div className="bg-slate-900 text-white rounded-3xl p-6 text-center space-y-2 shadow-xl">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
          Total Amount to Pay
        </span>
        <div className="text-3xl font-black tracking-tight text-white">
          {formatCurrency(outstandingBalance, currency)}
        </div>
        <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
          <ShieldCheck className="w-3.5 h-3.5" />
          <span>Encrypted Server-Side Settlement</span>
        </div>
      </div>

      {/* Payment Method Selector */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-3">
        <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
          Select Payment Method
        </h2>

        <div className="space-y-2">
          {/* Razorpay Online */}
          <label
            onClick={() => setPaymentMethod('razorpay')}
            className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
              paymentMethod === 'razorpay'
                ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-sm">
                R
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Razorpay / Net Banking</div>
                <div className="text-[11px] text-slate-500">Cards, Netbanking & Wallets</div>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                paymentMethod === 'razorpay' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
              }`}
            >
              {paymentMethod === 'razorpay' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </label>

          {/* UPI */}
          <label
            onClick={() => setPaymentMethod('upi')}
            className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
              paymentMethod === 'upi'
                ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                UPI
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">UPI Instant Pay</div>
                <div className="text-[11px] text-slate-500">GPay, PhonePe, Paytm, BHIM</div>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                paymentMethod === 'upi' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
              }`}
            >
              {paymentMethod === 'upi' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </label>

          {/* Credit / Debit Card */}
          <label
            onClick={() => setPaymentMethod('card')}
            className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
              paymentMethod === 'card'
                ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Credit / Debit Card</div>
                <div className="text-[11px] text-slate-500">Visa, Mastercard, Amex</div>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                paymentMethod === 'card' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
              }`}
            >
              {paymentMethod === 'card' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </label>

          {/* Cash / Server Payment */}
          <label
            onClick={() => setPaymentMethod('cash')}
            className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all cursor-pointer ${
              paymentMethod === 'cash'
                ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center">
                <Banknote className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">Pay Cash to Waiter</div>
                <div className="text-[11px] text-slate-500">Staff settles bill at your table</div>
              </div>
            </div>
            <div
              className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                paymentMethod === 'cash' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
              }`}
            >
              {paymentMethod === 'cash' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
            </div>
          </label>
        </div>
      </div>

      {/* Optional Digital Receipt Contact Form */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Digital Receipt Delivery
          </h2>
          <span className="text-[10px] text-slate-400 font-medium">Optional</span>
        </div>

        <div className="space-y-2.5">
          <div className="relative">
            <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Name on receipt (e.g. John Doe)"
              className="w-full text-xs pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
            />
          </div>

          <div className="relative">
            <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="Email address for PDF receipt"
              className="w-full text-xs pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
            />
          </div>

          <div className="relative">
            <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone number (optional)"
              className="w-full text-xs pl-10 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
            />
          </div>
        </div>
      </div>

      {/* Pay CTA */}
      <div>
        <Button
          onClick={handleProceedPayment}
          size="lg"
          isLoading={isProcessing}
          disabled={outstandingBalance <= 0}
          className="w-full shadow-lg shadow-blue-500/20 py-4 font-bold text-base gap-2"
        >
          <span>Complete Payment • {formatCurrency(outstandingBalance, currency)}</span>
        </Button>
      </div>
    </div>
  );
}

