'use client';

import React from 'react';
import Image from 'next/image';
import { Category } from '@/types';

interface CategoryBarProps {
  categories: Category[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
}

export function CategoryBar({ categories, activeCategoryId, onSelectCategory }: CategoryBarProps) {
  if (categories.length === 0) return null;

  return (
    <div className="bg-white border-b border-slate-100 py-3 px-4">
      {/* Blinkit Category Icon Tiles Carousel */}
      <div className="flex items-start gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-1">
        {/* All Items Tile */}
        <button
          onClick={() => onSelectCategory('all')}
          className="flex flex-col items-center gap-1.5 shrink-0 select-none group cursor-pointer"
        >
          <div
            className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
              activeCategoryId === 'all'
                ? 'bg-emerald-100 border-2 border-emerald-600 shadow-xs'
                : 'bg-slate-100/90 border border-slate-200/60 group-hover:bg-slate-200/70'
            }`}
          >
            <span className="text-xl">🍽️</span>
          </div>
          <span
            className={`text-[11px] text-center font-bold tracking-tight max-w-[64px] truncate leading-tight ${
              activeCategoryId === 'all' ? 'text-emerald-700' : 'text-slate-600'
            }`}
          >
            All Items
          </span>
        </button>

        {/* Categories Tiles */}
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id;
          const hasImage = Boolean(cat.image && cat.image.trim() !== '');

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className="flex flex-col items-center gap-1.5 shrink-0 select-none group cursor-pointer"
            >
              <div
                className={`relative w-14 h-14 rounded-2xl overflow-hidden transition-all bg-slate-50 flex items-center justify-center ${
                  isActive
                    ? 'border-2 border-emerald-600 shadow-xs ring-2 ring-emerald-500/20'
                    : 'border border-slate-200/70 group-hover:border-slate-300'
                }`}
              >
                {hasImage ? (
                  <Image
                    src={cat.image!}
                    alt={cat.name}
                    fill
                    sizes="56px"
                    className="object-cover group-hover:scale-105 transition-transform"
                  />
                ) : (
                  <span className="text-xl">☕</span>
                )}
              </div>
              <span
                className={`text-[11px] text-center font-bold tracking-tight max-w-[64px] line-clamp-2 leading-tight ${
                  isActive ? 'text-emerald-700 font-extrabold' : 'text-slate-700'
                }`}
              >
                {cat.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}



