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

  // Payment Method: Direct UPI (Google Pay, PhonePe, Paytm, QR)
  const paymentMethod = 'upi';
  const [outstandingBalance, setOutstandingBalance] = useState<number>(0);
  const [billDetails, setBillDetails] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Awaiting Staff Confirmation state
  const [isAwaitingStaffConfirmation, setIsAwaitingStaffConfirmation] = useState(false);

  // Success & Refresh state
  const [isPaidSuccess, setIsPaidSuccess] = useState(false);
  const [refreshCountdown, setRefreshCountdown] = useState(5);

  // Direct UPI details
  const [upiId, setUpiId] = useState<string>('9229950815@upi');
  const [upiPayeeName, setUpiPayeeName] = useState<string>('bikaner');
  const [upiDeepLink, setUpiDeepLink] = useState<string>('');
  const [copiedUpi, setCopiedUpi] = useState<boolean>(false);
  const [upiQrSvg, setUpiQrSvg] = useState<string>('');

  // Customer contact details - COMPULSORY EMAIL & PHONE
  const [customerName, setCustomerName] = useState(participant?.name || '');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [phoneError, setPhoneError] = useState<string | null>(null);
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

  const validateContacts = (): boolean => {
    let isValid = true;
    const trimmedEmail = customerEmail.trim();
    const cleanPhone = customerPhone.trim().replace(/\D/g, '');

    if (!trimmedEmail) {
      setEmailError('Email ID is compulsory before doing online payment.');
      isValid = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError('Please enter a valid email address (e.g. name@example.com).');
      isValid = false;
    } else {
      setEmailError(null);
    }

    if (!cleanPhone) {
      setPhoneError('Phone number is compulsory before doing online payment.');
      isValid = false;
    } else if (cleanPhone.length < 10) {
      setPhoneError('Please enter a valid 10-digit mobile number.');
      isValid = false;
    } else {
      setPhoneError(null);
    }

    return isValid;
  };

  const handleLaunchUpiApp = (e: React.MouseEvent) => {
    if (!validateContacts()) {
      e.preventDefault();
      showToast('Contact Info Required', 'Email ID and Phone number are compulsory before doing online payment.', 'error');
      const el = document.getElementById('contact-form-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleSettlementConfirmed = async () => {
    setIsAwaitingStaffConfirmation(false);
    setIsPaidSuccess(true);
    showToast('Payment Verified! 🎉', 'Cashier / Waiter confirmed your payment. Receipt issued.', 'success');

    // Trigger digital bill dispatch to compulsory email
    if (customerEmail.trim()) {
      try {
        await fetch('/api/receipt/email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: customerEmail.trim(),
            invoiceId: sessionId,
          }),
        });
      } catch {
        // Non-blocking email dispatch
      }
    }

    clearSessionState();
    clearGuestSession();
  };

  // Submit UPI payment details & transition to awaiting cashier/waiter approval
  const handleSubmitUpiProof = async () => {
    if (!validateContacts()) {
      showToast('Required Fields Missing', 'Please enter your compulsory Email and Phone number.', 'error');
      const el = document.getElementById('contact-form-section');
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);

    const stored = getGuestSession();
    const activeTableId = table?.id || stored?.tableId;
    const activeRestId = restaurant?.id || stored?.restaurantId;

    try {
      const res = await fetch('/api/payment/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          tableId: activeTableId,
          restaurantId: activeRestId,
          action: 'submit_upi',
          paymentMethod: 'UPI',
          customerDetails: {
            name: customerName.trim() || undefined,
            email: customerEmail.trim(),
            phone: customerPhone.trim(),
            rating,
            review: review.trim() || undefined,
          },
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data?.error || 'Could not submit UPI payment.');
        setIsProcessing(false);
        return;
      }

      setIsAwaitingStaffConfirmation(true);
      setIsProcessing(false);
      showToast('UPI Submitted', 'Please show your UPI payment screen to Cashier or Waiter.', 'info');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Server error recording payment.');
      setIsProcessing(false);
    }
  };

  // Active check if cashier or waiter clicked "Payment Received"
  useEffect(() => {
    if (!isAwaitingStaffConfirmation || isPaidSuccess) return;

    let isMounted = true;

    const checkSettlement = async () => {
      try {
        const stored = getGuestSession();
        const activeTableId = table?.id || stored?.tableId;
        const activeRestId = restaurant?.id || stored?.restaurantId;
        const query = new URLSearchParams({ sessionId });
        if (activeTableId) query.set('tableId', activeTableId);
        if (activeRestId) query.set('restaurantId', activeRestId);

        const res = await fetch(`/api/bill?${query.toString()}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data?.success && data.bill) {
          if (data.bill.outstandingBalance <= 0 || data.bill.isFullySettled) {
            if (!isMounted) return;
            handleSettlementConfirmed();
          }
        }
      } catch {}
    };

    const interval = setInterval(checkSettlement, 2500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isAwaitingStaffConfirmation, isPaidSuccess, sessionId, table?.id, restaurant?.id]);

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
          {review && <p className="text-xs italic text-slate-600 mt-1">&ldquo;{review}&rdquo;</p>}
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

      {/* 2. Customer Contact & Delivery Form (Email & Phone COMPULSORY) */}
      <div id="contact-form-section" className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div>
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-blue-600" />
              <span>Customer Contact Details</span>
            </h2>
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-full">
              Email &amp; Phone Required
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            Email ID and Phone number are compulsory before making online payment to deliver your official GST tax invoice.
          </p>
        </div>

        <div className="space-y-3">
          {/* User Email (COMPULSORY) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                Email Address <span className="text-rose-600 font-extrabold">*</span>
              </label>
              <span className="text-[10px] font-semibold text-rose-600">Compulsory</span>
            </div>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={customerEmail}
                onChange={(e) => {
                  setCustomerEmail(e.target.value);
                  if (emailError) setEmailError(null);
                }}
                placeholder="customer@example.com"
                className={`w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border text-slate-900 transition-colors ${
                  emailError
                    ? 'border-rose-400 bg-rose-50/50 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
                }`}
              />
            </div>
            {emailError ? (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{emailError}</p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-0.5">Required for delivering your official GST tax receipt</p>
            )}
          </div>

          {/* User Phone (COMPULSORY) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                Phone Number <span className="text-rose-600 font-extrabold">*</span>
              </label>
              <span className="text-[10px] font-semibold text-rose-600">Compulsory</span>
            </div>
            <div className="relative">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="tel"
                required
                maxLength={14}
                value={customerPhone}
                onChange={(e) => {
                  setCustomerPhone(e.target.value);
                  if (phoneError) setPhoneError(null);
                }}
                placeholder="10-digit mobile number (e.g. 9876543210)"
                className={`w-full text-xs pl-9 pr-3 py-2.5 rounded-xl border text-slate-900 transition-colors ${
                  phoneError
                    ? 'border-rose-400 bg-rose-50/50 focus:ring-2 focus:ring-rose-500/20'
                    : 'border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20'
                }`}
              />
            </div>
            {phoneError ? (
              <p className="text-[11px] text-rose-600 mt-1 font-medium">{phoneError}</p>
            ) : (
              <p className="text-[10px] text-slate-400 mt-0.5">Required for payment verification &amp; SMS receipt</p>
            )}
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

      {/* 3. Direct UPI Payment: Google Pay, PhonePe, QR */}
      <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
            <QrCode className="w-4 h-4 text-light-primary" />
            <span>UPI Online Payment</span>
          </h2>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
            Zero Extra Fee
          </span>
        </div>

        <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200/80 space-y-3 animate-in fade-in duration-150">
          <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">
            1-Tap UPI Apps (Opens Installed App):
          </span>

          {/* Direct App Redirect Buttons */}
          <div className="grid grid-cols-2 gap-2">
            {gpayDeepLink && (
              <a
                href={gpayDeepLink}
                onClick={handleLaunchUpiApp}
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
                onClick={handleLaunchUpiApp}
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
              onClick={handleLaunchUpiApp}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs transition-all active:scale-[0.98]"
            >
              <span>Open Any UPI App (Paytm / BHIM / Cred)</span>
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

        {/* Informational notice: Cash is only marked by staff */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2 text-xs text-slate-600">
          <Banknote className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Paying Cash at Table or Counter?</strong> Cash payments are updated and verified exclusively by your Cashier, Waiter, or Admin. Please hand cash to staff to settle.
          </p>
        </div>
      </div>

      {/* 4. Settlement Action & Staff Verification */}
      {isAwaitingStaffConfirmation ? (
        <div className="bg-white rounded-3xl p-6 border-2 border-amber-300 shadow-md space-y-5 text-center animate-in fade-in duration-200">
          <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center mx-auto shadow-inner animate-pulse">
            <Zap className="w-8 h-8 text-amber-600" />
          </div>

          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-900 border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              Awaiting Staff Confirmation
            </span>
            <h2 className="text-xl font-black text-slate-900">
              Show This Screen to Cashier or Waiter
            </h2>
            <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
              Please show your UPI payment success screen to your waiter or cashier.
              Once staff clicks <strong>&ldquo;Payment Received&rdquo;</strong>, your official digital receipt will be unlocked and sent to <strong>{customerEmail}</strong>.
            </p>
          </div>

          {/* Amount & Table summary */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-xs">
            <div className="text-left">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Table</span>
              <span className="font-extrabold text-slate-800 text-sm">Table {table?.number || '1'}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-400 block text-[10px] uppercase font-bold">UPI Amount</span>
              <span className="font-black text-emerald-600 text-base">{formatCurrency(outstandingBalance, currency)}</span>
            </div>
          </div>

          <div className="p-3 bg-blue-50 border border-blue-200/80 rounded-xl text-xs text-blue-900 flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 text-blue-600 animate-spin shrink-0" />
            <span>Listening for staff confirmation in real time...</span>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsAwaitingStaffConfirmation(false)}
              className="w-full text-xs"
            >
              Show UPI QR Code / Edit Payment Details
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            onClick={handleSubmitUpiProof}
            size="lg"
            isLoading={isProcessing}
            disabled={outstandingBalance <= 0}
            className="w-full py-4 font-extrabold text-base gap-2 shadow-lg bg-light-primary hover:bg-light-primary-container shadow-light-primary/20 text-light-on-primary rounded-full transition-all cursor-pointer"
          >
            <span>✓ I Have Paid via UPI • Show to Staff ({formatCurrency(outstandingBalance, currency)})</span>
          </Button>
          <p className="text-[11px] text-center text-slate-400 mt-2">
            After paying in your UPI app, click above and show your screen to the cashier or waiter
          </p>
        </div>
      )}
    </div>
  );
}
