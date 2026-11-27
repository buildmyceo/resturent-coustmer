'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Home,
  Hotel,
  Loader2,
  LocateFixed,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Receipt,
  Trash2,
  User,
  Users,
} from 'lucide-react';
import { formatCurrency } from '@/lib/format';
import { createClient } from '@/lib/supabase/client';
import {
  AddressCategory,
  clearLocalProfile,
  mergeWithSupabaseUser,
  SavedDeliveryAddress,
  writeLocalProfile,
} from '@/lib/customer-profile';
import { isValidEmail, isValidPhone } from '@/lib/validation/customer';
import { StorefrontBottomNav } from '@/components/store/StorefrontBottomNav';
import { CustomerAuthModal } from '@/components/auth/CustomerAuthModal';

const ADDRESS_CATEGORIES: { id: AddressCategory; label: string; icon: any }[] = [
  { id: 'HOME', label: 'Home', icon: Home },
  { id: 'WORK', label: 'Work', icon: Building2 },
  { id: 'HOTEL', label: 'Hotel', icon: Hotel },
  { id: 'OTHER', label: 'Other', icon: MapPin },
];

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
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [defaultAddress, setDefaultAddress] = useState('');
  const [defaultPincode, setDefaultPincode] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<SavedDeliveryAddress[]>([]);

  const [savingProfile, setSavingProfile] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [locatingProfile, setLocatingProfile] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // New friend / address form
  const [showAddForm, setShowAddForm] = useState(false);
  const [category, setCategory] = useState<AddressCategory>('HOME');
  const [customLabel, setCustomLabel] = useState('');
  const [isFriend, setIsFriend] = useState(false);
  const [recipientName, setRecipientName] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [locatingAddr, setLocatingAddr] = useState(false);
  const [bills, setBills] = useState<any[]>([]);
  const [billFilter, setBillFilter] = useState<'all' | 'dine_in' | 'delivery'>('all');
  const [loadingBills, setLoadingBills] = useState(true);

  const loadData = async () => {
    setLoading(true);
    setLoadingBills(true);
    try {
      const { data } = await supabase.auth.getUser();
      const u = data?.user || null;
      setUser(u);
      const merged = mergeWithSupabaseUser(u);
      setName(merged.name);
      setPhone(merged.phone);
      setEmail(merged.email);
      setAge(merged.age || '');
      setGender(merged.gender || '');
      setDefaultAddress(merged.defaultAddress || '');
      setDefaultPincode(merged.defaultPincode || '');
      setSavedAddresses(merged.savedAddresses);
      if (!merged.name && !merged.phone) {
        setEditingProfile(true);
      }

      try {
        const infoRes = await fetch(
          `/api/restaurant/info?slug=${encodeURIComponent(restaurantSlug)}`,
          { cache: 'no-store' }
        );
        const infoJson = await infoRes.json();
        const restaurantId = infoJson?.restaurant?.id || '';
        const qs = new URLSearchParams();
        if (restaurantId) qs.set('restaurantId', restaurantId);
        const bRes = await fetch(`/api/customer/history?${qs.toString()}`, {
          cache: 'no-store',
        });
        const bJson = await bRes.json();
        if (bJson.success) setBills(bJson.bills || []);
      } catch {}
    } catch {}
    setLoadingBills(false);
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
    nextAge: string,
    nextGender: string,
    nextDefaultAddr: string,
    nextDefaultPin: string,
    nextAddresses: SavedDeliveryAddress[]
  ) => {
    writeLocalProfile({
      name: nextName,
      phone: nextPhone,
      email: nextEmail,
      age: nextAge,
      gender: nextGender,
      defaultAddress: nextDefaultAddr,
      defaultPincode: nextDefaultPin,
      savedAddresses: nextAddresses,
    });
    if (user) {
      await supabase.auth.updateUser({
        data: {
          full_name: nextName,
          phone: nextPhone,
          age: nextAge || undefined,
          gender: nextGender || undefined,
          default_address: nextDefaultAddr || undefined,
          default_pincode: nextDefaultPin || undefined,
          saved_addresses: nextAddresses,
        },
      });
    }
  };

  const reverseGeocode = async (latNum: number, lngNum: number) => {
    const res = await fetch(`/api/geocode/reverse?lat=${latNum}&lng=${lngNum}`);
    const json = await res.json();
    return json;
  };

  const handleUseProfileGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }
    setLocatingProfile(true);
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latNum = Number(pos.coords.latitude.toFixed(6));
        const lngNum = Number(pos.coords.longitude.toFixed(6));
        try {
          const geo = await reverseGeocode(latNum, lngNum);
          if (geo.success) {
            if (geo.address) setDefaultAddress(geo.address);
            if (geo.pincode) setDefaultPincode(geo.pincode);
          }
        } catch {}
        setLocatingProfile(false);
      },
      (err) => {
        setLocatingProfile(false);
        setErrorMsg(err.message || 'Could not detect GPS location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
      await persistAll(
        name.trim(),
        phone.trim(),
        email.trim(),
        age.trim(),
        gender,
        defaultAddress.trim(),
        defaultPincode.trim(),
        savedAddresses
      );
      setStatusMsg('Profile settings saved!');
      setEditingProfile(false);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleUseAddrGps = () => {
    if (!navigator.geolocation) {
      setErrorMsg('Geolocation is not supported by your browser.');
      return;
    }
    setLocatingAddr(true);
    setErrorMsg(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const latNum = Number(pos.coords.latitude.toFixed(6));
        const lngNum = Number(pos.coords.longitude.toFixed(6));
        setLat(String(latNum));
        setLng(String(lngNum));
        try {
          const geo = await reverseGeocode(latNum, lngNum);
          if (geo.success) {
            if (geo.address) setAddress(geo.address);
            if (geo.pincode) setPincode(geo.pincode);
          }
        } catch {}
        setLocatingAddr(false);
      },
      (err) => {
        setLocatingAddr(false);
        setErrorMsg(err.message || 'Could not detect GPS location.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);

    const finalLabel =
      category === 'OTHER' || isFriend
        ? customLabel.trim() || (isFriend ? 'Friend' : 'Other')
        : category.charAt(0) + category.slice(1).toLowerCase();

    if (!recipientName.trim() || !address.trim()) {
      setErrorMsg('Recipient name and street address are required.');
      return;
    }
    if (!isValidPhone(recipientPhone)) {
      setErrorMsg('Please enter a valid 10-15 digit phone number for this recipient.');
      return;
    }

    const newItem: SavedDeliveryAddress = {
      id: `addr_${Date.now()}`,
      category,
      label: finalLabel,
      recipientName: recipientName.trim(),
      recipientPhone: recipientPhone.trim(),
      address: address.trim(),
      pincode: pincode.trim() || undefined,
      landmark: landmark.trim() || undefined,
      lat: lat ? parseFloat(lat) : undefined,
      lng: lng ? parseFloat(lng) : undefined,
      isFriend,
    };

    const updated = [...savedAddresses, newItem];
    setSavedAddresses(updated);
    await persistAll(
      name,
      phone,
      email,
      age,
      gender,
      defaultAddress,
      defaultPincode,
      updated
    );

    setCategory('HOME');
    setCustomLabel('');
    setRecipientName('');
    setRecipientPhone('');
    setAddress('');
    setPincode('');
    setLandmark('');
    setLat('');
    setLng('');
    setIsFriend(false);
    setShowAddForm(false);
    setStatusMsg('Saved delivery address added!');
  };

  const handleDeleteAddress = async (id: string) => {
    const updated = savedAddresses.filter((a) => a.id !== id);
    setSavedAddresses(updated);
    await persistAll(
      name,
      phone,
      email,
      age,
      gender,
      defaultAddress,
      defaultPincode,
      updated
    );
    setStatusMsg('Saved address removed.');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    clearLocalProfile();
    setUser(null);
    setName('');
    setPhone('');
    setEmail('');
    setAge('');
    setGender('');
    setDefaultAddress('');
    setDefaultPincode('');
    setSavedAddresses([]);
    setBills([]);
    setEditingProfile(true);
    setStatusMsg('Signed out successfully.');
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
            Save your contact info, age, gender, and Home / Work / Hotel / Friend locations.
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

        {/* Personal Profile Card (View Mode by default, Edit Mode on click) */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <User className="w-4 h-4 text-light-primary" />
              My Profile &amp; Default Address
            </h2>
            {!editingProfile && (
              <button
                type="button"
                onClick={() => {
                  setStatusMsg(null);
                  setErrorMsg(null);
                  setEditingProfile(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit
              </button>
            )}
          </div>

          {!editingProfile ? (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[11px] font-medium text-slate-500">Full Name</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{name || '—'}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[11px] font-medium text-slate-500">Phone Number</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{phone || '—'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[11px] font-medium text-slate-500">Age</p>
                  <p className="font-semibold text-slate-900 mt-0.5">{age || '—'}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[11px] font-medium text-slate-500">Gender</p>
                  <p className="font-semibold text-slate-900 mt-0.5 capitalize">
                    {gender || 'Prefer not to say'}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                  <p className="text-[11px] font-medium text-slate-500">Email</p>
                  <p className="font-semibold text-slate-900 mt-0.5 truncate">{email || '—'}</p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <p className="text-[11px] font-medium text-slate-500">Default Delivery Address</p>
                <p className="font-medium text-slate-900 mt-0.5">
                  {defaultAddress || 'No default address saved yet.'}
                  {defaultPincode ? ` - ${defaultPincode}` : ''}
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveProfile} className="space-y-4">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Age</label>
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="25"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Gender</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm bg-white"
                  >
                    <option value="">Prefer not to say</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
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

              <div className="pt-2 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-700">Default Address</label>
                  <button
                    type="button"
                    onClick={handleUseProfileGps}
                    disabled={locatingProfile}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-orange-50 text-orange-700 text-[11px] font-semibold hover:bg-orange-100"
                  >
                    {locatingProfile ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <LocateFixed className="w-3 h-3" />
                    )}
                    Auto-fill from GPS
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={defaultAddress}
                  onChange={(e) => setDefaultAddress(e.target.value)}
                  placeholder="House/Flat no, Street, Area, City"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                />
                <div className="max-w-[180px]">
                  <label className="block text-xs font-medium text-slate-700 mb-1">Pincode</label>
                  <input
                    type="text"
                    value={defaultPincode}
                    onChange={(e) => setDefaultPincode(e.target.value)}
                    placeholder="e.g. 248007"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-5 py-2.5 rounded-xl bg-light-primary text-white text-xs font-semibold hover:opacity-95 disabled:opacity-50 cursor-pointer"
                >
                  {savingProfile ? 'Saving...' : 'Save Profile'}
                </button>
                {(name || phone) && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingProfile(false);
                      loadData();
                    }}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          )}
        </div>

        {/* Saved Addresses & Friends */}
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-light-primary" />
                Saved Addresses (Home / Work / Hotel / Friends)
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Order food to your Home, Work, Hotel, or a friend&apos;s location.
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
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  {ADDRESS_CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setCategory(cat.id)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          category === cat.id
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        {cat.label}
                      </button>
                    );
                  })}
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isFriend}
                    onChange={(e) => setIsFriend(e.target.checked)}
                    className="rounded"
                  />
                  Friend&apos;s address
                </label>
              </div>

              {(category === 'OTHER' || isFriend) && (
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="Custom Label (e.g. Friend - Rahul, Room 302)"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white"
                />
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleUseAddrGps}
                  disabled={locatingAddr}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-orange-600 text-xs font-semibold hover:bg-orange-50"
                >
                  {locatingAddr ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <LocateFixed className="w-3.5 h-3.5" />
                  )}
                  Detect GPS, Address &amp; Pincode
                </button>
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
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  placeholder="Pincode"
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white"
                />
                <input
                  type="text"
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder="Landmark (Optional)"
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs bg-white"
                />
                <input
                  type="text"
                  value={lat && lng ? `${lat}, ${lng}` : ''}
                  readOnly
                  placeholder="GPS coordinates"
                  className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono bg-slate-100 text-slate-600"
                />
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
              No saved addresses yet. Add your Home, Work, Hotel, or a friend&apos;s location.
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
                      {addr.category && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-700">
                          {addr.category}
                        </span>
                      )}
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
                        {addr.pincode ? ` - ${addr.pincode}` : ''}
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

        {/* Bill History Section */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <Receipt className="w-4 h-4 text-orange-600" />
                Bill History &amp; Receipts
              </h2>
              <p className="text-xs text-slate-500">
                Your completed and paid bills for this restaurant.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex items-center gap-1 bg-slate-100 rounded-lg p-0.5 text-[11px] font-semibold">
                {([
                  { id: 'all', label: 'All' },
                  { id: 'dine_in', label: 'Dine-In' },
                  { id: 'delivery', label: 'Delivery' },
                ] as const).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setBillFilter(tab.id)}
                    className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                      billFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <Link
                href={`/store/${restaurantSlug}/bills`}
                className="text-xs font-semibold text-orange-600 hover:underline"
              >
                View All
              </Link>
            </div>
          </div>

          {loadingBills ? (
            <div className="py-6 text-center">
              <Loader2 className="w-5 h-5 text-orange-600 animate-spin mx-auto" />
            </div>
          ) : bills.filter((b) => billFilter === 'all' || (b.order_type || 'dine_in') === billFilter).length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">
              {user
                ? billFilter === 'dine_in'
                  ? 'No dine-in bills yet.'
                  : billFilter === 'delivery'
                  ? 'No delivery bills yet.'
                  : 'No paid bills yet.'
                : 'Sign in with Google or Email to view your bill history.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {bills
                .filter((b) => billFilter === 'all' || (b.order_type || 'dine_in') === billFilter)
                .slice(0, 5)
                .map((b) => (
                <div
                  key={b.id}
                  className="p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900">
                          #{b.order_number}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            b.order_type === 'delivery'
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {b.order_type === 'delivery' ? 'Delivery' : 'Dine-In'}
                        </span>
                      </div>
                      <p className="text-slate-500 mt-0.5">
                        {new Date(b.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                        PAID
                      </span>
                      <p className="text-sm font-bold text-slate-900 mt-1">
                        {formatCurrency(Number(b.total_amount || 0), 'INR')}
                      </p>
                    </div>
                  </div>
                  <div className="text-slate-600 border-t border-slate-100 pt-1.5">
                    {(b.order_items || [])
                      .map((i: any) => `${i.quantity}× ${i.dish_name}`)
                      .join(', ')}
                  </div>
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
