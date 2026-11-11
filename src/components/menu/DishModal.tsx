'use client';

import React, { useState, useMemo } from 'react';
import Image from 'next/image';
import { Dish, DishVariant, DishAddon } from '@/types';
import { DietaryBadge } from './DietaryBadge';
import { formatCurrency } from '@/lib/format';
import { X, Clock, AlertTriangle, Plus, Minus, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface DishModalProps {
  dish: Dish | null;
  currency?: string;
  onClose: () => void;
  onAddToCart: (
    dish: Dish,
    options: {
      variantId?: string;
      variantName?: string;
      variantPrice?: number;
      selectedAddons: { id: string; name: string; additionalPrice: number }[];
      quantity: number;
      specialInstructions?: string;
    }
  ) => void;
}

export function DishModal({ dish, currency = 'USD', onClose, onAddToCart }: DishModalProps) {
  // Variants selection (radio: single select)
  const defaultVariant = dish?.variants && dish.variants.length > 0 ? dish.variants[0] : null;
  const [selectedVariant, setSelectedVariant] = useState<DishVariant | null>(defaultVariant);

  // Addons selection (checkboxes: multi-select)
  const [selectedAddonIds, setSelectedAddonIds] = useState<string[]>([]);

  // Quantity
  const [quantity, setQuantity] = useState(1);

  // Special instructions
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Calculate live total price
  const totalPrice = useMemo(() => {
    if (!dish) return 0;
    const base = selectedVariant ? Number(selectedVariant.price) : Number(dish.price);
    const addonsTotal = (dish.addons || [])
      .filter((a) => selectedAddonIds.includes(a.id))
      .reduce((sum, a) => sum + Number(a.additionalPrice), 0);
    return (base + addonsTotal) * quantity;
  }, [dish, selectedVariant, selectedAddonIds, quantity]);

  if (!dish) return null;

  const toggleAddon = (addonId: string) => {
    setSelectedAddonIds((prev) =>
      prev.includes(addonId) ? prev.filter((id) => id !== addonId) : [...prev, addonId]
    );
  };

  const handleConfirmAddToCart = () => {
    const selectedAddonsObjects = (dish.addons || [])
      .filter((a) => selectedAddonIds.includes(a.id))
      .map((a) => ({ id: a.id, name: a.name, additionalPrice: Number(a.additionalPrice) }));

    onAddToCart(dish, {
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
      variantPrice: selectedVariant ? Number(selectedVariant.price) : undefined,
      selectedAddons: selectedAddonsObjects,
      quantity,
      specialInstructions: specialInstructions.trim() || undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="fixed inset-0"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[85vh] z-10 animate-in slide-in-from-bottom duration-300">
        {/* Floating Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-slate-900/70 hover:bg-slate-900 text-white flex items-center justify-center transition-colors shadow-md backdrop-blur-md"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Hero Image */}
        <div className="relative h-60 w-full shrink-0 bg-slate-100">
          <Image
            src={dish.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&auto=format&fit=crop&q=80'}
            alt={dish.name}
            fill
            className="object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/60 via-transparent to-transparent" />

          {/* Floating Pill Details */}
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-white">
            <div className="flex items-center gap-2">
              <div className="bg-white/90 backdrop-blur-md px-2.5 py-1 rounded-lg">
                <DietaryBadge type={dish.dietaryType} showText />
              </div>
              {dish.prepTime > 0 && (
                <div className="bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-blue-400" />
                  <span>{dish.prepTime} mins</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Customization Content */}
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* Header Info */}
          <div>
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-bold text-slate-900 leading-snug">{dish.name}</h2>
              <div className="text-lg font-bold text-blue-600 shrink-0">
                {formatCurrency(dish.price, currency)}
              </div>
            </div>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">{dish.description}</p>

            {/* Allergens Notice */}
            {dish.allergens && dish.allergens.length > 0 && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-xl">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>
                  <strong>Allergens:</strong> {dish.allergens.join(', ')}
                </span>
              </div>
            )}
          </div>

          {/* 1. Variants Selection (Sizes / Doneness) */}
          {dish.variants && dish.variants.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Select Variant / Option</h3>
                <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  Required
                </span>
              </div>

              <div className="space-y-2">
                {dish.variants.map((v) => {
                  const isSelected = selectedVariant?.id === v.id;
                  return (
                    <label
                      key={v.id}
                      onClick={() => setSelectedVariant(v)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-colors ${
                            isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>
                        <span className="text-sm font-semibold text-slate-800">{v.name}</span>
                      </div>
                      <span className="text-xs font-bold text-slate-900">
                        {formatCurrency(v.price, currency)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. Add-ons Selection (Extra Truffles, Sauce, etc.) */}
          {dish.addons && dish.addons.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Add-ons & Extras</h3>
                <span className="text-[11px] text-slate-400 font-medium">Optional</span>
              </div>

              <div className="space-y-2">
                {dish.addons.map((addon) => {
                  const isSelected = selectedAddonIds.includes(addon.id);
                  return (
                    <label
                      key={addon.id}
                      onClick={() => toggleAddon(addon.id)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-colors ${
                            isSelected ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-300'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                        </div>
                        <span className="text-sm font-medium text-slate-800">{addon.name}</span>
                      </div>
                      <span className="text-xs font-bold text-blue-600">
                        +{formatCurrency(addon.additionalPrice, currency)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* 3. Special Instructions */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Special Cooking Instructions</h3>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="e.g. Less spicy, dressing on the side, no onions..."
              rows={2}
              maxLength={200}
              className="w-full text-sm p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-slate-400"
            />
          </div>
        </div>

        {/* Footer with Quantity & Add to Cart button */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-4">
          <div className="flex items-center border border-slate-200 bg-white rounded-xl shadow-xs overflow-hidden">
            <button
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="p-2.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 transition-colors"
            >
              <Minus className="w-4 h-4" />
            </button>
            <span className="w-9 text-center font-bold text-sm text-slate-900 select-none">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity((q) => q + 1)}
              className="p-2.5 text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <Button
            onClick={handleConfirmAddToCart}
            size="lg"
            className="flex-1 justify-between shadow-md"
          >
            <span>Add to Order</span>
            <span className="font-bold">{formatCurrency(totalPrice, currency)}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}

