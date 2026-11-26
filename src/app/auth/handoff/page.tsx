'use client';

import React, { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function HandoffInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function complete() {
      const next = searchParams.get('next') || '/';
      const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : '';
      const params = new URLSearchParams(hash);
      const accessToken = params.get('at');
      const refreshToken = params.get('rt');

      if (accessToken && refreshToken) {
        const supabase = createClient();
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
      }
      router.replace(next);
    }
    complete();
  }, [router, searchParams]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-3">
      <Loader2 className="w-8 h-8 text-light-primary animate-spin" />
      <p className="text-sm font-medium text-slate-600">Completing sign in...</p>
    </main>
  );
}

export default function AuthHandoffPage() {
  return (
    <React.Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center bg-slate-50">
          <Loader2 className="w-8 h-8 text-light-primary animate-spin" />
        </main>
      }
    >
      <HandoffInner />
    </React.Suspense>
  );
}
