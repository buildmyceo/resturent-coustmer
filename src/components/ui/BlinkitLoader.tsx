'use client';

import React, { useState, useEffect } from 'react';

interface FoodItem {
  emoji: string;
  name: string;
  bgGrad: string;
  tag: string;
}

const FOOD_ITEMS: FoodItem[] = [
  { emoji: '🍕', name: 'Artisan Woodfired Pizza', bgGrad: 'from-amber-500/20 to-orange-500/20', tag: 'Fresh & Hot' },
  { emoji: '🍔', name: 'Gourmet Smashed Burger', bgGrad: 'from-red-500/20 to-amber-500/20', tag: 'Chef Recommended' },
  { emoji: '☕', name: 'Velvety Hot Espresso', bgGrad: 'from-amber-600/20 to-yellow-600/20', tag: 'Artisan Brew' },
  { emoji: '🍜', name: 'Steaming Ramen & Broth', bgGrad: 'from-emerald-500/20 to-teal-500/20', tag: 'Fresh Broth' },
  { emoji: '🍰', name: 'Decadent Tiramisu & Pastries', bgGrad: 'from-pink-500/20 to-rose-500/20', tag: 'Sweet Treats' },
  { emoji: '🥗', name: 'Crisp Farm Fresh Salad', bgGrad: 'from-green-500/20 to-emerald-500/20', tag: 'Healthy & Crisp' },
  { emoji: '🥟', name: 'Handmade Steamed Dumplings', bgGrad: 'from-cyan-500/20 to-blue-500/20', tag: 'Handmade' },
];

const ROTATING_QUOTES = [
  'Warming up the oven...',
  'Prepping fresh artisanal ingredients...',
  'Fetching chef\'s live menu...',
  'Handcrafting delicious flavors for your table...',
  'Setting up your digital dining counter...',
];

interface BlinkitLoaderProps {
  title?: string;
  subtitle?: string;
  fullScreen?: boolean;
  className?: string;
}

export default function BlinkitLoader({
  title,
  subtitle,
  fullScreen = true,
  className = '',
}: BlinkitLoaderProps) {
  const [index, setIndex] = useState(0);
  const [quoteIndex, setQuoteIndex] = useState(0);

  useEffect(() => {
    const itemInterval = setInterval(() => {
      setIndex((prev) => (prev + 1) % FOOD_ITEMS.length);
    }, 1800);

    const quoteInterval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % ROTATING_QUOTES.length);
    }, 2800);

    return () => {
      clearInterval(itemInterval);
      clearInterval(quoteInterval);
    };
  }, []);

  const currentItem = FOOD_ITEMS[index];
  const currentQuote = subtitle || ROTATING_QUOTES[quoteIndex];

  const content = (
    <div className={`flex flex-col items-center justify-center text-center p-6 max-w-sm mx-auto select-none ${className}`}>
      {/* 3D / Floating Card Container */}
      <div className="relative mb-6">
        {/* Glow backdrop pulse */}
        <div
          className={`absolute -inset-4 rounded-full bg-gradient-to-tr ${currentItem.bgGrad} blur-2xl opacity-75 animate-pulse transition-all duration-700`}
        />

        {/* Orbiting food particle dots */}
        <div className="absolute inset-0 flex items-center justify-center animate-spin" style={{ animationDuration: '8s' }}>
          <span className="absolute -top-3 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-amber-400 opacity-60"></span>
          <span className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-rose-400 opacity-60"></span>
          <span className="absolute -left-3 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-emerald-400 opacity-60"></span>
          <span className="absolute -right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-blue-400 opacity-60"></span>
        </div>

        {/* Main Central Card */}
        <div className="relative w-28 h-28 sm:w-32 sm:h-32 rounded-3xl bg-white border border-slate-100 shadow-[0_12px_40px_rgba(0,0,0,0.08)] flex flex-col items-center justify-center p-3 overflow-hidden">
          {/* Subtle radial inner glow */}
          <div className="absolute inset-0 bg-radial from-slate-50/50 to-transparent pointer-events-none" />

          {/* Animated bouncing food emoji */}
          <div
            key={index}
            className="text-5xl sm:text-6xl transform animate-bounce transition-transform duration-300"
            style={{ animationDuration: '1.2s' }}
          >
            {currentItem.emoji}
          </div>

          {/* Badge */}
          <div className="mt-1 px-2.5 py-0.5 rounded-full bg-slate-900/5 text-[10px] font-bold text-slate-700 tracking-tight transition-all duration-300">
            {currentItem.tag}
          </div>
        </div>
      </div>

      {/* Main Title / Current Item */}
      <h3 className="text-base sm:text-lg font-black text-slate-900 tracking-tight transition-all duration-300">
        {title || currentItem.name}
      </h3>

      {/* Cycling Friendly Subtitle / Dining Quote */}
      <p
        key={currentQuote}
        className="text-xs sm:text-sm font-medium text-slate-500 mt-1.5 max-w-xs transition-opacity duration-500 min-h-[2.5rem] flex items-center justify-center"
      >
        {currentQuote}
      </p>

      {/* Blinkit-Style Animated Progress Track */}
      <div className="w-44 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-4 relative">
        <div
          className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-blue-600 rounded-full"
          style={{
            animation: 'blinkitProgress 1.5s infinite ease-in-out',
          }}
        />
      </div>

      <style jsx>{`
        @keyframes blinkitProgress {
          0% {
            transform: translateX(-100%) scaleX(0.2);
          }
          50% {
            transform: translateX(30%) scaleX(0.7);
          }
          100% {
            transform: translateX(200%) scaleX(0.3);
          }
        }
      `}</style>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-[#fafbfc] flex items-center justify-center p-4">
        {content}
      </div>
    );
  }

  return content;
}
