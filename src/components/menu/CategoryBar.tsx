'use client';

import React from 'react';
import { Category } from '@/types';

interface CategoryBarProps {
  categories: Category[];
  activeCategoryId: string;
  onSelectCategory: (id: string) => void;
}

export function CategoryBar({ categories, activeCategoryId, onSelectCategory }: CategoryBarProps) {
  if (categories.length === 0) return null;

  return (
    <div className="sticky top-16 z-30 bg-white/95 backdrop-blur-md border-b border-slate-100 py-2.5 px-4">
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar scroll-smooth">
        <button
          onClick={() => onSelectCategory('all')}
          className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 select-none ${
            activeCategoryId === 'all'
              ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
          }`}
        >
          All Items
        </button>

        {categories.map((cat) => {
          const isActive = activeCategoryId === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 select-none whitespace-nowrap ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
              }`}
            >
              {cat.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

