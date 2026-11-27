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
  Tag,
  Truck,
  User,
  X,
  AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { loadRazorpayCheckoutScript } from '@/lib/razorpay-client';
import { isValidEmail, isValidPhone } from '@/lib/validation/customer';
import { StorefrontBottomNav } from '@/components/store/StorefrontBottomNav';
import { DeliveryMapPicker } from '@/components/store/DeliveryMapPicker';
import { createClient } from '@/lib/supabase/client';
import {
  AddressCategory,
  mergeWithSupabaseUser,
  SavedDeliveryAddress,
  writeLocalProfile,
} from '@/lib/customer-profile';

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
  const [deliveryPincode, setDeliveryPincode] = useState('');
  const [deliveryLandmark, setDeliveryLandmark] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<string>('');
  const [deliveryLng, setDeliveryLng] = useState<string>('');
  const [customerNote, setCustomerNote] = useState('');

  const [locating, setLocating] = useState(false);
  const [checkingZone, setCheckingZone] = useState(false);
  const [zoneResult, setZoneResult] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [savedAddresses, setSavedAddresses] = useState<SavedDeliveryAddress[]>([]);
  const [selectedSavedId, setSelectedSavedId] = useState<string>('myself');
  const [saveForNextTime, setSaveForNextTime] = useState(true);
  const [saveCategory, setSaveCategory] = useState<AddressCategory>('HOME');
  const [saveLabel, setSaveLabel] = useState('Home');

  const [paymentMethod, setPaymentMethod] = useState<'razorpay' | 'cod'>('razorpay');
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<any>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [instantSavedMsg, setInstantSavedMsg] = useState<string | null>(null);
  const [mapModalOpen, setMapModalOpen] = useState(false);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`ceova_delivery_cart_${restaurantSlug}`);
      if (saved) setCart(JSON.parse(saved));
    } catch {}

    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const merged = mergeWithSupabaseUser(data?.user || null);
      if (merged.name) setCustomerName(merged.name);
      if (merged.phone) setCustomerPhone(merged.phone);
      if (merged.email) setCustomerEmail(merged.email);
      if (merged.defaultAddress) setDeliveryAddress(merged.defaultAddress);
      if (merged.defaultPincode) setDeliveryPincode(merged.defaultPincode);
      if (merged.savedAddresses.length > 0) {
        setSavedAddresses(merged.savedAddresses);
        const homeAddr =
          merged.savedAddresses.find(
            (a) => a.category === 'HOME' || a.label.toLowerCase() === 'home'
          ) || merged.savedAddresses[0];
        if (homeAddr) {
          setSelectedSavedId(homeAddr.id);
          if (homeAddr.recipientName) setCustomerName(homeAddr.recipientName);
          if (homeAddr.recipientPhone) setCustomerPhone(homeAddr.recipientPhone);
          if (homeAddr.recipientEmail) setCustomerEmail(homeAddr.recipientEmail);
          setDeliveryAddress(homeAddr.address);
          setDeliveryPincode(homeAddr.pincode || '');
          setDeliveryLandmark(homeAddr.landmark || '');
          if (homeAddr.category) setSaveCategory(homeAddr.category);
          setSaveLabel(homeAddr.label);
          if (typeof homeAddr.lat === 'number' && typeof homeAddr.lng === 'number') {
            setDeliveryLat(String(homeAddr.lat));
            setDeliveryLng(String(homeAddr.lng));
          }
        }
      }
    }).catch(() => {});

    let cancelled = false;
    const loadRestaurant = async (attempt = 0) => {
      try {
        const res = await fetch(`/api/restaurant/info?slug=${encodeURIComponent(restaurantSlug)}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        if (cancelled) return;
        if (json.success) {
          setInfo(json);
          setError(null);
        } else {
          setError(json.error || 'Restaurant not found.');
        }
      } catch (e: any) {
        if (cancelled) return;
        if (attempt === 0) {
          setTimeout(() => loadRestaurant(1), 350);
          return;
        }
        setError(e?.message || 'Failed to load restaurant.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadRestaurant();
    return () => {
      cancelled = true;
    };
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
      async (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        setDeliveryLat(String(lat));
        setDeliveryLng(String(lng));
        checkZone(lat, lng);
        try {
          const geoRes = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
          const geoJson = await geoRes.json();
          if (geoRes.ok && geoJson.success) {
            if (geoJson.address) setDeliveryAddress(geoJson.address);
            if (geoJson.pincode) setDeliveryPincode(geoJson.pincode);
          }
        } catch {
          // Reverse geocoding failure shouldn't block GPS coordinate usage
        } finally {
          setLocating(false);
        }
      },
      (geoErr) => {
        setLocating(false);
        setError(geoErr.message || 'Could not access your GPS location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const freeThreshold =
    zoneResult?.freeDeliveryMinOrder !== null && zoneResult?.freeDeliveryMinOrder !== undefined
      ? Number(zoneResult.freeDeliveryMinOrder)
      : deliveryCfg?.freeMinOrder !== null && deliveryCfg?.freeMinOrder !== undefined
      ? Number(deliveryCfg.freeMinOrder)
      : deliveryCfg?.freeAbove != null
      ? Number(deliveryCfg.freeAbove)
      : null;

  const baseFee = Number(zoneResult?.deliveryFee ?? deliveryCfg?.fee ?? deliveryCfg?.charge ?? 0);

  const couponDiscount = useMemo(() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.minOrderAmount && subtotal < Number(appliedCoupon.minOrderAmount)) return 0;
    const raw =
      appliedCoupon.discountType === 'percentage'
        ? (subtotal * Number(appliedCoupon.discountValue || 0)) / 100
        : Math.min(Number(appliedCoupon.discountValue || 0), subtotal);
    const capped =
      appliedCoupon.maxDiscountAmount && raw > Number(appliedCoupon.maxDiscountAmount)
        ? Number(appliedCoupon.maxDiscountAmount)
        : raw;
    return Number(Math.max(0, capped).toFixed(2));
  }, [appliedCoupon, subtotal]);

  const discountedSubtotal = Math.max(0, Number((subtotal - couponDiscount).toFixed(2)));
  const taxRate = restaurant?.taxEnabled ? Number(restaurant?.taxRate ?? 0) : 0;
  const taxAmount = Number(((discountedSubtotal * taxRate) / 100).toFixed(2));

  const deliveryFee =
    freeThreshold !== null && discountedSubtotal >= freeThreshold ? 0 : baseFee;

  const amountForFreeDelivery =
    freeThreshold !== null ? Math.max(0, Number((freeThreshold - discountedSubtotal).toFixed(2))) : null;

  const estimatedTotal = Number((discountedSubtotal + taxAmount + deliveryFee).toFixed(2));

  const handleApplyCoupon = () => {
    setCouponError(null);
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    const availableCoupons: any[] = Array.isArray(restaurant?.coupons) ? restaurant.coupons : [];
    const matched = availableCoupons.find(
      (c: any) => String(c.code || '').toUpperCase() === code && c.isActive !== false
    );
    if (!matched) {
      setCouponError('Invalid or expired coupon code.');
      return;
    }
    if (matched.minOrderAmount && subtotal < Number(matched.minOrderAmount)) {
      setCouponError(
        `Minimum order of ${formatCurrency(Number(matched.minOrderAmount), currency)} required.`
      );
      return;
    }
    setAppliedCoupon(matched);
    setCouponInput('');
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
  };

  const handleMapSelect = async (lat: number, lng: number) => {
    setDeliveryLat(String(lat));
    setDeliveryLng(String(lng));
    checkZone(lat, lng);
    try {
      const geoRes = await fetch(`/api/geocode/reverse?lat=${lat}&lng=${lng}`);
      const geoJson = await geoRes.json();
      if (geoRes.ok && geoJson.success) {
        if (geoJson.address) setDeliveryAddress(geoJson.address);
        if (geoJson.pincode) setDeliveryPincode(geoJson.pincode);
      }
    } catch {}
  };

  const handleSelectAddressId = (id: string) => {
    setInstantSavedMsg(null);
    setSelectedSavedId(id);
    if (id === 'myself') {
      const supabase = createClient();
      supabase.auth.getUser().then(({ data }) => {
        const m = mergeWithSupabaseUser(data?.user || null);
        if (m.name) setCustomerName(m.name);
        if (m.phone) setCustomerPhone(m.phone);
        if (m.email) setCustomerEmail(m.email);
        setDeliveryAddress(m.defaultAddress || '');
        setDeliveryPincode(m.defaultPincode || '');
        setDeliveryLandmark('');
      });
      return;
    }
    if (id === 'new') {
      setDeliveryAddress('');
      setDeliveryPincode('');
      setDeliveryLandmark('');
      setDeliveryLat('');
      setDeliveryLng('');
      setZoneResult(null);
      setSaveForNextTime(true);
      return;
    }
    const addr = savedAddresses.find((a) => a.id === id);
    if (!addr) return;
    setCustomerName(addr.recipientName);
    setCustomerPhone(addr.recipientPhone);
    if (addr.recipientEmail) setCustomerEmail(addr.recipientEmail);
    setDeliveryAddress(addr.address);
    setDeliveryPincode(addr.pincode || '');
    setDeliveryLandmark(addr.landmark || '');
    if (addr.category) setSaveCategory(addr.category);
    setSaveLabel(addr.label);
    if (typeof addr.lat === 'number' && typeof addr.lng === 'number') {
      setDeliveryLat(String(addr.lat));
      setDeliveryLng(String(addr.lng));
      checkZone(addr.lat, addr.lng);
    }
  };

  const handleInstantSaveAddress = async () => {
    setError(null);
    setInstantSavedMsg(null);
    if (deliveryAddress.trim().length < 5) {
      setError('Please enter a street address before saving.');
      return;
    }
    const latNum = parseFloat(deliveryLat);
    const lngNum = parseFloat(deliveryLng);
    const newAddr: SavedDeliveryAddress = {
      id: `addr_${Date.now()}`,
      label: saveLabel.trim() || saveCategory,
      category: saveCategory,
      recipientName: customerName.trim() || 'Customer',
      recipientPhone: customerPhone.trim() || '',
      recipientEmail: customerEmail.trim() || undefined,
      address: deliveryAddress.trim(),
      pincode: deliveryPincode.trim() || undefined,
      landmark: deliveryLandmark.trim() || undefined,
      lat: Number.isNaN(latNum) ? undefined : latNum,
      lng: Number.isNaN(lngNum) ? undefined : lngNum,
    };
    const updatedList = [
      newAddr,
      ...savedAddresses.filter((a) => a.address !== newAddr.address),
    ].slice(0, 10);

    setSavedAddresses(updatedList);
    setSelectedSavedId(newAddr.id);
    writeLocalProfile({ savedAddresses: updatedList });
    try {
      const supabase = createClient();
      const { data: uData } = await supabase.auth.getUser();
      if (uData?.user) {
        await supabase.auth.updateUser({
          data: { saved_addresses: updatedList },
        });
      }
    } catch {}
    setInstantSavedMsg('Address saved to your list!');
  };

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

    // Save customer info & delivery address if requested
    if (saveForNextTime) {
      try {
        const supabase = createClient();
        const { data: uData } = await supabase.auth.getUser();
        const newAddr: SavedDeliveryAddress = {
          id: selectedSavedId !== 'myself' ? selectedSavedId : `addr_${Date.now()}`,
          label: saveLabel.trim() || saveCategory,
          category: saveCategory,
          recipientName: customerName.trim(),
          recipientPhone: customerPhone.trim(),
          recipientEmail: customerEmail.trim(),
          address: deliveryAddress.trim(),
          pincode: deliveryPincode.trim() || undefined,
          landmark: deliveryLandmark.trim() || undefined,
          lat: latNum,
          lng: lngNum,
        };
        const updatedList =
          selectedSavedId !== 'myself'
            ? savedAddresses.map((a) => (a.id === selectedSavedId ? { ...a, ...newAddr } : a))
            : [newAddr, ...savedAddresses.filter((a) => a.address !== newAddr.address)].slice(0, 10);

        writeLocalProfile({
          name: selectedSavedId === 'myself' ? customerName.trim() : undefined,
          phone: selectedSavedId === 'myself' ? customerPhone.trim() : undefined,
          email: customerEmail.trim(),
          defaultAddress: selectedSavedId === 'myself' ? deliveryAddress.trim() : undefined,
          defaultPincode:
            selectedSavedId === 'myself' ? deliveryPincode.trim() || undefined : undefined,
          savedAddresses: updatedList,
        });
        if (uData?.user) {
          supabase.auth
            .updateUser({
              data: {
                saved_addresses: updatedList,
              },
            })
            .catch(() => {});
        }
      } catch {}
    }

    try {
      const idempotencyKey = `del_${restaurant.id}_${Date.now()}_${Math.random()
        .toString(36)
        .slice(2, 8)}`;

      const cleanAddress = deliveryAddress.trim();
      const cleanPincode = deliveryPincode.trim();
      const fullDeliveryAddress =
        cleanPincode && !cleanAddress.includes(cleanPincode)
          ? `${cleanAddress} - ${cleanPincode}`
          : cleanAddress;

      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          orderType: 'delivery',
          paymentMethod,
          couponCode: appliedCoupon?.code || undefined,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          deliveryAddress: fullDeliveryAddress,
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

      const saveRecentOrder = (id: string) => {
        try {
          const existing = JSON.parse(localStorage.getItem('ceova_recent_order_ids') || '[]');
          const next = [id, ...(Array.isArray(existing) ? existing.filter((x: string) => x !== id) : [])].slice(0, 20);
          localStorage.setItem('ceova_recent_order_ids', JSON.stringify(next));
        } catch {}
      };

      if (paymentMethod === 'cod' || !json.razorpay) {
        saveRecentOrder(json.orderId);
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
              try {
                const existing = JSON.parse(localStorage.getItem('ceova_recent_order_ids') || '[]');
                const next = [json.orderId, ...(Array.isArray(existing) ? existing.filter((x: string) => x !== json.orderId) : [])].slice(0, 20);
                localStorage.setItem('ceova_recent_order_ids', JSON.stringify(next));
              } catch {}
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
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-orange-600" />
                <h1 className="text-xl font-bold text-slate-900">Delivery Checkout</h1>
              </div>
              <Link
                href={`/store/${restaurantSlug}/profile`}
                className="text-xs font-semibold text-orange-600 hover:underline"
              >
                Manage Saved / Friends
              </Link>
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">Delivery Location &amp; Address</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMapModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-800 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                  >
                    <MapPin className="w-3.5 h-3.5 text-orange-600" />
                    Set Address Using Map
                  </button>
                  <button
                    type="button"
                    onClick={handleUseCurrentLocation}
                    disabled={locating}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 text-xs font-semibold hover:bg-orange-100 cursor-pointer"
                  >
                    {locating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <LocateFixed className="w-3.5 h-3.5" />}
                    Use My GPS Location
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor="saved-address-select"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Choose Saved Address
                </label>
                <select
                  id="saved-address-select"
                  value={selectedSavedId}
                  onChange={(e) => handleSelectAddressId(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white"
                >
                  <option value="myself">My Default Profile Address</option>
                  {savedAddresses.map((addr) => (
                    <option key={addr.id} value={addr.id}>
                      {addr.category ? `${addr.category} · ` : ''}
                      {addr.label}
                      {addr.isFriend ? ' (Friend)' : ''} — {addr.address}
                      {addr.pincode ? ` - ${addr.pincode}` : ''}
                    </option>
                  ))}
                  <option value="new">+ Add New Address (Enter / GPS)</option>
                </select>
              </div>

              {checkingZone ? (
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-orange-600" />
                  <span>Checking delivery availability...</span>
                </div>
              ) : (!deliveryLat || !deliveryLng) && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
                  Tap &ldquo;Set Address Using Map&rdquo;, click &ldquo;Use My GPS Location&rdquo;, or choose a saved address.
                </p>
              )}

              {(selectedSavedId === 'new' || selectedSavedId === 'myself') && (
                <>
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
                        Pincode / ZIP
                      </label>
                      <input
                        type="text"
                        value={deliveryPincode}
                        onChange={(e) => setDeliveryPincode(e.target.value)}
                        placeholder="e.g. 800001"
                        className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                      />
                    </div>
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
                  </div>
                </>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-medium text-slate-700">
                  Delivery Instructions (Optional)
                </label>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Ring bell',
                    'Call on arrival',
                    'Leave at door',
                    "Don't ring bell",
                    'Drop with security',
                  ].map((opt) => {
                    const parts = customerNote
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    const checked = parts.includes(opt);
                    return (
                      <label
                        key={opt}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                          checked
                            ? 'bg-orange-50 border-orange-300 text-orange-800'
                            : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? parts.filter((p) => p !== opt)
                              : [...parts, opt];
                            setCustomerNote(next.join(', '));
                          }}
                          className="rounded accent-orange-600"
                        />
                        <span>{opt}</span>
                      </label>
                    );
                  })}
                </div>
                <input
                  type="text"
                  value={customerNote}
                  onChange={(e) => setCustomerNote(e.target.value)}
                  placeholder="Or type custom delivery instructions..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
              </div>

              {(selectedSavedId === 'myself' || selectedSavedId === 'new') && (
                <div className="pt-2 space-y-2 text-xs">
                  <label className="inline-flex items-center gap-2 font-medium text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={saveForNextTime}
                      onChange={(e) => setSaveForNextTime(e.target.checked)}
                      className="rounded"
                    />
                    Save this address for next time
                  </label>
                  {saveForNextTime && (
                    <div className="flex flex-wrap items-center gap-2">
                      {(['HOME', 'WORK', 'HOTEL', 'OTHER'] as AddressCategory[]).map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => {
                            setSaveCategory(cat);
                            if (['Home', 'Work', 'Hotel', 'Other', ''].includes(saveLabel)) {
                              setSaveLabel(cat.charAt(0) + cat.slice(1).toLowerCase());
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold transition-colors ${
                            saveCategory === cat
                              ? 'bg-orange-600 text-white border-orange-600'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handleInstantSaveAddress}
                        className="px-3 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-semibold hover:bg-slate-800 cursor-pointer"
                      >
                        Save Address Now
                      </button>
                    </div>
                  )}
                  {instantSavedMsg && (
                    <p className="text-[11px] font-semibold text-emerald-700">{instantSavedMsg}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Summary Sidebar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 h-fit shadow-xs lg:sticky lg:top-6">
            <h2 className="text-base font-bold text-slate-900">Order Summary</h2>

            {/* 1. Food List */}
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

            {/* Items Subtotal */}
            <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-semibold text-slate-800">
              <span>Items Total</span>
              <span>{formatCurrency(subtotal, currency)}</span>
            </div>

            {/* 2. Coupon Code Area */}
            <div className="pt-3 border-t border-slate-200 space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-orange-600" />
                Apply Coupon Code
              </label>
              {appliedCoupon ? (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-xs">
                  <div>
                    <span className="font-bold text-emerald-800">{appliedCoupon.code}</span>
                    <span className="text-emerald-700 ml-1.5">
                      (-{formatCurrency(couponDiscount, currency)})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-emerald-700 hover:text-rose-600 p-0.5"
                    aria-label="Remove coupon"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-xs uppercase tracking-wide"
                  />
                  <button
                    type="button"
                    onClick={handleApplyCoupon}
                    disabled={!couponInput.trim()}
                    className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-40"
                  >
                    Apply
                  </button>
                </div>
              )}
              {couponError && (
                <p className="text-[11px] font-medium text-rose-600">{couponError}</p>
              )}
            </div>

            {/* 3. Bill & Delivery Breakdown */}
            <div className="pt-3 border-t border-slate-200 space-y-2 text-sm">
              <div className="flex justify-between text-slate-600">
                <span>Bill Subtotal</span>
                <span>{formatCurrency(subtotal, currency)}</span>
              </div>
              {couponDiscount > 0 && (
                <div className="flex justify-between text-emerald-700 font-medium">
                  <span>Coupon Discount</span>
                  <span>-{formatCurrency(couponDiscount, currency)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Taxes ({taxRate}%)</span>
                  <span>{formatCurrency(taxAmount, currency)}</span>
                </div>
              )}
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
              {freeThreshold !== null && amountForFreeDelivery !== null && (
                amountForFreeDelivery > 0 ? (
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
                    <p className="text-[11px] font-medium text-amber-900">
                      Add <span className="font-bold">{formatCurrency(amountForFreeDelivery, currency)}</span> more to get <span className="font-bold">FREE delivery</span>!
                    </p>
                    <div className="w-full h-1.5 bg-amber-200/70 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-600 rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, Math.round((discountedSubtotal / freeThreshold) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-[11px] font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 p-2 rounded-xl">
                    Free delivery unlocked!
                  </p>
                )
              )}
              <div className="flex justify-between font-bold text-base text-slate-900 pt-2 border-t border-slate-200">
                <span>Total Bill</span>
                <span>{formatCurrency(estimatedTotal, currency)}</span>
              </div>
            </div>

            {/* 4. Payment Method Dropdown */}
            <div className="pt-2 border-t border-slate-200 space-y-1.5">
              <label
                htmlFor="checkout-payment-method"
                className="block text-xs font-bold text-slate-700"
              >
                Payment Option
              </label>
              <select
                id="checkout-payment-method"
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as 'razorpay' | 'cod')}
                className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              >
                <option value="razorpay">Pay Online (Razorpay / UPI / Card)</option>
                <option value="cod">Cash on Delivery (COD)</option>
              </select>
            </div>

            {/* 5. Place Order Button */}
            <button
              type="submit"
              disabled={submitting || cart.length === 0 || (zoneResult && !zoneResult.isWithinZone)}
              className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50 shadow-sm cursor-pointer"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {paymentMethod === 'cod' ? 'Placing Order...' : 'Opening Razorpay...'}
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  {paymentMethod === 'cod'
                    ? `Place Order (COD) · ${formatCurrency(estimatedTotal, currency)}`
                    : `Place Order & Pay · ${formatCurrency(estimatedTotal, currency)}`}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
      <StorefrontBottomNav restaurantSlug={restaurantSlug} />

      {mapModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-orange-600" />
                Set Address Using Map
              </h3>
              <button
                type="button"
                onClick={() => setMapModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 cursor-pointer"
                aria-label="Close map"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <DeliveryMapPicker
              lat={
                deliveryLat && !Number.isNaN(parseFloat(deliveryLat))
                  ? parseFloat(deliveryLat)
                  : null
              }
              lng={
                deliveryLng && !Number.isNaN(parseFloat(deliveryLng))
                  ? parseFloat(deliveryLng)
                  : null
              }
              fallbackLat={
                typeof restaurant?.latitude === 'number' ? restaurant.latitude : 25.618193
              }
              fallbackLng={
                typeof restaurant?.longitude === 'number' ? restaurant.longitude : 85.039305
              }
              onSelectLocation={(lat, lng) => {
                setSelectedSavedId('new');
                handleMapSelect(lat, lng);
              }}
            />

            {deliveryAddress && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                <p className="font-semibold text-slate-900">Selected Location</p>
                <p className="text-slate-700">
                  {deliveryAddress}
                  {deliveryPincode ? ` - ${deliveryPincode}` : ''}
                </p>
              </div>
            )}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setMapModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm &amp; Close
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
