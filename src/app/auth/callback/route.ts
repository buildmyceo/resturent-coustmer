import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '/';
  const returnTo = searchParams.get('returnTo');

  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  const redirectBase = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;

  // Relay OAuth code back to a verified custom restaurant domain without consuming PKCE code here
  if (code && returnTo) {
    try {
      const targetUrl = new URL(returnTo);
      const currentHost = new URL(redirectBase).hostname.toLowerCase();
      const targetHost = targetUrl.hostname.toLowerCase();

      if (targetUrl.protocol === 'https:' && targetHost !== currentHost) {
        const admin = createAdminClient();
        const { data: match } = await admin.rpc('resolve_restaurant_by_host', {
          p_host: targetHost,
        });
        const row = Array.isArray(match) ? match[0] : match;
        if (row?.id) {
          const targetNext = `${targetUrl.pathname}${targetUrl.search}` || '/';
          return NextResponse.redirect(
            `${targetUrl.origin}/auth/callback?code=${encodeURIComponent(code)}&next=${encodeURIComponent(targetNext)}`
          );
        }
      }
    } catch {
      // Fall through to local exchange if returnTo is invalid
    }
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${redirectBase}${next}`);
    }
  }

  return NextResponse.redirect(`${redirectBase}${next}`);
}
