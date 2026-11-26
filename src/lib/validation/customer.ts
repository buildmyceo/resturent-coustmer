/**
 * Shared customer contact & delivery validation helpers (R3 & R2).
 */

export function normalizePhone(raw: string): string {
  const cleaned = String(raw || '').replace(/[\s\-().]/g, '');
  if (/^[6-9]\d{9}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  return cleaned;
}

export function isValidPhone(raw: string): boolean {
  const normalized = normalizePhone(raw);
  if (!/^\+?[0-9]{10,15}$/.test(normalized)) {
    return false;
  }
  const digits = normalized.replace(/^\+/, '');
  if (/^(\d)\1{9,}$/.test(digits) || /^(\d)\1{9,}$/.test(digits.slice(-10))) {
    return false;
  }
  return true;
}

export function normalizeEmail(raw: string): string {
  return String(raw || '').trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}
