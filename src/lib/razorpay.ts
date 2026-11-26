import crypto from 'node:crypto';

export function safeTimingEqual(expectedHex: string, actualHex: string): boolean {
  if (!expectedHex || !actualHex) return false;
  const bufA = Buffer.from(expectedHex, 'utf8');
  const bufB = Buffer.from(actualHex, 'utf8');
  if (bufA.byteLength !== bufB.byteLength) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function getRazorpayCredentials(): { keyId: string; keySecret: string; webhookSecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || '';
  return { keyId, keySecret, webhookSecret };
}

export function verifyRazorpayPaymentSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  keySecret?: string
): boolean {
  const secret = keySecret || getRazorpayCredentials().keySecret;
  if (!secret || !razorpayOrderId || !razorpayPaymentId || !razorpaySignature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest('hex');
  return safeTimingEqual(expected, razorpaySignature);
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  webhookSecret?: string
): boolean {
  const secret = webhookSecret || getRazorpayCredentials().webhookSecret;
  if (!secret || !rawBody || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeTimingEqual(expected, signatureHeader);
}

export interface RouteTransferConfig {
  settlementMode?: string | null;
  linkedAccountId?: string | null;
  commissionBps?: number | null;
  amountPaise: number;
  restaurantId: string;
  entityId: string;
  onHold?: boolean;
}

export function buildRouteTransfers(cfg: RouteTransferConfig) {
  if (
    cfg.settlementMode !== 'platform_route' ||
    !cfg.linkedAccountId ||
    !cfg.linkedAccountId.startsWith('acc_')
  ) {
    return undefined;
  }
  const bps = Math.max(0, Math.min(2000, Number(cfg.commissionBps || 0)));
  const feePaise = Math.round((cfg.amountPaise * bps) / 10000);
  const netPaise = Math.max(100, cfg.amountPaise - feePaise);
  return [
    {
      account: cfg.linkedAccountId,
      amount: netPaise,
      currency: 'INR',
      notes: {
        restaurant_id: cfg.restaurantId,
        entity_id: cfg.entityId,
      },
      on_hold: cfg.onHold ? 1 : 0,
    },
  ];
}

export async function createRazorpayOrder(params: {
  amountPaise: number;
  currency?: string;
  receipt: string;
  notes: Record<string, string>;
  transfers?: ReturnType<typeof buildRouteTransfers>;
}) {
  const { keyId, keySecret } = getRazorpayCredentials();
  if (!keyId || !keySecret) {
    throw new Error('Razorpay server credentials (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET) are not configured.');
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const payload: Record<string, any> = {
    amount: Math.round(params.amountPaise),
    currency: params.currency || 'INR',
    receipt: params.receipt.slice(0, 40),
    payment_capture: 1,
    notes: params.notes,
  };
  if (params.transfers && params.transfers.length > 0) {
    payload.transfers = params.transfers;
  }

  const res = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.description || 'Failed to create Razorpay order');
  }
  return { order: data, keyId };
}

export async function fetchRazorpayPayment(paymentId: string) {
  const { keyId, keySecret } = getRazorpayCredentials();
  if (!keyId || !keySecret) {
    throw new Error('Razorpay server credentials are not configured.');
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.description || 'Failed to fetch Razorpay payment');
  }
  return data;
}

export async function refundRazorpayPayment(params: {
  paymentId: string;
  amountPaise?: number;
  reason?: string;
  reverseAll?: boolean;
}) {
  const { keyId, keySecret } = getRazorpayCredentials();
  if (!keyId || !keySecret) {
    throw new Error('Razorpay server credentials are not configured.');
  }
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const body: Record<string, any> = {
    notes: { reason: params.reason || 'Order/Booking refund' },
  };
  if (params.amountPaise && params.amountPaise > 0) {
    body.amount = Math.round(params.amountPaise);
  }
  if (params.reverseAll) {
    body.reverse_all = 1;
  }

  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(params.paymentId)}/refund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.description || 'Failed to issue Razorpay refund');
  }
  return data;
}
