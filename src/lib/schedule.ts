/**
 * Restaurant Operational Schedule & Timezone Validation
 * Checks whether the restaurant is currently OPEN or CLOSED based on the admin-configured
 * operating schedule and IANA timezone.
 */

export interface DaySchedule {
  open: string; // e.g. "11:00" or "11:00 AM" or "11:00:00"
  close: string; // e.g. "23:00" or "11:00 PM"
  closed: boolean;
}

export interface OperatingHoursCheck {
  isOpen: boolean;
  status: 'open' | 'closed';
  reason?: string;
  currentDayName: string;
  currentTimeStr: string;
  todaySchedule?: DaySchedule;
  nextOpenMsg?: string;
}

/**
 * Standardize any time format (e.g. "11:00", "11:00 AM", "23:30", "11:30 PM") into minutes since midnight (0 - 1439)
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  if (!timeStr || typeof timeStr !== 'string') return null;
  const str = timeStr.trim().toUpperCase();

  const isPM = str.includes('PM');
  const isAM = str.includes('AM');

  // Strip AM/PM and non-time characters
  const clean = str.replace(/[^\d:]/g, '');
  const parts = clean.split(':');
  if (parts.length === 0 || !parts[0]) return null;

  let hours = parseInt(parts[0], 10);
  const minutes = parts.length > 1 ? parseInt(parts[1], 10) : 0;

  if (isNaN(hours) || isNaN(minutes)) return null;

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

/**
 * Clean and normalize timezone strings (e.g. "Asia/Kolkata (IST)" -> "Asia/Kolkata")
 */
export function normalizeTimezone(tz?: string): string {
  if (!tz) return 'UTC';
  const clean = tz.split(' ')[0].trim();
  try {
    // Validate with Intl.DateTimeFormat
    Intl.DateTimeFormat(undefined, { timeZone: clean });
    return clean;
  } catch {
    return 'UTC';
  }
}

/**
 * Check if the restaurant is currently open given its opening hours and timezone
 */
export function checkIsRestaurantOpen(
  openingHours?: Record<string, DaySchedule>,
  timezone?: string
): OperatingHoursCheck {
  // If no opening hours are set at all, default to OPEN
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return {
      isOpen: true,
      status: 'open',
      currentDayName: 'Today',
      currentTimeStr: '',
    };
  }

  const validTz = normalizeTimezone(timezone);

  // Get current date/time components formatted in the target restaurant timezone
  const now = new Date();
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: validTz,
    weekday: 'long',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
  });

  const parts = dtf.formatToParts(now);
  let dayName = 'monday';
  let hourVal = 0;
  let minVal = 0;

  for (const part of parts) {
    if (part.type === 'weekday') {
      dayName = part.value.toLowerCase();
    } else if (part.type === 'hour') {
      hourVal = parseInt(part.value, 10);
    } else if (part.type === 'minute') {
      minVal = parseInt(part.value, 10);
    }
  }

  const currentMinutes = hourVal * 60 + minVal;
  const currentFormattedTime = `${String(hourVal).padStart(2, '0')}:${String(minVal).padStart(2, '0')}`;

  const todayConfig = openingHours[dayName];

  // If today is marked explicitly closed
  if (!todayConfig || todayConfig.closed) {
    return {
      isOpen: false,
      status: 'closed',
      reason: `Restaurant is closed today (${capitalize(dayName)}).`,
      currentDayName: capitalize(dayName),
      currentTimeStr: currentFormattedTime,
      todaySchedule: todayConfig,
    };
  }

  const openMinutes = parseTimeToMinutes(todayConfig.open);
  const closeMinutes = parseTimeToMinutes(todayConfig.close);

  if (openMinutes === null || closeMinutes === null) {
    // Cannot parse hours, fallback to open
    return {
      isOpen: true,
      status: 'open',
      currentDayName: capitalize(dayName),
      currentTimeStr: currentFormattedTime,
      todaySchedule: todayConfig,
    };
  }

  // Handle standard same-day shift (e.g. 11:00 to 23:00) vs overnight shift (e.g. 18:00 to 02:00)
  let isOpenNow = false;
  if (closeMinutes > openMinutes) {
    // Normal same-day shift
    isOpenNow = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } else {
    // Overnight shift: open late evening and closes early morning
    isOpenNow = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }

  if (!isOpenNow) {
    const isBeforeOpen = currentMinutes < openMinutes;
    const reason = isBeforeOpen
      ? `Restaurant opens today at ${formatDisplayTime(todayConfig.open)}.`
      : `Restaurant closed today at ${formatDisplayTime(todayConfig.close)}.`;

    return {
      isOpen: false,
      status: 'closed',
      reason,
      currentDayName: capitalize(dayName),
      currentTimeStr: currentFormattedTime,
      todaySchedule: todayConfig,
    };
  }

  return {
    isOpen: true,
    status: 'open',
    currentDayName: capitalize(dayName),
    currentTimeStr: currentFormattedTime,
    todaySchedule: todayConfig,
  };
}

function capitalize(s: string) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatDisplayTime(t: string) {
  const mins = parseTimeToMinutes(t);
  if (mins === null) return t;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  const displayM = m > 0 ? `:${String(m).padStart(2, '0')}` : ':00';
  return `${displayH}${displayM} ${ampm}`;
}
