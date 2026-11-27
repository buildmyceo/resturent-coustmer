export interface SavedDeliveryAddress {
  id: string;
  label: string; // e.g., "Home", "Office", "Friend - Rahul"
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  address: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  isFriend?: boolean;
}

export interface CustomerProfileData {
  name: string;
  phone: string;
  email: string;
  savedAddresses: SavedDeliveryAddress[];
}

const PROFILE_KEY = 'ceova_customer_profile';
const ADDRESSES_KEY = 'ceova_saved_addresses';

export function readLocalProfile(): CustomerProfileData {
  let name = '';
  let phone = '';
  let email = '';
  let savedAddresses: SavedDeliveryAddress[] = [];

  if (typeof window === 'undefined') {
    return { name, phone, email, savedAddresses };
  }

  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      name = parsed.name || '';
      phone = parsed.phone || '';
      email = parsed.email || '';
    }
  } catch {}

  try {
    const rawAddr = localStorage.getItem(ADDRESSES_KEY);
    if (rawAddr) {
      const parsedAddr = JSON.parse(rawAddr);
      if (Array.isArray(parsedAddr)) savedAddresses = parsedAddr;
    }
  } catch {}

  return { name, phone, email, savedAddresses };
}

export function writeLocalProfile(data: Partial<CustomerProfileData>) {
  if (typeof window === 'undefined') return;
  const current = readLocalProfile();
  const nextProfile = {
    name: data.name !== undefined ? data.name : current.name,
    phone: data.phone !== undefined ? data.phone : current.phone,
    email: data.email !== undefined ? data.email : current.email,
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    if (data.savedAddresses !== undefined) {
      localStorage.setItem(ADDRESSES_KEY, JSON.stringify(data.savedAddresses));
    }
  } catch {}
}

export function mergeWithSupabaseUser(user: any): CustomerProfileData {
  const local = readLocalProfile();
  if (!user) return local;

  const meta = user.user_metadata || {};
  const remoteAddrs: SavedDeliveryAddress[] = Array.isArray(meta.saved_addresses)
    ? meta.saved_addresses
    : [];

  const mergedMap = new Map<string, SavedDeliveryAddress>();
  for (const a of local.savedAddresses) mergedMap.set(a.id, a);
  for (const a of remoteAddrs) mergedMap.set(a.id, a);

  const merged: CustomerProfileData = {
    name: meta.full_name || meta.name || local.name || '',
    phone: meta.phone || local.phone || '',
    email: user.email || local.email || '',
    savedAddresses: Array.from(mergedMap.values()),
  };

  writeLocalProfile(merged);
  return merged;
}
