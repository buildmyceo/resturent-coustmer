import { NextRequest, NextResponse } from 'next/server';
import zlib from 'zlib';

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function extractFromPNG(buf: Buffer): { primary: string; secondary: string } | null {
  try {
    let offset = 8;
    let width = 0;
    let height = 0;
    let colorType = 0;
    const idatChunks: Buffer[] = [];

    while (offset < buf.length) {
      const len = buf.readUInt32BE(offset);
      const type = buf.toString('ascii', offset + 4, offset + 8);
      if (type === 'IHDR') {
        width = buf.readUInt32BE(offset + 8);
        height = buf.readUInt32BE(offset + 12);
        colorType = buf.readUInt8(offset + 17);
      } else if (type === 'IDAT') {
        idatChunks.push(buf.subarray(offset + 8, offset + 8 + len));
      } else if (type === 'IEND') {
        break;
      }
      offset += 12 + len;
    }

    if (!width || !height || idatChunks.length === 0) return null;

    const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
    const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
    const stride = width * bpp;
    const scanlineLen = 1 + stride;

    let prevRow = Buffer.alloc(stride);
    let currRow = Buffer.alloc(stride);
    const colorBuckets: Record<string, { count: number; r: number; g: number; b: number }> = {};

    const sampleStep = Math.max(1, Math.floor(height / 100));

    for (let y = 0; y < height; y++) {
      const rowOffset = y * scanlineLen;
      if (rowOffset >= decompressed.length) break;
      const filterType = decompressed[rowOffset];
      const rowStart = rowOffset + 1;

      for (let i = 0; i < stride; i++) {
        const x = decompressed[rowStart + i];
        const a = i >= bpp ? currRow[i - bpp] : 0;
        const b = prevRow[i];
        const c = i >= bpp ? prevRow[i - bpp] : 0;
        let val = x;
        if (filterType === 1) val = (x + a) & 0xff;
        else if (filterType === 2) val = (x + b) & 0xff;
        else if (filterType === 3) val = (x + Math.floor((a + b) / 2)) & 0xff;
        else if (filterType === 4) val = (x + paeth(a, b, c)) & 0xff;
        currRow[i] = val;
      }

      if (y % sampleStep === 0) {
        for (let x = 0; x < width; x += sampleStep) {
          const idx = x * bpp;
          const r = currRow[idx];
          const g = currRow[idx + 1];
          const b = currRow[idx + 2];
          const a = bpp === 4 ? currRow[idx + 3] : 255;
          if (a < 100) continue;
          if (r > 240 && g > 240 && b > 240) continue;
          if (r < 18 && g < 18 && b < 18) continue;

          // Bucket quantization
          const qr = Math.round(r / 20) * 20;
          const qg = Math.round(g / 20) * 20;
          const qb = Math.round(b / 20) * 20;
          const hex = `#${[qr, qg, qb].map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('')}`;

          if (!colorBuckets[hex]) {
            colorBuckets[hex] = { count: 0, r: qr, g: qg, b: qb };
          }
          colorBuckets[hex].count += 1;
        }
      }

      const temp = prevRow;
      prevRow = currRow;
      currRow = temp;
    }

    const sorted = Object.entries(colorBuckets).sort((a, b) => b[1].count - a[1].count);
    if (sorted.length === 0) return null;

    const primary = sorted[0][0];
    let secondary = primary;
    for (let j = 1; j < sorted.length; j++) {
      const cand = sorted[j][0];
      if (cand !== primary) {
        secondary = cand;
        break;
      }
    }

    return { primary, secondary };
  } catch (err) {
    console.error('Error extracting from PNG:', err);
    return null;
  }
}

function extractFromSVG(text: string): { primary: string; secondary: string } | null {
  const matches = text.match(/#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})/g);
  if (!matches || matches.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const m of matches) {
    const norm = m.toLowerCase();
    if (norm === '#fff' || norm === '#ffffff' || norm === '#000' || norm === '#000000') continue;
    counts[norm] = (counts[norm] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length === 0) return null;

  return {
    primary: sorted[0][0],
    secondary: sorted[1]?.[0] || sorted[0][0],
  };
}

function isAllowedPublicHttpsUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl);
    if (u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      host === '::1' ||
      host.startsWith('[') ||
      /^127\./.test(host) ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^169\.254\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const logoUrl = searchParams.get('logoUrl');

  if (!logoUrl || !isAllowedPublicHttpsUrl(logoUrl)) {
    return NextResponse.json({ error: 'Invalid or disallowed logoUrl parameter' }, { status: 400 });
  }

  try {
    const res = await fetch(logoUrl, {
      headers: { 'User-Agent': 'CeovaBrandThemeExtractor/1.0' },
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 86400 }, // Cache 24 hours
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch image' }, { status: 502 });
    }

    const contentType = res.headers.get('content-type') || '';
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // SVG
    if (contentType.includes('svg') || logoUrl.endsWith('.svg') || buffer.slice(0, 10).toString().includes('<svg')) {
      const svgText = buffer.toString('utf-8');
      const colors = extractFromSVG(svgText);
      if (colors) {
        return NextResponse.json({ success: true, theme: colors });
      }
    }

    // PNG
    if (buffer.length > 8 && buffer.slice(0, 8).toString('hex') === '89504e470d0a1a0a') {
      const colors = extractFromPNG(buffer);
      if (colors) {
        return NextResponse.json({ success: true, theme: colors });
      }
    }

    // Fallback: Default Barista
    return NextResponse.json({
      success: true,
      theme: { primary: '#3D1C0B', secondary: '#D0803C' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
