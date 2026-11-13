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
import { getGuestSession, clearGuestSession, GuestSessionState } from '@/lib/guest-session';
import { calculateDistanceMeters, formatDistance } from '@/lib/geofence';
import { QRScannerModal } from '@/components/scanner/QRScannerModal';
import { BottomCornerScanButton } from '@/components/layout/BottomCornerScanButton';
import { AdminEditRestaurantModal } from '@/components/admin/AdminEditRestaurantModal';
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
  const [isAdminEditOpen, setIsAdminEditOpen] = useState(false);

  // Geofence & Location State
  const [userCoords, setUserCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<'prompt' | 'granted' | 'denied' | 'simulated'>('prompt');
  const [simulationMode, setSimulationMode] = useState<'auto' | 'inside' | 'outside'>('auto');
  const [showLocationMenu, setShowLocationMenu] = useState(false);

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
    if (simulationMode !== 'auto') return;

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
  }, [simulationMode]);

  // 4. Calculate Distance & Geofence Status
  const { distanceMeters, isWithinGeofence } = useMemo(() => {
    if (!restaurant?.geofence) {
      return { distanceMeters: null, isWithinGeofence: false };
    }

    const { latitude: restLat, longitude: restLon, radiusMeters, enabled } = restaurant.geofence;

    // Manual simulation overrides for testing
    if (simulationMode === 'inside') {
      return { distanceMeters: 45, isWithinGeofence: true };
    }
    if (simulationMode === 'outside') {
      return { distanceMeters: 3800, isWithinGeofence: false };
    }

    // Auto GPS mode
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
  }, [restaurant, userCoords, simulationMode]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between selection:bg-rose-500 selection:text-white relative overflow-x-hidden font-sans">
      {/* Background Ambient Glows */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-2xl h-96 bg-gradient-to-b from-rose-100/40 via-amber-50/30 to-transparent blur-3xl pointer-events-none -z-10" />

      {/* TOP NAVIGATION BAR */}
      <header className="w-full max-w-xl mx-auto px-4 pt-4 sm:pt-6 flex items-center justify-between z-20">
        {/* Brand Mark */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 text-white flex items-center justify-center font-black text-sm shadow-md shadow-rose-500/20">
            C
          </div>
          <div>
            <span className="font-black text-sm tracking-tight text-slate-900 block leading-none">
              CEOVA
            </span>
            <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
              Dining SaaS
            </span>
          </div>
        </div>

        {/* Right Controls: Geofence Pill & Admin Settings */}
        <div className="flex items-center gap-2">
          {/* Geofence Status Pill with Simulation Switcher */}
          <div className="relative">
            <button
              onClick={() => setShowLocationMenu(!showLocationMenu)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border transition-all shadow-xs ${
                isWithinGeofence
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-white text-slate-600 border-slate-200'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  isWithinGeofence ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
                }`}
              />
              <span>
                {isWithinGeofence
                  ? `In Restaurant (${distanceMeters ? formatDistance(distanceMeters) : 'At Venue'})`
                  : distanceMeters
                  ? `Out of Range (${formatDistance(distanceMeters)})`
                  : 'Out of Range'}
              </span>
              <ChevronDown className="w-3 h-3 opacity-60" />
            </button>

            {/* Location Switcher Menu */}
            {showLocationMenu && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-white p-2 shadow-2xl border border-slate-100 z-50 text-xs animate-in fade-in zoom-in-95 duration-150">
                <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1">
                  Geofence Mode
                </div>
                <button
                  onClick={() => {
                    setSimulationMode('auto');
                    setShowLocationMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl transition-colors flex items-center justify-between ${
                    simulationMode === 'auto'
                      ? 'bg-blue-50 text-blue-600 font-bold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>Auto (Device GPS)</span>
                  {simulationMode === 'auto' && <span className="text-[10px]">●</span>}
                </button>
                <button
                  onClick={() => {
                    setSimulationMode('inside');
                    setShowLocationMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl transition-colors flex items-center justify-between ${
                    simulationMode === 'inside'
                      ? 'bg-emerald-50 text-emerald-700 font-bold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>Simulate: Inside Restaurant</span>
                  {simulationMode === 'inside' && <span className="text-[10px]">●</span>}
                </button>
                <button
                  onClick={() => {
                    setSimulationMode('outside');
                    setShowLocationMenu(false);
                  }}
                  className={`w-full text-left px-2.5 py-1.5 rounded-xl transition-colors flex items-center justify-between ${
                    simulationMode === 'outside'
                      ? 'bg-amber-50 text-amber-700 font-bold'
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span>Simulate: Out of Range</span>
                  {simulationMode === 'outside' && <span className="text-[10px]">●</span>}
                </button>
              </div>
            )}
          </div>

          {/* Admin Edit Trigger */}
          <button
            onClick={() => {
              playTap();
              setIsAdminEditOpen(true);
            }}
            title="Restaurant Admin: Edit info, social profiles, & geofence"
            className="w-8 h-8 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center transition-colors shadow-2xs"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
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

        {/* 2. DYNAMIC CONTENT: GEOFENCE SWITCH */}
        {isWithinGeofence && restaurant ? (
          /* ========================================================================= */
          /* STATE B: INSIDE RESTAURANT GEOFENCE -> SHOW RESTAURANT INFO, SOCIAL, CALL */
          /* ========================================================================= */
          <div className="space-y-5 animate-in fade-in duration-300">
            {/* Restaurant Profile Card */}
            <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-5 relative overflow-hidden">
              <div className="flex items-start gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shrink-0 font-black text-2xl shadow-md shadow-blue-500/20">
                  {restaurant.name ? restaurant.name.charAt(0).toUpperCase() : 'R'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-lg font-black text-slate-900 tracking-tight truncate">
                      {restaurant.name}
                    </h1>
                    <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold">
                      Open
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-0.5">
                    {restaurant.description}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-1">
                    <MapPin className="w-3 h-3 text-rose-500 shrink-0" />
                    <span className="truncate">{restaurant.address}, {restaurant.city}</span>
                  </div>
                </div>
              </div>

              {/* Quick Contact & Helpline Bar */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                {restaurant.helpline && (
                  <a
                    href={`tel:${restaurant.helpline}`}
                    className="flex items-center justify-center gap-2 p-2.5 rounded-2xl bg-emerald-50 text-emerald-700 font-bold text-xs hover:bg-emerald-100/70 transition-colors border border-emerald-100"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Call Helpline</span>
                  </a>
                )}
                {restaurant.email && (
                  <a
                    href={`mailto:${restaurant.email}`}
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

                  {restaurant.socialLinks?.whatsapp && (
                    <a
                      href={`https://wa.me/${restaurant.socialLinks.whatsapp.replace(/[^0-9]/g, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-emerald-50/60 hover:bg-emerald-100/60 border border-emerald-100 text-emerald-700 text-xs font-semibold transition-colors"
                    >
                      <WhatsAppIcon className="w-4 h-4 text-emerald-600" />
                      <span className="truncate">WhatsApp</span>
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
                  className="w-full gap-2.5 shadow-lg shadow-blue-500/20 text-sm font-bold"
                >
                  <QrCode className="w-5 h-5" />
                  <span>Scan Table QR to Order</span>
                </Button>
                <p className="text-[11px] text-center text-slate-400 mt-2">
                  Scan the QR code placed on your table to browse the menu.
                </p>
              </div>

              {/* Quick Sample Tables */}
              <div className="pt-2 border-t border-slate-100 space-y-1.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Quick Select Table
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => router.push('/qr/zv_bikanerw7bt_tT01')}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-xs font-medium text-slate-700 text-left transition-colors"
                  >
                    Table T-01 (Dining)
                  </button>
                  <button
                    onClick={() => router.push('/qr/zv_bikanerw7bt_tT02')}
                    className="p-2 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-100 text-xs font-medium text-slate-700 text-left transition-colors"
                  >
                    Table T-02 (Booth)
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* ========================================================================= */
          /* STATE A: OUT OF RANGE / DEFAULT COMPANY MESSAGE (CEOVA SIGNATURE)         */
          /* ========================================================================= */
          <div className="space-y-6 text-center animate-in fade-in duration-300">
            {/* Pill Badge */}
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 border border-rose-100 text-rose-600 text-xs font-bold shadow-2xs">
              <Sparkles className="w-3.5 h-3.5 text-rose-500" />
              <span>Contactless Dining Experience</span>
            </div>

            {/* BIG TYPOGRAPHY HEADLINE */}
            <div className="space-y-4">
              <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-[1.15]">
                Thank you for dining in your favourite restaurant{' '}
                <span className="inline-block text-rose-500 animate-pulse drop-shadow-md">
                  ❤️
                </span>
              </h1>

              {/* Signature Typography */}
              <div className="pt-1">
                <p className="text-lg sm:text-xl font-bold bg-gradient-to-r from-rose-600 via-amber-600 to-rose-700 bg-clip-text text-transparent italic tracking-wide">
                  Taste and Love from Ceova
                </p>
                <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto mt-2 leading-relaxed">
                  Every meal is a memory. Ceova powers interactive dining, effortless contactless orders, and real-time kitchen tracking for restaurants worldwide.
                </p>
              </div>
            </div>

            {/* Feature Showcase Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-left">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-1">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm mb-2">
                  <Utensils className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-800">Live Menus</h3>
                <p className="text-[11px] text-slate-500 leading-tight">
                  High-res dishes, custom allergens, & live availability.
                </p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-1">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold text-sm mb-2">
                  <Clock className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-800">Kitchen Sync</h3>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Track food preparation directly from the kitchen display.
                </p>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-1">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-sm mb-2">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-slate-800">Zero Wait Bill</h3>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Shared table orders, direct UPI payments, & tax receipts.
                </p>
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="pt-2">
              <Button
                onClick={() => {
                  playTap();
                  setIsScannerOpen(true);
                }}
                size="lg"
                className="w-full gap-2.5 shadow-xl shadow-rose-500/20 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-sm font-bold"
              >
                <QrCode className="w-5 h-5" />
                <span>Scan Table QR to Order</span>
              </Button>
              <p className="text-[11px] text-slate-400 mt-2">
                Sitting at a table? Scan the QR code to order right away.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="w-full max-w-xl mx-auto px-4 pb-8 pt-4 text-center space-y-2 z-10">
        <p className="text-[11px] text-slate-400 font-medium">
          Ceova Hospitality SaaS • Premium Contactless Dining
        </p>
      </footer>

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

      {/* ADMIN RESTAURANT PROFILE & GEOFENCE EDIT MODAL */}
      <AdminEditRestaurantModal
        isOpen={isAdminEditOpen}
        onClose={() => setIsAdminEditOpen(false)}
        restaurant={restaurant}
        onSaveSuccess={(updated) => setRestaurant(updated)}
      />
    </div>
  );
}
