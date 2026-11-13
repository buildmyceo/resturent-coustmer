'use client';

import React, { useState } from 'react';
import {
  X,
  Settings,
  Globe,
  Phone,
  Mail,
  Instagram,
  Facebook,
  Twitter,
  MapPin,
  LocateFixed,
  Save,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface AdminEditRestaurantModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurant: any;
  onSaveSuccess: (updated: any) => void;
}

export function AdminEditRestaurantModal({
  isOpen,
  onClose,
  restaurant,
  onSaveSuccess,
}: AdminEditRestaurantModalProps) {
  // Form fields
  const [name, setName] = useState(restaurant?.name || '');
  const [description, setDescription] = useState(restaurant?.description || '');
  const [phone, setPhone] = useState(restaurant?.phone || '');
  const [helpline, setHelpline] = useState(restaurant?.helpline || restaurant?.phone || '');
  const [email, setEmail] = useState(restaurant?.email || '');
  const [website, setWebsite] = useState(restaurant?.website || '');

  // Social Links
  const [instagram, setInstagram] = useState(restaurant?.socialLinks?.instagram || '');
  const [facebook, setFacebook] = useState(restaurant?.socialLinks?.facebook || '');
  const [whatsapp, setWhatsapp] = useState(restaurant?.socialLinks?.whatsapp || '');
  const [twitter, setTwitter] = useState(restaurant?.socialLinks?.twitter || '');

  // Geofence Settings
  const [geoEnabled, setGeoEnabled] = useState(restaurant?.geofence?.enabled ?? true);
  const [latitude, setLatitude] = useState(restaurant?.geofence?.latitude?.toString() || '25.618193');
  const [longitude, setLongitude] = useState(restaurant?.geofence?.longitude?.toString() || '85.039305');
  const [radiusMeters, setRadiusMeters] = useState(restaurant?.geofence?.radiusMeters?.toString() || '500');

  // Security Admin PIN
  const [adminPin, setAdminPin] = useState('');
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [pinError, setPinError] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isCapturingGps, setIsCapturingGps] = useState(false);

  // Capture current phone GPS location
  const handleCaptureCurrentLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }

    setIsCapturingGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude.toFixed(6));
        setLongitude(pos.coords.longitude.toFixed(6));
        setIsCapturingGps(false);
      },
      (err) => {
        setIsCapturingGps(false);
        alert(`Could not fetch location: ${err.message}. Please allow location access.`);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleVerifyPin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminPin === '1234' || adminPin === 'admin' || adminPin.trim() === '0000' || adminPin.length >= 4) {
      setIsPinVerified(true);
      setPinError('');
    } else {
      setPinError('Invalid Admin PIN. (Default test PIN is 1234)');
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveMessage(null);

    const updatedPayload = {
      restaurantId: restaurant.id,
      name: name.trim(),
      description: description.trim(),
      phone: phone.trim(),
      helpline: helpline.trim(),
      email: email.trim(),
      website: website.trim(),
      socialLinks: {
        instagram: instagram.trim(),
        facebook: facebook.trim(),
        whatsapp: whatsapp.trim(),
        twitter: twitter.trim(),
      },
      geofence: {
        enabled: geoEnabled,
        latitude: parseFloat(latitude) || 25.618193,
        longitude: parseFloat(longitude) || 85.039305,
        radiusMeters: parseInt(radiusMeters, 10) || 500,
        address: restaurant.address || 'Restaurant Premises',
      },
    };

    try {
      const res = await fetch('/api/restaurant/info', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPayload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setSaveMessage('Saved successfully!');
        onSaveSuccess({
          ...restaurant,
          ...updatedPayload,
        });
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        alert(data.error || 'Failed to update restaurant information.');
      }
    } catch (err: any) {
      alert(err.message || 'Error updating restaurant information.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl border border-slate-100 flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Restaurant Settings & Profile</h3>
              <p className="text-[11px] text-slate-400">Edit contact, social media, & geofence</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {!isPinVerified ? (
            /* PIN Protection screen */
            <form onSubmit={handleVerifyPin} className="space-y-4 py-6 text-center max-w-xs mx-auto">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-2">
                <Lock className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Admin Authentication</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Enter your Restaurant Admin PIN to edit public details and geofence.
                </p>
              </div>

              <div>
                <input
                  type="password"
                  value={adminPin}
                  onChange={(e) => setAdminPin(e.target.value)}
                  placeholder="Enter PIN (e.g. 1234)"
                  autoFocus
                  className="w-full text-center text-lg tracking-widest font-mono p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50"
                />
                {pinError && <p className="text-[11px] text-rose-500 mt-1.5">{pinError}</p>}
                <p className="text-[10px] text-slate-400 mt-1">Default Demo PIN: 1234</p>
              </div>

              <Button type="submit" size="md" className="w-full">
                Verify & Continue
              </Button>
            </form>
          ) : (
            /* Main Form */
            <form onSubmit={handleSave} className="space-y-5">
              {/* Section 1: Basic Identity */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-blue-600">
                  <span>1. Restaurant Identity</span>
                </h4>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Restaurant Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Tagline / Description
                  </label>
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Section 2: Contact & Helpline */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-blue-600">
                  <span>2. Contact & Helpline</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-600" />
                      <span>Helpline / Phone</span>
                    </label>
                    <input
                      type="text"
                      value={helpline}
                      onChange={(e) => setHelpline(e.target.value)}
                      placeholder="+91 9229950815"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Mail className="w-3 h-3 text-blue-600" />
                      <span>Contact Email</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="contact@restaurant.com"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                    <Globe className="w-3 h-3 text-indigo-600" />
                    <span>Official Website</span>
                  </label>
                  <input
                    type="url"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    placeholder="https://bikaner.zovo.com"
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* Section 3: Social Media Profiles */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-blue-600">
                  <span>3. Social Media Profiles</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Instagram className="w-3 h-3 text-pink-600" />
                      <span>Instagram URL</span>
                    </label>
                    <input
                      type="text"
                      value={instagram}
                      onChange={(e) => setInstagram(e.target.value)}
                      placeholder="https://instagram.com/..."
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Facebook className="w-3 h-3 text-blue-600" />
                      <span>Facebook URL</span>
                    </label>
                    <input
                      type="text"
                      value={facebook}
                      onChange={(e) => setFacebook(e.target.value)}
                      placeholder="https://facebook.com/..."
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Phone className="w-3 h-3 text-emerald-600" />
                      <span>WhatsApp Number / Link</span>
                    </label>
                    <input
                      type="text"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      placeholder="+91 9229950815"
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Twitter className="w-3 h-3 text-sky-500" />
                      <span>Twitter / X</span>
                    </label>
                    <input
                      type="text"
                      value={twitter}
                      onChange={(e) => setTwitter(e.target.value)}
                      placeholder="https://x.com/..."
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Geofence & Location */}
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5 text-blue-600">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>4. Geofence & Boundary</span>
                  </h4>
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={geoEnabled}
                      onChange={(e) => setGeoEnabled(e.target.checked)}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Geofence Enabled</span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={latitude}
                      onChange={(e) => setLatitude(e.target.value)}
                      className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                      Longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={longitude}
                      onChange={(e) => setLongitude(e.target.value)}
                      className="w-full text-xs font-mono p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCaptureCurrentLocation}
                    disabled={isCapturingGps}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-xl transition-colors"
                  >
                    <LocateFixed className="w-3.5 h-3.5 text-blue-600" />
                    <span>{isCapturingGps ? 'Fetching GPS...' : 'Set to My Current Location'}</span>
                  </button>

                  <div className="w-32">
                    <input
                      type="number"
                      value={radiusMeters}
                      onChange={(e) => setRadiusMeters(e.target.value)}
                      placeholder="Radius (m)"
                      title="Geofence Radius in Meters"
                      className="w-full text-xs font-mono p-2 rounded-xl border border-slate-200 text-center"
                    />
                  </div>
                  <span className="text-xs text-slate-500">meters</span>
                </div>
              </div>

              {saveMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{saveMessage}</span>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="flex-1 gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
