'use client';

import React from 'react';
import Image from 'next/image';
import { Dish } from '@/types';
import { DietaryBadge } from './DietaryBadge';
import { formatCurrency } from '@/lib/format';
import { Plus, Clock, UtensilsCrossed } from 'lucide-react';

interface DishCardProps {
  dish: Dish;
  currency?: string;
  onOpenDetail: (dish: Dish) => void;
  onQuickAdd: (dish: Dish) => void;
  cartQuantity?: number;
}

export function DishCard({ dish, currency = 'USD', onOpenDetail, onQuickAdd, cartQuantity = 0 }: DishCardProps) {
  const hasCustomizations = (dish.variants && dish.variants.length > 0) || (dish.addons && dish.addons.length > 0);

  const handleAddClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasCustomizations) {
      onOpenDetail(dish);
    } else {
      onQuickAdd(dish);
    }
  };

  const hasPhoto = Boolean(dish.image && dish.image.trim() !== '');

  return (
    <div
      onClick={() => onOpenDetail(dish)}
      className="group bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-xs hover:shadow-md hover:border-slate-200 transition-all duration-200 cursor-pointer flex flex-col justify-between"
    >
      {hasPhoto ? (
        <div className="relative aspect-4/3 w-full bg-slate-100 overflow-hidden">
          <Image
            src={dish.image}
            alt={dish.name}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />

          {/* Dietary Badge Floating Top-Left */}
          <div className="absolute top-2.5 left-2.5 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg shadow-xs flex items-center">
            <DietaryBadge type={dish.dietaryType} />
          </div>

          {/* Prep Time Floating Top-Right */}
          {dish.prepTime > 0 && (
            <div className="absolute top-2.5 right-2.5 bg-slate-900/80 backdrop-blur-md text-white text-[11px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 shadow-xs">
              <Clock className="w-3 h-3 text-slate-300" />
              <span>{dish.prepTime}m</span>
            </div>
          )}

          {/* Cart Quantity Badge if already in cart */}
          {cartQuantity > 0 && (
            <div className="absolute bottom-2.5 left-2.5 bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full shadow-md animate-in zoom-in-75">
              {cartQuantity} in cart
            </div>
          )}
        </div>
      ) : (
        <div className="relative p-4 pb-0 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <DietaryBadge type={dish.dietaryType} />
            {dish.prepTime > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                <Clock className="w-3 h-3" />
                {dish.prepTime}m
              </span>
            )}
          </div>
          {cartQuantity > 0 && (
            <span className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs">
              {cartQuantity} in cart
            </span>
          )}
        </div>
      )}

      <div className="p-4 flex-1 flex flex-col justify-between">
        <div>
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-slate-900 text-base leading-snug group-hover:text-blue-600 transition-colors">
              {dish.name}
            </h3>
          </div>

          <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
            {dish.description}
          </p>
        </div>

        <div className="mt-4 pt-3 border-t border-slate-50 flex items-center justify-between">
          <div>
            <div className="text-sm font-bold text-slate-900">
              {formatCurrency(dish.price, currency)}
            </div>
            {hasCustomizations && (
              <span className="text-[10px] text-slate-400 font-medium">Customizable</span>
            )}
          </div>

          <button
            onClick={handleAddClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white transition-all text-xs font-semibold select-none active:scale-95 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add</span>
          </button>
        </div>
      </div>
    </div>
  );
}

