'use client';

import React, { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useCustomer } from '@/context/CustomerContext';
import { getGuestSession, clearGuestSession } from '@/lib/guest-session';
import { formatCurrency, formatDateTime } from '@/lib/format';
import {
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
  Copy,
  Check,
  ExternalLink,
  Zap,
  Star,
  MessageSquare,
  Sparkles,
  RefreshCw,
  Utensils,
  Smartphone,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface PaymentPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function CheckoutPaymentPage({ params }: PaymentPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;
  const router = useRouter();

  const { restaurant, table, participant, showToast, clearSessionState } = useCustomer();

  // Simplified Payment Methods: Only 'upi' (Google Pay / PhonePe) or 'waiter' (Cash / Waiter)
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'waiter'>('upi');
  const [outstandingBalance, setOutstandingBalance] = useState<number>(0);
  const [billDetails, setBillDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Success & Refresh state
  const [isPaidSuccess, setIsPaidSuccess] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(5);

  // Direct UPI details
  const [upiId, setUpiId] = useState<string>('9229950815@upi');
  const [upiPayeeName, setUpiPayeeName] = useState<string>('bikaner');
  const [upiDeepLink, setUpiDeepLink] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState<boolean>(false);
  const [upiQrSvg, setUpiQrSvg] = useState<string>('');

  // Customer contact details for digital bill delivery & review
  const [customerName, setCustomerName] = useState(participant?.name || '');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [rating, setRating] = useState<number>(5);
  const [review, setReview] = useState<string>('');

  // 1. Fetch live bill items and UPI configuration
  useEffect(() => {
    async function loadBillAndIntent() {
      setIsLoading(true);
      try {
        const stored = getGuestSession();
        const activeTableId = table?.id || stored?.tableId;
        const activeRestId = restaurant?.id || stored?.restaurantId;

        // Fetch Bill items & summary
        const billParams = new URLSearchParams({ sessionId });
        if (activeTableId) billParams.set('tableId', activeTableId);
        if (activeRestId) billParams.set('restaurantId', activeRestId);

        const [billRes, intentRes] = await Promise.all([
          fetch(`/api/bill?${billParams.toString()}`).catch(() => null),
          fetch('/api/payment/create-intent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sessionId,
              paymentMethod: 'upi',
              tableId: activeTableId,
              restaurantId: activeRestId,
            }),
          }).catch(() => null),
        ]);

        if (billRes && billRes.ok) {
          const billData = await billRes.json();
          if (billData.success && billData.bill) {
            setBillDetails(billData.bill);
            setOutstandingBalance(billData.bill.outstandingBalance);
          }
        }

        if (intentRes && intentRes.ok) {
          const intentData = await intentRes.json();
          if (intentData.success && intentData.paymentIntent) {
            if (!outstandingBalance && intentData.paymentIntent.amount) {
              setOutstandingBalance(intentData.paymentIntent.amount);
            }
            if (intentData.paymentIntent.upiId) setUpiId(intentData.paymentIntent.upiId);
            if (intentData.paymentIntent.upiPayeeName) setUpiPayeeName(intentData.paymentIntent.upiPayeeName);
            if (intentData.paymentIntent.upiDeepLink) setUpiDeepLink(intentData.paymentIntent.upiDeepLink);
          }
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Network error fetching bill.');
      } finally {
        setIsLoading(false);
      }
    }

    loadBillAndIntent();
  }, [sessionId, table?.id, restaurant?.id]);

  // Construct Google Pay & PhonePe direct deep links
  const gpayDeepLink = upiId
    ? `tez://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${outstandingBalance.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Table_${table?.number || '1'}_Bill`)}`
    : '';

  const phonepeDeepLink = upiId
    ? `phonepe://upi/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${outstandingBalance.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Table_${table?.number || '1'}_Bill`)}`
    : '';

  const standardUpiLink = upiDeepLink || (upiId
    ? `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiPayeeName)}&am=${outstandingBalance.toFixed(2)}&cu=INR&tn=${encodeURIComponent(`Table_${table?.number || '1'}_Bill`)}`
    : '');

  // Render on-screen UPI QR code
  useEffect(() => {
    const targetLink = standardUpiLink;
    if (!targetLink) return;

    let isMounted = true;
    QRCode.toString(
      targetLink,
      {
        type: 'svg',
        margin: 1,
        width: 170,
        errorCorrectionLevel: 'M',
        color: { dark: '#0f172a', light: '#ffffff' },
      },
      (err, svg) => {
        if (!err && svg && isMounted) {
          setUpiQrSvg(svg);
        }
      }
    );
    return () => {
      isMounted = false;
    };
  }, [standardUpiLink]);

  const currency = restaurant?.currency || 'INR';

  const handleCopyUpi = () => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId);
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  };

  // 2. Submit payment settlement (No UTR verification required)
  const handleProceedPayment = async () => {
    setIsProcessing(true);
    setErrorMessage(null);

    const stored = getGuestSession();
    const activeTableId = table?.id || stored?.tableId;
    const activeRestId = restaurant?.id || stored?.restaurantId;

    const gatewayOrderId = `ord_bill_${Date.now()}`;
    const gatewayPaymentId = `pay_${paymentMethod}_${Date.now()}`;
    const gatewaySignature = `sig_${Date.now()}`;

    try {
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          tableId: activeTableId,
          restaurantId: activeRestId,
          gatewayOrderId,
          gatewayPaymentId,
          gatewaySignature,
          paymentMethod: paymentMethod === 'waiter' ? 'CASH' : 'UPI',
          customerDetails: {
            name: customerName.trim() || undefined,
            email: customerEmail.trim() || undefined,
            phone: customerPhone.trim() || undefined,
            rating,
            review: review.trim() || undefined,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data?.error || 'Could not record bill payment.');
        setIsProcessing(false);
        return;
      }

      // If customer provided an email address, trigger digital bill dispatch
      if (customerEmail.trim()) {
        try {
          await fetch('/api/receipt/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: customerEmail.trim(),
              invoiceId: data.invoiceId || sessionId,
              invoiceNumber: data.invoiceNumber,
            }),
          });
        } catch {
          // Non-blocking email dispatch
        }
      }

      // Clear table session state & storage
      clearSessionState();
      clearGuestSession();

      showToast('Bill Paid Successfully! 🎉', 'Thank you for your feedback.', 'success');
      setIsPaidSuccess(true);
      setIsProcessing(false);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Server error recording payment.');
      setIsProcessing(false);
    }
  };

  // 3. Countdown & auto-refresh effect after bill paid
  useEffect(() => {
    if (!isPaidSuccess) return;

    const timer = setInterval(() => {
      setRefreshCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          // Hard refresh and redirect to root to reset page for new QR code scan
          window.location.href = '/';
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaidSuccess]);

  const handleManualRefresh = () => {
    window.location.href = '/';
  };

  if (isLoading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
        <h3 className="text-sm font-bold text-slate-800">Generating Online Bill...</h3>
        <p className="text-xs text-slate-400">Loading ordered items and live calculation</p>
      </div>
    );
  }

  // --- SUCCESS SCREEN WITH AUTO-REFRESH ---
  if (isPaidSuccess) {
    return (
      <div className="p-4 py-12 max-w-md mx-auto space-y-6 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-20 h-20 rounded-3xl bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20 border-2 border-emerald-200">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Bill Paid Successfully!</h1>
          <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
            Thank you for dining at {restaurant?.name || 'our restaurant'}!
            {customerEmail && (
              <span className="block font-medium text-emerald-700 mt-1">
                Your online bill receipt has been sent to <strong>{customerEmail}</strong>.
              </span>
            )}
          </p>
        </div>

        {/* Rating feedback acknowledgement */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs text-slate-700 space-y-1">
          <div className="flex items-center justify-center gap-1 text-amber-500">
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={`w-4 h-4 ${star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'}`}
              />
            ))}
          </div>
          <p className="text-[11px] text-slate-500">Thank you for rating us {rating} out of 5 stars!</p>
          {review && <p className="text-xs italic text-slate-600 mt-1">"{review}"</p>}
        </div>

        {/* Refresh notice & CTA */}
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-center gap-2 text-xs font-bold text-blue-900">
            <RefreshCw className="w-4 h-4 text-blue-600 animate-spin" />
            <span>Clearing dining session & refreshing page...</span>
          </div>
          <p className="text-[11px] text-blue-700">
            Auto-resetting in <strong>{refreshCountdown}</strong> seconds. Next guest can now scan the table QR code.
          </p>
          <div className="pt-1">
            <Button
              onClick={handleManualRefresh}
              size="sm"
              className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 gap-2"
            >
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>Refresh Page Now</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-md mx-auto pb-12">
      {/* Header */}
      <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
        <Link
          href={`/table/${sessionId}/bill`}
          className="text-slate-400 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Online Bill & Payment</h1>
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

      {/* 1. Itemized Online Bill Card */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-blue-600" />
            <h2 className="font-extrabold text-sm text-slate-900">Online Itemized Bill</h2>
          </div>
          <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
            Table {table?.number || '1'}
          </span>
        </div>

        {/* Ordered items breakdown */}
        {billDetails?.items && billDetails.items.length > 0 ? (
          <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
            {billDetails.items.map((item: any, idx: number) => (
              <div key={`${item.id}-${idx}`} className="py-2 flex items-start justify-between text-xs">
                <div className="flex-1 pr-2">
                  <span className="font-semibold text-slate-900">
                    {item.quantity}x {item.dishName}
                  </span>
                  {item.variantName && (
                    <span className="text-slate-400 text-[11px] block">{item.variantName}</span>
                  )}
                </div>
                <span className="font-bold text-slate-900 shrink-0">
                  {formatCurrency(item.totalPrice, currency)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-2 text-xs text-slate-500 italic">Order items verified</div>
        )}

        {/* Bill Financial Summary */}
        <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
          {billDetails?.subtotal ? (
            <div className="flex justify-between text-slate-500">
              <span>Subtotal</span>
              <span>{formatCurrency(billDetails.subtotal, currency)}</span>
            </div>
          ) : null}
          {billDetails?.taxAmount ? (
            <div className="flex justify-between text-slate-500">
              <span>Taxes (GST/Sales Tax)</span>
              <span>{formatCurrency(billDetails.taxAmount, currency)}</span>
            </div>
          ) : null}
          {billDetails?.serviceFee ? (
            <div className="flex justify-between text-slate-500">
              <span>Service Charge</span>
              <span>{formatCurrency(billDetails.serviceFee, currency)}</span>
            </div>
          ) : null}

          <div className="pt-2 border-t border-slate-200 flex justify-between font-black text-slate-900 text-base">
            <span>Total Amount Due</span>
            <span className="text-emerald-600 text-lg">
              {formatCurrency(outstandingBalance, currency)}
            </span>
          </div>
        </div>
      </div>

      {/* 2. Customer Contact & Review Form */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div>
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <Mail className="w-3.5 h-3.5 text-blue-600" />
            <span>Receive Bill on Email & Review</span>
          </h2>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Add your email to receive an instant copy of your online bill receipt.
          </p>
        </div>

        <div className="space-y-3">
          {/* User Email */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Your Email Address <span className="text-blue-600 font-normal">(for online bill delivery)</span>
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="your.email@example.com"
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>
          </div>

          {/* User Phone */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Phone Number <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>
          </div>

          {/* User Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Guest Name <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Name on bill"
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>
          </div>

          {/* Interactive Star Rating */}
          <div className="pt-1">
            <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
              Rate Your Dining Experience
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => setRating(star)}
                  className="p-1.5 transition-transform hover:scale-110 active:scale-95"
                >
                  <Star
                    className={`w-6 h-6 transition-colors ${
                      star <= rating
                        ? 'fill-amber-400 text-amber-400 drop-shadow-xs'
                        : 'text-slate-200 hover:text-amber-200'
                    }`}
                  />
                </button>
              ))}
              <span className="text-xs font-bold text-slate-700 ml-1">
                {rating === 5 ? 'Excellent 🌟' : rating === 4 ? 'Great 👍' : rating === 3 ? 'Good 👌' : 'Fair'}
              </span>
            </div>
          </div>

          {/* Customer Review / Feedback Box */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Feedback / Review <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <div className="relative">
              <MessageSquare className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                rows={2}
                placeholder="Tell us what you loved or how we can improve..."
                className="w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 text-slate-900"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3. Payment Method: ONLY Google Pay / PhonePe (UPI) OR Pay to Waiter */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
          Choose How to Pay
        </h2>

        <div className="grid grid-cols-2 gap-3">
          {/* Method A: Google Pay / PhonePe */}
          <button
            type="button"
            onClick={() => setPaymentMethod('upi')}
            className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
              paymentMethod === 'upi'
                ? 'border-emerald-600 bg-emerald-50/60 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold text-xs">
                UPI
              </div>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentMethod === 'upi' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300'
                }`}
              >
                {paymentMethod === 'upi' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
            <div className="font-bold text-xs text-slate-900">Google Pay / PhonePe</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Direct UPI App or QR</div>
          </button>

          {/* Method B: Pay to Waiter */}
          <button
            type="button"
            onClick={() => setPaymentMethod('waiter')}
            className={`p-3.5 rounded-2xl border-2 text-left transition-all ${
              paymentMethod === 'waiter'
                ? 'border-blue-600 bg-blue-50/60 shadow-xs'
                : 'border-slate-200 hover:border-slate-300 bg-white'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center">
                <Banknote className="w-4 h-4" />
              </div>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                  paymentMethod === 'waiter' ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                }`}
              >
                {paymentMethod === 'waiter' && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
              </div>
            </div>
            <div className="font-bold text-xs text-slate-900">Paid to Waiter</div>
            <div className="text-[10px] text-slate-500 mt-0.5">Cash / Card at table</div>
          </button>
        </div>

        {/* UPI Details & Deep Links when 'upi' selected */}
        {paymentMethod === 'upi' && (
          <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 space-y-3 mt-3 animate-in fade-in duration-150">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
              1-Tap Payment on Mobile:
            </span>

            {/* Direct App Redirect Buttons */}
            <div className="grid grid-cols-2 gap-2">
              {gpayDeepLink && (
                <a
                  href={gpayDeepLink}
                  className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-white border border-emerald-300 hover:border-emerald-500 font-bold text-xs text-slate-800 shadow-xs transition-all active:scale-[0.98]"
                >
                  <Smartphone className="w-3.5 h-3.5 text-blue-600" />
                  <span>Google Pay</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              )}

              {phonepeDeepLink && (
                <a
                  href={phonepeDeepLink}
                  className="flex items-center justify-center gap-1.5 py-3 px-3 rounded-xl bg-white border border-emerald-300 hover:border-emerald-500 font-bold text-xs text-slate-800 shadow-xs transition-all active:scale-[0.98]"
                >
                  <Smartphone className="w-3.5 h-3.5 text-purple-600" />
                  <span>PhonePe</span>
                  <ExternalLink className="w-3 h-3 text-slate-400" />
                </a>
              )}
            </div>

            {/* Any UPI App button */}
            {standardUpiLink && (
              <a
                href={standardUpiLink}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all active:scale-[0.98]"
              >
                <span>Open Any UPI App (Paytm / BHIM)</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}

            {/* Dynamic UPI QR Code Preview for Desktop / Other Device */}
            {upiQrSvg && (
              <div className="bg-white p-3 rounded-2xl border border-emerald-200 text-center space-y-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                  Or Scan QR with any Banking App
                </span>
                <div
                  className="flex justify-center items-center py-1 mx-auto"
                  dangerouslySetInnerHTML={{ __html: upiQrSvg }}
                />
              </div>
            )}

            {/* UPI ID copy box */}
            <div className="bg-white p-2.5 rounded-xl border border-emerald-200/70 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider block">
                  UPI ID
                </span>
                <span className="font-mono font-bold text-slate-900 text-xs truncate block">
                  {upiId}
                </span>
              </div>
              <button
                type="button"
                onClick={handleCopyUpi}
                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors shrink-0"
              >
                {copiedUpi ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-600" />
                    <span className="text-emerald-700">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Waiter Details when 'waiter' selected */}
        {paymentMethod === 'waiter' && (
          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-200/80 space-y-1.5 mt-3 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <Banknote className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-bold text-blue-900">Pay Directly to Staff</span>
            </div>
            <p className="text-xs text-blue-800 leading-relaxed">
              Hand cash to your waiter or ask for the card machine. Click the button below to confirm you have paid or requested the waiter.
            </p>
          </div>
        )}
      </div>

      {/* 4. Complete / Confirm Settlement Button (No Verification required) */}
      <div>
        <Button
          onClick={handleProceedPayment}
          size="lg"
          isLoading={isProcessing}
          disabled={outstandingBalance <= 0}
          className={`w-full py-4 font-extrabold text-base gap-2 shadow-lg ${
            paymentMethod === 'waiter'
              ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20 text-white'
              : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20 text-white'
          }`}
        >
          {paymentMethod === 'waiter' ? (
            <span>✓ Confirm Paid to Waiter • {formatCurrency(outstandingBalance, currency)}</span>
          ) : (
            <span>✓ Confirm Paid via Google Pay / PhonePe • {formatCurrency(outstandingBalance, currency)}</span>
          )}
        </Button>
        <p className="text-[11px] text-center text-slate-400 mt-2">
          Page automatically refreshes and clears table session after confirmation
        </p>
      </div>
    </div>
  );
}
