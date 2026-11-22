'use client';

import { useEffect } from 'react';
import { useCustomer } from '@/context/CustomerContext';
import { syncRestaurantTheme, DEFAULT_BRAND_THEME, applyDynamicTheme } from '@/lib/dynamic-theme';

export function ThemeApplier() {
  const { restaurant } = useCustomer();

  useEffect(() => {
    // Initial sync from local storage if available to avoid latency
    if (typeof window !== 'undefined') {
      try {
        const id = restaurant?.id || 'default';
        const cached = localStorage.getItem(`ceova_brand_theme_${id}`);
        if (cached) {
          applyDynamicTheme(JSON.parse(cached));
        } else {
          applyDynamicTheme(DEFAULT_BRAND_THEME);
        }
      } catch {}
    }

    // Dynamic brand extraction & application
    syncRestaurantTheme(restaurant as any).catch((err) => {
      console.warn('Failed to sync brand theme:', err);
    });
  }, [
    restaurant?.id,
    restaurant?.logoUrl,
    (restaurant as any)?.logo,
    (restaurant as any)?.landingPage?.primaryColor,
    restaurant?.settings?.landingPageConfig?.primaryColor,
    restaurant?.settings?.primaryColor,
  ]);

  return null;
}
