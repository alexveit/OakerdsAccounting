# Oakerds Accounting - Coding Rules

> **These rules apply to ALL code generation for this project.**
>
> Last updated: December 2024

---

## Table of Contents

1. [Centralized Utilities](#1-centralized-utilities---never-duplicate)
2. [Type Safety](#2-type-safety)
3. [Accounting Integrity](#3-accounting-integrity)
4. [File Organization](#4-file-organization)
5. [Ledger Components](#5-ledger-components)
6. [Supabase Queries](#6-supabase-queries)
7. [Code File Standards](#7-code-file-standards)
8. [What Not To Do](#8-what-not-to-do)
9. [What To Always Do](#9-what-to-always-do)
10. [Account Code Ranges](#10-account-code-ranges-reference)
11. [Specific Account Codes](#11-specific-account-codes)
12. [Session Learnings](#12-session-learnings---meta-rule)
13. [Real Estate Transactions](#13-real-estate-transaction-rules)
14. [AI File Editing](#14-ai-assistant-file-editing)
15. [AI-Powered Features](#15-ai-powered-features)
16. [Click-to-Edit Pattern](#16-click-to-edit-pattern)
17. [Entity Select Components](#17-entity-select-components)
18. [Common Bug Patterns](#18-common-bug-patterns-to-avoid)
19. [PowerShell DB Dumps](#19-powershell-database-dumps)
20. [UI Display Conventions](#20-ui-display-conventions)
21. [AI Bank Import](#21-ai-bank-import-specifics)
22. [Modal Edit Results](#22-modal-edit-results)
23. [Transaction Line Placement](#23-transaction-line-entity-placement)
24. [Credit Card Signs](#24-credit-card-sign-convention)
25. [Event Propagation](#25-event-propagation-in-nested-clickables)
26. [UI Color Conventions](#26-ui-color-conventions)
27. [CSS & Styling](#27-css--styling)

---

## 1. CENTRALIZED UTILITIES - NEVER DUPLICATE

ACCOUNT CODES (src/utils/accounts.ts)
- Import: ACCOUNT_CODE_RANGES, ACCOUNT_TYPE_IDS, SPECIAL_ACCOUNTS, ACCOUNT_CODES
- Import helpers: isBankCode, isBusinessCardCode, isPersonalCardCode,
  isPersonalDebtCode, isHelocCode, isCreditCardCode, isRentalExpenseCode,
  isFlipExpenseCode, isMarketingExpenseCode, isRentalIncomeCode,
  isRealEstateAssetCode, isMortgageCode
- NEVER hardcode account ranges (e.g., code >= 1000 && code <= 1999)
- ALWAYS use: ACCOUNT_CODE_RANGES.BANK_MIN, ACCOUNT_CODE_RANGES.BANK_MAX, etc.
- NEVER use account names for lookups (e.g., a.name === 'RE - Mortgage Interest')
- ALWAYS use ACCOUNT_CODES: accounts.find(a => a.code === ACCOUNT_CODES.RENTAL_MORTGAGE_INTEREST)

TRANSACTION LINE CLASSIFICATION (src/utils/accounts.ts)
- Use classifyLine(line) for all P&L categorization
- Returns: { isBusiness, isPersonal, incomeCategory, expenseCategory }
- Income categories: 'job' | 'rental' | 'personal' | 'other'
- Expense categories: 'job' | 'rental' | 'flip' | 'marketing' | 'overhead' | 'personal'
- Use isRealEstateExpenseCategory(category) to check if rental OR flip
- NEVER duplicate classification logic inline in components
- ALWAYS use classifyLine() for Dashboard, Analytics, ProfitSummary, etc.

Example:
```tsx
const classification = classifyLine(line);
if (classification.incomeCategory === 'rental') { ... }
if (classification.expenseCategory === 'flip') { ... }
if (isRealEstateExpenseCategory(classification.expenseCategory)) { ... }
```

FORMATTING (src/utils/format.ts)
- Import: formatCurrency, formatMoney, formatCurrencyOptional, formatPercent
- formatCurrency(value, decimals) - use decimals=0 for whole dollars
- formatMoney(value) - alias for formatCurrency(value, 2)
- NEVER create local formatCurrency or formatMoney functions

DATES (src/utils/date.ts)
- Import: formatLocalDate
- For ledger components: export { formatLocalDate as formatDate } from '../../utils/date'
- NEVER create local date formatting functions

## 2. TYPE SAFETY

- AVOID `as any[]` type casting - define proper types instead
- Use `catch (err: unknown)` then `err instanceof Error ? err.message : '...'`
- Define explicit types for Supabase query results

### SUPABASE QUERY TYPE CASTING
- Define RawXxxRow types matching exact query shape (including nested joins)
- Cast results: (data ?? []) as unknown as RawXxxRow[]
- Handle nested joins that return arrays OR objects:

  type RawAccountRow = {
    id: number;
    name: string;
    account_types: { name: string }[] | { name: string } | null;
  };

  const raw = (data ?? []) as unknown as RawAccountRow[];
  const mapped = raw.map(a => ({
    ...a,
    account_types: Array.isArray(a.account_types)
      ? a.account_types[0] ?? null
      : a.account_types ?? null,
  }));

### RECHARTS COMPONENT TYPING
- Tooltip props: { active?: boolean; payload?: Array<{ payload: DataType }>; label?: string }
- Shape props: Use (props: unknown) then cast inside:

  shape={(props: unknown) => {
    const { x, y, width, height, payload } = props as {
      x: number; y: number; width: number; height: number; payload: MyData;
    };
    ...
  }}

### ERROR HANDLING
- Always: catch (err: unknown)
- Then: err instanceof Error ? err.message : 'Fallback message'
- NEVER: catch (err: any) or catch (err) with implicit any

## 3. ACCOUNTING INTEGRITY

### DOUBLE-ENTRY RULES
- Every transaction MUST have lines that sum to zero (debits = credits)
- Never create single-sided transactions
- DB trigger `trg_enforce_balance_*` blocks unbalanced transactions at database level

### TRANSACTION CREATION - USE RPC
- ALWAYS use `create_transaction_multi` RPC for creating transactions
- NEVER insert directly into transactions/transaction_lines tables
- RPC validates balance before committing (rejects if SUM != 0)
- RPC inserts all lines atomically in single statement

Example:
```tsx
const { error } = await supabase.rpc('create_transaction_multi', {
  p_date: date,
  p_description: description,
  p_lines: [
    { account_id: cashAccountId, amount: -100, is_cleared: true, purpose: 'business' },
    { account_id: expenseAccountId, amount: 100, is_cleared: true, purpose: 'business' },
  ],
});
```

### OPENING BALANCES
- Mortgage/loan liabilities: offset to Owner Equity (account_id: 10, code: 3000)
- Asset accounts: offset to Owner Equity
- Pattern: Liability negative, Equity positive (or vice versa) - must sum to zero

### TRANSACTION STRUCTURE
- transactions table: id, date, description
- transaction_lines table: transaction_id, account_id, amount, is_cleared, purpose
- Positive amounts = debits (expenses, assets)
- Negative amounts = credits (income, liabilities)

CLEARED vs UNCLEARED
- YTD reports: use is_cleared = true only
- Balance sheet: use ALL transactions (cleared + uncleared)

## 4. FILE ORGANIZATION

### IMPORTS ORDER
1. React imports
2. Supabase client
3. Utility imports (accounts, format, date)
4. Types
5. Components

### COMPONENT STRUCTURE
1. Type definitions
2. Props type
3. Component function
4. State declarations
5. Computed values
6. Helper functions (only if truly component-specific)
7. Data fetching
8. Event handlers
9. Styles
10. Return/render

## 5. LEDGER COMPONENTS (src/components/ledger/)

- Re-export shared utilities: formatDate, formatMoney from utils.ts
- Use ACCOUNT_CODE_RANGES for codeMatchesFilter function
- Types defined in types.ts
- Index exports from index.ts

## 6. SUPABASE QUERIES

- Always handle errors: if (error) throw error
- Use .select() to specify columns explicitly
- Use proper joins: accounts!inner, transactions!inner
- Foreign key relationships use ON DELETE CASCADE or ON DELETE SET NULL

## 7. CODE FILE STANDARDS

### ASCII ONLY
- All .ts/.tsx files must contain only ASCII characters
- No Unicode dashes, quotes, or symbols in code
- Use standard ASCII: - instead of em-dash, ' instead of curly quotes
- Prevents corruption when files are processed by different tools

Unicode characters get corrupted when files pass through different systems
(Windows CRLF, copy/paste, encoding mismatches). Use ASCII equivalents only.

FORBIDDEN -> USE INSTEAD
  em-dash or en-dash    ->  -- or -
  ellipsis character    ->  ... (three periods)
  arrow character       ->  ->
  curly apostrophes     ->  ' (straight apostrophe)
  curly quotes          ->  " (straight quote)
  warning emoji         ->  [!] or text
  checkmark             ->  [x] or OK or text

### IN UI STRINGS
  BAD:  'Select job...'  (ellipsis character U+2026)
  GOOD: 'Select job...' (three periods)

  BAD:  'Transfer Bank -> Card' (arrow character U+2192)
  GOOD: 'Transfer Bank -> Card' (hyphen + greater than)

  BAD:  '${code} -- ${name}' (em-dash U+2014)
  GOOD: '${code} - ${name}' (regular hyphen)

### IN COMMENTS
  BAD:  // From: -amt -> money leaving (arrow character)
  GOOD: // From: -amt -> money leaving (hyphen + greater than)

This prevents garbled output like: a->', a EUR ", a[TM], etc.

## 8. WHAT NOT TO DO

X  Hardcode account ranges: code >= 2000 && code <= 2099
X  Use account names for lookups: a.name === 'RE - Mortgage Interest'
X  Create local formatCurrency/formatMoney functions
X  Create local formatDate functions
X  Use `as any[]` without good reason
X  Create single-sided transactions
X  Duplicate helper functions that exist in utils/
X  Insert directly into transactions/transaction_lines (use RPC)
X  Use Unicode characters in code files

## 9. WHAT TO ALWAYS DO

OK  Import from centralized utils (accounts.ts, format.ts, date.ts)
OK  Use ACCOUNT_CODE_RANGES constants
OK  Use ACCOUNT_CODES for specific account lookups
OK  Use helper functions: isBankCode(), isBusinessCardCode(), etc.
OK  Use create_transaction_multi RPC for all transaction creation
OK  Ensure transactions balance (sum of lines = 0)
OK  Define proper TypeScript types
OK  Handle Supabase errors explicitly
OK  Keep code files ASCII-only

## 10. ACCOUNT CODE RANGES REFERENCE

ASSETS (1xxx, 63xxx)
- Banks: 1000-1999
- RE Assets: 63000-63999

LIABILITIES (2xxx, 64xxx)
- Credit Cards: 2000-2999
  - Business Cards: 2000-2099
  - Personal Cards: 2100-2199
  - Personal Debt: 2200-2299
  - HELOC: 2300-2399
- RE Mortgages: 64000-64999

EQUITY (3xxx)
- Equity: 3000-3999
- Owner Equity: account_id=10, code=3000 (used for opening balance offsets)

INCOME (4xxx, 61xxx)
- Job Income: 4000-4999
- Rental Income: 61000-61999

EXPENSES (5xxxx, 6xxxx)
- Overhead: 50000-54999
- Marketing: 55000-55999
- Personal: 60000-60999
- Real Estate Expenses: 62000-62999
  - Rental Expenses: 62000-62099
  - Flip Expenses: 62100-62105

## 11. SPECIFIC ACCOUNT CODES (ACCOUNT_CODES constant)

Use these for direct account lookups instead of name matching:

### INCOME
- JOB_INCOME: '4000'
- RENTAL_INCOME: '61000'

### FLIP EXPENSES (62100-62105)
- FLIP_INTEREST: '62100'
- FLIP_REHAB_MATERIALS: '62101'
- FLIP_REHAB_LABOR: '62102'
- FLIP_CLOSING_COSTS: '62103'
- FLIP_SERVICES: '62104'
- FLIP_HOLDING_COSTS: '62105'

### RENTAL EXPENSES
- RENTAL_REPAIRS: '62005'
- RENTAL_PROPERTY_MGMT: '62006'
- RENTAL_UTILITIES: '62007'
- RENTAL_HOME_WARRANTY: '62008'
- RENTAL_SUPPLIES: '62009'
- RENTAL_HOA: '62010'
- RENTAL_TAXES_INSURANCE: '62011'
- RENTAL_MORTGAGE_INTEREST: '62012'

## 12. SESSION LEARNINGS - META RULE

After any substantial database or application improvement session:

1. Review changes made during the session
2. Identify patterns, conventions, or rules that were established
3. Add relevant learnings to this CODING_RULES.txt file
4. This ensures institutional knowledge is captured and not lost

Examples of what to capture:
- New RPC functions and their usage patterns
- Database constraints or triggers added
- Architectural decisions (e.g., where components should live)
- Bug patterns to avoid
- New utility functions or constants

## 13. REAL ESTATE TRANSACTION RULES

### DEAL ATTRIBUTION
- All RE expense transaction_lines MUST have real_estate_deal_id set
- Orphaned RE expenses (no deal linked) break per-property P&L tracking
- Verify with: SELECT ... WHERE real_estate_deal_id IS NULL AND account code in RE range

### ACCOUNT TYPE MUST MATCH PROPERTY TYPE
- Flip properties: Use Flip Expense accounts (62100-62105)
- Rental properties: Use Rental Expense accounts (62000-62099)
- NEVER use Flip accounts for rental property expenses (or vice versa)
- Common mistake: Contractor work on rental coded as Flip Rehab Labor

### VERIFICATION QUERIES
When flip or rental totals don't match between views:
1. Check for orphaned expenses (no deal_id)
2. Check for misattributed expenses (wrong deal)
3. Check for wrong account type (flip account on rental property)

Example:
```tsx
SELECT COALESCE(d.nickname, '** NO DEAL **') AS deal, a.code, SUM(tl.amount)
FROM transaction_lines tl
JOIN accounts a ON a.id = tl.account_id
LEFT JOIN real_estate_deals d ON d.id = tl.real_estate_deal_id
WHERE a.code BETWEEN '62100' AND '62105'
GROUP BY d.nickname, a.code;
```

## 14. AI ASSISTANT FILE EDITING

### WHEN EDITING FILES WITH UNICODE/EMOJI CONTENT
- NEVER use shell commands (sed, cat >, awk) on files containing emojis or special characters
- Shell tools corrupt multi-byte UTF-8 sequences (emojis become garbled like ÃƒÂ°Ã…Â¸"Ã…Â )
- ALWAYS use the str_replace tool for targeted edits
- OR provide clean code snippets for manual paste

SAFE: str_replace tool, view tool, providing code blocks to paste
UNSAFE: sed, cat >, echo >, awk, perl one-liners on UTF-8 files

This applies especially to:
- App.tsx (nav icons)
- Any UI component with emoji icons
- Files with non-ASCII characters in strings

If you see garbled characters like ÃƒÂ°Ã…Â¸"Ã…Â  instead of Ã°Å¸â€œÅ , the file was corrupted
by shell commands and needs to be restored from source control.

## 15. AI-POWERED FEATURES (Bank Import Pattern)

### EDGE FUNCTION STRUCTURE
- Supabase Edge Functions for AI API calls (keeps API keys server-side)
- Send reference data (accounts, vendors, jobs) to AI for context
- Include current date context for parsing dates without years
- Return structured JSON with validation

### JSON PARSING FROM AI
- AI responses may have trailing commas - clean with regex before parsing
- Remove control characters: jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
- Remove trailing commas: jsonStr.replace(/,(\s*[\}\]])/g, '$1')
- Wrap JSON.parse in try/catch with detailed error logging

### STATE PERSISTENCE FOR EXPENSIVE OPERATIONS
- Use localStorage to preserve AI-processed data across navigation
- Pattern: save on state change, restore on mount, clear on commit/cancel

  const STORAGE_KEY = 'featureName_state';

```tsx
// Restore on mount
useEffect(() => {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) { /* restore state */ }
}, []);

// Save on change
useEffect(() => {
  if (hasData) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}, [state]);

// Clear after commit
function clearSavedState() {
  localStorage.removeItem(STORAGE_KEY);
}
```

## 16. CLICK-TO-EDIT PATTERN (Overview -> Manage)

For views with Overview and Manage tabs (Vendors, Installers, LeadSources):

PARENT VIEW (e.g., VendorsView.tsx)
- State: selectedId, setSelectedId
- Pass onSelect callback to Overview
- Pass initialSelectedId + onSelectionUsed to ManageView

  const [selectedId, setSelectedId] = useState<number | null>(null);

```tsx
<Overview onVendorSelect={(id) => { setSelectedId(id); setTab('manage'); }} />
<ManageView
  initialSelectedId={selectedId}
  onSelectionUsed={() => setSelectedId(null)}
/>
```

### OVERVIEW COMPONENT
- Accept onXxxSelect prop
- Add onClick to table rows with cursor: pointer

  <tr
    onClick={() => onVendorSelect?.(v.id)}
    style={{ cursor: onVendorSelect ? 'pointer' : 'default' }}
  >

### MANAGE COMPONENT
- Accept initialSelectedId and onSelectionUsed props
- useEffect to apply selection after data loads

  useEffect(() => {
    if (initialSelectedId != null && items.length > 0) {
      setSelectedId(initialSelectedId);
      setIsCreating(false);
      onSelectionUsed?.();
    }
  }, [initialSelectedId, items.length, onSelectionUsed]);

## 17. ENTITY SELECT COMPONENTS (Job, Vendor, Installer)

### USE WRAPPER COMPONENTS - NOT INLINE SEARCHABLESELECT
- Import from: '../shared' (VendorSelect, InstallerSelect, JobSelect)
- Wrappers handle: data loading, options mapping, quick-create (vendors)
- Parent only manages: value (number | null) and onChange

  // GOOD - one line, consistent everywhere
  <VendorSelect value={vendorId} onChange={setVendorId} />
  <InstallerSelect value={installerId} onChange={setInstallerId} />
  <JobSelect value={jobId} onChange={setJobId} />

  // BAD - duplicated in every component
  const [vendors, setVendors] = useState([]);
  useEffect(() => { /* load vendors */ }, []);
  const vendorOptions = vendors.map(v => ({ value: v.id, label: v.nick_name }));
  <SearchableSelect options={vendorOptions} ... />

### STATE TYPE FOR ENTITY IDS
- Use: number | null (not string)
- Wrapper components expect this type signature
- No String/Number conversion needed

  const [vendorId, setVendorId] = useState<number | null>(null);

### OPTIONAL PROPS
- placeholder: custom placeholder text
- emptyLabel: label for "none selected" option (default: "None")
- disabled: disable the select

### SEARCHABLESELECT CLICK HANDLER
- Use onMouseDown with preventDefault, NOT onClick
- onClick has race condition with input blur events
- Pattern applies to dropdown option selection:

  onMouseDown={(e) => { e.preventDefault(); handleOptionClick(option.value); }}

## 18. COMMON BUG PATTERNS TO AVOID

### SUCCESS MESSAGE DISAPPEARING
- Bug: setSuccess() then list updates, triggering useEffect that calls populateForm()
- populateForm() was clearing success - user never sees feedback
- Fix: Don't clear success in populateForm(), only in resetForm()

### TYPESCRIPT TYPE NARROWING IN CONDITIONALS
- Bug: {state === 'review' && <button disabled={state === 'committing'}>}
- TS knows state can only be 'review' inside the block, flags comparison as always false
- Fix: Include both states in condition: {(state === 'review' || state === 'committing') && ...}

### OPTIONAL FIELDS IN RPC CALLS
- Bug: Passing null for optional fields like job_id in JSONB
- Postgres RPC may not handle nulls in JSONB well
- Fix: Only include fields if they have values

  const line: Record<string, any> = { account_id, amount };
  if (jobId) line.job_id = jobId;
  if (vendorId) line.vendor_id = vendorId;

### CSS INPUT TYPE SELECTORS
- Bug: input[type="tel"] not styled like other inputs
- Fix: Add all input types to CSS selector list
- Check: text, number, date, email, password, search, tel

## 19. POWERSHELL DATABASE DUMPS

### ENCODING FIX
- PowerShell's > redirection outputs UTF-16 by default
- UTF-16 files can't be searched/processed by many tools
- Always use: | Out-File -FilePath "file.sql" -Encoding utf8

  # BAD - creates UTF-16
  pg_dump ... > schema.sql

  # GOOD - creates UTF-8
  pg_dump ... | Out-File -FilePath "schema.sql" -Encoding utf8

## 20. UI DISPLAY CONVENTIONS

### EXPENSE DISPLAY
- Red color alone indicates expense/negative - no minus sign needed
- Showing both minus AND red is redundant and clutters the UI

```tsx
// ❌ BAD
<span style={{ color: red }}>-{currency(expense)}</span>

```tsx
  # GOOD
  <span style={{ color: red }}>{currency(expense)}</span>
```

### ASCII SEPARATORS IN UI
- Use pipe | or hyphen - instead of middle dot (Ã‚Â·) or bullet
- Middle dots get garbled across systems (Ãƒâ€šÃ‚Â· instead of Ã‚Â·)

```tsx
// ❌ BAD
  Margin: 13.4% Ã‚Â· Avg: $5,947 Ã‚Â· Count: 104

```tsx
// ✅ GOOD
Margin: 13.4% | Avg: $5,947 | Count: 104

### COLLAPSIBLE SIDEBAR SECTIONS
- Store collapsed state as Set<string> of section titles
- Default to collapsed: new Set(['Operations', 'Financials', 'Real Estate'])
- Toggle with click on section header, show chevron indicator

## 21. AI BANK IMPORT SPECIFICS

### DATE PARSING
- Bank data often shows dates without year (e.g., "12/07")
- Always include current date context in AI prompt
- System prompt: "Today is ${currentDate}. Use ${currentYear} for dates without year."

### STATUS AUTO-POPULATION
- Bank "Processing"/"Pending" -> is_cleared = false (unchecked)
- Bank "Posted"/"Cleared" -> is_cleared = true (checked)
- Allow user override but default from bank status

checked={tx.override_is_cleared ?? (tx.bank_status === 'posted')}

### MINIMAL INPUT FOR BEST RESULTS
- Copy only the transaction table, not full page
- Full page includes navigation, footer, disclaimers = more tokens + higher error rate
- Cleaner input = more reliable JSON output from AI

### PURPOSE FIELD
- Removed from Bank Import for consistency with NewTransactionForm
- Default to 'business' for all imported transactions
- User can edit in Ledger if needed

## 22. MODAL EDIT RESULTS - RETURNING DISPLAY VALUES

When a modal edits entity relationships (job, vendor, installer), return
display names in the result so parent can update UI without refetching.

### MODAL RESULT TYPE
- Include both IDs (for database) and display names (for UI)

export type EditModalResult = {
  // ... other fields
  jobName: string | null;
  vendorInstaller: string;  // combined display string
};

### MODAL SAVE HANDLER
- After saving to DB, fetch display names for changed entities
- Build result object with names, not just IDs

// Fetch names for UI
let jobName = null;
if (editJobId) {
  const { data } = await supabase.from('jobs').select('name').eq('id', editJobId).single();
  jobName = data?.name ?? null;
}

```tsx
  onSave(txId, { ...result, jobName, vendorInstaller });
```

### PARENT UPDATE HANDLER
- Spread result values directly into row state

  const handleEditSave = (txId: number, result: EditModalResult) => {
    setRows(prev => prev.map(r =>
      r.transaction_id === txId
        ? { ...r, job_name: result.jobName, vendor_installer: result.vendorInstaller }
        : r
    ));
  };

### WHY THIS PATTERN
- Avoids full data refetch after every edit
- Keeps UI responsive
- Modal already has the data, just needs to return it

## 23. TRANSACTION LINE ENTITY PLACEMENT

CATEGORY LINE ONLY - job_id, vendor_id, installer_id
- These belong ONLY on the income/expense (category) line
- NEVER on the asset/liability (cash/bank) line
- This is proper double-entry accounting practice

  // CORRECT
  categoryLine = { account_id: expenseAcct, amount: 100, job_id, vendor_id, installer_id };
  cashLine = { account_id: bankAcct, amount: -100 };  // NO job_id

  // WRONG - job_id on both lines (denormalized hack)
  categoryLine = { account_id: expenseAcct, amount: 100, job_id };
  cashLine = { account_id: bankAcct, amount: -100, job_id };  // BAD

### WHY THIS MATTERS
- Data integrity: updating job on one line doesn't orphan the other
- Multi-job splits: one payment can cover multiple jobs (cash line has no job)
- Professional credibility: follows GAAP conventions
- Clean exports: no cleanup needed for QuickBooks/Xero integration

QUERYING JOB TRANSACTIONS (two-step pattern)
Since cash lines don't have job_id, query in two steps:

  // Step 1: Get category lines with job_id -> transaction IDs
  const { data: categoryLines } = await supabase
    .from('transaction_lines')
    .select('transaction_id, job_id')
    .not('job_id', 'is', null);

  const txToJob = new Map<number, number>();
  for (const line of categoryLines) {
    txToJob.set(line.transaction_id, line.job_id);
  }

  // Step 2: Get ALL lines for those transactions
  const { data: allLines } = await supabase
    .from('transaction_lines')
    .select('*, accounts(*), transactions(*)')
    .in('transaction_id', [...txToJob.keys()]);

  // Group by job using txToJob map (cash lines won't have job_id)
  for (const line of allLines) {
    const jobId = line.job_id ?? txToJob.get(line.transaction_id);
    // ... group by jobId
  }

## 24. CREDIT CARD SIGN CONVENTION (Bank Import)

CC statements show charges as POSITIVE (you owe more), but in accounting
they are EXPENSES and must be NEGATIVE.

BANK ACCOUNT (checking/savings)
- Statement negative = expense -> use NEGATIVE amount
- Statement positive = income -> use POSITIVE amount
- Keep signs as-is

### CREDIT CARD
- Statement positive (charge) = expense -> use NEGATIVE amount (INVERT!)
- Statement negative (payment) = income -> use POSITIVE amount (INVERT!)

### DETECTION
- Account codes starting with "1" = bank account (keep signs)
- Account codes starting with "2" = credit card (invert signs)

### AI PROMPT EXAMPLE
  ⚠️ CRITICAL - THIS IS A CREDIT CARD ACCOUNT ⚠️
  You MUST INVERT all signs from what the statement shows:
  - Statement shows $303.70 charge -> output amount: -303.70 (NEGATIVE)
  - Statement shows -$100.00 payment -> output amount: 100.00 (POSITIVE)

### MATCHING CC TRANSACTIONS
DB stores CC expenses as negative, but statement shows positive.
Match by comparing ABSOLUTE VALUES:
- Statement: $39.00 (positive)
- DB: -$39.00 (negative)
- abs(39) == abs(-39) -> MATCH!

## 25. EVENT PROPAGATION IN NESTED CLICKABLES

When clickable elements (checkboxes, buttons) are inside other clickable
containers (collapsible cards, expandable rows), stop event propagation.

### PROBLEM
- Card div has onClick to toggle expand/collapse
- Checkbox inside card triggers card toggle when clicked

### SOLUTION
- Add onClick={(e) => e.stopPropagation()} to inner clickable
- Or wrap inner content section in div with stopPropagation

  // On the checkbox itself
  <input
    type="checkbox"
    onClick={(e) => e.stopPropagation()}
    onChange={() => handleToggle(id)}
  />

  // Or wrap the content area
  {isExpanded && (
    <div onClick={(e) => e.stopPropagation()}>
      {/* buttons, checkboxes, tables here */}
    </div>
  )}

## 26. UI COLOR CONVENTIONS

ACTION BUTTONS (primary actions)
- Blue: #2563eb
- Use for: Settle, Save, Submit, Create

### SELECTION ACTION BARS
- Background: Light blue #f0f9ff
- Text: Neutral dark with fontWeight: 500
- Use for: "X items selected" status bars

### ROW HIGHLIGHTING
- Unsettled CC: Light red #fef2f2
- Uncleared: Light yellow #fffbe6
- CC takes precedence over uncleared

### STATUS INDICATORS
- Unsettled CC: Red #b91c1c
- Settled CC: Green #10b981


## 27. CSS & STYLING

### INLINE STYLES - AVOID
```css
/* ❌ BAD */
style={{ padding: '1rem', color: 'red' }}

/* ✅ GOOD */
className="alert-box"
```

Exceptions (inline OK):
- Dynamic values computed at runtime: style={{ width: `${percent}%` }}
- Conditional colors from data: style={{ color: statusColors[status] }}
- Prop-driven dimensions: style={{ minWidth }}

### WHEN REFACTORING INLINE -> CSS
1. Create class in index.css with descriptive name
2. Use component prefix: .transfer-form__, .ledger__, .deal-edit__
3. Replace style={{ }} with className=""
4. If mixing static + dynamic: className="base-class" style={{ dynamicProp }}

### CSS CLASS NAMING
Use BEM-style for view-specific components:

```css
.component__element--modifier
.deal-edit__section
.modal__title
.btn-pill--danger
```

Use flat names for global utilities:

```css
.card, .btn-primary, .flex, .gap-1
```

### CSS VARIABLES - USE THEM
```css
/* ❌ BAD */
color: #b00020;

/* ✅ GOOD */
color: var(--accent-negative);
```

```css
/* ❌ BAD */
border-radius: 8px;

/* ✅ GOOD */
border-radius: var(--radius-md);
```

Available variables documented at top of index.css:
- Colors: --bg, --text-main, --accent-*, --border-*
- Spacing: --radius-sm, --radius-md, --radius-lg, --radius-full
- Shadows: --shadow-sm, --shadow-md, --shadow-lg
- Layout: --sidebar-width, --sidebar-collapsed-width

### AVOID DUPLICATE DEFINITIONS
Before adding a new class, search index.css for existing similar classes.
One definition per class. If you need variations, use modifiers:

```css
.btn-danger          /* base */
.btn-danger--outline /* modifier */
```

### UNITS
Prefer rem for spacing/sizing (scales with user preferences).
Use px only for borders, box-shadows, or pixel-perfect requirements.

Equivalent values:

```
0.75rem   = 12px
0.8125rem = 13px
0.875rem  = 14px
1rem      = 16px
```

### CSS FILE ORGANIZATION
When adding new styles:
1. Find the relevant section in index.css (check header comment for overview)
2. Add to existing section OR create new section with header:
   /* =========================================================
      Component Name
      ========================================================= */
3. Keep view-specific styles grouped together

### DYNAMIC STYLES THAT ARE OK INLINE
These patterns are acceptable as inline styles:
- Colors from data: style={{ color: tx.type === 'income' ? 'green' : 'red' }}
- Conditional backgrounds: style={{ backgroundColor: isSelected ? '#f0f0f0' : undefined }}
- Computed dimensions: style={{ width: `${progress}%` }}
- Status colors from constants: style={{ color: STATUS_COLORS[status] }}

### COMMON CSS PATTERNS IN THIS APP

| Category | Classes |
|----------|---------|
| Page header | `.page-header`, `.page-header__title` |
| Cards | `.card`, `.card--flat` |
| Buttons | `.btn-primary`, `.btn-danger`, `.btn-cancel` |
| Forms | `.filter-group`, `.filter-group__label` |
| Tables | `.data-table th`, `.data-table td` |
| Modals | `.modal-overlay`, `.modal`, `.modal__title` |
| Status | `.badge`, `.badge-success`, `.badge-danger` |
