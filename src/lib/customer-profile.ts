export type AddressCategory = 'HOME' | 'WORK' | 'HOTEL' | 'OTHER';

export interface SavedDeliveryAddress {
  id: string;
  category?: AddressCategory;
  label: string;
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

const PROFILE_KEY_PREFIX = 'ceova_customer_profile';
const ADDRESSES_KEY_PREFIX = 'ceova_saved_addresses';
const ACTIVE_USER_KEY = 'ceova_active_user_id';

const EMPTY_PROFILE: CustomerProfileData = {
  name: '',
  phone: '',
  email: '',
  age: '',
  gender: '',
  defaultAddress: '',
  defaultPincode: '',
  savedAddresses: [],
};

function getKeysForUser(userId?: string | null) {
  const suffix = userId ? `_${userId}` : '_guest';
  return {
    profileKey: `${PROFILE_KEY_PREFIX}${suffix}`,
    addressesKey: `${ADDRESSES_KEY_PREFIX}${suffix}`,
  };
}

export function readLocalProfile(userId?: string | null): CustomerProfileData {
  if (typeof window === 'undefined') return { ...EMPTY_PROFILE };
  const resolvedUserId =
    userId !== undefined ? userId : localStorage.getItem(ACTIVE_USER_KEY) || null;
  const { profileKey, addressesKey } = getKeysForUser(resolvedUserId);

  let name = '';
  let phone = '';
  let email = '';
  let age = '';
  let gender = '';
  let defaultAddress = '';
  let defaultPincode = '';
  let savedAddresses: SavedDeliveryAddress[] = [];

  try {
    const raw = localStorage.getItem(profileKey);
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
    const rawAddr = localStorage.getItem(addressesKey);
    if (rawAddr) {
      const parsedAddr = JSON.parse(rawAddr);
      if (Array.isArray(parsedAddr)) savedAddresses = parsedAddr;
    }
  } catch {}

  return { name, phone, email, age, gender, defaultAddress, defaultPincode, savedAddresses };
}

export function writeLocalProfile(data: Partial<CustomerProfileData>, userId?: string | null) {
  if (typeof window === 'undefined') return;
  const resolvedUserId =
    userId !== undefined ? userId : localStorage.getItem(ACTIVE_USER_KEY) || null;
  const { profileKey, addressesKey } = getKeysForUser(resolvedUserId);

  const current = readLocalProfile(resolvedUserId);
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
    localStorage.setItem(profileKey, JSON.stringify(nextProfile));
    if (data.savedAddresses !== undefined) {
      localStorage.setItem(addressesKey, JSON.stringify(data.savedAddresses));
    }
  } catch {}
}

export function clearLocalProfile() {
  if (typeof window === 'undefined') return;
  try {
    const activeId = localStorage.getItem(ACTIVE_USER_KEY);
    if (activeId) {
      localStorage.removeItem(`${PROFILE_KEY_PREFIX}_${activeId}`);
      localStorage.removeItem(`${ADDRESSES_KEY_PREFIX}_${activeId}`);
    }
    localStorage.removeItem(PROFILE_KEY_PREFIX);
    localStorage.removeItem(ADDRESSES_KEY_PREFIX);
    localStorage.removeItem(`${PROFILE_KEY_PREFIX}_guest`);
    localStorage.removeItem(`${ADDRESSES_KEY_PREFIX}_guest`);
    localStorage.removeItem(ACTIVE_USER_KEY);
    localStorage.removeItem('ceova_recent_order_ids');
  } catch {}
}

export function mergeWithSupabaseUser(user: any): CustomerProfileData {
  if (typeof window === 'undefined') return { ...EMPTY_PROFILE };

  // Remove legacy unscoped keys so past user data can never leak across accounts
  try {
    localStorage.removeItem(PROFILE_KEY_PREFIX);
    localStorage.removeItem(ADDRESSES_KEY_PREFIX);
  } catch {}

  const previousUserId = localStorage.getItem(ACTIVE_USER_KEY);

  if (!user || !user.id) {
    // User is signed out: if a logged-in account was previously active, wipe cached state
    if (previousUserId) {
      clearLocalProfile();
      return { ...EMPTY_PROFILE };
    }
    return readLocalProfile(null);
  }

  // Account switched to a different user: clear previous user's recent order IDs & guest cache
  if (previousUserId && previousUserId !== user.id) {
    try {
      localStorage.removeItem(`${PROFILE_KEY_PREFIX}_${previousUserId}`);
      localStorage.removeItem(`${ADDRESSES_KEY_PREFIX}_${previousUserId}`);
      localStorage.removeItem(`${PROFILE_KEY_PREFIX}_guest`);
      localStorage.removeItem(`${ADDRESSES_KEY_PREFIX}_guest`);
      localStorage.removeItem('ceova_recent_order_ids');
    } catch {}
  }

  try {
    localStorage.setItem(ACTIVE_USER_KEY, user.id);
  } catch {}

  // Use ONLY this user's scoped cache + this user's own Supabase user_metadata
  const userLocal = readLocalProfile(user.id);
  const meta = user.user_metadata || {};
  const remoteAddrs: SavedDeliveryAddress[] = Array.isArray(meta.saved_addresses)
    ? meta.saved_addresses
    : [];

  const mergedMap = new Map<string, SavedDeliveryAddress>();
  for (const a of userLocal.savedAddresses) mergedMap.set(a.id, a);
  for (const a of remoteAddrs) mergedMap.set(a.id, a);

  const merged: CustomerProfileData = {
    name: meta.full_name || meta.name || userLocal.name || '',
    phone: meta.phone || userLocal.phone || '',
    email: user.email || userLocal.email || '',
    age: meta.age ? String(meta.age) : userLocal.age || '',
    gender: meta.gender || userLocal.gender || '',
    defaultAddress: meta.default_address || userLocal.defaultAddress || '',
    defaultPincode: meta.default_pincode || userLocal.defaultPincode || '',
    savedAddresses: Array.from(mergedMap.values()),
  };

  writeLocalProfile(merged, user.id);
  return merged;
}
