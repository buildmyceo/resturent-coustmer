/**
 * Dynamic Brand Theming Engine for Multi-tenant Restaurant Ordering
 * 
 * Automatically extracts dominant brand colors from any restaurant logo or profile settings,
 * generates a comprehensive Material 3 cohesive color system, and dynamically applies
 * CSS custom properties to :root / documentElement without full page reloads.
 */

export interface BrandTheme {
  primary: string;
  onPrimary: string;
  primaryContainer: string;
  onPrimaryContainer: string;

  secondary: string;
  onSecondary: string;
  secondaryContainer: string;
  onSecondaryContainer: string;

  tertiary: string;
  onTertiary: string;
  tertiaryContainer: string;
  onTertiaryContainer: string;

  background: string;
  onBackground: string;

  surface: string;
  surfaceDim: string;
  surfaceBright: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;

  onSurface: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;

  inverseSurface: string;
  inverseOnSurface: string;
  inversePrimary: string;

  amberBadge: string;
  onAmberBadge: string;
  warning: string;
}

// Default Barista Coffeehouse Theme
export const DEFAULT_BRAND_THEME: BrandTheme = {
  primary: '#3D1C0B',
  onPrimary: '#FFFFFF',
  primaryContainer: '#542810',
  onPrimaryContainer: '#F8E7D8',

  secondary: '#D0803C',
  onSecondary: '#FFFFFF',
  secondaryContainer: '#F4E2D2',
  onSecondaryContainer: '#542810',

  tertiary: '#E86010',
  onTertiary: '#FFFFFF',
  tertiaryContainer: '#8A370A',
  onTertiaryContainer: '#FDEBDD',

  background: '#FAF6F0',
  onBackground: '#26150B',

  surface: '#FAF6F0',
  surfaceDim: '#EFE7DE',
  surfaceBright: '#FAF6F0',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F5EFE8',
  surfaceContainer: '#EFE7DE',
  surfaceContainerHigh: '#E7DDD2',
  surfaceContainerHighest: '#DFD3C6',

  onSurface: '#26150B',
  surfaceVariant: '#EFE7DE',
  onSurfaceVariant: '#6E5648',
  outline: '#8C7364',
  outlineVariant: '#DFD3C6',

  inverseSurface: '#26150B',
  inverseOnSurface: '#FDFBF7',
  inversePrimary: '#E8A26A',

  amberBadge: '#FDEED9',
  onAmberBadge: '#7A3508',
  warning: '#D0803C',
};

/* ========================================================================= */
/* COLOR CONVERSION & MATH HELPERS                                           */
/* ========================================================================= */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 61, g: 28, b: 11 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (v: number) => clamp(v).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;

  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const hNorm = ((h % 360) + 360) % 360 / 360;
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const lNorm = Math.max(0, Math.min(100, l)) / 100;

  if (sNorm === 0) {
    const val = Math.round(lNorm * 255);
    return { r: val, g: val, b: val };
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tNorm = t;
    if (tNorm < 0) tNorm += 1;
    if (tNorm > 1) tNorm -= 1;
    if (tNorm < 1 / 6) return p + (q - p) * 6 * tNorm;
    if (tNorm < 1 / 2) return q;
    if (tNorm < 2 / 3) return p + (q - p) * (2 / 3 - tNorm) * 6;
    return p;
  };

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  return {
    r: Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255),
    g: Math.round(hue2rgb(p, q, hNorm) * 255),
    b: Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

export function getLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return a[0] * 0.2126 + a[1] * 0.7152 + a[2] * 0.0722;
}

/* ========================================================================= */
/* PALETTE GENERATOR                                                         */
/* ========================================================================= */

/**
 * Generates a full, cohesive Material 3 color system from a restaurant's primary (and optional secondary) color.
 */
export function generateBrandTheme(primaryHex: string, secondaryHex?: string): BrandTheme {
  const rgb = hexToRgb(primaryHex);
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // If secondary hex not provided, pick an aesthetically shifted harmonic hue (approx +30-35 deg)
  const secondary = secondaryHex
    ? secondaryHex
    : hslToHex((h + 35) % 360, Math.min(95, Math.max(45, s)), Math.max(40, Math.min(55, l + 20)));

  const secRgb = hexToRgb(secondary);
  const { h: secH, s: secS } = rgbToHsl(secRgb.r, secRgb.g, secRgb.b);

  // Tertiary harmonic hue (+70 deg)
  const tertH = (h + 70) % 360;
  const tertS = Math.min(90, Math.max(50, s));

  // Determine onPrimary contrast
  const primLum = getLuminance(primaryHex);
  const onPrimary = primLum > 0.45 ? '#1A110B' : '#FFFFFF';

  // Primary container: deep rich or soft depending on primary luminance
  const primaryContainer = l < 30
    ? hslToHex(h, Math.min(100, s + 10), Math.min(48, l + 14))
    : hslToHex(h, s, Math.max(15, l - 18));
  const onPrimaryContainer = getLuminance(primaryContainer) > 0.45
    ? hslToHex(h, s, 15)
    : hslToHex(h, Math.max(25, s * 0.4), 92);

  // Secondary contrast & container
  const secLum = getLuminance(secondary);
  const onSecondary = secLum > 0.45 ? '#1A110B' : '#FFFFFF';
  const secondaryContainer = hslToHex(secH, Math.min(55, Math.max(20, Math.round(secS * 0.5))), 88);
  const onSecondaryContainer = hslToHex(secH, Math.min(90, secS + 15), 18);

  // Tertiary
  const tertiary = hslToHex(tertH, tertS, 45);
  const tertiaryContainer = hslToHex(tertH, Math.min(90, tertS), 26);
  const onTertiaryContainer = hslToHex(tertH, Math.min(40, tertS), 94);

  // Surfaces: subtly tinted with primary hue for warmth and brand unity
  const background = hslToHex(h, Math.min(20, Math.round(s * 0.2)), 97);
  const onBackground = hslToHex(h, Math.min(40, Math.round(s * 0.4)), 10);

  const surface = background;
  const surfaceDim = hslToHex(h, Math.min(18, Math.round(s * 0.18)), 92);
  const surfaceBright = background;
  const surfaceContainerLowest = '#FFFFFF';
  const surfaceContainerLow = hslToHex(h, Math.min(18, Math.round(s * 0.18)), 95);
  const surfaceContainer = hslToHex(h, Math.min(18, Math.round(s * 0.18)), 92);
  const surfaceContainerHigh = hslToHex(h, Math.min(18, Math.round(s * 0.18)), 88);
  const surfaceContainerHighest = hslToHex(h, Math.min(18, Math.round(s * 0.18)), 84);

  const onSurface = hslToHex(h, Math.min(40, Math.round(s * 0.4)), 11);
  const surfaceVariant = surfaceContainer;
  const onSurfaceVariant = hslToHex(h, Math.min(25, Math.round(s * 0.3)), 36);
  const outline = hslToHex(h, Math.min(20, Math.round(s * 0.2)), 47);
  const outlineVariant = hslToHex(h, Math.min(20, Math.round(s * 0.2)), 82);

  const inverseSurface = hslToHex(h, Math.min(30, Math.round(s * 0.4)), 12);
  const inverseOnSurface = hslToHex(h, Math.min(15, Math.round(s * 0.15)), 98);
  const inversePrimary = hslToHex(h, Math.min(100, s + 20), 65);

  const amberBadge = hslToHex(secH, Math.min(75, secS), 93);
  const onAmberBadge = hslToHex(secH, Math.min(100, secS + 15), 24);

  return {
    primary: primaryHex,
    onPrimary,
    primaryContainer,
    onPrimaryContainer,

    secondary,
    onSecondary,
    secondaryContainer,
    onSecondaryContainer,

    tertiary,
    onTertiary: '#FFFFFF',
    tertiaryContainer,
    onTertiaryContainer,

    background,
    onBackground,

    surface,
    surfaceDim,
    surfaceBright,
    surfaceContainerLowest,
    surfaceContainerLow,
    surfaceContainer,
    surfaceContainerHigh,
    surfaceContainerHighest,

    onSurface,
    surfaceVariant,
    onSurfaceVariant,
    outline,
    outlineVariant,

    inverseSurface,
    inverseOnSurface,
    inversePrimary,

    amberBadge,
    onAmberBadge,
    warning: secondary,
  };
}

/* ========================================================================= */
/* CSS DOM INJECTION                                                         */
/* ========================================================================= */

/**
 * Injects dynamic theme custom properties into document.documentElement without reloads.
 */
export function applyDynamicTheme(theme: BrandTheme): void {
  if (typeof document === 'undefined') return;

  const root = document.documentElement;
  const setProp = (key: string, val: string) => root.style.setProperty(key, val);

  // Tailwind v4 @theme variables
  setProp('--color-primary', theme.primary);
  setProp('--color-brand-black', theme.onSurface);
  setProp('--color-accent', theme.secondary);
  setProp('--color-warning', theme.warning);
  setProp('--color-amber-badge', theme.amberBadge);
  setProp('--color-on-amber-badge', theme.onAmberBadge);

  setProp('--color-light-primary', theme.primary);
  setProp('--color-light-on-primary', theme.onPrimary);
  setProp('--color-light-primary-container', theme.primaryContainer);
  setProp('--color-light-on-primary-container', theme.onPrimaryContainer);

  setProp('--color-light-secondary', theme.secondary);
  setProp('--color-light-on-secondary', theme.onSecondary);
  setProp('--color-light-secondary-container', theme.secondaryContainer);
  setProp('--color-light-on-secondary-container', theme.onSecondaryContainer);

  setProp('--color-light-tertiary', theme.tertiary);
  setProp('--color-light-on-tertiary', theme.onTertiary);
  setProp('--color-light-tertiary-container', theme.tertiaryContainer);
  setProp('--color-light-on-tertiary-container', theme.onTertiaryContainer);

  setProp('--color-light-background', theme.background);
  setProp('--color-light-on-background', theme.onBackground);

  setProp('--color-light-surface', theme.surface);
  setProp('--color-light-surface-dim', theme.surfaceDim);
  setProp('--color-light-surface-bright', theme.surfaceBright);
  setProp('--color-light-surface-container-lowest', theme.surfaceContainerLowest);
  setProp('--color-light-surface-container-low', theme.surfaceContainerLow);
  setProp('--color-light-surface-container', theme.surfaceContainer);
  setProp('--color-light-surface-container-high', theme.surfaceContainerHigh);
  setProp('--color-light-surface-container-highest', theme.surfaceContainerHighest);

  setProp('--color-light-on-surface', theme.onSurface);
  setProp('--color-light-surface-variant', theme.surfaceVariant);
  setProp('--color-light-on-surface-variant', theme.onSurfaceVariant);
  setProp('--color-light-outline', theme.outline);
  setProp('--color-light-outline-variant', theme.outlineVariant);

  setProp('--color-light-inverse-surface', theme.inverseSurface);
  setProp('--color-light-inverse-on-surface', theme.inverseOnSurface);
  setProp('--color-light-inverse-primary', theme.inversePrimary);

  // Global root background & text
  setProp('--background', theme.background);
  setProp('--foreground', theme.onSurface);
  setProp('--primary', theme.primary);
  setProp('--primary-hover', theme.primaryContainer);
}

/* ========================================================================= */
/* CLIENT LOGO EXTRACTION (Canvas with Server Fallback)                      */
/* ========================================================================= */

/**
 * Extracts dominant primary & secondary colors from an image URL using client canvas.
 * Falls back to serverless API endpoint if CORS blocks client canvas pixel reading.
 */
export async function extractBrandColorsFromLogo(
  logoUrl: string
): Promise<{ primary: string; secondary: string } | null> {
  if (!logoUrl) return null;

  // 1. Try client-side offscreen canvas first (instant, 0 network hop)
  try {
    const clientResult = await new Promise<{ primary: string; secondary: string } | null>(
      (resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timeoutId = setTimeout(() => resolve(null), 1800);

        img.onload = () => {
          clearTimeout(timeoutId);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = 48;
            canvas.height = 48;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve(null);

            ctx.drawImage(img, 0, 0, 48, 48);
            const imgData = ctx.getImageData(0, 0, 48, 48).data;

            const buckets: Record<string, { count: number; r: number; g: number; b: number; sat: number }> = {};

            for (let i = 0; i < imgData.length; i += 4) {
              const a = imgData[i + 3];
              if (a < 120) continue; // transparent
              const r = imgData[i];
              const g = imgData[i + 1];
              const b = imgData[i + 2];

              // Skip pure white or pure black
              if (r > 245 && g > 245 && b > 245) continue;
              if (r < 18 && g < 18 && b < 18) continue;

              const { s } = rgbToHsl(r, g, b);

              // Bucket by 24
              const qr = Math.round(r / 24) * 24;
              const qg = Math.round(g / 24) * 24;
              const qb = Math.round(b / 24) * 24;
              const hex = rgbToHex(qr, qg, qb);

              if (!buckets[hex]) {
                buckets[hex] = { count: 0, r: qr, g: qg, b: qb, sat: s };
              }
              buckets[hex].count += 1;
            }

            const sorted = Object.entries(buckets).sort((a, b) => b[1].count - a[1].count);
            if (sorted.length === 0) return resolve(null);

            const primary = sorted[0][0];
            // Find secondary that is sufficiently different in hue/chroma
            const primRgb = hexToRgb(primary);
            const primHsl = rgbToHsl(primRgb.r, primRgb.g, primRgb.b);

            let secondary = '';
            for (let j = 1; j < sorted.length; j++) {
              const candHex = sorted[j][0];
              const candHsl = rgbToHsl(sorted[j][1].r, sorted[j][1].g, sorted[j][1].b);
              const hueDiff = Math.abs(candHsl.h - primHsl.h);
              const isFar = hueDiff > 25 && hueDiff < 335;
              if (isFar || candHsl.s > 35) {
                secondary = candHex;
                break;
              }
            }

            resolve({ primary, secondary: secondary || primary });
          } catch {
            resolve(null);
          }
        };

        img.onerror = () => {
          clearTimeout(timeoutId);
          resolve(null);
        };

        img.src = logoUrl;
      }
    );

    if (clientResult) return clientResult;
  } catch {
    // continue to server fallback
  }

  // 2. Serverless API fallback (bypasses CORS restrictions)
  try {
    const res = await fetch(`/api/restaurant/extract-theme?logoUrl=${encodeURIComponent(logoUrl)}`);
    if (res.ok) {
      const data = await res.json();
      if (data?.theme?.primary) {
        return {
          primary: data.theme.primary,
          secondary: data.theme.secondary || data.theme.primary,
        };
      }
    }
  } catch {
    // fallback
  }

  return null;
}

/* ========================================================================= */
/* ORCHESTRATOR: SYNC RESTAURANT THEME                                       */
/* ========================================================================= */

export async function syncRestaurantTheme(
  restaurant: {
    id?: string;
    logoUrl?: string;
    logo?: string;
    landingPage?: {
      primaryColor?: string;
      secondaryColor?: string;
    };
    settings?: {
      primaryColor?: string;
      secondaryColor?: string;
      landingPageConfig?: {
        primaryColor?: string;
        secondaryColor?: string;
      };
    };
  } | null
): Promise<BrandTheme> {
  if (!restaurant) {
    applyDynamicTheme(DEFAULT_BRAND_THEME);
    return DEFAULT_BRAND_THEME;
  }

  const storageKey = `ceova_brand_theme_${restaurant.id || 'default'}`;

  // Check 1: Explicit settings in restaurant profile or landingPage
  const explicitPrimary =
    restaurant.landingPage?.primaryColor ||
    restaurant.settings?.landingPageConfig?.primaryColor ||
    restaurant.settings?.primaryColor ||
    (restaurant as any).primaryColor;

  const explicitSecondary =
    restaurant.landingPage?.secondaryColor ||
    restaurant.settings?.landingPageConfig?.secondaryColor ||
    restaurant.settings?.secondaryColor ||
    (restaurant as any).secondaryColor;

  if (explicitPrimary) {
    const theme = generateBrandTheme(explicitPrimary, explicitSecondary);
    applyDynamicTheme(theme);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, JSON.stringify(theme));
      } catch {}
    }
    return theme;
  }

  // Check 2: Cached theme in localStorage
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached) as BrandTheme;
        applyDynamicTheme(parsed);
        // If logo hasn't changed, return cached
        if (!restaurant.logoUrl && !restaurant.logo) return parsed;
      }
    } catch {}
  }

  // Check 3: Extract from logo URL
  const targetLogo = restaurant.logoUrl || restaurant.logo;
  if (targetLogo) {
    const extracted = await extractBrandColorsFromLogo(targetLogo);
    if (extracted?.primary) {
      const theme = generateBrandTheme(extracted.primary, extracted.secondary);
      applyDynamicTheme(theme);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(theme));
        } catch {}
      }
      return theme;
    }
  }

  // Fallback: Default Barista Theme
  applyDynamicTheme(DEFAULT_BRAND_THEME);
  return DEFAULT_BRAND_THEME;
}
