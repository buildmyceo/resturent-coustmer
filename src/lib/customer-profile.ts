export type AddressCategory = 'HOME' | 'WORK' | 'HOTEL' | 'OTHER';

export interface SavedDeliveryAddress {
  id: string;
  category?: AddressCategory;
  label: string; // e.g., "Home", "Work", "Hotel", "Friend - Rahul"
  recipientName: string;
  recipientPhone: string;
  recipientEmail?: string;
  address: string;
  pincode?: string;
  landmark?: string;
  lat?: number;
  lng?: number;
  isFriend?: boolean;
}

export interface CustomerProfileData {
  name: string;
  phone: string;
  email: string;
  age?: string;
  gender?: string;
  defaultAddress?: string;
  defaultPincode?: string;
  savedAddresses: SavedDeliveryAddress[];
}

const PROFILE_KEY = 'ceova_customer_profile';
const ADDRESSES_KEY = 'ceova_saved_addresses';

export function readLocalProfile(): CustomerProfileData {
  let name = '';
  let phone = '';
  let email = '';
  let age = '';
  let gender = '';
  let defaultAddress = '';
  let defaultPincode = '';
  let savedAddresses: SavedDeliveryAddress[] = [];

  if (typeof window === 'undefined') {
    return { name, phone, email, age, gender, defaultAddress, defaultPincode, savedAddresses };
  }

  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      name = parsed.name || '';
      phone = parsed.phone || '';
      email = parsed.email || '';
      age = parsed.age || '';
      gender = parsed.gender || '';
      defaultAddress = parsed.defaultAddress || '';
      defaultPincode = parsed.defaultPincode || '';
    }
  } catch {}

  try {
    const rawAddr = localStorage.getItem(ADDRESSES_KEY);
    if (rawAddr) {
      const parsedAddr = JSON.parse(rawAddr);
      if (Array.isArray(parsedAddr)) savedAddresses = parsedAddr;
    }
  } catch {}

  return { name, phone, email, age, gender, defaultAddress, defaultPincode, savedAddresses };
}

export function writeLocalProfile(data: Partial<CustomerProfileData>) {
  if (typeof window === 'undefined') return;
  const current = readLocalProfile();
  const nextProfile = {
    name: data.name !== undefined ? data.name : current.name,
    phone: data.phone !== undefined ? data.phone : current.phone,
    email: data.email !== undefined ? data.email : current.email,
    age: data.age !== undefined ? data.age : current.age,
    gender: data.gender !== undefined ? data.gender : current.gender,
    defaultAddress:
      data.defaultAddress !== undefined ? data.defaultAddress : current.defaultAddress,
    defaultPincode:
      data.defaultPincode !== undefined ? data.defaultPincode : current.defaultPincode,
  };
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(nextProfile));
    if (data.savedAddresses !== undefined) {
      localStorage.setItem(ADDRESSES_KEY, JSON.stringify(data.savedAddresses));
    }
  } catch {}
}

export function clearLocalProfile() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(PROFILE_KEY);
    localStorage.removeItem(ADDRESSES_KEY);
    localStorage.removeItem('ceova_recent_order_ids');
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
    age: meta.age ? String(meta.age) : local.age || '',
    gender: meta.gender || local.gender || '',
    defaultAddress: meta.default_address || local.defaultAddress || '',
    defaultPincode: meta.default_pincode || local.defaultPincode || '',
    savedAddresses: Array.from(mergedMap.values()),
  };

  writeLocalProfile(merged);
  return merged;
}
