/**
 * Currency and Date Formatter Utilities
 */

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const code = (currency || 'USD').toUpperCase();
  const symbolMap: Record<string, string> = {
    USD: '$',
    EUR: '€',
    GBP: '£',
    INR: '₹',
    CAD: 'CA$',
    AUD: 'AU$',
    JPY: '¥',
  };

  const symbol = symbolMap[code] || '$';
  const formattedNumber = (amount || 0).toLocaleString(undefined, {
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
