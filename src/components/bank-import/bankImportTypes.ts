// src/components/bank-import/bankImportTypes.ts

/**
 * A pending (uncleared) transaction from our ledger that we try to match
 * against bank data.
 */
export type PendingTransaction = {
  line_id: number;
  transaction_id: number;
  date: string;
  description: string | null;
  amount: number; // Negative = outflow, positive = inflow (from cash account perspective)
  vendor_name: string | null;
  job_name: string | null;
  installer_name: string | null;
};

/**
 * A cleared transaction from our ledger - used to identify already-reconciled items
 */
export type ClearedTransaction = {
  line_id: number;
  transaction_id: number;
  date: string;
  description: string | null;
  amount: number;
};

/**
 * Historical transaction for pattern learning
 */
export type HistoricalTransaction = {
  date: string;
  description: string | null;
  amount: number;
  account_code: string | null;
  account_name: string;
  vendor_name: string | null;
  job_name: string | null;
};

/**
 * Reference data sent to Claude for categorization
 */
export type ReferenceData = {
  vendors: Array<{ id: number; name: string }>;
  jobs: Array<{ id: number; name: string; address: string | null; status: string }>;
  installers: Array<{ id: number; name: string }>;
  expenseAccounts: Array<{ id: number; code: string; name: string }>;
  incomeAccounts: Array<{ id: number; code: string; name: string }>;
};

/**
 * Account info for the selected bank/card account
 */
export type SelectedAccount = {
  id: number;
  name: string;
  code: string;
};

/**
 * Request payload sent to the edge function
 */
export type BankImportRequest = {
  rawBankData: string;
  selectedAccount: SelectedAccount;
  pendingTransactions: PendingTransaction[];
  clearedTransactions: ClearedTransaction[];
  recentHistory: HistoricalTransaction[];
  referenceData: ReferenceData;
};

/**
 * Bank status - whether the transaction has posted at the bank
 */
export type BankStatus = 'posted' | 'pending';

/**
 * Match type - how the bank transaction relates to DB
 */
export type MatchType = 'matched_pending' | 'matched_cleared' | 'new' | 'tip_adjustment';

/**
 * A single parsed transaction from Claude's response
 */
export type ParsedTransaction = {
  // Parsed from bank data
  date: string; // YYYY-MM-DD
  description: string; // Raw bank description
  amount: number; // Negative = debit/outflow, positive = credit/inflow

  // Bank status
  bank_status: BankStatus;

  // Match info
  match_type: MatchType;
  matched_line_id: number | null;
  matched_transaction_id: number | null; // For tip adjustments - need to update all lines
  original_amount: number | null; // For tip adjustments - the DB amount before tip
  match_confidence: 'high' | 'medium' | 'low';

  // Suggestions for new transactions (only if match_type === 'new')
  suggested_account_id: number | null;
  suggested_account_code: string | null;
  suggested_vendor_id: number | null;
  suggested_job_id: number | null;
  suggested_installer_id: number | null;
  suggested_purpose: 'business' | 'personal' | null;

  // Explanation for the user
  reasoning: string;
};

/**
 * Response from the edge function
 */
export type BankImportResponse = {
  parsed_transactions: ParsedTransaction[];
  warnings: string[];
};

/**
 * UI state for a transaction being reviewed
 */
export type ReviewTransaction = ParsedTransaction & {
  // UI state
  selected: boolean;
  // User overrides (editable)
  override_account_id: number | null;
  override_vendor_id: number | null;
  override_job_id: number | null;
  override_installer_id: number | null;
  override_description: string | null;
  override_is_cleared: boolean | null;
};

/**
 * Commit payload for matched transactions (mark as cleared)
 */
export type ClearPayload = {
  line_id: number;
};

/**
 * Commit payload for new transactions
 */
export type NewTransactionPayload = {
  date: string;
  description: string;
  cash_account_id: number;
  category_account_id: number;
  amount: number; // Absolute value
  is_expense: boolean; // true = expense (debit category), false = income (credit category)
  vendor_id: number | null;
  job_id: number | null;
  installer_id: number | null;
  purpose: 'business' | 'personal';
};
