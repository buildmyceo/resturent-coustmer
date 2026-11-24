/**
 * Currency and Date Formatter Utilities
 */

export function formatCurrency(amount: number, currency: string = 'INR'): string {
  const code = (currency || 'INR').toUpperCase();
  const symbolMap: Record<string, string> = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    CAD: 'CA$',
    AUD: 'AU$',
    JPY: '¥',
  };

  const symbol = symbolMap[code] || '₹';
  const locale = code === 'INR' ? 'en-IN' : undefined;
  const formattedNumber = (amount || 0).toLocaleString(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${symbol}${formattedNumber}`;
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

export function formatTime(isoString?: string): string {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

