'use client';

import React from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { formatCurrency } from '@/lib/format';
import { Utensils, X, ShieldCheck } from 'lucide-react';
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
          className="absolute top-4 right-4 p-1.5 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-lg border border-blue-200/60">
              <Utensils className="w-3.5 h-3.5 text-blue-600" />
              <span>Confirm Kitchen Order</span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 mt-2">Ready to place your order?</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              This will be sent directly to the kitchen display system at{' '}
              <strong>{restaurant?.name}</strong> for <strong>{table?.number || 'your table'}</strong>.
            </p>
          </div>

          {/* Table & Host Overview */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-100 flex items-center justify-between text-xs">
            <div>
              <span className="text-slate-500 block">Dining At</span>
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
              <span>Estimated Tax ({restaurant?.settings?.taxPercentage ?? 8.5}%)</span>
              <span>{formatCurrency(cartTotals.taxAmount, currency)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Service Fee ({restaurant?.settings?.serviceChargePercentage ?? 10}%)</span>
              <span>{formatCurrency(cartTotals.serviceFee, currency)}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-sm">
              <span>Estimated Total</span>
              <span className="text-blue-600">{formatCurrency(cartTotals.totalAmount, currency)}</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 text-[11px] text-slate-400 justify-center">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Final totals calculated securely on server using price snapshots</span>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1"
            >
              Back
            </Button>
            <Button
              onClick={onConfirmOrder}
              isLoading={isSubmitting}
              className="flex-1 shadow-md"
            >
              PLACE ORDER
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
