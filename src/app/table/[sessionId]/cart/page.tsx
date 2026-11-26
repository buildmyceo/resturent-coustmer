'use client';

import React, { useState, useEffect, useMemo, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { formatCurrency } from '@/lib/format';
import { OrderConfirmModal } from '@/components/cart/OrderConfirmModal';
import { customerAudio } from '@/lib/audio';
import { isValidEmail, isValidPhone } from '@/lib/validation/customer';
import { loadRazorpayCheckoutScript } from '@/lib/razorpay-client';
import confetti from 'canvas-confetti';
import { Dish } from '@/types';
import { fetchRestaurantAndMenuDB } from '@/lib/supabase/service';
import {
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Utensils,
  MessageSquare,
  ArrowLeft,
  MapPinOff,
  QrCode,
  Tag,
  X,
  TicketPercent,
  Clock,
  Store,
  Loader2,
  CheckCircle2,
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
    broadcastOrderCreated,
  } = useCustomer();

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderCustomerNote, setOrderCustomerNote] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [paymentChoice, setPaymentChoice] = useState<'default' | 'razorpay'>('default');
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [fallbackDishes, setFallbackDishes] = useState<Dish[]>([]);

  // If menuDishes was not yet populated from context, fetch once
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

  // Filter recommendations (top-selling / chef picks not already in cart)
  const recommendedDishes = useMemo(() => {
    if (!allAvailableDishes || allAvailableDishes.length === 0) return [];
    const cartDishIds = new Set(cart.map((item) => item.dishId));

    const eligible = allAvailableDishes.filter(
      (d) => d.isAvailable && !d.isArchived && !cartDishIds.has(d.id)
    );

    const adminPicked = eligible.filter((d) => Boolean(d.featuredInCart));
    const popular = eligible
      .filter((d) => !d.featuredInCart && (d.ordersCount || 0) > 0)
      .sort((a, b) => (b.ordersCount || 0) - (a.ordersCount || 0));

    return [...adminPicked, ...popular].slice(0, 4);
  }, [allAvailableDishes, cart]);

  const currency = restaurant?.currency || 'INR';

  const geo = restaurant?.settings?.geofence;
  const hasCoordinates = typeof geo?.latitude === 'number' && typeof geo?.longitude === 'number';
  const isGeofenceConfigured = Boolean(geo && (geo.enabled !== false || hasCoordinates));
  const isOrderBlockedByGeofence = isGeofenceConfigured && isInsideGeofence !== true;

  // Compute estimated max prep time across dishes in cart
  const estimatedPrepTime = useMemo(() => {
    if (cart.length === 0) return 15;
    return 15;
  }, [cart]);

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

    if (!isValidPhone(customerPhone)) {
      showToast('Phone Required', 'Please enter a valid 10-15 digit phone number before placing your order.', 'error');
      setIsConfirmModalOpen(false);
      return;
    }

    if (!isValidEmail(customerEmail)) {
      showToast('Email Required', 'Please enter a valid email address before placing your order.', 'error');
      setIsConfirmModalOpen(false);
      return;
    }

    setIsSubmitting(true);

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
          orderType: 'dine_in',
          paymentMethod: paymentChoice === 'razorpay' ? 'razorpay' : undefined,
          customerName: participant?.name || 'Guest',
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
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

      if (data.razorpay) {
        const loaded = await loadRazorpayCheckoutScript();
        if (!loaded || !(window as any).Razorpay) {
          showToast('Payment Error', 'Could not load Razorpay checkout.', 'error');
          setIsSubmitting(false);
          return;
        }
        const rzp = new (window as any).Razorpay({
          key: data.razorpay.keyId,
          amount: data.razorpay.amountPaise,
          currency: data.razorpay.currency || 'INR',
          name: restaurant.name,
          description: `Order ${data.orderNumber}`,
          order_id: data.razorpay.orderId,
          prefill: {
            name: participant?.name || 'Guest',
            email: customerEmail.trim(),
            contact: customerPhone.trim(),
          },
          handler: async (rzpRes: any) => {
            try {
              const vRes = await fetch('/api/payment/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  purpose: 'order',
                  restaurantId: restaurant.id,
                  orderId: data.orderId,
                  razorpay_order_id: rzpRes.razorpay_order_id,
                  razorpay_payment_id: rzpRes.razorpay_payment_id,
                  razorpay_signature: rzpRes.razorpay_signature,
                }),
              });
              const vJson = await vRes.json();
              if (!vRes.ok || !vJson.success) {
                showToast('Verification Failed', vJson.error || 'Payment verification failed.', 'error');
                setIsSubmitting(false);
                return;
              }
              customerAudio.playOrderPlaced();
              clearCart();
              await refreshOrders();
              setIsSubmitting(false);
              setIsConfirmModalOpen(false);
              router.push(`/table/${sessionId}/orders`);
            } catch {
              setIsSubmitting(false);
            }
          },
          modal: {
            ondismiss: () => setIsSubmitting(false),
          },
        });
        rzp.open();
        return;
      }

      // Order Success!
      customerAudio.playOrderPlaced();

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch {
        // non-blocking
      }

      // Instant client broadcast to staff and kitchen portals via active websocket
      if (broadcastOrderCreated && restaurant?.id && table?.id && data.status !== 'pending_payment') {
        broadcastOrderCreated({
          id: data.orderId,
          order_number: data.orderNumber,
          restaurant_id: restaurant.id,
          table_id: table.id,
          table_number: (table as any)?.table_number || table.number || 'T-01',
          status: 'pending',
          total_amount: data.totalAmount,
          created_at: new Date().toISOString(),
        });
      }

      showToast(
        'Order Submitted',
        'Your order has been submitted. Please wait while our staff confirms it.',
        'success'
      );

      clearCart();
      setIsSubmitting(false);
      setIsConfirmModalOpen(false);

      await refreshOrders();
      router.push(`/table/${sessionId}/orders`);
    } catch (err: any) {
      showToast('Network Error', err?.message || 'Failed to place order.', 'error');
      setIsSubmitting(false);
      setIsConfirmModalOpen(false);
    }
  };

  const tableNumberDisplay = table?.number || 'T-01';

  // Empty Cart State
  if (cart.length === 0) {
    return (
      <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-12 pb-36 flex flex-col gap-8">
        <section className="py-20 px-6 bg-light-surface-container-lowest border border-light-outline-variant/60 rounded-2xl flex flex-col items-center text-center gap-4 max-w-lg mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-full bg-light-secondary-container/70 text-light-primary flex items-center justify-center">
            <ShoppingBag className="w-8 h-8 stroke-[1.75]" />
          </div>
          <div className="flex flex-col gap-1 max-w-md">
            <h2 className="font-headline text-2xl text-light-on-surface">Your Cart is Empty</h2>
            <p className="font-body text-xs sm:text-sm text-light-on-surface-variant text-pretty">
              You haven&apos;t added any delicious dishes or handcrafted coffees to your table cart yet.
            </p>
          </div>
          <Link
            href={`/table/${sessionId}`}
            className="mt-2 inline-flex items-center justify-center gap-2 bg-light-primary text-light-on-primary hover:bg-light-primary-container px-6 py-3 rounded-full font-label text-xs sm:text-sm font-semibold transition-colors shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Browse Restaurant Menu</span>
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="flex-1 max-w-[1200px] w-full mx-auto px-4 sm:px-6 pt-6 pb-36 flex flex-col gap-8">
      {/* Page Header */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-light-outline-variant/60 pb-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="font-headline text-2xl sm:text-3xl text-light-on-surface">Table Cart</h1>
            <span className="shrink-0 font-label text-xs sm:text-sm bg-light-secondary-container text-light-on-secondary-container px-3 py-1 rounded-full tabular-nums whitespace-nowrap font-medium">
              {cartTotals.itemCount} {cartTotals.itemCount === 1 ? 'item' : 'items'}
            </span>
          </div>
          <p className="font-body text-xs sm:text-sm text-light-on-surface-variant">
            Review your selected dishes before confirming your order for Table {tableNumberDisplay}.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={clearCart}
            type="button"
            className="inline-flex items-center gap-1.5 bg-light-surface-container-lowest border border-light-outline-variant/80 hover:border-light-error hover:text-light-error text-light-on-surface-variant px-3.5 py-2 rounded-xl text-xs font-label font-semibold transition-colors cursor-pointer shadow-2xs"
          >
            <Trash2 className="w-4 h-4" />
            <span>Clear Cart</span>
          </button>
        </div>
      </section>

      {/* Populated Cart Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Cart Items, Kitchen Note, Coupons & Pairings */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Cart Items List */}
          <section aria-label="Items in table cart" className="flex flex-col gap-4">
            {cart.map((item) => {
              const dietaryLower = String(item.dietaryType || '').toLowerCase();
              const isVeg = (dietaryLower.includes('veg') && !dietaryLower.includes('non')) || dietaryLower === 'vegan';
              const hasPhoto = Boolean(item.dishImage && item.dishImage.trim() !== '');

              return (
                <article
                  key={item.cartItemId}
                  className="cart-row bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                    <div className="relative w-20 h-20 rounded-xl overflow-hidden bg-light-surface-container-low shrink-0 border border-light-outline-variant/40">
                      {hasPhoto ? (
                        <Image
                          src={item.dishImage}
                          alt={item.dishName}
                          fill
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-light-outline bg-light-surface-container">
                          <Utensils className="w-6 h-6 stroke-[1.5]" />
                        </div>
                      )}
                      {/* Veg / Non-Veg Indicator */}
                      <span
                        className={`absolute top-1.5 left-1.5 w-4 h-4 rounded-xs bg-light-surface-container-lowest border ${
                          isVeg ? 'border-veg' : 'border-rose-600'
                        } flex items-center justify-center`}
                        title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
                      >
                        {isVeg ? (
                          <span className="w-2 h-2 rounded-full bg-veg" />
                        ) : (
                          <span className="w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[6px] border-b-rose-600" />
                        )}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-title text-base font-semibold text-light-on-surface truncate">
                          {item.dishName}
                        </h2>
                      </div>
                      <p className="font-body text-xs text-light-on-surface-variant line-clamp-1">
                        {item.variantName ? `Option: ${item.variantName}` : '1 portion'}
                        {item.selectedAddons.length > 0 &&
                          ` • ${item.selectedAddons.map((a) => a.name).join(', ')}`}
                      </p>
                      {item.specialInstructions && (
                        <span className="font-body text-[11px] text-warning bg-amber-badge/40 px-2 py-0.5 rounded-md inline-block max-w-fit">
                          Note: &quot;{item.specialInstructions}&quot;
                        </span>
                      )}
                      <span className="font-label text-xs font-semibold text-light-on-surface-variant tabular-nums">
                        {formatCurrency(item.unitPrice, currency)} each
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-light-outline-variant/40 shrink-0">
                    <div className="inline-flex items-center gap-2 bg-light-surface-container-low border border-light-outline-variant rounded-lg px-2 py-1">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.cartItemId, item.quantity - 1)}
                        className="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-light-surface-container-high text-light-on-surface transition-colors cursor-pointer"
                        aria-label={`Decrease ${item.dishName} quantity`}
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="font-label text-sm font-semibold text-light-on-surface tabular-nums min-w-4 text-center">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.cartItemId, item.quantity + 1)}
                        className="w-7 h-7 inline-flex items-center justify-center rounded hover:bg-light-surface-container-high text-light-on-surface transition-colors cursor-pointer"
                        aria-label={`Increase ${item.dishName} quantity`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-title text-base font-semibold text-light-on-surface tabular-nums min-w-[76px] text-right">
                        {formatCurrency(item.totalPrice, currency)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.cartItemId)}
                        className="w-8 h-8 inline-flex items-center justify-center rounded-full text-light-on-surface-variant hover:text-light-error hover:bg-light-error-container/40 transition-colors cursor-pointer"
                        aria-label={`Remove ${item.dishName}`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>

          {/* Special Kitchen Instructions */}
          <section
            aria-label="Special instructions"
            className="bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-4 flex flex-col gap-2 shadow-xs"
          >
            <label htmlFor="kitchen-note" className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-light-primary" />
              <span className="font-title text-sm font-semibold text-light-on-surface">
                Note for Kitchen &amp; Barista
              </span>
            </label>
            <textarea
              id="kitchen-note"
              rows={2}
              value={orderCustomerNote}
              onChange={(e) => setOrderCustomerNote(e.target.value)}
              placeholder="Any allergies, spice level, or coffee strength preferences..."
              className="w-full rounded-xl border border-light-outline-variant/80 bg-light-surface-container-low px-3.5 py-2.5 font-body text-xs sm:text-sm text-light-on-surface placeholder:text-light-on-surface-variant focus:border-light-primary focus:ring-1 focus:ring-light-primary outline-none transition-all"
            />
          </section>

          {/* Offers & Promo Code Section */}
          <section
            aria-label="Offers and promo code"
            className="bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-4 flex flex-col gap-3 shadow-xs"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-light-on-surface">
                <TicketPercent className="w-4 h-4 text-light-primary" />
                <span>Offers &amp; Promo Code</span>
              </div>
              {appliedCoupon && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-light-secondary-container text-light-on-secondary-container">
                  Applied
                </span>
              )}
            </div>

            {appliedCoupon ? (
              <div className="flex items-center justify-between p-3 rounded-xl bg-light-secondary-container/50 border border-light-secondary">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-light-primary" />
                    <span className="font-mono font-bold text-xs text-light-primary">{appliedCoupon.code}</span>
                  </div>
                  <p className="text-[11px] text-light-on-secondary-container">
                    {appliedCoupon.title} •{' '}
                    {appliedCoupon.discountType === 'percentage'
                      ? `${appliedCoupon.discountValue}% OFF`
                      : `${formatCurrency(appliedCoupon.discountValue, currency)} OFF`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveCoupon}
                  className="p-1 text-light-on-surface-variant hover:text-light-error rounded-lg transition-colors cursor-pointer"
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
                    className="flex-1 text-xs px-3.5 py-2.5 rounded-xl border border-light-outline-variant/80 bg-light-surface-container-low uppercase font-mono tracking-wider focus:outline-none focus:ring-1 focus:ring-light-primary focus:border-light-primary text-light-on-surface placeholder:text-light-outline placeholder:normal-case placeholder:font-sans"
                  />
                  <button
                    type="submit"
                    disabled={!couponInput.trim()}
                    className="px-4 py-2 text-xs font-semibold rounded-xl bg-light-inverse-surface text-light-inverse-on-surface hover:bg-light-on-surface shrink-0 cursor-pointer disabled:opacity-40 transition-colors"
                  >
                    Apply
                  </button>
                </div>
                {couponError && (
                  <p className="text-[11px] text-light-error font-medium pl-1">{couponError}</p>
                )}
              </form>
            )}
          </section>

          {/* Quick Pairings: Complete Your Table Order */}
          {recommendedDishes.length > 0 && (
            <section aria-label="Frequently paired with" className="flex flex-col gap-3">
              <h2 className="font-headline text-lg sm:text-xl text-light-on-surface">
                Complete Your Table Order
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {recommendedDishes.map((dish) => {
                  const hasPhoto = Boolean(dish.image && dish.image.trim() !== '');
                  return (
                    <article
                      key={dish.id}
                      className="h-full bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-3 flex items-center justify-between gap-3 shadow-xs hover:border-light-primary/40 transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative w-14 h-14 rounded-xl overflow-hidden bg-light-surface-container-low shrink-0 border border-light-outline-variant/40">
                          {hasPhoto ? (
                            <Image
                              src={dish.image}
                              alt={dish.name}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-light-outline">
                              <Utensils className="w-5 h-5 stroke-[1.5]" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <h3 className="font-title text-sm font-semibold text-light-on-surface truncate">
                            {dish.name}
                          </h3>
                          <span className="font-body text-xs text-light-on-surface-variant tabular-nums">
                            {formatCurrency(dish.price, currency)}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          addToCart(dish);
                          customerAudio.playTap();
                        }}
                        className="shrink-0 bg-light-surface-container-lowest text-light-primary border border-light-primary hover:bg-light-primary hover:text-light-on-primary px-3 py-1.5 rounded-lg font-label text-xs font-semibold transition-colors cursor-pointer"
                      >
                        Add
                      </button>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Right Column: Order Summary */}
        <aside
          aria-label="Order summary"
          className="lg:col-span-4 bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-6 flex flex-col gap-5 lg:sticky lg:top-24 shadow-xs"
        >
          <div className="flex items-center justify-between gap-2 border-b border-light-surface-container pb-3">
            <h2 className="font-headline text-xl text-light-on-surface">Order Summary</h2>
            <span className="font-mono text-xs font-semibold bg-amber-badge text-on-amber-badge px-2.5 py-0.5 rounded-full tabular-nums">
              {tableNumberDisplay}
            </span>
          </div>

          <div className="flex items-center gap-2 bg-light-secondary-container/50 text-light-on-secondary-container px-3.5 py-2.5 rounded-xl text-xs">
            <Clock className="w-4 h-4 shrink-0 text-light-primary" />
            <span className="font-body text-xs">Estimated prep time: {estimatedPrepTime}–18 mins</span>
          </div>

          <dl className="flex flex-col gap-2 text-xs sm:text-sm">
            <div className="flex items-center justify-between">
              <dt className="font-body text-light-on-surface-variant">Items Subtotal</dt>
              <dd className="font-body text-light-on-surface tabular-nums">
                {formatCurrency(cartTotals.subtotal, currency)}
              </dd>
            </div>

            {couponDiscountAmount > 0 && (
              <div className="flex items-center justify-between text-light-primary font-medium">
                <dt className="font-body">Coupon Discount ({appliedCoupon?.code})</dt>
                <dd className="font-body tabular-nums">
                  -{formatCurrency(couponDiscountAmount, currency)}
                </dd>
              </div>
            )}

            {restaurant?.settings?.taxEnabled !== false && cartTotals.taxAmount > 0 && (
              <div className="flex items-center justify-between">
                <dt className="font-body text-light-on-surface-variant flex items-center gap-1.5 flex-wrap">
                  <span>{restaurant?.settings?.taxName || 'GST / Tax'} ({restaurant?.settings?.taxPercentage ?? 5}%)</span>
                  {restaurant?.settings?.gstNumber && (
                    <span className="text-[10px] bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-mono font-medium border border-slate-200">
                      GSTIN: {restaurant.settings.gstNumber}
                    </span>
                  )}
                </dt>
                <dd className="font-body text-light-on-surface tabular-nums">
                  {formatCurrency(cartTotals.taxAmount, currency)}
                </dd>
              </div>
            )}

            {restaurant?.settings?.serviceChargeEnabled === true && cartTotals.serviceFee > 0 && (
              <div className="flex items-center justify-between">
                <dt className="font-body text-light-on-surface-variant">
                  Service Charge ({restaurant?.settings?.serviceChargePercentage ?? 5}%)
                </dt>
                <dd className="font-body text-light-on-surface tabular-nums">
                  {formatCurrency(cartTotals.serviceFee, currency)}
                </dd>
              </div>
            )}

            <div className="flex items-center justify-between pt-3 border-t border-light-outline-variant/60">
              <dt className="font-title text-base font-semibold text-light-on-surface">Order Total</dt>
              <dd className="font-title text-xl font-bold text-light-primary tabular-nums">
                {formatCurrency(cartTotals.totalAmount, currency)}
              </dd>
            </div>
          </dl>

          {restaurant?.settings?.payFirstEnabled || (restaurant as any)?.payFirstEnabled ? (
            <div className="p-3 bg-amber-50 border border-amber-200/90 rounded-xl space-y-1 text-xs">
              <span className="font-bold text-amber-900 block">Pay First &amp; Show Receipt to Cashier</span>
              <p className="font-body text-amber-800 leading-relaxed">
                Please complete payment and show your receipt to the cashier. The cashier will approve your order, sending it straight to the kitchen to begin cooking. Both you and your waiter will be notified when food is ready!
              </p>
            </div>
          ) : (
            <p className="font-body text-xs text-light-on-surface-variant leading-relaxed">
              No immediate payment required. Items are added to your running table bill.
            </p>
          )}

          {/* Shop Closed Alert */}
          {!isShopOpen && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-xl space-y-1 text-xs">
              <div className="flex items-center gap-1.5 text-amber-900 font-bold">
                <Store className="w-3.5 h-3.5 text-amber-600" />
                <span>Restaurant Closed</span>
              </div>
              <p className="text-amber-950 text-[11px]">
                {operatingHoursStatus.reason || 'Ordering is paused outside operating hours.'}
              </p>
            </div>
          )}

          {/* Geofence Boundary Alert */}
          {isOrderBlockedByGeofence && (
            <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl space-y-1 text-xs">
              <div className="flex items-center gap-1.5 text-rose-800 font-bold">
                <MapPinOff className="w-3.5 h-3.5 text-rose-600" />
                <span>Outside Restaurant Area</span>
              </div>
              <p className="text-rose-900 text-[11px]">
                Visit restaurant to order food, or scan table QR code.
              </p>
            </div>
          )}

          {/* Mandatory Customer Contact (R3) */}
          <div className="p-3.5 bg-light-surface-container-low border border-light-outline-variant/60 rounded-xl space-y-2.5">
            <p className="text-xs font-bold text-light-on-surface">
              Contact Details (Required before ordering)
            </p>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="Phone number * (e.g. +91 9876543210)"
              className="w-full px-3 py-2 text-xs bg-white border border-light-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-light-primary/20"
              required
            />
            <input
              type="email"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
              placeholder="Email address * (for order & receipt)"
              className="w-full px-3 py-2 text-xs bg-white border border-light-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-light-primary/20"
              required
            />
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setPaymentChoice('default')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  paymentChoice === 'default'
                    ? 'bg-light-primary text-white border-light-primary'
                    : 'bg-white text-light-on-surface border-light-outline-variant'
                }`}
              >
                {(restaurant?.settings?.payFirstEnabled || (restaurant as any)?.payFirstEnabled)
                  ? 'Pay at Counter'
                  : 'Pay After Meal'}
              </button>
              <button
                type="button"
                onClick={() => setPaymentChoice('razorpay')}
                className={`flex-1 py-1.5 px-2.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                  paymentChoice === 'razorpay'
                    ? 'bg-light-primary text-white border-light-primary'
                    : 'bg-white text-light-on-surface border-light-outline-variant'
                }`}
              >
                Pay Now (Razorpay)
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <button
              id="place-order-btn"
              type="button"
              onClick={() => {
                if (!isValidPhone(customerPhone)) {
                  showToast('Phone Required', 'Please enter a valid 10-15 digit phone number.', 'error');
                  return;
                }
                if (!isValidEmail(customerEmail)) {
                  showToast('Email Required', 'Please enter a valid email address.', 'error');
                  return;
                }
                setIsConfirmModalOpen(true);
              }}
              disabled={isOrderBlockedByGeofence || !isShopOpen || isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-light-primary text-light-on-primary hover:bg-light-primary-container active:scale-[0.99] px-5 py-3.5 rounded-full font-label text-sm font-semibold transition-all shadow-md shadow-light-primary/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Utensils className="w-5 h-5" />
              )}
              <span>
                {!isShopOpen
                  ? 'Restaurant Closed'
                  : isOrderBlockedByGeofence
                  ? 'Outside Ordering Area'
                  : (restaurant?.settings?.payFirstEnabled || (restaurant as any)?.payFirstEnabled)
                  ? `Pay & Show Receipt • ${formatCurrency(cartTotals.totalAmount, currency)}`
                  : `Confirm Order • ${formatCurrency(cartTotals.totalAmount, currency)}`}
              </span>
            </button>

            <Link
              href={`/table/${sessionId}`}
              className="w-full inline-flex items-center justify-center gap-2 bg-light-surface-container-lowest text-light-primary border border-light-primary hover:bg-light-secondary-container/40 px-5 py-2.5 rounded-full font-label text-sm font-semibold transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Add More Dishes</span>
            </Link>
          </div>
        </aside>
      </div>

      {/* Confirmation Modal */}
      <OrderConfirmModal
        isOpen={isConfirmModalOpen}
        onClose={() => setIsConfirmModalOpen(false)}
        onConfirmOrder={handlePlaceOrder}
        isSubmitting={isSubmitting}
      />
    </main>
  );
}
