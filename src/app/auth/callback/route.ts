import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';

  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  const redirectBase = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;

  const cookieStore = await cookies();
  const returnTo = cookieStore.get('ceova_oauth_return_to')?.value;

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data?.session && returnTo) {
      try {
        const targetUrl = new URL(returnTo);
        const targetNext = `${targetUrl.pathname}${targetUrl.search}` || '/';
        const handoffUrl = `${targetUrl.origin}/auth/handoff?next=${encodeURIComponent(
          targetNext
        )}#at=${encodeURIComponent(data.session.access_token)}&rt=${encodeURIComponent(
          data.session.refresh_token
        )}`;
        const res = NextResponse.redirect(handoffUrl);
        res.cookies.delete('ceova_oauth_return_to');
        return res;
      } catch {}
    }

    if (!error) {
      const res = NextResponse.redirect(`${redirectBase}${next}`);
      res.cookies.delete('ceova_oauth_return_to');
      return res;
    }
  }

  return NextResponse.redirect(`${redirectBase}${next}`);
}
