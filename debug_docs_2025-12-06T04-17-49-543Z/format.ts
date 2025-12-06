// src/utils/format.ts

/**
 * Format a number as USD currency.
 * @param value - The number to format
 * @param decimals - Number of decimal places (default 2)
 */
export function formatCurrency(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export function formatMoney(value: number): string {
  return formatCurrency(value, 2);
}

/**
 * Format a number as USD currency, returning empty string for null/undefined.
 * Useful for optional values in tables.
 */
export function formatCurrencyOptional(value: number | null | undefined, decimals = 2): string {
  if (value == null || Number.isNaN(value)) return '';
  return formatCurrency(value, decimals);
}

/**
 * Format a number as a percentage.
 * @param value - The decimal value (0.15 = 15%)
 * @param decimals - Number of decimal places (default 1)
 */
export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}