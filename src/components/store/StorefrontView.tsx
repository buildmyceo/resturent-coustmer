'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  MapPin,
  Phone,
  Search,
  ShoppingBag,
  Truck,
  Utensils,
  Plus,
  Minus,
  Loader2,
  QrCode,
  ArrowRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface StorefrontViewProps {
  restaurantSlug: string;
}

interface DeliveryCartItem {
  dishId: string;
  dishName: string;
  price: number;
  quantity: number;
  imageUrl?: string | null;
}

export function StorefrontView({ restaurantSlug }: StorefrontViewProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<DeliveryCartItem[]>([]);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(`ceova_delivery_cart_${restaurantSlug}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) setCart(parsed);
      }
    } catch {}
  }, [restaurantSlug]);

  useEffect(() => {
    try {
      sessionStorage.setItem(`ceova_delivery_cart_${restaurantSlug}`, JSON.stringify(cart));
    } catch {}
  }, [cart, restaurantSlug]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/restaurant/info?slug=${encodeURIComponent(restaurantSlug)}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (!active) return;
        if (!res.ok || !json.success) {
          setError(json.error || 'Restaurant not found.');
        } else {
          setData(json);
        }
      } catch (err: any) {
        if (active) setError(err?.message || 'Failed to load restaurant menu.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => {
      active = false;
    };
  }, [restaurantSlug]);

  const restaurant = data?.restaurant;
  const categories: any[] = data?.categories || [];
  const dishes: any[] = data?.dishes || [];
  const booking = data?.booking || {};
  const delivery = data?.delivery || {};
  const currency = restaurant?.currency || 'INR';

  const filteredDishes = useMemo(() => {
    return dishes.filter((d) => {
      if (d.is_available === false || d.isAvailable === false || d.is_archived) return false;
      if (selectedCategory !== 'ALL' && d.category_id !== selectedCategory && d.categoryId !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return (
          String(d.name || '').toLowerCase().includes(q) ||
          String(d.description || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [dishes, selectedCategory, searchQuery]);

  const cartTotal = useMemo(
    () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [cart]
  );
  const cartCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  );

  const addDish = (dish: any) => {
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.dishId === dish.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + 1 };
        return copy;
      }
      return [
        ...prev,
        {
          dishId: dish.id,
          dishName: dish.name,
          price: Number(dish.price || 0),
          quantity: 1,
          imageUrl: dish.image_url || dish.imageUrl || null,
        },
      ];
    });
  };

  const updateQty = (dishId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) => (i.dishId === dishId ? { ...i, quantity: i.quantity + delta } : i))
        .filter((i) => i.quantity > 0)
    );
  };

  if (loading) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6 gap-3">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
        <p className="text-sm font-medium text-slate-600">Loading menu &amp; ordering options...</p>
      </main>
    );
  }

  if (error || !restaurant) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <Utensils className="w-10 h-10 text-slate-400 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Restaurant Unavailable</h1>
          <p className="text-sm text-slate-600">{error || 'This restaurant menu could not be loaded.'}</p>
        </div>
      </main>
    );
  }

  const freeAbove =
    delivery.freeAbove !== null && delivery.freeAbove !== undefined
      ? Number(delivery.freeAbove)
      : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-28">
      {/* Hero Banner */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {restaurant.logo_url || restaurant.logoUrl ? (
                <img
                  src={restaurant.logo_url || restaurant.logoUrl}
                  alt={restaurant.name}
                  className="w-16 h-16 rounded-2xl object-cover border border-slate-200"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-600 font-bold text-2xl">
                  {restaurant.name?.charAt(0) || 'R'}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-slate-900">{restaurant.name}</h1>
                {restaurant.address && (
                  <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {restaurant.address}
                  </p>
                )}
                {restaurant.phone && (
                  <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Phone className="w-3 h-3 shrink-0" />
                    {restaurant.phone}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5">
              {booking?.enabled && (
                <Link
                  href={`/store/${restaurantSlug}/book`}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  Book a Table
                  {Number(booking.feeAmount || 0) > 0 && (
                    <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full">
                      {formatCurrency(Number(booking.feeAmount), currency)}
                    </span>
                  )}
                </Link>
              )}
              {delivery?.enabled && (
                <span className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
                  <Truck className="w-4 h-4" />
                  Delivery up to {Math.min(20, Number(delivery.radiusKm || 5))} km
                  {freeAbove !== null && (
                    <span>· Free above {formatCurrency(freeAbove, currency)}</span>
                  )}
                </span>
              )}
            </div>
          </div>

          {/* Service Modes Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
              <QrCode className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-slate-900">Dine-In via Table QR</p>
                <p className="text-slate-500 mt-0.5">Scan the QR on your table to order at your seat.</p>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
              <Calendar className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-slate-900">Reserve a Table</p>
                <p className="text-slate-500 mt-0.5">
                  {booking?.enabled
                    ? booking.feeCreditable
                      ? 'Booking fee is credited toward your dining bill.'
                      : 'Instant table reservation with Razorpay.'
                    : 'Walk-in seating available.'}
                </p>
              </div>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
              <Truck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-xs">
                <p className="font-semibold text-slate-900">Home Delivery</p>
                <p className="text-slate-500 mt-0.5">
                  {delivery?.enabled
                    ? `Delivery charge ${formatCurrency(Number(delivery.charge || 0), currency)}${
                        freeAbove !== null ? ` (Free ≥ ${formatCurrency(freeAbove, currency)})` : ''
                      }`
                    : 'Delivery currently unavailable.'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Menu Filter Bar */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search dishes..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
            />
          </div>
        </div>

        {categories.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategory('ALL')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                selectedCategory === 'ALL'
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-colors ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Dish Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
          {filteredDishes.map((dish) => {
            const inCart = cart.find((c) => c.dishId === dish.id);
            const img = dish.image_url || dish.imageUrl;
            return (
              <div
                key={dish.id}
                className="bg-white border border-slate-200 rounded-2xl p-4 flex gap-4 justify-between shadow-xs"
              >
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2.5 h-2.5 rounded-full ${
                        dish.is_veg || dish.isVeg ? 'bg-emerald-600' : 'bg-rose-600'
                      }`}
                    />
                    <h3 className="font-semibold text-slate-900 truncate">{dish.name}</h3>
                  </div>
                  {dish.description && (
                    <p className="text-xs text-slate-500 line-clamp-2">{dish.description}</p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <span className="text-sm font-bold text-slate-900">
                      {formatCurrency(Number(dish.price || 0), currency)}
                    </span>
                    {dish.preparation_time && (
                      <span className="text-[11px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {dish.preparation_time} min
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-end justify-between gap-2 shrink-0">
                  {img && (
                    <img
                      src={img}
                      alt={dish.name}
                      className="w-20 h-20 rounded-xl object-cover border border-slate-100"
                    />
                  )}
                  {delivery?.enabled ? (
                    inCart ? (
                      <div className="inline-flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-xl px-2 py-1">
                        <button
                          type="button"
                          onClick={() => updateQty(dish.id, -1)}
                          className="p-1 text-orange-700 hover:bg-orange-100 rounded-lg"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-bold text-orange-900 min-w-4 text-center">
                          {inCart.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(dish.id, 1)}
                          className="p-1 text-orange-700 hover:bg-orange-100 rounded-lg"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => addDish(dish)}
                        className="px-3.5 py-1.5 rounded-xl bg-orange-600 text-white text-xs font-semibold hover:bg-orange-700 transition-colors"
                      >
                        + Add
                      </button>
                    )
                  ) : (
                    <span className="text-[11px] text-slate-400 font-medium">Dine-In Only</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Floating Delivery Cart Bar */}
      {delivery?.enabled && cartCount > 0 && (
        <div className="fixed bottom-4 inset-x-4 z-40 max-w-2xl mx-auto">
          <div className="bg-slate-900 text-white rounded-2xl px-5 py-3.5 shadow-xl flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500 flex items-center justify-center">
                <ShoppingBag className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-xs text-slate-300">
                  {cartCount} {cartCount === 1 ? 'item' : 'items'} for delivery
                </p>
                <p className="text-base font-bold">{formatCurrency(cartTotal, currency)}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push(`/store/${restaurantSlug}/checkout`)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold transition-colors"
            >
              Checkout
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
