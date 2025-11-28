<!-- .github/copilot-instructions.md - guidance for AI coding agents -->
# Repo snapshot

- Project: React + TypeScript front-end built with Vite. Sources under `src/`.
- Data/backend: Supabase (client in `src/lib/supabaseClient.ts`). DB schema and dumps at repository root (`schema.sql`, `full_dump.sql`, `supabase/`, `Tables/`).

# Quick dev commands

- Install deps: `npm install`
- Run dev server: `npm run dev` (starts Vite HMR)
- Build: `npm run build` (runs `tsc -b` then `vite build`)
- Preview build: `npm run preview`
- Lint: `npm run lint`

# Architecture & data flows (concise)

- Front-end-only SPA. No server code here; all backend access uses Supabase JS client.
- `src/lib/supabaseClient.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from env — supply these when running locally.
- UI components live in `src/components/`. Example: `NewTransactionForm.tsx` shows common patterns for reads, validation and writes to Supabase.
- Mutations are performed through Supabase RPCs and table inserts. Example RPC: `create_transaction` is called with `p_date`, `p_description`, `p_line1`, `p_line2` from `NewTransactionForm.tsx`.
- Reads often join related rows via Supabase selects. Example: `.from('transaction_lines').select('id, amount, transactions(date, description)')`.

# Project-specific conventions & patterns

- Accounts and account types
  - `accounts` rows include `account_types.name` and `purpose_default`.
  - Common `account_types.name` values used in UI: `asset`, `liability`, `income`, `expense`.
  - In UI sorting, `account.id === 1` is treated specially (placed first) — preserve this when modifying account lists.

- Jobs and job-related transactions
  - Jobs have `status` (UI filters out `status === 'closed'`). See `NewTransactionForm.tsx` for how jobs are loaded and sorted by `start_date`.
  - When a transaction `linkToJob` is true and `txType === 'expense'`:
    - `expenseKind === 'material'` requires `vendor_id`.
    - `expenseKind === 'labor'` requires `installer_id`.
  - These rules are enforced in the component prior to calling the RPC; mirror these checks if you add alternative entry points.

- UX safety checks to respect
  - Large amount warning: amounts > $10,000 prompt confirmation.
  - Future-date warning: dates > 7 days ahead prompt confirmation.
  - Duplicate-check: `transaction_lines` search +/- 3 days by vendor and similar amount/description — do not remove this behavior unless intentionally changing UX.

- Type & ID handling
  - UI frequently stores numeric IDs as `string` in React state for `<select>` controls — convert with `Number(...)` prior to sending to Supabase.

# Integration & where to change backend behaviors

- Database schema: `schema.sql` / `full_dump.sql` / `supabase/` (migrations/SQL lives here). Update the DB via Supabase console or migrations; front-end expects certain RPC signatures (e.g., `create_transaction(p_date, p_description, p_line1, p_line2)`).
- Example CSV data for imports: `Tables/*.csv` and `supabase/*.json` mapping files — useful when seeding or inspecting row shapes.

# Files to look at when working in this repo

- UI components: `src/components/*` (business logic lives here — e.g. `NewTransactionForm.tsx`, `LedgerView.tsx`)
- Supabase client: `src/lib/supabaseClient.ts` (env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)
- Small utilities: `src/utils/date.ts` (date helper `todayLocalISO` used by forms)
- DB & schema: `schema.sql`, `full_dump.sql`, `supabase/`, `Tables/`

# Important examples (copyable snippets)

- Calling RPC to create transaction (from `NewTransactionForm.tsx`):

  supabase.rpc('create_transaction', {
    p_date: date,
    p_description: description || null,
    p_line1: line1,
    p_line2: line2,
  });

- Selecting transaction lines with parent transaction fields:

  supabase
    .from('transaction_lines')
    .select('id, amount, transactions(date, description)')

# Guidance for AI edits

- Preserve existing UX validations unless the issue describes changing them explicitly.
- When adding or changing RPCs, update `schema.sql`/Supabase migration and keep front-end payload shape in sync (see `p_line1`/`p_line2` example).
- Prefer making small, focused changes. Use `npm run dev` locally and verify Supabase env vars are set. If a change requires DB migrations, list the SQL to run in the PR description.

# Questions to ask the author before larger changes

- Is there a CI or deployment flow that applies DB migrations automatically? (No CI config detected in repo.)
- Where are production Supabase credentials / project details stored? (Don't commit secrets.)
- Do you want to keep the duplicate-check heuristics and large-amount prompts as-is for automation tests?

---
If anything is missing or you want me to emphasize other files (for example `jobs` or `transactions` RPCs), tell me which area to expand and I'll update this file.
