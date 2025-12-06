# Oakerds Accounting

Business management and accounting application for **Oakerds LLC** (flooring contracting) and **Oakerds Holdings LLC** (real estate investments).

## Live URLs

| Environment | URL |
|-------------|-----|
| Production | https://app.alexveit.com |
| Mobile View | https://app.alexveit.com?m=1 |

## Tech Stack

- **Frontend:** React 18 + TypeScript + Vite
- **Backend:** Supabase (PostgreSQL + Auth)
- **Hosting:** Vercel
- **Domain:** domain.com (DNS via Network Solutions)

## Features

### Operations
- **Jobs** - Track flooring jobs from lead to completion with full P&L per job
- **Installers** - Manage contractors with 1099 reporting and payment tracking
- **Vendors** - Track material suppliers and service providers
- **Lead Sources** - Marketing channel tracking with ROI analysis
- **Price List** - Mobile-accessible pricing reference for field quotes

### Financials
- **Double-Entry Ledger** - Full transaction history with cleared/pending status
- **Expenses by Category** - Drill-down from yearly totals to individual transactions
- **Profit Summary** - Schedule C and Schedule E breakdowns
- **Tax Exports** - Generate 1099-NEC reports and tax-ready summaries

### Real Estate (REI Dashboard)
- **Rentals** - Track income, expenses, NOI per property
- **Flips** - Rehab budgets, draw tracking, profit projections
- **Wholesale** - Assignment fee tracking

### Analytics
- **Balances** - Net worth tracking across all accounts
- **Cash Flow** - Monthly income vs expenses
- **Expense Trends** - Category-level analysis over time

## Database Schema

| Table | Purpose |
|-------|---------|
| `accounts` | Chart of accounts with type and code |
| `account_types` | Asset, Liability, Equity, Income, Expense |
| `transactions` | Transaction headers (date, description) |
| `transaction_lines` | Double-entry lines with amounts |
| `jobs` | Flooring job records |
| `installers` | Contractor information |
| `vendors` | Supplier information |
| `lead_sources` | Marketing channels |
| `real_estate_deals` | Properties (rental, flip, wholesale) |

### Account Code Structure

```
1000-1999   Bank Accounts (Assets)
2000-2099   Business Credit Cards
2100-2199   Personal Credit Cards
2200-2299   Personal Debt
2300-2399   HELOC / Lines of Credit
3000-3999   Equity
4000-4999   Job Income
50000-54999 Business Overhead Expenses
55000-55999 Marketing Expenses
60000-60999 Personal Expenses
61000-61999 Rental Income
62000-62099 Rental Expenses
62100-62105 Flip Expenses
63000-63999 Real Estate Assets
64000-64999 Real Estate Mortgages
```

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Export codebase for AI review
npm run debug-docs
```

## Project Structure

```
src/
├── components/           # Dashboard and stand-alone Views
│   ├── analytics/        # Charts and trends
│   ├── expenses/         # Expense tracking views
│   ├── installers/       # Installer management
│   ├── lead-sources/     # Marketing ROI
│   ├── ledger/           # Transaction ledger (modular)
│   ├── mobile/           # Mobile-optimized views
│   ├── real-estate/      # REI dashboard, flips, rentals
│   └── vendors/          # Vendor management
├── lib/
│   └── supabaseClient.ts # Supabase connection
├── utils/
│   ├── accounts.ts       # Account codes & helpers (SINGLE SOURCE OF TRUTH)
│   ├── format.ts         # Currency/percent formatting
│   ├── date.ts           # Date formatting
│   └── mortgageAmortization.ts
├── App.tsx               # Main app with navigation
├── main.tsx              # Entry point
└── index.css             # Global styles

scripts/
└── createSnapshot.cjs    # Debug docs generator

db_tools/
├── my_db_backup.ps1      # Database backup script
└── [dumps]/              # SQL schema and data exports
```

## Key Files

| File | Purpose |
|------|---------|
| `CODING_RULES.txt` | Code standards for AI-assisted development |
| `src/utils/accounts.ts` | Single source of truth for all account codes |
| `src/utils/format.ts` | Centralized formatting (never duplicate) |

## Coding Standards

See `CODING_RULES.txt` for complete guidelines. Key principles:

1. **Never hardcode account ranges** - Use `ACCOUNT_CODE_RANGES` from `accounts.ts`
2. **Never duplicate formatters** - Import from `utils/format.ts`
3. **Double-entry integrity** - All transactions must balance (sum to zero)
4. **Cleared vs uncleared** - YTD reports use cleared only; balances use all

## Environment Variables

Create `.env.local`:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Deployment

Deployed automatically via Vercel on push to main branch.

## License

Private - Oakerds LLC
