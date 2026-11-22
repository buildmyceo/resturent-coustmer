'use client';

import React from 'react';
import Image from 'next/image';
import { Dish } from '@/types';
import { formatCurrency } from '@/lib/format';
import { Clock, UtensilsCrossed } from 'lucide-react';

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
  const dietaryLower = String(dish.dietaryType || '').toLowerCase();
  const isVeg = (dietaryLower.includes('veg') && !dietaryLower.includes('non')) || dietaryLower === 'vegan';
  const isPopular = dish.isSignature === true || (Boolean(dish.ordersCount) && (dish.ordersCount || 0) > 2);
  const prepMinutes = dish.prepTime || 12;

  return (
    <article
      onClick={() => onOpenDetail(dish)}
      className="menu-card group h-full bg-light-surface-container-lowest border border-light-outline-variant/70 rounded-2xl p-4 flex flex-col justify-between gap-3 hover:border-light-primary/50 transition-all duration-state-change ease-state-change shadow-xs hover:shadow-sm cursor-pointer select-none"
    >
      <div className="flex flex-col gap-3">
        {/* Top Media Container */}
        <div className="relative w-full h-44 bg-light-surface-container-low rounded-xl overflow-hidden">
          {hasPhoto ? (
            <Image
              src={dish.image}
              alt={dish.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-light-on-surface-variant/40 bg-light-surface-container-high/40">
              <UtensilsCrossed className="w-8 h-8 stroke-[1.5]" />
              <span className="text-[10px] font-medium mt-1">Freshly Made</span>
            </div>
          )}

          {/* Veg / Non-Veg Indicator */}
          <span
            className={`absolute top-2.5 left-2.5 w-5 h-5 rounded-xs bg-light-surface-container-lowest border ${
              isVeg ? 'border-veg' : 'border-rose-600'
            } flex items-center justify-center shadow-2xs`}
            title={isVeg ? 'Vegetarian' : 'Non-Vegetarian'}
          >
            {isVeg ? (
              <span className="w-2.5 h-2.5 rounded-full bg-veg"></span>
            ) : (
              <span className="w-0 h-0 border-l-[4px] border-l-transparent border-r-[4px] border-r-transparent border-b-[8px] border-b-rose-600"></span>
            )}
          </span>

          {/* Prep Time Tag */}
          <span className="absolute top-2.5 right-2.5 inline-flex items-center gap-1 bg-light-inverse-surface/90 text-light-inverse-on-surface px-2 py-0.5 rounded-full shadow-xs">
            <Clock className="w-3 h-3 text-light-inverse-on-surface" />
            <span className="font-label text-xs font-semibold tabular-nums">{prepMinutes}m</span>
          </span>
        </div>

        {/* Dish Title & Description */}
        <header className="flex flex-col gap-1">
          <div className="flex items-center justify-between gap-1.5">
            <h3 className="font-title text-base font-semibold text-light-on-surface line-clamp-1 group-hover:text-light-primary transition-colors">
              {dish.name}
            </h3>
            {isPopular && (
              <span className="font-label text-[11px] font-bold text-on-amber-badge bg-amber-badge px-2 py-0.5 rounded-full shrink-0 shadow-2xs">
                Popular
              </span>
            )}
          </div>
          <p className="font-body text-xs text-light-on-surface-variant line-clamp-2 text-pretty leading-relaxed">
            {dish.description || 'Single-origin craft recipe prepared fresh to your table.'}
          </p>
        </header>
      </div>

      {/* Footer Price & Add Action */}
      <footer className="flex items-end justify-between gap-2 pt-3 border-t border-light-surface-container">
        <div className="flex flex-col">
          <span className="font-label text-[11px] text-light-on-surface-variant">
            {dish.categoryName || '1 portion'}
          </span>
          <span className="font-title text-base font-bold text-light-on-surface tabular-nums">
            {formatCurrency(dish.price, currency)}
          </span>
        </div>

        <div className="cart-action-slot" data-item-id={dish.id} data-item-price={dish.price}>
          {cartQuantity > 0 ? (
            <div
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-2 bg-light-primary text-light-on-primary rounded-lg px-2.5 py-1 shadow-xs"
            >
              <button
                onClick={handleDecrementClick}
                type="button"
                className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-light-primary-container text-base font-bold cursor-pointer active:scale-90 transition-transform"
                aria-label="Decrease quantity"
              >
                -
              </button>
              <span className="font-label text-sm font-bold tabular-nums min-w-4 text-center">
                {cartQuantity}
              </span>
              <button
                onClick={handleAddClick}
                type="button"
                className="w-5 h-5 inline-flex items-center justify-center rounded hover:bg-light-primary-container text-base font-bold cursor-pointer active:scale-90 transition-transform"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
          ) : (
            <button
              onClick={handleAddClick}
              type="button"
              className="add-btn inline-flex items-center justify-center bg-light-surface-container-lowest text-light-primary border border-light-primary hover:bg-light-primary hover:text-light-on-primary px-4 py-1.5 rounded-lg font-label text-sm font-semibold transition-colors duration-state-change ease-state-change shadow-2xs active:scale-95 cursor-pointer"
            >
              <span>Add</span>
            </button>
          )}
        </div>
      </footer>
    </article>
  );
}
