import { NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const returnTo = searchParams.get('returnTo');

  const forwardedHost = request.headers.get('x-forwarded-host');
  const isLocalEnv = process.env.NODE_ENV === 'development';
  const baseOrigin = !isLocalEnv && forwardedHost ? `https://${forwardedHost}` : origin;

  let verifiedReturnTo: string | null = null;
  if (returnTo) {
    try {
      const targetUrl = new URL(returnTo);
      if (targetUrl.protocol === 'https:') {
        const admin = createAdminClient();
        const { data: match } = await admin.rpc('resolve_restaurant_by_host', {
          p_host: targetUrl.hostname.toLowerCase(),
        });
        const row = Array.isArray(match) ? match[0] : match;
        if (row?.id) {
          verifiedReturnTo = targetUrl.toString();
        }
      }
    } catch {}
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${baseOrigin}/auth/callback`,
      skipBrowserRedirect: true,
    },
  });

  if (error || !data?.url) {
    return NextResponse.redirect(verifiedReturnTo || baseOrigin);
  }

  const response = NextResponse.redirect(data.url);
  if (verifiedReturnTo) {
    response.cookies.set('ceova_oauth_return_to', verifiedReturnTo, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 600,
      path: '/',
    });
  }
  return response;
}
