'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  LocateFixed,
  LogOut,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  mergeWithSupabaseUser,
  SavedDeliveryAddress,
  writeLocalProfile,
} from '@/lib/customer-profile';
import { isValidEmail, isValidPhone } from '@/lib/validation/customer';
import { StorefrontBottomNav } from '@/components/store/StorefrontBottomNav';
import { CustomerAuthModal } from '@/components/auth/CustomerAuthModal';

export default function CustomerProfileSettingsPage() {
  const params = useParams<{ restaurantSlug: string }>();
  const restaurantSlug = params?.restaurantSlug || '';
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [authOpen, setAuthOpen] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedDeliveryAddress[]>([]);

  const [savingProfile, setSavingProfile] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New friend / address form
  const [showAddForm, setShowAddForm] = useState(false);
  const [label, setLabel] = useState('');
  const [isFriend, setIsFriend] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [landmark, setLandmark] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [locating, setLocating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getUser();
      const u = data?.user || null;
      setUser(u);
      const merged = mergeWithSupabaseUser(u);
      setName(merged.name);
      setPhone(merged.phone);
      setEmail(merged.email);
      setSavedAddresses(merged.savedAddresses);
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persistAll = async (
    nextName: string,
    nextPhone: string,
    nextEmail: string,
    nextAddresses: SavedDeliveryAddress[]
  ) => {
    writeLocalProfile({
      name: nextName,
      phone: nextPhone,
      email: nextEmail,
      savedAddresses: nextAddresses,
    });
    if (user) {
      await supabase.auth.updateUser({
        data: {
          full_name: nextName,
          phone: nextPhone,
          saved_addresses: nextAddresses,
        },
      });
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    if (!name.trim()) {
      setErrorMsg('Please enter your full name.');
      return;
    }
    if (!isValidPhone(phone)) {
      setErrorMsg('Please enter a valid 10-15 digit phone number.');
      return;
    }
    if (email && !isValidEmail(email)) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setSavingProfile(true);
    try {
      await persistAll(name.trim(), phone.trim(), email.trim(), savedAddresses);
      setStatusMsg('Profile settings saved!');
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(String(Number(pos.coords.latitude.toFixed(6))));
        setLng(String(Number(pos.coords.longitude.toFixed(6))));
        setLocating(false);
      },
      (err) => {
        setLocating(false);
        setErrorMsg(err.message || 'Could not detect GPS location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    if (!label.trim() || !recipientName.trim() || !address.trim()) {
      setErrorMsg('Label, recipient name, and street address are required.');
      return;
    }
    if (!isValidPhone(recipientPhone)) {
      setErrorMsg('Please enter a valid 10-15 digit phone number for this recipient.');
      return;
    }

    const newItem: SavedDeliveryAddress = {
      id: `addr_${Date.now()}`,
      label: label.trim(),
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      address: address.trim(),
      landmark: landmark.trim() || undefined,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      isFriend,
    };

    const updated = [...savedAddresses, newItem];
    setSavedAddresses(updated);
    await persistAll(name, phone, email, updated);

    setLabel('');
    setRecipientName('');
    setRecipientPhone('');
    setAddress('');
    setLandmark('');
    setLat('');
    setLng('');
    setIsFriend(false);
    setShowAddForm(false);
    setStatusMsg('Saved delivery address / friend added!');
  };

  const handleDeleteAddress = async (id: string) => {
    const updated = savedAddresses.filter((a) => a.id !== id);
    setSavedAddresses(updated);
    await persistAll(name, phone, email, updated);
    setStatusMsg('Saved address removed.');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-light-surface">
        <Loader2 className="w-8 h-8 text-light-primary animate-spin" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-light-surface pb-28">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <Link
            href={`/store/${restaurantSlug}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Menu
          </Link>

          {user ? (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-rose-600 hover:bg-rose-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setAuthOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-light-primary text-white text-xs font-semibold"
            >
              <User className="w-3.5 h-3.5" />
              Sign In / Sync Account
            </button>
          )}
        </div>

        <div>
          <h1 className="font-headline text-2xl font-bold text-slate-900">Profile Settings</h1>
          <p className="text-xs text-slate-500 mt-1">
            Save your contact info and your friends&apos; delivery addresses for 1-tap checkout.
          </p>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{statusMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {errorMsg}
          </div>
        )}

        {/* Personal Profile Form */}
        <form
          onSubmit={handleSaveProfile}
          className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs"
        >
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <User className="w-4 h-4 text-light-primary" />
            My Contact Info
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                <Phone className="w-3 h-3 inline mr-1" />
                Phone Number *
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+91 9876543210"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              <Mail className="w-3 h-3 inline mr-1" />
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
            />
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="px-5 py-2.5 rounded-xl bg-light-primary text-white text-xs font-semibold hover:opacity-95 disabled:opacity-50"
          >
            {savingProfile ? 'Saving...' : 'Save Profile'}
          </button>
        </form>

        {/* Saved Addresses & Friends */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-light-primary" />
                Saved Delivery Locations &amp; Friends
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Order food to your own address or directly to a friend&apos;s location.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 text-xs font-semibold hover:bg-orange-100"
            >
              <Plus className="w-3.5 h-3.5" />
              Add New
            </button>
          </div>

          {showAddForm && (
            <form
              onSubmit={handleAddAddress}
              className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">New Delivery Recipient</span>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFriend}
                    onChange={(e) => setIsFriend(e.target.checked)}
                    className="rounded"
                  />
                  This is a friend&apos;s address
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Label (e.g. Home, Rahul)"
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white"
                  required
                />
                <input
                  type="text"
                  value={recipientName}
                  onChange={(e) => setRecipientName(e.target.value)}
                  placeholder="Recipient Name *"
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white"
                  required
                />
                <input
                  type="tel"
                  value={recipientPhone}
                  onChange={(e) => setRecipientPhone(e.target.value)}
                  placeholder="Recipient Phone *"
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white"
                  required
                />
              </div>

              <textarea
                rows={2}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Complete Street Address *"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white"
                required
              />

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Landmark (Optional)"
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white"
                />
                <input
                  type="text"
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  placeholder="Lat (optional)"
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white"
                />
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={lng}
                    onChange={(e) => setLng(e.target.value)}
                    placeholder="Lng (optional)"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleUseGps}
                    disabled={locating}
                    title="Use Current GPS"
                    className="px-2.5 py-2 rounded-xl bg-white border border-slate-200 text-orange-600 hover:bg-orange-50"
                  >
                    {locating ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <LocateFixed className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-light-primary text-white text-xs font-semibold"
                >
                  Save Location
                </button>
              </div>
            </form>
          )}

          {savedAddresses.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              No saved addresses yet. Add your home, work, or a friend&apos;s delivery location.
            </p>
          ) : (
            <div className="space-y-2.5">
              {savedAddresses.map((addr) => (
                <div
                  key={addr.id}
                  className="p-3.5 rounded-xl border border-slate-200 flex items-start justify-between gap-3"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{addr.label}</span>
                      {addr.isFriend && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Friend
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 font-medium">
                      {addr.recipientName} · {addr.recipientPhone}
                    </p>
                    <p className="text-slate-500 flex items-start gap-1">
                      <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5 text-orange-600" />
                      <span>
                        {addr.address}
                        {addr.landmark ? ` (${addr.landmark})` : ''}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteAddress(addr.id)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <StorefrontBottomNav restaurantSlug={restaurantSlug} />
      <CustomerAuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => loadData()}
      />
    </main>
  );
}
