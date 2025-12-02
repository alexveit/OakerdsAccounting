// src/utils/accounts.ts

/**
 * Common types used across the app
 */
export type Purpose = 'business' | 'personal' | 'mixed';

/**
 * Special account IDs - centralized to avoid magic numbers
 * These are specific to your chart of accounts setup
 */
export const SPECIAL_ACCOUNTS = {
  /** Primary checking account - always sorted first */
  PRIMARY_CHECKING: 1,
  /** Corporate credit card - sorted second */
  CORPORATE_CARD: 4,
} as const;

/**
 * Account code ranges - single source of truth
 */
export const ACCOUNT_CODE_RANGES = {
  // Balance sheet - Assets
  BANK_MIN: 1000,
  BANK_MAX: 1999,
  
  // Balance sheet - Liabilities
  CREDIT_CARD_MIN: 2000,
  CREDIT_CARD_MAX: 2999,

  // Income
  RENTAL_INCOME_MIN: 61000,
  RENTAL_INCOME_MAX: 61999,

  // Expenses
  MARKETING_MIN: 55000,
  MARKETING_MAX: 55999,
  REAL_ESTATE_EXPENSE_MIN: 62000,
  REAL_ESTATE_EXPENSE_MAX: 62999,

  // Real estate assets/liabilities
  RE_ASSET_MIN: 63000,
  RE_ASSET_MAX: 63999,
  RE_MORTGAGE_MIN: 64000,
  RE_MORTGAGE_MAX: 64999,
} as const;

/**
 * Parse account code string to number.
 * Returns null if code is empty or not a valid number.
 */
export function parseAccountCode(code: string | null | undefined): number | null {
  if (!code) return null;
  const n = Number(code.replace(/\D/g, ''));
  return Number.isFinite(n) ? n : null;
}

/**
 * Check if account code is in a given range
 */
export function isCodeInRange(code: string | null | undefined, min: number, max: number): boolean {
  const n = parseAccountCode(code);
  return n !== null && n >= min && n <= max;
}

// ─────────────────────────────────────────────────────────────────
// Account type checks by code range
// ─────────────────────────────────────────────────────────────────

export function isBankCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.BANK_MIN, ACCOUNT_CODE_RANGES.BANK_MAX);
}

export function isCreditCardCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.CREDIT_CARD_MIN, ACCOUNT_CODE_RANGES.CREDIT_CARD_MAX);
}

export function isRentalIncomeCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.RENTAL_INCOME_MIN, ACCOUNT_CODE_RANGES.RENTAL_INCOME_MAX);
}

export function isMarketingExpenseCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.MARKETING_MIN, ACCOUNT_CODE_RANGES.MARKETING_MAX);
}

export function isRealEstateExpenseCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.REAL_ESTATE_EXPENSE_MIN, ACCOUNT_CODE_RANGES.REAL_ESTATE_EXPENSE_MAX);
}

export function isRealEstateAssetCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.RE_ASSET_MIN, ACCOUNT_CODE_RANGES.RE_ASSET_MAX);
}

export function isMortgageCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.RE_MORTGAGE_MIN, ACCOUNT_CODE_RANGES.RE_MORTGAGE_MAX);
}

// ─────────────────────────────────────────────────────────────────
// Compound checks for categorization
// ─────────────────────────────────────────────────────────────────

/**
 * Check if this is a cash-like account (bank or credit card)
 * Used for transaction form cash account dropdowns
 */
export function isCashAccount(code: string | null | undefined): boolean {
  return isBankCode(code) || isCreditCardCode(code);
}

/**
 * Check if this is a transferable account (bank or credit card)
 * Alias for isCashAccount for semantic clarity
 */
export function isTransferableCode(code: string | null | undefined): boolean {
  return isCashAccount(code);
}

/**
 * Check if this is a Schedule E (rental) related code
 */
export function isScheduleECode(code: string | null | undefined): boolean {
  return isRentalIncomeCode(code) || isRealEstateExpenseCode(code);
}

/**
 * Categorize an expense by its code for dashboard/tax reporting
 */
export type ExpenseCategory = 'realEstate' | 'marketing' | 'overhead' | 'jobExpense' | 'personal';

export function categorizeExpense(
  code: string | null | undefined,
  purpose: Purpose,
  hasJobId: boolean
): ExpenseCategory {
  if (purpose === 'personal') return 'personal';

  const isBusiness = purpose === 'business' || purpose === 'mixed';
  if (!isBusiness) return 'personal';

  if (isRealEstateExpenseCode(code)) return 'realEstate';
  if (hasJobId) return 'jobExpense';
  if (isMarketingExpenseCode(code)) return 'marketing';

  return 'overhead';
}

// ─────────────────────────────────────────────────────────────────
// Sorting helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Get sort priority for an account based on special account rules.
 * Lower number = higher priority (sorted first).
 * Returns 0 for PRIMARY_CHECKING, 1 for CORPORATE_CARD, 2 for everything else.
 */
export function getAccountSortPriority(accountId: number): number {
  if (accountId === SPECIAL_ACCOUNTS.PRIMARY_CHECKING) return 0;
  if (accountId === SPECIAL_ACCOUNTS.CORPORATE_CARD) return 1;
  return 2;
}

/**
 * Compare function for sorting accounts with special accounts first.
 * Use with Array.sort(): accounts.sort(compareAccountsForSort)
 */
export function compareAccountsForSort(
  a: { id: number; code?: string | null; name?: string },
  b: { id: number; code?: string | null; name?: string }
): number {
  const priorityA = getAccountSortPriority(a.id);
  const priorityB = getAccountSortPriority(b.id);

  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }

  // Same priority - sort by code or name
  const codeA = a.code || a.name || '';
  const codeB = b.code || b.name || '';
  return codeA.localeCompare(codeB);
}
