/**
 * Converts a decimal amount to Stripe's smallest currency unit.
 * - Zero-decimal currencies (e.g. JPY, KRW): amount as-is.
 * - Two-decimal (e.g. USD, EUR): amount * 100.
 * - Three-decimal (e.g. BHD, KWD): amount * 1000.
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif', 'clp', 'djf', 'gnf', 'jpy', 'kmf', 'krw', 'mga', 'pyg', 'rwf', 'ugx', 'vnd', 'vuv', 'xaf', 'xof',
]);

const THREE_DECIMAL_CURRENCIES = new Set([
  'bhd', 'jod', 'kwd', 'omr', 'tnd',
]);

export function getSmallestUnit(amount: number, currencyCode: string): number {
  const currency = (currencyCode || 'usd').toLowerCase();

  if (ZERO_DECIMAL_CURRENCIES.has(currency)) {
    return Math.round(amount);
  }
  if (THREE_DECIMAL_CURRENCIES.has(currency)) {
    return Math.round(amount * 1000);
  }
  // Default: two decimal (cents)
  return Math.round(amount * 100);
}

