'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Mail,
  Phone,
  ShieldCheck,
  User,
  Users,
  XCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { loadRazorpayCheckoutScript } from '@/lib/razorpay-client';
import { isValidEmail, isValidPhone } from '@/lib/validation/customer';

export default function BookTablePage() {
  const params = useParams<{ restaurantSlug: string }>();
  const restaurantSlug = params?.restaurantSlug || '';

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<any>(null);
  const [bookingDate, setBookingDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [bookingTime, setBookingTime] = useState('19:30');
  const [partySize, setPartySize] = useState(2);

  const [checkingAvail, setCheckingAvail] = useState(false);
  const [availableTables, setAvailableTables] = useState<any[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<string>('');

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<any>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    async function loadInfo() {
      setLoading(true);
      try {
        const res = await fetch(`/api/restaurant/info?slug=${encodeURIComponent(restaurantSlug)}`);
        const json = await res.json();
        if (json.success) {
          setInfo(json);
        } else {
          setError(json.error || 'Restaurant not found.');
        }
      } catch (err: any) {
        setError(err?.message || 'Failed to load booking details.');
      } finally {
        setLoading(false);
      }
    }
    loadInfo();
  }, [restaurantSlug]);

  const restaurant = info?.restaurant;
  const bookingCfg = info?.restaurant?.booking || info?.booking || {};
  const currency = restaurant?.currency || 'INR';

  const checkAvailability = async () => {
    if (!restaurant?.id) return;
    setCheckingAvail(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        restaurantId: restaurant.id,
        date: bookingDate,
        time: bookingTime,
        partySize: String(partySize),
      });
      const res = await fetch(`/api/bookings/availability?${qs.toString()}`);
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not check availability.');
        setAvailableTables([]);
      } else {
        const avail = (json.tables || []).filter((t: any) => t.isAvailable);
        setAvailableTables(json.tables || []);
        setSelectedTableId(avail[0]?.id || '');
      }
    } catch (err: any) {
      setError(err?.message || 'Availability check failed.');
    } finally {
      setCheckingAvail(false);
    }
  };

  useEffect(() => {
    if (restaurant?.id && bookingCfg?.enabled) {
      checkAvailability();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurant?.id, bookingDate, bookingTime, partySize]);

  const handleBookAndPay = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedTableId) {
      setError('Please select an available table.');
      return;
    }
    if (!customerName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!isValidPhone(customerPhone)) {
      setError('Please enter a valid 10-15 digit phone number.');
      return;
    }
    if (!isValidEmail(customerEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/bookings/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          tableId: selectedTableId,
          bookingDate,
          bookingTime,
          partySize,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Failed to reserve table.');
        setSubmitting(false);
        return;
      }

      if (!json.requiresPayment || !json.razorpay) {
        setConfirmedBooking(json.booking);
        setSubmitting(false);
        return;
      }

      const loaded = await loadRazorpayCheckoutScript();
      if (!loaded || !(window as any).Razorpay) {
        setError('Unable to load Razorpay payment gateway. Please try again.');
        setSubmitting(false);
        return;
      }

      const rzp = new (window as any).Razorpay({
        key: json.razorpay.keyId,
        amount: json.razorpay.amountPaise,
        currency: json.razorpay.currency || 'INR',
        name: restaurant.name,
        description: `Table Reservation (${bookingDate} ${bookingTime})`,
        order_id: json.razorpay.orderId,
        prefill: {
          name: customerName.trim(),
          email: customerEmail.trim(),
          contact: customerPhone.trim(),
        },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                purpose: 'table_booking',
                restaurantId: restaurant.id,
                bookingId: json.booking.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyJson = await verifyRes.json();
            if (!verifyRes.ok || !verifyJson.success) {
              setError(verifyJson.error || 'Payment verification failed.');
            } else {
              setConfirmedBooking(verifyJson.booking || json.booking);
            }
          } catch (vErr: any) {
            setError(vErr?.message || 'Payment verification failed.');
          } finally {
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => {
            setSubmitting(false);
          },
        },
      });
      rzp.open();
    } catch (err: any) {
      setError(err?.message || 'Unexpected error during booking.');
      setSubmitting(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!confirmedBooking?.id) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch('/api/bookings/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: confirmedBooking.id,
          customerPhone,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not cancel booking.');
      } else {
        setConfirmedBooking({ ...confirmedBooking, status: json.status || 'cancelled' });
      }
    } catch (err: any) {
      setError(err?.message || 'Cancellation failed.');
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
      </main>
    );
  }

  if (!bookingCfg?.enabled) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Table Bookings Disabled</h1>
          <p className="text-sm text-slate-600">
            Online table reservations are currently not enabled for {restaurant?.name || 'this restaurant'}.
          </p>
          <Link
            href={`/store/${restaurantSlug}`}
            className="inline-flex items-center gap-2 text-sm font-semibold text-orange-600 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Menu
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href={`/store/${restaurantSlug}`}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to {restaurant?.name}
          </Link>
        </div>

        {confirmedBooking ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5 shadow-xs">
            <div className="flex items-center gap-3">
              {confirmedBooking.status === 'cancelled' || confirmedBooking.status === 'refunded' ? (
                <XCircle className="w-10 h-10 text-rose-600" />
              ) : (
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              )}
              <div>
                <h1 className="text-xl font-bold text-slate-900">
                  {confirmedBooking.status === 'cancelled' || confirmedBooking.status === 'refunded'
                    ? 'Booking Cancelled'
                    : 'Table Reservation Confirmed!'}
                </h1>
                <p className="text-sm text-slate-500">
                  Booking Code:{' '}
                  <span className="font-mono font-bold text-slate-900">
                    {confirmedBooking.booking_code}
                  </span>
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm">
              <div>
                <p className="text-xs text-slate-500">Date</p>
                <p className="font-semibold text-slate-900">{bookingDate}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Time</p>
                <p className="font-semibold text-slate-900">{bookingTime}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Party Size</p>
                <p className="font-semibold text-slate-900">{partySize} Guests</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Booking Fee</p>
                <p className="font-semibold text-slate-900">
                  {Number(bookingCfg.feeAmount || 0) > 0
                    ? `${formatCurrency(Number(bookingCfg.feeAmount), currency)} (${
                        bookingCfg.feeCreditable ? 'Credited to bill' : 'Non-refundable fee'
                      })`
                    : 'Free'}
                </p>
              </div>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
                {error}
              </div>
            )}

            {confirmedBooking.status === 'confirmed' && (
              <div className="flex flex-wrap gap-3 justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleCancelBooking}
                  disabled={cancelling}
                  className="px-4 py-2 rounded-xl border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50 disabled:opacity-50"
                >
                  {cancelling ? 'Cancelling...' : 'Cancel Booking'}
                </button>
                <Link
                  href={`/store/${restaurantSlug}`}
                  className="px-5 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800"
                >
                  Done
                </Link>
              </div>
            )}
          </div>
        ) : (
          <form
            onSubmit={handleBookAndPay}
            className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xs"
          >
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Book a Table</h1>
              <p className="text-sm text-slate-500 mt-1">
                Reserve your table at {restaurant?.name}.
                {Number(bookingCfg.feeAmount || 0) > 0 && (
                  <span>
                    {' '}
                    Booking fee: <strong>{formatCurrency(Number(bookingCfg.feeAmount), currency)}</strong>
                    {bookingCfg.feeCreditable ? ' (credited toward your final bill).' : '.'}
                  </span>
                )}
              </p>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  <Calendar className="w-3.5 h-3.5 inline mr-1" />
                  Date
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().split('T')[0]}
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  <Clock className="w-3.5 h-3.5 inline mr-1" />
                  Time
                </label>
                <input
                  type="time"
                  value={bookingTime}
                  onChange={(e) => setBookingTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  <Users className="w-3.5 h-3.5 inline mr-1" />
                  Party Size
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={partySize}
                  onChange={(e) => setPartySize(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">Select Available Table</label>
                {checkingAvail && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {availableTables.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    disabled={!t.isAvailable}
                    onClick={() => setSelectedTableId(t.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      !t.isAvailable
                        ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                        : selectedTableId === t.id
                        ? 'bg-orange-50 border-orange-500 text-orange-950 ring-1 ring-orange-500'
                        : 'bg-white border-slate-200 hover:border-slate-300 text-slate-800'
                    }`}
                  >
                    <p className="text-sm font-bold">
                      {t.table_name || `Table ${t.table_number}`}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Up to {t.seating_capacity} seats · {t.isAvailable ? 'Available' : 'Booked'}
                    </p>
                  </button>
                ))}
                {!checkingAvail && availableTables.length === 0 && (
                  <p className="col-span-full text-xs text-slate-500">
                    No tables found for {partySize} guests at this slot.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <h2 className="text-sm font-bold text-slate-900">Your Contact Details (Required)</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    <User className="w-3.5 h-3.5 inline mr-1" />
                    Full Name *
                  </label>
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="John Doe"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    <Phone className="w-3.5 h-3.5 inline mr-1" />
                    Phone Number *
                  </label>
                  <input
                    type="tel"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="+91 9876543210"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  <Mail className="w-3.5 h-3.5 inline mr-1" />
                  Email Address *
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  Special Requests (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Window seat, birthday, high chair..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || !selectedTableId}
              className="w-full py-3 px-5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  {Number(bookingCfg.feeAmount || 0) > 0
                    ? `Pay ${formatCurrency(Number(bookingCfg.feeAmount), currency)} & Reserve Table`
                    : 'Confirm Free Reservation'}
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
