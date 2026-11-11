'use client';

import React, { use } from 'react';
import Link from 'next/link';
import { useCustomer } from '@/context/CustomerContext';
import { formatCurrency, formatTime } from '@/lib/format';
import { OrderProgressStepper } from '@/components/orders/OrderProgressStepper';
import {
  Clock,
  UtensilsCrossed,
  Receipt,
  Plus,
  RefreshCw,
  Users,
  CheckCircle2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface OrdersPageProps {
  params: Promise<{ sessionId: string }>;
}

export default function OrderTrackingPage({ params }: OrdersPageProps) {
  const resolvedParams = use(params);
  const sessionId = resolvedParams.sessionId;

  const { orders, refreshOrders, isOrdersLoading, restaurant, table } = useCustomer();
  const currency = restaurant?.currency || 'USD';

  if (orders.length === 0 && !isOrdersLoading) {
    return (
      <div className="px-4 py-20 text-center space-y-5">
        <div className="w-20 h-20 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100 shadow-xs">
          <Clock className="w-9 h-9 stroke-[1.75]" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-slate-900">No Orders Placed Yet</h2>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Dishes placed by anyone at {table?.number || 'this table'} will appear here in real time.
          </p>
        </div>
        <div className="pt-2">
          <Link href={`/table/${sessionId}`}>
            <Button size="lg" className="shadow-md gap-2">
              <Plus className="w-4 h-4" />
              <span>Browse Menu & Order</span>
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Active vs Served orders count
  const activeOrders = orders.filter((o) =>
    ['pending', 'accepted', 'preparing', 'ready'].includes(o.status)
  );

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">Live Table Orders</h1>
            {activeOrders.length > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                {activeOrders.length} Preparing
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Realtime synchronization with Kitchen Display System & Waiter staff
          </p>
        </div>

        <button
          onClick={() => refreshOrders()}
          disabled={isOrdersLoading}
          className="p-2 text-slate-500 hover:text-slate-800 rounded-xl hover:bg-slate-100 transition-colors"
          title="Refresh orders"
        >
          <RefreshCw className={`w-4 h-4 ${isOrdersLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {orders.map((order) => {
          const isPending = order.status === 'pending';
          const isReady = order.status === 'ready';
          const isServed = order.status === 'served' || order.status === 'completed';

          return (
            <div
              key={order.id}
              className={`bg-white rounded-3xl p-5 border shadow-xs transition-all duration-300 space-y-4 ${
                isReady
                  ? 'border-emerald-300 ring-2 ring-emerald-500/10 shadow-md'
                  : 'border-slate-100'
              }`}
            >
              {/* Order Header */}
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900">
                      Order #{order.orderNumber}
                    </span>
                    {order.participantName && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md font-medium">
                        <Users className="w-3 h-3" />
                        {order.participantName}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Placed at {formatTime(order.orderTime || order.createdAt)}
                  </span>
                </div>

                <div className="text-right">
                  <span className="text-sm font-black text-slate-900 block">
                    {formatCurrency(order.totalAmount, currency)}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {order.items.reduce((sum, i) => sum + i.quantity, 0)} items
                  </span>
                </div>
              </div>

              {/* Ready Food Highlight Banner */}
              {isReady && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center gap-2.5 text-emerald-800 text-xs font-semibold animate-in zoom-in-95">
                  <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Ready! Staff is currently serving your fresh food to the table.</span>
                </div>
              )}

              {/* Visual Progress Stepper */}
              <OrderProgressStepper status={order.status} />

              {/* Itemized Dish List */}
              <div className="pt-2 border-t border-slate-50 space-y-2">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between text-xs py-1"
                  >
                    <div className="flex-1 pr-2">
                      <span className="font-semibold text-slate-800">
                        {item.quantity}x {item.dishName}
                      </span>
                      {item.variantName && (
                        <span className="text-slate-500 font-normal"> ({item.variantName})</span>
                      )}
                      {item.notes && (
                        <div className="text-[11px] text-amber-700 italic">
                          &quot;{item.notes}&quot;
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-slate-700 shrink-0">
                      {formatCurrency(item.unitPrice * item.quantity, currency)}
                    </span>
                  </div>
                ))}

                {order.customerNote && (
                  <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-xl mt-2">
                    <strong>Note:</strong> {order.customerNote}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Navigation Actions */}
      <div className="pt-4 flex items-center gap-3">
        <Link href={`/table/${sessionId}`} className="flex-1">
          <Button variant="outline" size="lg" className="w-full gap-2">
            <Plus className="w-4 h-4" />
            <span>Order More Dishes</span>
          </Button>
        </Link>
        <Link href={`/table/${sessionId}/bill`} className="flex-1">
          <Button size="lg" className="w-full gap-2 shadow-md">
            <Receipt className="w-4 h-4" />
            <span>View Table Bill</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
