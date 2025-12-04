// src/components/ledger/types.ts

/**
 * Represents a single row in the ledger view.
 * Each row corresponds to one transaction, displayed from the "cash side" perspective.
 */
export type LedgerRow = {
  transaction_id: number;
  line_id: number;
  date: string;
  created_at: string;
  updated_at: string;
  description: string | null;
  job_name: string | null;
  vendor_installer: string;
  cash_account: string | null;
  cash_account_id: number | null;
  type_label: string | null;
  amount: number;
  is_cleared: boolean;
  /** All account IDs touched by this transaction (for filtering) */
  all_account_ids: number[];
  /** All account codes touched by this transaction (for filtering) */
  all_account_codes: (number | null)[];
};

/**
 * Account option for dropdowns
 */
export type AccountOption = {
  id: number;
  name: string;
  code: number | null;
  label: string;
};

/**
 * Simplified account option for edit modal dropdowns
 */
export type AccountSelectOption = {
  id: number;
  label: string;
};

/**
 * Sortable fields in the ledger table
 */
export type SortField =
  | 'date'
  | 'description'
  | 'vendor_installer'
  | 'cash_account'
  | 'type_label'
  | 'amount'
  | 'is_cleared';

/**
 * Sort direction
 */
export type SortDir = 'asc' | 'desc';

/**
 * Date range filter presets
 */
export type DateRangePreset = 'last-12-months' | 'custom';

/**
 * Date range with nullable start/end
 */
export type DateRange = {
  start: string | null;
  end: string | null;
};

/**
 * Account filter options:
 * - 'all': show all transactions
 * - 'banks': codes 1000-1999
 * - 'cards': codes 2000-2999
 * - 're-all': codes 63000-64999
 * - 're-assets': codes 63000-63999
 * - 're-liabilities': codes 64000-64999
 * - number: specific account ID
 */
export type AccountFilter = 
  | 'all' 
  | 'banks' 
  | 'cards' 
  | 're-all' 
  | 're-assets' 
  | 're-liabilities' 
  | number;

/**
 * Categorized accounts for the tiered dropdown
 */
export type CategorizedAccounts = {
  banks: AccountOption[];
  cards: AccountOption[];
  reAssets: AccountOption[];
  reLiabilities: AccountOption[];
  other: AccountOption[];
};
