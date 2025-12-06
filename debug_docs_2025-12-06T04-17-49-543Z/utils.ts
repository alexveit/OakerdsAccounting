// src/components/ledger/utils.ts

import type { DateRange, DateRangePreset, AccountFilter, SortDir } from './types';
import { ACCOUNT_CODE_RANGES } from '../../utils/accounts';


/**
 * Get date range for a preset
 */
export function getDateRangeForPreset(preset: DateRangePreset): DateRange {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();

  const toISO = (d: Date): string => {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  switch (preset) {
    case 'last-12-months': {
      const start = new Date(year - 1, month, today.getDate());
      return { start: toISO(start), end: toISO(today) };
    }
    case 'custom':
    default:
      return { start: null, end: null };
  }
}

/**
 * Check if a code falls within a filter range
 */
export function codeMatchesFilter(code: number | null, filter: AccountFilter): boolean {
  if (filter === 'all') return true;
  if (code === null) return false;

  switch (filter) {
    case 'banks':
      return code >= ACCOUNT_CODE_RANGES.BANK_MIN && code <= ACCOUNT_CODE_RANGES.BANK_MAX;
    case 'cards':
      return code >= ACCOUNT_CODE_RANGES.CREDIT_CARD_MIN && code <= ACCOUNT_CODE_RANGES.CREDIT_CARD_MAX;
    case 're-all':
      return code >= ACCOUNT_CODE_RANGES.RE_ASSET_MIN && code <= ACCOUNT_CODE_RANGES.RE_MORTGAGE_MAX;
    case 're-assets':
      return code >= ACCOUNT_CODE_RANGES.RE_ASSET_MIN && code <= ACCOUNT_CODE_RANGES.RE_ASSET_MAX;
    case 're-liabilities':
      return code >= ACCOUNT_CODE_RANGES.RE_MORTGAGE_MIN && code <= ACCOUNT_CODE_RANGES.RE_MORTGAGE_MAX;
    default:
      return false;
  }
}

/**
 * Format date from ISO to M/D/YYYY
 */
export { formatLocalDate as formatDate } from '../../utils/date';

export { formatMoney } from '../../utils/format';

/**
 * Compare two values for sorting
 */
export function compareValues(a: unknown, b: unknown, dir: SortDir): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === 'asc' ? 1 : -1;
  if (b == null) return dir === 'asc' ? -1 : 1;

  if (typeof a === 'number' && typeof b === 'number') {
    return dir === 'asc' ? a - b : b - a;
  }

  if (typeof a === 'boolean' && typeof b === 'boolean') {
    if (a === b) return 0;
    // asc: false first (pending), desc: true first (cleared)
    return dir === 'asc' ? (a ? 1 : -1) : (a ? -1 : 1);
  }

  const sa = String(a).toLowerCase();
  const sb = String(b).toLowerCase();
  if (sa === sb) return 0;
  if (dir === 'asc') return sa < sb ? -1 : 1;
  return sa > sb ? -1 : 1;
}

/**
 * Get default sort direction for a field
 */
export function getDefaultSortDir(field: string): SortDir {
  return field === 'date' || field === 'amount' ? 'desc' : 'asc';
}
