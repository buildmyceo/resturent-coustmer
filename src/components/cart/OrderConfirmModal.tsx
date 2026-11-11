'use client';

import React from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { formatCurrency } from '@/lib/format';
import { Utensils, X, Clock, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface OrderConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmOrder: () => void;
  isSubmitting: boolean;
}

export function OrderConfirmModal({ isOpen, onClose, onConfirmOrder, isSubmitting }: OrderConfirmModalProps) {
  const { restaurant, table, cart, cartTotals, participant } = useCustomer();

  if (!isOpen) return null;

  const currency = restaurant?.currency || 'USD';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="fixed inset-0" onClick={onClose} />

      <div className="relative w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden p-6 z-10 animate-in slide-in-from-bottom duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 text-[11px] font-bold rounded-lg border border-amber-200/60">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Waiter Confirmation Queue</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-2">Confirm Your Table Order</h2>
            <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
              Your order will be sent to the floor waiter for validation before kitchen preparation begins.
            </p>
          </div>

          {/* Table & Host Overview */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 block">Dining Table</span>
              <span className="font-bold text-slate-900">{table?.number} • {table?.name}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 block">Ordered By</span>
              <span className="font-bold text-blue-600">{participant?.name || 'Guest'}</span>
            </div>
          </div>

          {/* Ordered Dishes Summary */}
          <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
            {cart.map((item) => (
              <div
                key={item.cartItemId}
                className="flex items-start justify-between py-2 border-b border-slate-100 last:border-0 text-xs"
              >
                <div className="flex-1 pr-2">
                  <div className="font-semibold text-slate-900">
                    {item.quantity}x {item.dishName}
                    {item.variantName && (
                      <span className="text-slate-500 font-normal"> ({item.variantName})</span>
                    )}
                  </div>
                  {item.selectedAddons.length > 0 && (
                    <div className="text-[11px] text-slate-500">
                      +{item.selectedAddons.map((a) => a.name).join(', ')}
                    </div>
                  )}
                  {item.specialInstructions && (
                    <div className="text-[11px] text-amber-700 italic mt-0.5">
                      &quot;{item.specialInstructions}&quot;
                    </div>
                  )}
                </div>
                <div className="font-bold text-slate-900 shrink-0">
                  {formatCurrency(item.totalPrice, currency)}
                </div>
              </div>
            ))}
          </div>

          {/* Totals Breakdown */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal ({cartTotals.itemCount} items)</span>
              <span>{formatCurrency(cartTotals.subtotal, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Estimated Taxes &amp; Fees</span>
              <span>{formatCurrency(cartTotals.taxAmount + cartTotals.serviceFee, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-900 font-black text-sm pt-2 border-t border-slate-200">
              <span>Total Amount</span>
              <span className="text-blue-600">{formatCurrency(cartTotals.totalAmount, currency)}</span>
            </div>
          </div>

          {/* Action buttons */}
          <div className="pt-2 space-y-2">
            <Button
              onClick={onConfirmOrder}
              isLoading={isSubmitting}
              className="w-full gap-2 shadow-md cursor-pointer"
              size="lg"
            >
              <span>Confirm Order</span>
              <ArrowRight className="w-4 h-4" />
            </Button>

            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer text-center"
            >
              Back to Menu &amp; Cart
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
