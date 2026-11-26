'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Mail, Phone, User, X, CheckCircle2, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { isValidEmail, isValidPhone } from '@/lib/validation/customer';

interface CustomerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (user: any) => void;
}

export function CustomerAuthModal({ isOpen, onClose, onSuccess }: CustomerAuthModalProps) {
  const supabase = createClient();

  const [mode, setMode] = useState<'signin' | 'signup' | 'complete_profile'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        const meta = data.user.user_metadata || {};
        setFullName(meta.full_name || meta.name || '');
        setPhone(meta.phone || '');
        setEmail(data.user.email || '');
        if (!meta.full_name || !meta.phone) {
          setMode('complete_profile');
        }
      }
    });
  }, [isOpen, supabase]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    const currentOrigin = window.location.origin;
    const isLocalOrVercel =
      currentOrigin.includes('localhost') ||
      currentOrigin.includes('127.0.0.1') ||
      currentOrigin.endsWith('.vercel.app');

    if (!isLocalOrVercel) {
      const authRelayOrigin =
        process.env.NEXT_PUBLIC_PLATFORM_AUTH_ORIGIN || 'https://resturent-coustmer.vercel.app';
      window.location.href = `${authRelayOrigin}/api/auth/google-start?returnTo=${encodeURIComponent(
        window.location.href
      )}`;
      return;
    }

    const redirectTo = `${currentOrigin}/auth/callback?next=${encodeURIComponent(
      window.location.pathname
    )}`;
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (oauthErr) {
      setError(oauthErr.message);
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!isValidEmail(email)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (mode === 'signup') {
      if (!fullName.trim()) {
        setError('Please enter your full name.');
        return;
      }
      if (!isValidPhone(phone)) {
        setError('Please enter a valid 10-15 digit phone number.');
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === 'signup') {
        const { data, error: signUpErr } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              phone: phone.trim(),
            },
          },
        });
        if (signUpErr) {
          setError(signUpErr.message);
        } else if (data.user) {
          try {
            localStorage.setItem(
              'ceova_customer_profile',
              JSON.stringify({
                name: fullName.trim(),
                email: email.trim(),
                phone: phone.trim(),
              })
            );
          } catch {}
          if (data.session) {
            onSuccess?.(data.user);
            onClose();
          } else {
            setMessage('Account created! Please check your email to verify, then sign in.');
          }
        }
      } else {
        const { data, error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInErr) {
          setError(signInErr.message);
        } else if (data.user) {
          const meta = data.user.user_metadata || {};
          if (!meta.full_name || !meta.phone) {
            setMode('complete_profile');
          } else {
            try {
              localStorage.setItem(
                'ceova_customer_profile',
                JSON.stringify({
                  name: meta.full_name,
                  email: data.user.email,
                  phone: meta.phone,
                })
              );
            } catch {}
            onSuccess?.(data.user);
            onClose();
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('Please enter a valid 10-15 digit phone number.');
      return;
    }
    setLoading(true);
    try {
      const { data, error: updErr } = await supabase.auth.updateUser({
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
        },
      });
      if (updErr) {
        setError(updErr.message);
      } else {
        try {
          localStorage.setItem(
            'ceova_customer_profile',
            JSON.stringify({
              name: fullName.trim(),
              email: data.user?.email || email,
              phone: phone.trim(),
            })
          );
        } catch {}
        onSuccess?.(data.user);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save profile.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-5 relative">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-500"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>

        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {mode === 'complete_profile'
              ? 'Complete Your Profile'
              : mode === 'signup'
              ? 'Create Customer Account'
              : 'Sign In'}
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            {mode === 'complete_profile'
              ? 'Add your name and phone number for faster ordering and receipts.'
              : 'Sign in with Google or Email to track orders & view bill history.'}
          </p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700">
            {error}
          </div>
        )}
        {message && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {mode === 'complete_profile' ? (
          <form onSubmit={handleSaveProfile} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                <User className="w-3.5 h-3.5 inline mr-1" />
                Full Name *
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                <Phone className="w-3.5 h-3.5 inline mr-1" />
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
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-light-primary text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              Save &amp; Continue
            </button>
          </form>
        ) : (
          <>
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 text-sm font-semibold flex items-center justify-center gap-2.5 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                />
              </svg>
              Continue with Google
            </button>

            <div className="relative flex py-1 items-center">
              <div className="flex-grow border-t border-slate-200" />
              <span className="flex-shrink mx-3 text-[11px] text-slate-400 uppercase font-semibold">
                or with email
              </span>
              <div className="flex-grow border-t border-slate-200" />
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3">
              {mode === 'signup' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      <User className="w-3.5 h-3.5 inline mr-1" />
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="John Doe"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      <Phone className="w-3.5 h-3.5 inline mr-1" />
                      Phone *
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
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  <Mail className="w-3.5 h-3.5 inline mr-1" />
                  Email *
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">
                  <Lock className="w-3.5 h-3.5 inline mr-1" />
                  Password *
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-light-primary text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {mode === 'signup' ? 'Create Account' : 'Sign In with Email'}
              </button>
            </form>

            <p className="text-center text-xs text-slate-500">
              {mode === 'signup' ? (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signin')}
                    className="font-semibold text-light-primary hover:underline"
                  >
                    Sign In
                  </button>
                </>
              ) : (
                <>
                  New here?{' '}
                  <button
                    type="button"
                    onClick={() => setMode('signup')}
                    className="font-semibold text-light-primary hover:underline"
                  >
                    Create Account
                  </button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
