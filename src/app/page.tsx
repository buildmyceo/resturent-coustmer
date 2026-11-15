'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  QrCode,
  Utensils,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Phone,
  Mail,
  Globe,
  MapPin,
  Clock,
  Compass,
  Settings,
  Heart,
  ChevronDown,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import { FacebookIcon, InstagramIcon, TwitterIcon, WhatsAppIcon } from '@/components/ui/SocialIcons';
import { Button } from '@/components/ui/Button';
import BlinkitLoader from '@/components/ui/BlinkitLoader';
import { getGuestSession, clearGuestSession, GuestSessionState } from '@/lib/guest-session';
import { calculateDistanceMeters, formatDistance } from '@/lib/geofence';
import { QRScannerModal } from '@/components/scanner/QRScannerModal';
import { BottomCornerScanButton } from '@/components/layout/BottomCornerScanButton';
import { playTap } from '@/lib/audio';

export default function CustomerPortalLandingPage() {
  const router = useRouter();

  // Active Dining Session
  const [activeSession, setActiveSession] = useState<GuestSessionState | null>(null);

  // Restaurant Data
  const [restaurant, setRestaurant] = useState<any>(null);
  const [isLoadingRestaurant, setIsLoadingRestaurant] = useState(true);

  // Modals
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Geofence & Location State
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  // 1. Load active guest session on mount
  useEffect(() => {
    const session = getGuestSession();
    if (session && session.sessionId) {
      queueMicrotask(() => setActiveSession(session));
    }
  }, []);

  // 2. Fetch Restaurant Profile & Geofence
  const fetchRestaurantInfo = async () => {
    try {
      const res = await fetch('/api/restaurant/info');
      const data = await res.json();
      if (data.success && data.restaurant) {
        setRestaurant(data.restaurant);
      }
    } catch (err) {
      console.warn('Failed to fetch restaurant info:', err);
    } finally {
      setIsLoadingRestaurant(false);
    }
  };

  useEffect(() => {
    fetchRestaurantInfo();
  }, []);

  // 3. User Geolocation Watcher
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('denied');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserCoords({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
        setLocationStatus('granted');
      },
      (err) => {
        console.warn('Geolocation error:', err.message);
        setLocationStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // 4. Calculate Distance & Geofence Status
  const { distanceMeters, isWithinGeofence } = useMemo(() => {
    if (!restaurant?.geofence) {
      return { distanceMeters: null, isWithinGeofence: false };
    }

    const { latitude: restLat, longitude: restLon, radiusMeters, enabled } = restaurant.geofence;

    // Real device GPS mode
    if (!userCoords || !restLat || !restLon || enabled === false) {
      // Default to false (out of geofence) if GPS not available or geofence disabled
      return { distanceMeters: null, isWithinGeofence: false };
    }

    const dist = calculateDistanceMeters(
      userCoords.latitude,
      userCoords.longitude,
      restLat,
      restLon
    );

    const within = dist <= (radiusMeters || 500);
    return { distanceMeters: dist, isWithinGeofence: within };
  }, [restaurant, userCoords]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-rose-500 selection:text-white relative overflow-x-hidden font-sans">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-96 bg-gradient-to-b from-rose-100/40 via-amber-50/30 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* TOP NAVIGATION BAR */}
      <header className="w-full max-w-xl mx-auto px-4 pt-4 sm:pt-6 flex items-center justify-between z-20">
        {/* Restaurant Brand or User Profile */}
        <div className="flex items-center gap-2.5">
          {activeSession ? (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                {(activeSession.guestName || 'G').charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-extrabold text-sm tracking-tight text-slate-900 block leading-tight">
                  {activeSession.guestName || 'Valued Guest'}
                </span>
                <span className="text-[10px] text-emerald-600 font-semibold block leading-tight">
                  {activeSession.tableNumber ? `Seated at ${activeSession.tableNumber}` : 'Dining Guest'}
                </span>
              </div>
            </div>
          ) : restaurant?.logoUrl ? (
            <div className="flex items-center gap-2.5">
              <img
                src={restaurant.logoUrl}
                alt={restaurant.name || 'Restaurant Logo'}
                className="w-9 h-9 rounded-xl object-cover border border-slate-200/80 shadow-xs"
              />
              <div>
                <span className="font-extrabold text-sm tracking-tight text-slate-900 block leading-tight">
                  {restaurant?.name || 'Restaurant Dining'}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold block leading-tight">
                  {restaurant?.restaurantType || 'Guest Portal'}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center font-black text-sm shadow-xs">
                {(restaurant?.name || 'R').charAt(0).toUpperCase()}
              </div>
              <div>
                <span className="font-extrabold text-sm tracking-tight text-slate-900 block leading-tight">
                  {restaurant?.name || 'Restaurant Dining'}
                </span>
                <span className="text-[10px] text-slate-400 font-semibold block leading-tight">
                  {restaurant?.restaurantType || 'Guest Portal'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-2">
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="w-full max-w-md mx-auto px-4 py-6 sm:py-8 my-auto space-y-6">
        {/* 1. Resume Active Session Card (if user has an open table session) */}
        {activeSession && (
          <div className="bg-white rounded-3xl p-5 shadow-xl border border-blue-200 ring-2 ring-blue-500/10 space-y-3.5 animate-in fade-in duration-300">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                <span>Active Table Session</span>
              </span>
              <button
                onClick={() => {
                  clearGuestSession();
                  setActiveSession(null);
                }}
                className="text-[11px] text-slate-400 hover:text-slate-600 underline"
              >
                Leave Table
              </button>
            </div>

            <div>
              <h2 className="text-base font-bold text-slate-900">
                {activeSession.tableNumber} • {activeSession.guestName}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                You have an active dining session open at this table.
              </p>
            </div>

            <Link href={`/table/${activeSession.sessionId}`} className="block">
              <Button size="md" className="w-full gap-2 shadow-md">
                <span>Resume Dining Session</span>
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        )}

        {/* 2. RESTAURANT LANDING CARD (ALWAYS VISIBLE TO GUESTS) */}
        {restaurant ? (
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* Restaurant Profile Card with Dynamic Theme Customization */}
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-5 relative overflow-hidden">
              {/* Dynamic Theme Color Top Glow */}
              {restaurant.landingPage?.primaryColor && (
                <div
                  className="absolute top-0 right-0 w-52 h-52 rounded-full blur-3xl opacity-20 -z-10 pointer-events-none"
                  style={{ backgroundColor: restaurant.landingPage.primaryColor }}
                />
              )}

              {/* Floating Hero Visual Showcase (e.g. coffee cup, samosa platter, taco meal) */}
              {restaurant.landingPage?.heroImageUrl && (
                <div className="relative w-full h-44 rounded-2xl overflow-hidden shadow-md -mt-1">
                  <img
                    src={restaurant.landingPage.heroImageUrl}
                    alt={restaurant.name}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 text-white">
                    <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-xs">
                      {restaurant.landingPage.heroBadge || 'Signature Highlights'}
                    </span>
                  </div>
                </div>
              )}

              {/* Identity Header */}
              <div className="flex items-start gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-black border border-slate-200 text-white flex items-center justify-center shrink-0 font-black text-2xl shadow-md p-1.5 overflow-hidden">
                  {restaurant.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={restaurant.logoUrl} alt={restaurant.name} className="w-full h-full object-contain" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src="/ceova-logo.png" alt="Ceova" className="w-full h-full object-contain" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black text-slate-900 tracking-tight truncate">
                      {restaurant.landingPage?.heroHeadline || restaurant.name}
                    </h1>
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                      {restaurant.landingPage?.heroBadge || 'Open'}
                    </span>
                  </div>
                  {restaurant.landingPage?.tagline && (
                    <p className="text-[11px] font-semibold text-slate-700 mt-0.5 truncate">
                      {restaurant.landingPage.tagline}
                    </p>
                  )}
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                    {restaurant.landingPage?.subheadline || restaurant.description}
                  </p>
                  {restaurant.address && (
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                      <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                      <span className="truncate">{restaurant.address}, {restaurant.city}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Featured Category Badges / Pills */}
              {restaurant.landingPage?.featuredCategories && restaurant.landingPage.featuredCategories.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none pt-1">
                  {restaurant.landingPage.featuredCategories.map((c: any) => (
                    <div
                      key={c.id}
                      className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 shadow-2xs shrink-0 hover:bg-slate-100 transition-colors"
                    >
                      <span>{c.icon || '🍽️'}</span>
                      <span>{c.name}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Quick Contact & Helpline Bar */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                {(restaurant.landingPage?.helplineNumber || restaurant.helpline) && (
                  <a
                    href={`tel:${restaurant.landingPage?.helplineNumber || restaurant.helpline}`}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-2xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100/70 transition-colors border border-emerald-100"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Helpline</span>
                  </a>
                )}
                {(restaurant.landingPage?.contactEmail || restaurant.email) && (
                  <a
                    href={`mailto:${restaurant.landingPage?.contactEmail || restaurant.email}`}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-2xl bg-blue-50 text-blue-700 font-bold text-xs hover:bg-blue-100/70 transition-colors border border-blue-100"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email Us</span>
                  </a>
                )}
              </div>

              {/* Website Link */}
              {restaurant.website && (
                <a
                  href={restaurant.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-xs text-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-indigo-600" />
                    <span className="font-semibold">Official Website</span>
                  </div>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              )}

              {/* Social Media Profiles Grid */}
              <div className="space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Connect & Follow
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {restaurant.socialLinks?.whatsapp && (
                    <a
                      href={`https://wa.me/${restaurant.socialLinks.whatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200 text-emerald-800 text-xs font-semibold transition-colors"
                    >
                      <WhatsAppIcon className="w-4 h-4 text-emerald-600" />
                      <span className="truncate">WhatsApp</span>
                    </a>
                  )}

                  {restaurant.socialLinks?.instagram && (
                    <a
                      href={restaurant.socialLinks.instagram}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-pink-50/60 hover:bg-pink-100/60 border border-pink-100 text-pink-700 text-xs font-semibold transition-colors"
                    >
                      <InstagramIcon className="w-4 h-4 text-pink-600" />
                      <span className="truncate">Instagram</span>
                    </a>
                  )}

                  {restaurant.socialLinks?.facebook && (
                    <a
                      href={restaurant.socialLinks.facebook}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-blue-50/60 hover:bg-blue-100/60 border border-blue-100 text-blue-700 text-xs font-semibold transition-colors"
                    >
                      <FacebookIcon className="w-4 h-4 text-blue-600" />
                      <span className="truncate">Facebook</span>
                    </a>
                  )}

                  {restaurant.socialLinks?.twitter && (
                    <a
                      href={restaurant.socialLinks.twitter}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-sky-50/60 hover:bg-sky-100/60 border border-sky-100 text-sky-700 text-xs font-semibold transition-colors"
                    >
                      <TwitterIcon className="w-4 h-4 text-sky-500" />
                      <span className="truncate">Twitter / X</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Table QR Ordering Action */}
              <div className="pt-2">
                <Button
                  onClick={() => {
                    playTap();
                    setIsScannerOpen(true);
                  }}
                  size="lg"
                  className="w-full gap-2.5 shadow-lg text-sm font-bold text-white transition-all"
                  style={{
                    backgroundColor: restaurant.landingPage?.primaryColor || '#2563eb',
                    boxShadow: restaurant.landingPage?.primaryColor
                      ? `0 10px 25px -5px ${restaurant.landingPage.primaryColor}55`
                      : undefined,
                  }}
                >
                  <QrCode className="w-5 h-5" />
                  <span>{restaurant.landingPage?.ctaText || 'Scan Table QR to Order'}</span>
                  <ArrowRight className="w-4 h-4 ml-auto" />
                </Button>
                <p className="text-[11px] text-center text-slate-400 mt-2">
                  Scan the QR code placed on your table to browse the menu.
                </p>
              </div>
            </div>
          </div>
        ) : (
          /* Loading fallback */
          <BlinkitLoader
            fullScreen={false}
            className="py-12"
            subtitle="Loading restaurant menu & culinary selections..."
          />
        )}
      </main>

      {/* FOOTER */}
      {restaurant?.landingPage?.footerText && (
        <footer className="w-full max-w-xl mx-auto px-4 pb-8 pt-4 text-center space-y-2 z-10">
          <p className="text-[11px] text-slate-400 font-medium">
            {restaurant.landingPage.footerText}
          </p>
        </footer>
      )}

      {/* FLOATING SCAN BUTTON IN BOTTOM CORNER */}
      <BottomCornerScanButton
        onClick={() => setIsScannerOpen(true)}
        label="Scan Table QR"
      />

      {/* QR CAMERA & CODE SCANNER MODAL */}
      <QRScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        restaurantSlug={restaurant?.slug || 'bikaner-w7bt'}
      />
    </div>
  );
}
