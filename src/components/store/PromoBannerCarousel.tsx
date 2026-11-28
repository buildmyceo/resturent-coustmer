'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

export interface PromoBannerItem {
  id: string;
  imageUrl: string;
  title?: string;
  placement?: 'both' | 'qr' | 'online';
  isActive?: boolean;
}

export function PromoBannerCarousel({
  banners,
  placement,
}: {
  banners?: PromoBannerItem[] | null;
  placement: 'qr' | 'online';
}) {
  const activeBanners = useMemo(() => {
    if (!Array.isArray(banners)) return [];
    return banners
      .filter(
        (b) =>
          b &&
          b.imageUrl &&
          b.isActive !== false &&
          (!b.placement || b.placement === 'both' || b.placement === placement)
      )
      .slice(0, 5);
  }, [banners, placement]);

  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [activeBanners.length]);

  useEffect(() => {
    if (activeBanners.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % activeBanners.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [activeBanners.length]);

  if (activeBanners.length === 0) return null;

  const current = activeBanners[index % activeBanners.length];

  return (
    <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
      <div className="relative overflow-hidden rounded-2xl border border-light-outline-variant/40 bg-light-surface-container shadow-xs aspect-[3/1] sm:aspect-[16/5]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.imageUrl}
          alt={current.title || 'Special Offer'}
          className="w-full h-full object-cover transition-all duration-500"
        />
        {current.title && (
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/30 to-transparent px-4 py-3">
            <p className="text-white text-xs sm:text-sm font-bold tracking-tight line-clamp-1">
              {current.title}
            </p>
          </div>
        )}

        {activeBanners.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous banner"
              onClick={() =>
                setIndex((prev) => (prev - 1 + activeBanners.length) % activeBanners.length)
              }
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Next banner"
              onClick={() => setIndex((prev) => (prev + 1) % activeBanners.length)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/45 hover:bg-black/70 text-white flex items-center justify-center backdrop-blur-xs cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5">
              {activeBanners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  aria-label={`Banner ${i + 1}`}
                  onClick={() => setIndex(i)}
                  className={`h-1.5 rounded-full transition-all cursor-pointer ${
                    i === index ? 'w-5 bg-white' : 'w-1.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
