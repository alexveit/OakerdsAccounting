// src/accounts.ts
// Single source of truth for account codes, ranges, and helpers

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
 * Account type IDs from account_types table
 */
export const ACCOUNT_TYPE_IDS = {
  ASSET: 1,
  LIABILITY: 2,
  EQUITY: 3,
  INCOME: 4,
  EXPENSE: 5,
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

  BUSINESS_CARD_MIN: 2000,
  BUSINESS_CARD_MAX: 2099,
  PERSONAL_CARD_MIN: 2100,
  PERSONAL_CARD_MAX: 2199,
  PERSONAL_DEBT_MIN: 2200,
  PERSONAL_DEBT_MAX: 2299,
  HELOC_MIN: 2300,
  HELOC_MAX: 2399,

  // Equity
  EQUITY_MIN: 3000,
  EQUITY_MAX: 3999,

  // Income
  JOB_INCOME_MIN: 4000,
  JOB_INCOME_MAX: 4999,
  RENTAL_INCOME_MIN: 61000,
  RENTAL_INCOME_MAX: 61999,

  // Expenses - Business overhead
  OVERHEAD_MIN: 50000,
  OVERHEAD_MAX: 54999,

  // Expenses - Marketing
  MARKETING_MIN: 55000,
  MARKETING_MAX: 55999,

  // Expenses - Personal
  PERSONAL_MIN: 60000,
  PERSONAL_MAX: 60999,

  // Expenses - Real estate operations
  REAL_ESTATE_EXPENSE_MIN: 62000,
  REAL_ESTATE_EXPENSE_MAX: 62999,

  // Expenses - Rental Real estate operations
  RENTAL_EXPENSE_MIN: 62000,
  RENTAL_EXPENSE_MAX: 62099,

  // Expenses - Flip real estate operations
  FLIP_EXPENSE_MIN: 62100,
  FLIP_EXPENSE_MAX: 62105,

  // Real estate assets
  RE_ASSET_MIN: 63000,
  RE_ASSET_MAX: 63999,

  // Real estate liabilities (mortgages, hard money)
  RE_MORTGAGE_MIN: 64000,
  RE_MORTGAGE_MAX: 64999,
} as const;

/**
 * Specific account codes - for direct references
 * Use these instead of hardcoding account codes throughout the app
 */
export const ACCOUNT_CODES = {
  // Income
  JOB_INCOME: '4000',
  RENTAL_INCOME: '61000',

  // Flip expenses (62100-62105)
  FLIP_INTEREST: '62100',
  FLIP_REHAB_MATERIALS: '62101',
  FLIP_REHAB_LABOR: '62102',
  FLIP_CLOSING_COSTS: '62103',
  FLIP_SERVICES: '62104',
  FLIP_HOLDING_COSTS: '62105',

  // Rental expenses
  RENTAL_REPAIRS: '62005',
  RENTAL_PROPERTY_MGMT: '62006',
  RENTAL_UTILITIES: '62007',
  RENTAL_HOME_WARRANTY: '62008',
  RENTAL_SUPPLIES: '62009',
  RENTAL_HOA: '62010',
  RENTAL_TAXES_INSURANCE: '62011',
  RENTAL_MORTGAGE_INTEREST: '62012',
} as const;

/**
 * Rehab category codes - for budget tracking
 * Maps to rehab_categories table
 */
export const REHAB_CODES = {
  // Site prep
  IDEM: 'IDEM', // Interior Demo & Trash Hauling
  ETRH: 'ETRH', // Exterior Trash Hauling

  // Structural
  FDRP: 'FDRP', // Foundation Repairs
  CMAS: 'CMAS', // Concrete & Masonry
  WPRO: 'WPRO', // Waterproofing
  ROOF: 'ROOF', // Roof
  WIND: 'WIND', // Windows
  ESTR: 'ESTR', // Exterior Siding/Trim
  EXPT: 'EXPT', // Exterior Paint
  GUSO: 'GUSO', // Gutters and Soffit
  CRFR: 'CRFR', // Carpentry/Framing

  // MEP Rough
  HVRF: 'HVRF', // HVAC Rough-In
  PLRF: 'PLRF', // Plumbing Rough-In
  ELRF: 'ELRF', // Electrical Rough-In

  // Interior
  INSU: 'INSU', // Insulation
  DRYW: 'DRYW', // Drywall
  TDHW: 'TDHW', // Trim, Doors, Hardware
  TILE: 'TILE', // Tile Work
  CAVN: 'CAVN', // Cabinets/Vanities
  CNTP: 'CNTP', // Countertops
  FLOR: 'FLOR', // Flooring
  PAIN: 'PAIN', // Painting
  CRPT: 'CRPT', // Carpet

  // MEP Trim
  HVTO: 'HVTO', // HVAC Trim Out
  PLTO: 'PLTO', // Plumbing Trim Out
  ELTO: 'ELTO', // Electrical Trim Out
  APPL: 'APPL', // Appliances

  // Exterior/Site
  DRSD: 'DRSD', // Driveway/Sidewalk
  DECK: 'DECK', // Deck
  LAND: 'LAND', // Landscaping

  // Final
  POCL: 'POCL', // Punchout & Cleaning

  // Permits
  PENG: 'PENG', // Permit, Plans & Engineering

  // Transactional (non-trade costs)
  HOLD: 'HOLD', // Holding Cost
  CLSE: 'CLSE', // Closing Cost
  CRED: 'CRED', // Credit/Funding (NOT an expense - excluded from cost basis)

  // Other
  OTHR: 'OTHR', // Other
} as const;

/**
 * Rehab codes that should be EXCLUDED from cost basis calculations
 * These represent funding sources, not actual costs
 */
export const REHAB_CODES_EXCLUDE_FROM_COST_BASIS = [
  REHAB_CODES.CRED, // Credit/Funding - loan draws are not costs
] as const;

/**
 * Rehab codes for transactional costs (not trade-specific)
 */
export const REHAB_CODES_TRANSACTIONAL = [
  REHAB_CODES.HOLD,
  REHAB_CODES.CLSE,
  REHAB_CODES.CRED,
] as const;

// -------------------------------------------------------------------
// Parse & Range Check Helpers
// -------------------------------------------------------------------

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

// -------------------------------------------------------------------
// Account type checks by code range
// -------------------------------------------------------------------

export function isBusinessCardCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.BUSINESS_CARD_MIN, ACCOUNT_CODE_RANGES.BUSINESS_CARD_MAX);
}

export function isPersonalCardCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.PERSONAL_CARD_MIN, ACCOUNT_CODE_RANGES.PERSONAL_CARD_MAX);
}

export function isPersonalDebtCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.PERSONAL_DEBT_MIN, ACCOUNT_CODE_RANGES.PERSONAL_DEBT_MAX);
}

export function isHelocCode(code: string | null | undefined): boolean {
  const n = parseAccountCode(code);
  return n !== null && (
    isCodeInRange(code, ACCOUNT_CODE_RANGES.HELOC_MIN, ACCOUNT_CODE_RANGES.HELOC_MAX) ||
    n === 64004  // RE HELOC (Lancelot) - special case
  );
}

export function isRentalExpenseCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.RENTAL_EXPENSE_MIN, ACCOUNT_CODE_RANGES.RENTAL_EXPENSE_MAX);
}

export function isFlipExpenseCode(code: string | null | undefined): boolean {
  return isCodeInRange(code, ACCOUNT_CODE_RANGES.FLIP_EXPENSE_MIN, ACCOUNT_CODE_RANGES.FLIP_EXPENSE_MAX);
}

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

// -------------------------------------------------------------------
// Compound checks for categorization
// -------------------------------------------------------------------

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
 * @deprecated Use classifyLine() instead for more granular categorization
 * that separates rental from flip expenses
 */
export type ExpenseCategory = 'realEstate' | 'marketing' | 'overhead' | 'jobExpense' | 'personal';

/**
 * @deprecated Use classifyLine() instead
 */
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

// -------------------------------------------------------------------------
// Transaction Line Classification (unified for all dashboards/analytics)
// -------------------------------------------------------------------------

/**
 * Income categories for P&L classification
 */
export type IncomeCategory = 'job' | 'rental' | 'personal' | 'other';

/**
 * Expense categories for P&L classification (granular)
 * - job: Business expense linked to a job
 * - rental: Rental property expenses (62000-62099)
 * - flip: Flip/rehab expenses (62100-62105) - capitalized, not deductible
 * - marketing: Marketing expenses (55000-55999)
 * - overhead: Business overhead (no job, not RE, not marketing)
 * - personal: Personal expenses
 */
export type ExpenseCategoryGranular = 
  | 'job' 
  | 'rental' 
  | 'flip' 
  | 'marketing' 
  | 'overhead' 
  | 'personal';

/**
 * Full classification result for a transaction line
 */
export type LineClassification = {
  /** Whether this is business-related (business or mixed purpose) */
  isBusiness: boolean;
  /** Whether this is personal */
  isPersonal: boolean;
  /** For income lines: the income category */
  incomeCategory: IncomeCategory | null;
  /** For expense lines: the expense category */
  expenseCategory: ExpenseCategoryGranular | null;
};

/**
 * Input shape for classifyLine - matches common Supabase query patterns.
 * All fields optional to handle various query shapes gracefully.
 */
export type ClassifiableLineInput = {
  amount?: number | string | null;
  purpose?: Purpose | null;
  job_id?: number | null;
  accounts?: {
    name?: string | null;
    code?: string | null;
    account_types?: { name?: string | null } | null;
  } | null;
};

/**
 * Classify a transaction line for P&L reporting.
 * Single source of truth for income/expense categorization.
 * 
 * @example
 * const classification = classifyLine(line);
 * if (classification.incomeCategory === 'job') {
 *   jobIncome += Math.abs(amount);
 * }
 * if (classification.expenseCategory === 'rental') {
 *   rentalExpenses += amount;
 * }
 */
export function classifyLine(line: ClassifiableLineInput): LineClassification {
  const purpose: Purpose = (line.purpose as Purpose) ?? 'business';
  const accountType = line.accounts?.account_types?.name ?? '';
  const code = line.accounts?.code ?? '';
  const hasJobId = line.job_id != null;

  const isBusiness = purpose === 'business' || purpose === 'mixed';
  const isPersonal = purpose === 'personal';

  const result: LineClassification = {
    isBusiness,
    isPersonal,
    incomeCategory: null,
    expenseCategory: null,
  };

  // INCOME classification
  if (accountType === 'income') {
    if (isPersonal) {
      result.incomeCategory = 'personal';
    } else if (isBusiness) {
      result.incomeCategory = isRentalIncomeCode(code) ? 'rental' : 'job';
    } else {
      result.incomeCategory = 'other';
    }
  }

  // EXPENSE classification
  else if (accountType === 'expense') {
    if (isPersonal) {
      result.expenseCategory = 'personal';
    } else if (isBusiness) {
      // Order matters: check specific ranges before fallback
      if (isFlipExpenseCode(code)) {
        result.expenseCategory = 'flip';
      } else if (isRentalExpenseCode(code)) {
        result.expenseCategory = 'rental';
      } else if (hasJobId) {
        result.expenseCategory = 'job';
      } else if (isMarketingExpenseCode(code)) {
        result.expenseCategory = 'marketing';
      } else {
        result.expenseCategory = 'overhead';
      }
    }
  }

  return result;
}

/**
 * Convenience helper: check if expense is real estate related (rental OR flip)
 */
export function isRealEstateExpenseCategory(category: ExpenseCategoryGranular | null): boolean {
  return category === 'rental' || category === 'flip';
}

// -------------------------------------------------------------------------
// Sorting helpers
// -------------------------------------------------------------------------

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
