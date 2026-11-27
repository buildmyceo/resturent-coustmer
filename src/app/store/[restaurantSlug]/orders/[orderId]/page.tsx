'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  CreditCard,
  HelpCircle,
  Loader2,
  MapPin,
  Package,
  Phone,
  Truck,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { loadRazorpayCheckoutScript } from '@/lib/razorpay-client';
import { createClient } from '@/lib/supabase/client';

export default function DeliveryOrderTrackerPage() {
  const params = useParams<{ restaurantSlug: string; orderId: string }>();
  const searchParams = useSearchParams();
  const restaurantSlug = params?.restaurantSlug || '';
  const orderId = params?.orderId || '';
  const guestToken = searchParams.get('token') || '';

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [paying, setPaying] = useState(false);

  const fetchOrder = async () => {
    try {
      const qs = new URLSearchParams({ orderId });
      if (guestToken) qs.set('guestToken', guestToken);
      const res = await fetch(`/api/orders/track?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.orders?.length > 0) {
        setOrder(json.orders[0]);
      } else {
        setError(json.error || 'Order not found.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load order.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrder();
    const interval = setInterval(fetchOrder, 8000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, guestToken]);

  useEffect(() => {
    if (!order?.restaurantId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`restaurant:${order.restaurantId}`)
      .on('broadcast', { event: 'ORDER_UPDATED' }, () => fetchOrder())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.restaurantId]);

  const handlePayNow = async () => {
    if (!order?.id || !order?.restaurantId) return;
    setPaying(true);
    setError(null);
    try {
      const res = await fetch('/api/payment/create-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purpose: 'order',
          restaurantId: order.restaurantId,
          orderId: order.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success || !json.razorpay) {
        setError(json.error || 'Could not initiate payment.');
        setPaying(false);
        return;
      }

      const loaded = await loadRazorpayCheckoutScript();
      if (!loaded || !(window as any).Razorpay) {
        setError('Unable to load Razorpay payment gateway.');
        setPaying(false);
        return;
      }

      const rzp = new (window as any).Razorpay({
        key: json.razorpay.keyId,
        amount: json.razorpay.amountPaise,
        currency: json.razorpay.currency || 'INR',
        name: order.restaurantName || 'Restaurant',
        description: `Order #${order.orderNumber}`,
        order_id: json.razorpay.orderId,
        prefill: {
          name: order.customerName || undefined,
          email: order.customerEmail || undefined,
          contact: order.customerPhone || undefined,
        },
        handler: async (response: any) => {
          try {
            const verifyRes = await fetch('/api/payment/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                purpose: 'order',
                restaurantId: order.restaurantId,
                orderId: order.id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const verifyJson = await verifyRes.json();
            if (!verifyRes.ok || !verifyJson.success) {
              setError(verifyJson.error || 'Payment verification failed.');
            } else {
              await fetchOrder();
            }
          } catch (vErr: any) {
            setError(vErr?.message || 'Payment verification failed.');
          } finally {
            setPaying(false);
          }
        },
        modal: {
          ondismiss: () => setPaying(false),
        },
      });
      rzp.open();
    } catch (err: any) {
      setError(err?.message || 'Payment failed.');
      setPaying(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />
      </main>
    );
  }

  if (!order) {
    return (
      <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-3">
          <Package className="w-10 h-10 text-slate-400 mx-auto" />
          <h1 className="text-lg font-bold text-slate-900">Order Not Found</h1>
          <p className="text-sm text-slate-600">{error || 'Unable to locate this order.'}</p>
        </div>
      </main>
    );
  }

  const isDelivered = order.deliveryStatus === 'delivered';
  const isCancelled = ['cancelled', 'rejected'].includes(String(order.status || '').toLowerCase());
  const canPayNow = !isDelivered && !isCancelled && order.paymentStatus !== 'paid';

  return (
    <main className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <Link
          href={`/store/${restaurantSlug}`}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {order.restaurantName || 'Menu'}
        </Link>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-5 shadow-xs">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                {order.orderType === 'delivery' ? 'Home Delivery' : 'Dine-In Order'}
              </span>
              <h1 className="text-2xl font-bold text-slate-900 mt-0.5">#{order.orderNumber}</h1>
              <p className="text-xs text-slate-500 mt-1">
                Payment: <strong className="uppercase">{order.paymentStatus}</strong>
              </p>
            </div>

            <div className="px-3.5 py-1.5 rounded-full bg-slate-900 text-white text-xs font-semibold uppercase">
              {order.deliveryStatus === 'delivered'
                ? 'Delivered · Done'
                : order.orderType === 'delivery' &&
                  (order.deliveryStatus === 'out_for_delivery' ||
                    order.status === 'ready' ||
                    order.status === 'completed')
                ? 'Out for Delivery'
                : order.deliveryStatus || order.status}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
              {error}
            </div>
          )}

          {order.deliveryAddress && (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-sm space-y-1">
              <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-orange-600" />
                Delivery Address
              </p>
              <p className="text-slate-600">{order.deliveryAddress}</p>
              {order.deliveryLandmark && (
                <p className="text-xs text-slate-500">Landmark: {order.deliveryLandmark}</p>
              )}
            </div>
          )}

          <div className="divide-y divide-slate-100 text-sm">
            {(order.items || []).map((item: any) => (
              <div key={item.id} className="py-2.5 flex justify-between">
                <span className="text-slate-700">
                  {item.quantity}× {item.dishName}
                </span>
                <span className="font-semibold text-slate-900">
                  {formatCurrency(item.unitPrice * item.quantity, 'INR')}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-slate-200 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatCurrency(order.subtotal, 'INR')}</span>
            </div>
            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Delivery Fee</span>
                <span>{formatCurrency(order.deliveryFee, 'INR')}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base text-slate-900 pt-1">
              <span>Total</span>
              <span>{formatCurrency(order.totalAmount, 'INR')}</span>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowHelp((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 cursor-pointer"
            >
              <HelpCircle className="w-4 h-4 text-orange-600" />
              Help
            </button>

            {canPayNow && (
              <button
                type="button"
                onClick={handlePayNow}
                disabled={paying}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {paying ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Opening Razorpay...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    Pay Now · {formatCurrency(order.totalAmount, 'INR')}
                  </>
                )}
              </button>
            )}
          </div>

          {showHelp && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 text-xs space-y-2">
              <p className="font-bold text-slate-900">
                Need help with your order? Contact {order.restaurantName || 'Restaurant'}
              </p>
              {order.restaurantPhone && (
                <p className="text-slate-700 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                  <a
                    href={`tel:${order.restaurantPhone}`}
                    className="font-semibold text-orange-700 hover:underline"
                  >
                    {order.restaurantPhone}
                  </a>
                </p>
              )}
              {order.restaurantAddress && (
                <p className="text-slate-700 flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-orange-600 shrink-0 mt-0.5" />
                  <span>{order.restaurantAddress}</span>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
