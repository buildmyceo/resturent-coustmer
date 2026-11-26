'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  LocateFixed,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Truck,
  User,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { loadRazorpayCheckoutScript } from '@/lib/razorpay-client';
import { isValidEmail, isValidPhone } from '@/lib/validation/customer';
import { StorefrontBottomNav } from '@/components/store/StorefrontBottomNav';

interface CartItem {
  dishId: string;
  dishName: string;
  price: number;
  quantity: number;
}

export default function DeliveryCheckoutPage() {
  const params = useParams<{ restaurantSlug: string }>();
  const router = useRouter();
  const restaurantSlug = params?.restaurantSlug || '';

  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState<any>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLandmark, setDeliveryLandmark] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<string>('');
  const [deliveryLng, setDeliveryLng] = useState<string>('');
  const [customerNote, setCustomerNote] = useState('');

  const [locating, setLocating] = useState(false);
  const [checkingZone, setCheckingZone] = useState(false);
  const [zoneResult, setZoneResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`ceova_delivery_cart_${restaurantSlug}`);
      if (saved) setCart(JSON.parse(saved));
    } catch {}
    fetch(`/api/restaurant/info?slug=${encodeURIComponent(restaurantSlug)}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.success) setInfo(json);
        else setError(json.error || 'Restaurant not found.');
      })
      .catch((e) => setError(e?.message || 'Failed to load restaurant.'))
      .finally(() => setLoading(false));
  }, [restaurantSlug]);

  const restaurant = info?.restaurant;
  const deliveryCfg = info?.restaurant?.delivery || info?.delivery || {};
  const currency = restaurant?.currency || 'INR';

  const subtotal = useMemo(
    () => cart.reduce((sum, i) => sum + i.price * i.quantity, 0),
    [cart]
  );

  const checkZone = async (latNum: number, lngNum: number) => {
    if (!restaurant?.id) return;
    setCheckingZone(true);
    setError(null);
    try {
      const res = await fetch('/api/delivery/check-zone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          customerLat: latNum,
          customerLng: lngNum,
          discountedSubtotal: subtotal,
        }),
      });
      const json = await res.json();
      setZoneResult(json);
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not verify delivery zone.');
      } else if (!json.isWithinZone) {
        setError(
          `Your location is ${json.distanceKm} km away, outside the ${json.maxRadiusKm} km delivery zone.`
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Delivery zone check failed.');
    } finally {
      setCheckingZone(false);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setError('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setDeliveryLat(String(lat));
        setDeliveryLng(String(lng));
        setLocating(false);
        checkZone(lat, lng);
      },
      (geoErr) => {
        setLocating(false);
        setError(geoErr.message || 'Could not access your GPS location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const freeThreshold =
    deliveryCfg?.freeMinOrder !== null && deliveryCfg?.freeMinOrder !== undefined
      ? Number(deliveryCfg.freeMinOrder)
      : deliveryCfg?.freeAbove != null
      ? Number(deliveryCfg.freeAbove)
      : null;

  const baseFee = Number(deliveryCfg?.fee ?? deliveryCfg?.charge ?? 0);

  const deliveryFee = zoneResult?.isWithinZone
    ? Number(zoneResult.appliedDeliveryFee ?? zoneResult.deliveryFee ?? 0)
    : freeThreshold !== null && subtotal >= freeThreshold
    ? 0
    : baseFee;

  const estimatedTotal = Number((subtotal + deliveryFee).toFixed(2));

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (cart.length === 0) {
      setError('Your cart is empty.');
      return;
    }
    if (!customerName.trim()) {
      setError('Please enter your name.');
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
    if (deliveryAddress.trim().length < 5) {
      setError('Please enter your full delivery address.');
      return;
    }

    const latNum = parseFloat(deliveryLat);
    const lngNum = parseFloat(deliveryLng);
    if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
      setError('Please pin your delivery location using GPS or enter coordinates.');
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `del_${restaurant.id}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          orderType: 'delivery',
          paymentMethod: 'razorpay',
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          deliveryAddress: deliveryAddress.trim(),
          deliveryLandmark: deliveryLandmark.trim() || undefined,
          deliveryLat: latNum,
          deliveryLng: lngNum,
          customerNote: customerNote.trim() || undefined,
          idempotencyKey,
          items: cart.map((c) => ({
            dishId: c.dishId,
            dishName: c.dishName,
            quantity: c.quantity,
            price: c.price,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || 'Could not place delivery order.');
        setSubmitting(false);
        return;
      }

      if (!json.razorpay) {
        sessionStorage.removeItem(`ceova_delivery_cart_${restaurantSlug}`);
        router.push(`/store/${restaurantSlug}/orders/${json.orderId}?token=${encodeURIComponent(json.guestToken || '')}`);
        return;
      }

      const loaded = await loadRazorpayCheckoutScript();
      if (!loaded || !(window as any).Razorpay) {
        setError('Unable to load Razorpay payment gateway.');
        setSubmitting(false);
        return;
      }

      const rzp = new (window as any).Razorpay({
        key: json.razorpay.keyId,
        amount: json.razorpay.amountPaise,
        currency: json.razorpay.currency || 'INR',
        name: restaurant.name,
        description: `Delivery Order ${json.orderNumber}`,
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
                purpose: 'order',
                restaurantId: restaurant.id,
                orderId: json.orderId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyJson = await verifyRes.json();
            if (!verifyRes.ok || !verifyJson.success) {
              setError(verifyJson.error || 'Payment verification failed.');
              setSubmitting(false);
            } else {
              sessionStorage.removeItem(`ceova_delivery_cart_${restaurantSlug}`);
              router.push(
                `/store/${restaurantSlug}/orders/${json.orderId}?token=${encodeURIComponent(
                  json.guestToken || ''
                )}`
              );
            }
          } catch (vErr: any) {
            setError(vErr?.message || 'Payment verification failed.');
            setSubmitting(false);
          }
        },
        modal: {
          ondismiss: () => setSubmitting(false),
        },
      });
      rzp.open();
    } catch (err: any) {
      setError(err?.message || 'Checkout failed.');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
      </main>
    );
  }

  if (cart.length === 0) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4 shadow-xs">
          <Truck className="w-10 h-10 text-slate-300 mx-auto" />
          <h1 className="text-xl font-bold text-slate-900">Your Cart is Empty</h1>
          <p className="text-sm text-slate-500">
            Add some dishes from the menu before proceeding to checkout.
          </p>
          <Link
            href={`/store/${restaurantSlug}`}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-semibold hover:bg-orange-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Browse Menu
          </Link>
        </div>
        <StorefrontBottomNav restaurantSlug={restaurantSlug} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 py-8 pb-28 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <Link
          href={`/store/${restaurantSlug}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {restaurant?.name || 'Menu'}
        </Link>

        <form onSubmit={handlePlaceOrder} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
            <div className="flex items-center gap-2.5">
              <Truck className="w-5 h-5 text-orange-600" />
              <h1 className="text-xl font-bold text-slate-900">Delivery Checkout</h1>
            </div>

            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="space-y-3">
              <h2 className="text-sm font-bold text-slate-900">Customer Contact (Required)</h2>
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
            </div>

            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">Delivery Location &amp; Address</h2>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  disabled={locating}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold hover:bg-orange-100"
                >
                  {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                  Use My GPS Location
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Latitude</label>
                  <input
                    type="text"
                    value={deliveryLat}
                    onChange={(e) => setDeliveryLat(e.target.value)}
                    placeholder="25.618193"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Longitude</label>
                  <input
                    type="text"
                    value={deliveryLng}
                    onChange={(e) => setDeliveryLng(e.target.value)}
                    placeholder="85.039305"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono"
                    required
                  />
                </div>
              </div>

              {deliveryLat && deliveryLng && (
                <button
                  type="button"
                  onClick={() => checkZone(parseFloat(deliveryLat), parseFloat(deliveryLng))}
                  disabled={checkingZone}
                  className="text-xs font-semibold text-indigo-600 hover:underline"
                >
                  {checkingZone ? 'Checking delivery zone...' : 'Verify Delivery Zone'}
                </button>
              )}

              {zoneResult?.isWithinZone && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Eligible for delivery ({zoneResult.distanceKm} km away · Max{' '}
                    {zoneResult.maxRadiusKm} km).
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  <MapPin className="w-3.5 h-3.5 inline mr-1" />
                  Complete Street Address *
                </label>
                <textarea
                  rows={2}
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="House/Flat no, Building, Street, Area..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Landmark (Optional)
                  </label>
                  <input
                    type="text"
                    value={deliveryLandmark}
                    onChange={(e) => setDeliveryLandmark(e.target.value)}
                    placeholder="Near City Park..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Delivery Instructions
                  </label>
                  <input
                    type="text"
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                    placeholder="Ring bell / call on arrival"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Summary Sidebar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 h-fit shadow-xs">
            <h2 className="text-base font-bold text-slate-900">Order Summary</h2>
            <div className="divide-y divide-slate-100 text-sm">
              {cart.map((item) => (
                <div key={item.dishId} className="py-2 flex justify-between gap-2">
                  <span className="text-slate-700">
                    {item.quantity}× {item.dishName}
                  </span>
                  <span className="font-semibold text-slate-900">
                    {formatCurrency(item.price * item.quantity, currency)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Delivery Charge</span>
                <span>
                  {deliveryFee === 0 ? (
                    <span className="text-emerald-600 font-semibold">FREE</span>
                  ) : (
                    formatCurrency(deliveryFee, currency)
                  )}
                </span>
              </div>
              {freeThreshold !== null && subtotal < freeThreshold && (
                <p className="text-[11px] text-emerald-700 bg-emerald-50 p-2 rounded-lg">
                  Add {formatCurrency(freeThreshold - subtotal, currency)} more for free delivery!
                </p>
              )}
              <div className="flex justify-between font-bold text-base text-slate-900 pt-2 border-t border-slate-100">
                <span>Total</span>
                <span>{formatCurrency(estimatedTotal, currency)}</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || cart.length === 0 || (zoneResult && !zoneResult.isWithinZone)}
              className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Pay &amp; Place Delivery Order
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      <StorefrontBottomNav restaurantSlug={restaurantSlug} />
    </main>
  );
}
