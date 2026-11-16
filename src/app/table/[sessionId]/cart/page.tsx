'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { DietaryBadge } from '@/components/menu/DietaryBadge';
import { formatCurrency } from '@/lib/format';
import { OrderConfirmModal } from '@/components/cart/OrderConfirmModal';
import { customerAudio } from '@/lib/audio';
import confetti from 'canvas-confetti';
import { Dish } from '@/types';
import { fetchRestaurantAndMenuDB } from '@/lib/supabase/service';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  Utensils,
  ShieldCheck,
  MessageSquare,
  ArrowLeft,
  MapPinOff,
  QrCode,
  Tag,
  Check,
  X,
  TicketPercent,
  Sparkles,
  Flame,
  Clock,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface CartPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function ShoppingCartPage({ params }: CartPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;
  const router = useRouter();

  const {
    restaurant,
    table,
    cart,
    addToCart,
    cartTotals,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    participant,
    showToast,
    refreshOrders,
    isInsideGeofence,
    customerLocation,
    appliedCoupon,
    setAppliedCoupon,
    couponDiscountAmount,
    menuDishes,
    isShopOpen,
    operatingHoursStatus,
  } = useCustomer();

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderCustomerNote, setOrderCustomerNote] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [fallbackDishes, setFallbackDishes] = useState<Dish[]>([]);

  // If menuDishes was not yet populated from context (e.g. direct nav or refresh), fetch once
  useEffect(() => {
    if (menuDishes && menuDishes.length > 0) return;
    if (!restaurant?.id) return;

    fetchRestaurantAndMenuDB(restaurant.id)
      .then(({ dishes }) => {
        if (dishes && dishes.length > 0) {
          setFallbackDishes(dishes);
        }
      })
      .catch(() => {});
  }, [menuDishes, restaurant?.id]);

  const allAvailableDishes = menuDishes && menuDishes.length > 0 ? menuDishes : fallbackDishes;

  // Filter recommendations:
  // 1. Must be active, in stock, not already in cart
  // 2. Admin featuredInCart items first
  // 3. Followed by top-selling / popular items
  const recommendedDishes = useMemo(() => {
    if (!allAvailableDishes || allAvailableDishes.length === 0) return [];
    const cartDishIds = new Set(cart.map((item) => item.dishId));

    const eligible = allAvailableDishes.filter(
      (d) => d.isAvailable && !d.isArchived && !cartDishIds.has(d.id)
    );

    // Prioritize admin-picked dishes
    const adminPicked = eligible.filter((d) => Boolean(d.featuredInCart));
    // Popular / highest ordered (only dishes with actual order count)
    const popular = eligible
      .filter((d) => !d.featuredInCart && (d.ordersCount || 0) > 0)
      .sort((a, b) => (b.ordersCount || 0) - (a.ordersCount || 0));

    // Limit top recommendations to 4 to 5 items maximum
    return [...adminPicked, ...popular].slice(0, 5);
  }, [allAvailableDishes, cart]);

  const currency = restaurant?.currency || 'USD';

  const geo = restaurant?.settings?.geofence;
  const hasCoordinates = typeof geo?.latitude === 'number' && typeof geo?.longitude === 'number';
  const isGeofenceConfigured = Boolean(geo && (geo.enabled !== false || hasCoordinates));
  const isOrderBlockedByGeofence = isGeofenceConfigured && isInsideGeofence !== true;

  const handleApplyCoupon = (e: React.FormEvent) => {
    e.preventDefault();
    setCouponError(null);

    const code = couponInput.trim().toUpperCase();
    if (!code) return;

    const availableCoupons = restaurant?.settings?.coupons || [];
    const found = availableCoupons.find((c) => c.code.toUpperCase() === code && c.isActive);

    if (!found) {
      setCouponError('Invalid or expired coupon code');
      showToast('Invalid Coupon', 'Code not found or no longer active', 'error');
      return;
    }

    if (found.minOrderAmount && cartTotals.subtotal < found.minOrderAmount) {
      const err = `Minimum subtotal of ${formatCurrency(found.minOrderAmount, currency)} required`;
      setCouponError(err);
      showToast('Minimum Order Required', err, 'error');
      return;
    }

    if (found.appliesTo === 'category' && found.targetCategoryId) {
      const hasCategoryItem = cart.some((item) => item.categoryId === found.targetCategoryId);
      if (!hasCategoryItem) {
        const err = `Coupon only applies to items from ${found.targetCategoryName || 'the specified category'}`;
        setCouponError(err);
        showToast('Not Applicable', err, 'error');
        return;
      }
    }

    if (found.appliesTo === 'dishes' && Array.isArray(found.targetDishIds) && found.targetDishIds.length > 0) {
      const hasDishItem = cart.some((item) => found.targetDishIds?.includes(item.dishId));
      if (!hasDishItem) {
        const err = 'Coupon only applies to specific eligible dishes in the menu';
        setCouponError(err);
        showToast('Not Applicable', err, 'error');
        return;
      }
    }

    setAppliedCoupon(found);
    setCouponInput('');
    showToast('Coupon Applied!', `${found.code} applied successfully`, 'success');
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponError(null);
    showToast('Coupon Removed', undefined, 'info');
  };
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !restaurant?.id || !table?.id) return;

    if (!isShopOpen) {
      showToast(
        'Restaurant Closed',
        operatingHoursStatus.reason || 'The restaurant is currently closed. Ordering is paused.',
        'error'
      );
      return;
    }

    if (isOrderBlockedByGeofence) {
      showToast(
        'Location Restriction',
        'Visit restaurant to order food, or scan QR code if you are in a different restaurant.',
        'error'
      );
      return;
    }

    setIsSubmitting(true);

    // Generate unique idempotency key to prevent double submits
    const idempotencyKey = `ord_idemp_${sessionId}_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 6)}`;

    try {
      const res = await fetch('/api/orders/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          restaurantId: restaurant.id,
          tableId: table.id,
          tableSessionId: sessionId,
          participantId: participant?.id,
          participantName: participant?.name || 'Guest',
          items: cart.map((item) => ({
            dishId: item.dishId,
            dishName: item.dishName,
            variantId: item.variantId,
            addonIds: item.selectedAddons.map((a) => a.id),
            quantity: item.quantity,
            specialInstructions: item.specialInstructions,
          })),
          customerNote: orderCustomerNote.trim() || undefined,
          idempotencyKey,
          customerCoordinates: customerLocation || undefined,
          couponCode: appliedCoupon?.code,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showToast('Order Failed', data.error || 'Could not submit order to kitchen.', 'error');
        setIsSubmitting(false);
        setIsConfirmModalOpen(false);
        return;
      }

      // Order Success!
      customerAudio.playOrderPlaced();

      // Trigger Confetti Burst
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // non-blocking
      }

      showToast(
        'Order Submitted',
        'Your order has been submitted. Please wait while our staff confirms it.',
        'success'
      );

      clearCart();
      setIsSubmitting(false);
      setIsConfirmModalOpen(false);

      // Refresh orders in background & redirect to Live Order Tracking
      await refreshOrders();
      router.push(`/table/${sessionId}/orders`);
    } catch (err: any) {
      showToast('Network Error', err?.message || 'Failed to place order.', 'error');
      setIsSubmitting(false);
      setIsConfirmModalOpen(false);
    }
  };

  if (cart.length === 0) {
    return (
      <div className="px-4 py-20 text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
          <ShoppingBag className="w-9 h-9 stroke-[1.75]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">Your Cart is Empty</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            You haven&apos;t added any delicious dishes to your table cart yet.
          </p>
        </div>
        <div className="pt-2">
          <Link href={`/table/${sessionId}`}>
            <Button size="lg" className="shadow-md gap-2">
              <ArrowLeft className="w-4 h-4" />
              <span>Browse Restaurant Menu</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href={`/table/${sessionId}`}
              className="text-slate-400 hover:text-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Your Order Cart</h1>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 ml-7">
            {table?.number} • {cartTotals.itemCount} {cartTotals.itemCount === 1 ? 'dish' : 'dishes'}
          </p>
        </div>

        <button
          onClick={clearCart}
          className="text-xs text-rose-600 hover:text-rose-700 font-semibold flex items-center gap-1 transition-colors"
        >
          <Trash2 className="w-3.5 h-3.5" />
          <span>Clear All</span>
        </button>
      </div>

      {/* Cart Items List */}
      <div className="space-y-3">
        {cart.map((item) => (
          <div
            key={item.cartItemId}
            className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs flex flex-col justify-between space-y-3"
          >
            <div className="flex items-start gap-3.5">
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0 border border-slate-100">
                <Image
                  src={item.dishImage && item.dishImage.trim() !== '' ? item.dishImage : '/placeholder-dish.jpg'}
                  alt={item.dishName}
                  fill
                  className="object-cover"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <DietaryBadge type={item.dietaryType} />
                    <h3 className="font-bold text-sm text-slate-900 truncate">{item.dishName}</h3>
                  </div>
                  <span className="font-bold text-sm text-slate-900 shrink-0">
                    {formatCurrency(item.totalPrice, currency)}
                  </span>
                </div>

                {/* Variant & Addons tags */}
                {item.variantName && (
                  <div className="text-[11px] font-semibold text-slate-600 mt-0.5">
                    Option: {item.variantName}
                  </div>
                )}

                {item.selectedAddons.length > 0 && (
                  <div className="text-[11px] text-blue-600 mt-0.5">
                    Extras: {item.selectedAddons.map((a) => a.name).join(', ')}
                  </div>
                )}

                {/* Special Instructions */}
                {item.specialInstructions && (
                  <div className="text-[11px] text-amber-700 bg-amber-50/80 px-2 py-0.5 rounded-md mt-1 inline-block">
                    Note: &quot;{item.specialInstructions}&quot;
                  </div>
                )}
              </div>
            </div>

            {/* Quantity Stepper & Unit Price */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-50">
              <span className="text-xs text-slate-400">
                {formatCurrency(item.unitPrice, currency)} each
              </span>

              <div className="flex items-center gap-3">
                <div className="flex items-center border border-slate-200 bg-slate-50 rounded-xl overflow-hidden shadow-2xs">
                  <button
                    onClick={() => updateCartQuantity(item.cartItemId, item.quantity - 1)}
                    className="p-1.5 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-7 text-center font-bold text-xs text-slate-900 select-none">
                    {item.quantity}
                  </span>
                  <button
                    onClick={() => updateCartQuantity(item.cartItemId, item.quantity + 1)}
                    className="p-1.5 text-slate-600 hover:bg-slate-200 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => removeFromCart(item.cartItemId)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors"
                  title="Remove item"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recommended / Most Selling / Chef Promoted in Cart */}
      {recommendedDishes.length > 0 && (
        <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-slate-800">You Might Also Like</span>
            </div>
            <span className="text-[10px] font-semibold text-slate-400">Frequently ordered together</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {recommendedDishes.map((dish) => {
              const hasPhoto = Boolean(dish.image && dish.image.trim() !== '');
              return (
                <div
                  key={dish.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-slate-100 hover:border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-all gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="relative w-12 h-12 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-100 flex items-center justify-center">
                      {hasPhoto ? (
                        <Image
                          src={dish.image}
                          alt={dish.name}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      ) : (
                        <Utensils className="w-5 h-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <DietaryBadge type={dish.dietaryType} />
                        <h4 className="text-xs font-bold text-slate-900 truncate">{dish.name}</h4>
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-xs font-bold text-slate-800">
                          {formatCurrency(dish.price, currency)}
                        </span>
                        {dish.originalPrice && dish.originalPrice > dish.price && (
                          <span className="text-[10px] text-slate-400 line-through">
                            {formatCurrency(dish.originalPrice, currency)}
                          </span>
                        )}
                        {dish.featuredInCart && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-amber-100 text-amber-800">
                            Chef Pick
                          </span>
                        )}
                        {!dish.featuredInCart && (dish.ordersCount || 0) > 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-orange-100 text-orange-800 flex items-center gap-0.5">
                            <Flame className="w-2.5 h-2.5" /> Top
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      addToCart(dish);
                      showToast('Added to Cart', `${dish.name} was added`, 'success');
                      customerAudio.playTap();
                    }}
                    className="h-7 px-3 text-xs font-bold bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 hover:border-emerald-400 shadow-2xs shrink-0 cursor-pointer"
                  >
                    + Add
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Promo Code / Coupon Section */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
            <TicketPercent className="w-4 h-4 text-emerald-600" />
            <span>Offers &amp; Promo Code</span>
          </div>
          {appliedCoupon && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Applied
            </span>
          )}
        </div>

        {appliedCoupon ? (
          <div className="flex items-center justify-between p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
            <div className="space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-emerald-600" />
                <span className="font-mono font-bold text-xs text-emerald-800">{appliedCoupon.code}</span>
              </div>
              <p className="text-[11px] text-emerald-700">
                {appliedCoupon.title} •{' '}
                {appliedCoupon.discountType === 'percentage'
                  ? `${appliedCoupon.discountValue}% OFF`
                  : `${formatCurrency(appliedCoupon.discountValue, currency)} OFF`}
              </p>
            </div>
            <button
              onClick={handleRemoveCoupon}
              className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white transition-colors cursor-pointer"
              title="Remove promo code"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleApplyCoupon} className="space-y-2">
            <div className="flex gap-2">
              <input
                type="text"
                value={couponInput}
                onChange={(e) => {
                  setCouponInput(e.target.value.toUpperCase());
                  setCouponError(null);
                }}
                placeholder="Enter promo code (e.g. WELCOME20)"
                className="flex-1 text-xs px-3 py-2 rounded-xl border border-slate-200 uppercase font-mono tracking-wider focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 text-slate-900 placeholder:text-slate-400 placeholder:normal-case placeholder:font-sans"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!couponInput.trim()}
                className="text-xs bg-slate-900 hover:bg-slate-800 text-white shrink-0 cursor-pointer disabled:opacity-40"
              >
                Apply
              </Button>
            </div>
            {couponError && (
              <p className="text-[11px] text-rose-600 font-medium pl-1">{couponError}</p>
            )}
          </form>
        )}
      </div>

      {/* Table-wide Chef Note */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
          <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
          <span>Note for the Kitchen (Optional)</span>
        </div>
        <textarea
          value={orderCustomerNote}
          onChange={(e) => setOrderCustomerNote(e.target.value)}
          placeholder="e.g. Please serve starters together, bring extra cutlery for 4 people..."
          rows={2}
          maxLength={300}
          className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
        />
      </div>

      {/* Subtotal & Estimated Taxes Breakdown */}
      <div className="bg-white rounded-2xl p-4 border border-slate-100 shadow-xs space-y-2.5 text-xs">
        <div className="flex justify-between text-slate-600">
          <span>Items Subtotal</span>
          <span>{formatCurrency(cartTotals.subtotal, currency)}</span>
        </div>
        {couponDiscountAmount > 0 && (
          <div className="flex justify-between text-emerald-600 font-semibold">
            <span>Coupon Discount ({appliedCoupon?.code})</span>
            <span>-{formatCurrency(couponDiscountAmount, currency)}</span>
          </div>
        )}
        <div className="flex justify-between text-slate-600">
          <span>Sales Tax ({restaurant?.settings?.taxPercentage ?? 8.5}%)</span>
          <span>{formatCurrency(cartTotals.taxAmount, currency)}</span>
        </div>
        <div className="flex justify-between text-slate-600">
          <span>Service Charge ({restaurant?.settings?.serviceChargePercentage ?? 10}%)</span>
          <span>{formatCurrency(cartTotals.serviceFee, currency)}</span>
        </div>
        <div className="pt-2 border-t border-slate-100 flex justify-between font-bold text-sm text-slate-900">
          <span>Estimated Total</span>
          <span className="text-blue-600 text-base">{formatCurrency(cartTotals.totalAmount, currency)}</span>
        </div>
      </div>

      {/* Security attribution */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
        <span>Prices validated against verified restaurant database records</span>
      </div>

      {/* Shop Closed Warning Banner */}
      {!isShopOpen && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center gap-2 text-amber-900 font-bold">
            <Store className="w-4 h-4 text-amber-600" />
            <span>Restaurant is Currently Closed</span>
          </div>
          <p className="text-amber-950 font-medium">
            {operatingHoursStatus.reason ||
              'Online ordering is currently paused according to the restaurant operating hours schedule.'}
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-amber-800 pt-1">
            <Clock className="w-3.5 h-3.5 text-amber-600" />
            <span>
              Today ({operatingHoursStatus.currentDayName}):{' '}
              {operatingHoursStatus.todaySchedule?.closed
                ? 'Closed all day'
                : `${operatingHoursStatus.todaySchedule?.open} to ${operatingHoursStatus.todaySchedule?.close}`}
            </span>
          </div>
        </div>
      )}

      {/* Geofence Boundary Warning */}
      {isOrderBlockedByGeofence && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl space-y-2 text-xs">
          <div className="flex items-center gap-2 text-rose-800 font-bold">
            <MapPinOff className="w-4 h-4 text-rose-600" />
            <span>Outside Restaurant Ordering Area</span>
          </div>
          <p className="text-rose-900 font-medium">
            Visit restaurant to order food, or scan QR code if you are in a different restaurant.
          </p>
          <Link href="/" className="inline-block pt-1">
            <Button size="sm" className="bg-slate-900 hover:bg-slate-800 text-white text-xs gap-1.5 shadow-xs">
              <QrCode className="w-3.5 h-3.5 text-emerald-400" />
              <span>Scan QR Code</span>
            </Button>
          </Link>
        </div>
      )}

      {/* Place Order CTA Button */}
      <div>
        <Button
          onClick={() => setIsConfirmModalOpen(true)}
          size="lg"
          disabled={isOrderBlockedByGeofence || !isShopOpen}
          className="w-full shadow-lg shadow-blue-500/20 justify-between py-4"
        >
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5" />
            <span className="font-extrabold tracking-wide">
              {!isShopOpen
                ? 'Restaurant Closed • Ordering Paused'
                : isOrderBlockedByGeofence
                ? 'Outside Ordering Area'
                : 'Review & Place Order'}
            </span>
          </div>
          <span className="font-extrabold text-base">
            {formatCurrency(cartTotals.totalAmount, currency)}
          </span>
        </Button>
      </div>

      {/* Confirmation Modal */}
      <OrderConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirmOrder={handlePlaceOrder}
        isSubmitting={isSubmitting}
      />
    </div>
  );
}

