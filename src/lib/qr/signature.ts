/**
 * Cryptographic Table QR Token & Signature Utility
 *
 * Each table gets a tamper-proof cryptographic unique code.
 * If a customer tries to change the table number in the URL (e.g. from T-01 to T-02),
 * the cryptographic signature verification fails and access is blocked immediately.
 */

const SECRET_SALT = 'zovo_secure_table_signature_salt_2026';

/**
 * Fast synchronous DJB2-based 64-bit HMAC equivalent hash for synchronous components
 */
export function generateTableSignatureSync(restaurantSlug: string, tableNumber: string): string {
  const normSlug = (restaurantSlug || '').toLowerCase().trim();
  const normTable = (tableNumber || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const combined = `${normSlug}:${normTable}:${SECRET_SALT}`;

  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0; i < combined.length; i++) {
    const ch = combined.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);

  const hexPart = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(12, '0');
  return `zv_${normSlug}_t${normTable}_${hexPart.slice(0, 8)}`;
}

/**
 * Verify if the uniqueCode provided matches the authentic cryptographic signature for that table
 */
export function verifyTableSignatureSync(
  restaurantSlug: string,
  tableNumber: string,
  uniqueCode: string
): boolean {
  if (!uniqueCode) return false;

  const s = (restaurantSlug || '').toLowerCase().trim();
  const rawTbl = (tableNumber || '').toLowerCase().trim();
  const digitsOnly = rawTbl.replace(/\D/g, '');
  const alphaNum = rawTbl.replace(/[^a-z0-9]/g, '');

  const slugCandidates = [s];
  if (s.includes('-')) slugCandidates.push(s.split('-')[0]);

  // If uniqueCode itself embeds the encoded slug
  if (uniqueCode.startsWith('zv_')) {
    const parts = uniqueCode.split('_');
    if (parts.length >= 4 && parts[1]) {
      slugCandidates.push(parts[1].toLowerCase());
    }
  }

  const tblCandidates = [rawTbl, alphaNum];
  if (digitsOnly) {
    tblCandidates.push(digitsOnly);
    tblCandidates.push('t' + digitsOnly);
    tblCandidates.push('t' + digitsOnly.padStart(2, '0'));
    tblCandidates.push(digitsOnly.replace(/^0+/, ''));
  }

  // Check if uniqueCode matches any authentic variation for this table
  for (const cSlug of slugCandidates) {
    for (const cTbl of tblCandidates) {
      if (uniqueCode === generateTableSignatureSync(cSlug, cTbl)) {
        return true;
      }
    }
  }

  return false;
}
