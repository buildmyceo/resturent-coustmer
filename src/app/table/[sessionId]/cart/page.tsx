'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useCustomer } from '@/context/CustomerContext';
import { DietaryBadge } from '@/components/menu/DietaryBadge';
import { formatCurrency } from '@/lib/format';
import { OrderConfirmModal } from '@/components/cart/OrderConfirmModal';
import { customerAudio } from '@/lib/audio';
import confetti from 'canvas-confetti';
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
    cartTotals,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    participant,
    showToast,
    refreshOrders,
    isInsideGeofence,
    customerLocation,
  } = useCustomer();

  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderCustomerNote, setOrderCustomerNote] = useState('');

  const currency = restaurant?.currency || 'USD';

  // Handle final order submission
  const handlePlaceOrder = async () => {
    if (cart.length === 0 || !restaurant?.id || !table?.id) return;

    if (isInsideGeofence === false) {
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
              <div className="relative w-16 h-16 rounded-xl overflow-hidden bg-slate-100 shrink-0">
                <Image
                  src={item.dishImage || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80'}
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

      {/* Geofence Boundary Warning */}
      {isInsideGeofence === false && (
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
          disabled={isInsideGeofence === false}
          className="w-full shadow-lg shadow-blue-500/20 justify-between py-4"
        >
          <div className="flex items-center gap-2">
            <Utensils className="w-5 h-5" />
            <span className="font-extrabold tracking-wide">
              {isInsideGeofence === false ? 'Outside Ordering Area' : 'Review & Place Order'}
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

