import React from 'react';
import { DietaryType } from '@/types';
import { Leaf, Egg } from 'lucide-react';

export function DietaryBadge({ type, showText = false }: { type: DietaryType; showText?: boolean }) {
  const norm = (type || '').toLowerCase();

  if (norm.includes('vegan')) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-md">
        <Leaf className="w-3 h-3 text-emerald-600 shrink-0" />
        {showText && 'Vegan'}
      </span>
    );
  }

  if (norm.includes('egg')) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md">
        <Egg className="w-3 h-3 text-amber-600 shrink-0" />
        {showText && 'Contains Egg'}
      </span>
    );
  }

  if (norm.includes('non') || norm === 'non_vegetarian' || norm === 'non-veg') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <div
          title="Non-Vegetarian"
          className="w-4 h-4 border border-rose-600 flex items-center justify-center p-0.5 rounded-xs shrink-0"
        >
          <div className="w-2 h-2 bg-rose-600 rounded-full" />
        </div>
        {showText && <span className="text-[11px] font-medium text-rose-700">Non-Veg</span>}
      </div>
    );
  }

  // Default to Vegetarian (Veg)
  return (
    <div className="inline-flex items-center gap-1.5">
      <div
        title="Vegetarian"
        className="w-4 h-4 border border-emerald-600 flex items-center justify-center p-0.5 rounded-xs shrink-0"
      >
        <div className="w-2 h-2 bg-emerald-600 rounded-full" />
      </div>
      {showText && <span className="text-[11px] font-medium text-emerald-700">Veg</span>}
    </div>
  );
}

