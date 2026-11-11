/**
 * Scoped Guest Participant Session Management
 * Handles token generation, localStorage/Cookie persistence, and 15-minute inactivity expiration.
 */

export interface GuestSessionState {
  sessionId: string;
  participantId: string;
  guestToken: string;
  guestName: string;
  isHost: boolean;
  tableId: string;
  tableNumber: string;
  restaurantId: string;
  restaurantSlug: string;
  lastActiveTimestamp: number;
}

const STORAGE_KEY = 'zovo_guest_session';
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export function generateGuestToken(): string {
  const randomBytes = new Uint8Array(16);
  if (typeof window !== 'undefined' && window.crypto) {
    window.crypto.getRandomValues(randomBytes);
  } else {
    for (let i = 0; i < 16; i++) {
      randomBytes[i] = Math.floor(Math.random() * 256);
    }
  }
  const hex = Array.from(randomBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `zvg_${hex}`;
}

export function saveGuestSession(session: Omit<GuestSessionState, 'lastActiveTimestamp'>): void {
  if (typeof window === 'undefined') return;

  const data: GuestSessionState = {
    ...session,
    lastActiveTimestamp: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    // Also save in cookie for SSR route guards
    document.cookie = `zovo_guest_session_id=${session.sessionId}; path=/; max-age=86400; SameSite=Lax`;
    document.cookie = `zovo_guest_token=${session.guestToken}; path=/; max-age=86400; SameSite=Lax`;
  } catch (err) {
    console.warn('Unable to persist guest session to storage:', err);
  }
}

export function getGuestSession(): GuestSessionState | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const session: GuestSessionState = JSON.parse(raw);
    const now = Date.now();

    // Check 15-minute inactivity policy
    if (now - session.lastActiveTimestamp > INACTIVITY_TIMEOUT_MS) {
      console.info('Guest session expired due to 15 minutes of inactivity.');
      return {
        ...session,
        // Mark as expired so UI can prompt to rejoin via QR scan
      };
    }

    return session;
  } catch {
    return null;
  }
}

export function isSessionExpired(session: GuestSessionState | null): boolean {
  if (!session) return true;
  return Date.now() - session.lastActiveTimestamp > INACTIVITY_TIMEOUT_MS;
}

export function touchGuestSession(): void {
  if (typeof window === 'undefined') return;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;

    const session: GuestSessionState = JSON.parse(raw);
    session.lastActiveTimestamp = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore
  }
}

export function clearGuestSession(): void {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(STORAGE_KEY);
    document.cookie = 'zovo_guest_session_id=; path=/; max-age=0';
    document.cookie = 'zovo_guest_token=; path=/; max-age=0';
  } catch {
    // ignore
  }
}

