import { NextRequest, NextResponse } from 'next/server';

const PLATFORM_HOSTS = new Set(
  [
    'localhost',
    '127.0.0.1',
    process.env.NEXT_PUBLIC_PLATFORM_HOST || '',
    process.env.NEXT_PUBLIC_CUSTOMER_HOST || '',
  ]
    .map((h) => h.toLowerCase().split(':')[0].trim())
    .filter(Boolean)
);

function isPlatformHost(hostname: string): boolean {
  const clean = hostname.toLowerCase().split(':')[0].trim();
  if (!clean) return true;
  if (PLATFORM_HOSTS.has(clean)) return true;
  if (clean.endsWith('.vercel.app') || clean.endsWith('.localhost')) return true;
  return false;
}

export async function proxy(request: NextRequest) {
  const hostHeader =
    request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const hostname = hostHeader.toLowerCase().split(':')[0].trim();

  if (isPlatformHost(hostname)) {
    return NextResponse.next();
  }

  const pathname = request.nextUrl.pathname;
  if (pathname.startsWith('/api/') || pathname === '/domain-not-configured') {
    return NextResponse.next();
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.next();
  }

  try {
    const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/resolve_restaurant_by_host`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ p_host: hostname }),
    });

    if (rpcRes.ok) {
      const rows = await rpcRes.json();
      const match = Array.isArray(rows) ? rows[0] : rows;

      const restaurantId = match?.restaurant_id || match?.id;
      if (restaurantId && match?.slug) {
        const requestHeaders = new Headers(request.headers);
        requestHeaders.set('x-tenant-restaurant-id', String(restaurantId));
        requestHeaders.set('x-tenant-restaurant-slug', String(match.slug));
        requestHeaders.set('x-tenant-custom-domain', hostname);

        if (pathname === '/') {
          const url = request.nextUrl.clone();
          url.pathname = `/store/${match.slug}`;
          return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
        }

        if (
          pathname === '/book' ||
          pathname === '/checkout' ||
          pathname === '/orders' ||
          pathname === '/bills' ||
          pathname === '/profile' ||
          pathname.startsWith('/orders/')
        ) {
          const url = request.nextUrl.clone();
          url.pathname = `/store/${match.slug}${pathname}`;
          return NextResponse.rewrite(url, { request: { headers: requestHeaders } });
        }

        return NextResponse.next({ request: { headers: requestHeaders } });
      }
    }
  } catch (err) {
    console.warn('Custom domain resolution failed:', err);
  }

  const notConfiguredUrl = request.nextUrl.clone();
  notConfiguredUrl.pathname = '/domain-not-configured';
  notConfiguredUrl.searchParams.set('host', hostname);
  return NextResponse.rewrite(notConfiguredUrl);
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
