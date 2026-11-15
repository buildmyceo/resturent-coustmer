'use client';

import React from 'react';
import Image from 'next/image';
import { Dish } from '@/types';
import { DietaryBadge } from './DietaryBadge';
import { formatCurrency } from '@/lib/format';
import { Plus, Minus, Clock, UtensilsCrossed } from 'lucide-react';

interface DishCardProps {
  dish: Dish;
  currency?: string;
  onOpenDetail: (dish: Dish) => void;
  onQuickAdd: (dish: Dish) => void;
  onDecrement?: (dish: Dish) => void;
  cartQuantity?: number;
}

export function DishCard({
  dish,
  currency = 'INR',
  onOpenDetail,
  onQuickAdd,
  onDecrement,
  cartQuantity = 0,
}: DishCardProps) {
  const hasCustomizations =
    (dish.variants && dish.variants.length > 0) || (dish.addons && dish.addons.length > 0);

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasCustomizations && cartQuantity === 0) {
      onOpenDetail(dish);
    } else {
      onQuickAdd(dish);
    }
  };

  const handleDecrementClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDecrement) {
      onDecrement(dish);
    }
  };

  const hasPhoto = Boolean(dish.image && dish.image.trim() !== '');

  return (
    <div
      onClick={() => onOpenDetail(dish)}
      className="group bg-white rounded-2xl border border-slate-200/80 hover:border-slate-300 p-2.5 flex flex-col justify-between transition-all duration-150 cursor-pointer shadow-2xs hover:shadow-xs relative"
    >
      {/* Top Media / Food Presentation Container (Balanced Compact Landscape 4:3 Ratio) */}
      <div className="relative aspect-[4/3] w-full rounded-xl overflow-hidden bg-slate-50 flex items-center justify-center mb-2">
        {hasPhoto ? (
          <Image
            src={dish.image}
            alt={dish.name}
            fill
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-slate-300">
            <UtensilsCrossed className="w-6 h-6 stroke-[1.5]" />
            <span className="text-[9px] font-medium text-slate-400 mt-1">Fresh Food</span>
          </div>
        )}

        {/* Dietary Icon Floating Top-Left */}
        <div className="absolute top-1.5 left-1.5">
          <DietaryBadge type={dish.dietaryType} />
        </div>

        {/* Prep Time Tag Floating Top-Right */}
        {dish.prepTime > 0 && (
          <div className="absolute top-1.5 right-1.5 bg-slate-900/75 backdrop-blur-xs text-white text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-2xs">
            <Clock className="w-2.5 h-2.5 text-slate-300" />
            <span>{dish.prepTime}m</span>
          </div>
        )}
      </div>

      {/* Middle: Prep / Serving Info & Blinkit style ADD Button Row */}
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[11px] font-medium text-slate-500">
          {dish.categoryName || '1 portion'}
        </span>

        {/* Blinkit Style ADD / Quantity Stepper Button */}
        {cartQuantity > 0 ? (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center justify-between bg-emerald-700 text-white rounded-lg h-7 px-1.5 shadow-xs font-bold text-xs min-w-[70px]"
          >
            <button
              onClick={handleDecrementClick}
              className="p-1 hover:opacity-80 active:scale-90 transition-transform cursor-pointer"
              title="Decrease quantity"
            >
              <Minus className="w-3 h-3 stroke-[3]" />
            </button>
            <span className="px-1 text-[12px]">{cartQuantity}</span>
            <button
              onClick={handleAddClick}
              className="p-1 hover:opacity-80 active:scale-90 transition-transform cursor-pointer"
              title="Increase quantity"
            >
              <Plus className="w-3 h-3 stroke-[3]" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleAddClick}
            className="h-7 px-3.5 rounded-lg border border-emerald-600 text-emerald-700 hover:bg-emerald-50 active:scale-95 bg-white font-extrabold text-[11px] tracking-wide uppercase transition-all shadow-2xs flex items-center justify-center cursor-pointer"
          >
            ADD
          </button>
        )}
      </div>

      {/* Bottom: Price & Title */}
      <div className="pt-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-black text-slate-900 font-mono tracking-tight">
            {formatCurrency(dish.price, currency)}
          </span>
          {dish.originalPrice && dish.originalPrice > dish.price && (
            <span className="text-[10px] text-slate-400 line-through">
              {formatCurrency(dish.originalPrice, currency)}
            </span>
          )}
        </div>

        <h3 className="font-semibold text-slate-800 text-xs leading-snug line-clamp-2 mt-0.5 group-hover:text-emerald-700 transition-colors">
          {dish.name}
        </h3>

        {hasCustomizations && (
          <span className="text-[10px] text-emerald-600 font-medium block mt-0.5">
            Customisable
          </span>
        )}
      </div>
    </div>
  );
}


