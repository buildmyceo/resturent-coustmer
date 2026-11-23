'use client';

import React from 'react';
import Image from 'next/image';
import { Category } from '@/types';
import { getCategoryEmoji, isEmoji } from '@/lib/category-helpers';

interface CategoryBarProps {
  categories: Category[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
}

export function CategoryBar({ categories, activeCategoryId, onSelectCategory }: CategoryBarProps) {
  if (categories.length === 0) return null;

  return (
    <div className="bg-white border-b border-slate-100 py-3 px-4">
      {/* Category Icon Tiles Carousel */}
      <div className="flex items-start gap-4 overflow-x-auto no-scrollbar scroll-smooth pb-1">
        {/* Categories Tiles */}
        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id;
          const emoji = getCategoryEmoji(cat);

          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className="flex flex-col items-center gap-1.5 shrink-0 select-none group cursor-pointer"
            >
              <div
                className={`relative w-14 h-14 rounded-2xl overflow-hidden transition-all bg-slate-50 flex items-center justify-center ${
                  isActive
                    ? 'border-2 border-light-primary bg-light-secondary-container/20 shadow-xs ring-2 ring-light-primary/20'
                    : 'border border-slate-200/70 group-hover:border-slate-300'
                }`}
              >
                <span className="text-2xl select-none">{emoji}</span>
              </div>
              <span
                className={`text-[11px] text-center font-bold tracking-tight max-w-[64px] line-clamp-2 leading-tight ${
                  isActive ? 'text-light-primary font-extrabold' : 'text-slate-700'
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



