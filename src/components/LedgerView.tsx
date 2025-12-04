import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type DateRangePreset = 'last-12-months' | 'custom';

type DateRange = {
  start: string | null;
  end: string | null;
};

function getDateRangeForPreset(preset: DateRangePreset): DateRange {
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

type LedgerRow = {
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
  // All accounts touched by this transaction (for filtering)
  all_account_ids: number[];
  all_account_codes: (number | null)[];
};

type AccountOption = {
  id: number;
  name: string;
  code: number | null;
  label: string;
};

type SortField =
  | 'date'
  | 'description'
  | 'vendor_installer'
  | 'cash_account'
  | 'type_label'
  | 'amount'
  | 'is_cleared';

type SortDir = 'asc' | 'desc';

// Account filter can be:
// - 'all': show all transactions
// - number: specific account ID
// - 'banks': codes 1000-1999
// - 'cards': codes 2000-2999
// - 're-all': codes 63000-64999
// - 're-assets': codes 63000-63999
// - 're-liabilities': codes 64000-64999
type AccountFilter = 'all' | 'banks' | 'cards' | 're-all' | 're-assets' | 're-liabilities' | number;

// Helper to check if a code falls within a range
function codeMatchesFilter(code: number | null, filter: AccountFilter): boolean {
  if (filter === 'all') return true;
  if (code === null) return false;
  
  switch (filter) {
    case 'banks':
      return code >= 1000 && code <= 1999;
    case 'cards':
      return code >= 2000 && code <= 2999;
    case 're-all':
      return code >= 63000 && code <= 64999;
    case 're-assets':
      return code >= 63000 && code <= 63999;
    case 're-liabilities':
      return code >= 64000 && code <= 64999;
    default:
      return false; // number filter handled separately
  }
}

export function LedgerView() {
  const [allRows, setAllRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [rowActionError, setRowActionError] = useState<string | null>(null);


  const [editingRow, setEditingRow] = useState<LedgerRow | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editCashAccountId, setEditCashAccountId] = useState<number | null>(null);
  const [editCategoryAccountId, setEditCategoryAccountId] = useState<number | null>(null);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Account options for edit modal
  const [cashAccountOptions, setCashAccountOptions] = useState<{ id: number; label: string }[]>([]);
  const [categoryAccountOptions, setCategoryAccountOptions] = useState<{ id: number; label: string }[]>([]);

  // All accounts from DB for the tiered dropdown
  const [allAccounts, setAllAccounts] = useState<AccountOption[]>([]);

  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');

  // Date range filter
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('last-12-months');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Clear-transaction modal state
  const [clearOpen, setClearOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<LedgerRow | null>(null);
  const [clearAmount, setClearAmount] = useState<string>('');
  const [clearDate, setClearDate] = useState<string>('');
  const [clearDescription, setClearDescription] = useState<string>('');
  const [clearError, setClearError] = useState<string | null>(null);

  // ---------- load ledger ----------
  async function loadLedger() {
    setLoading(true);
    setError(null);
    setRowActionError(null);

    try {
      // Fetch 10 years of data for responsive client-side filtering
      const now = new Date();
      const tenYearsAgo = new Date(now);
      tenYearsAgo.setFullYear(now.getFullYear() - 10);
      const tenYearsAgoISO = tenYearsAgo.toISOString().slice(0, 10);

      const { data, error: lineErr } = await supabase
        .from('transaction_lines')
        .select(
          `
          id,
          transaction_id,
          amount,
          is_cleared,
          created_at,
          account_id,
          job_id,
          accounts (
            name,
            code,
            account_types ( name )
          ),
          transactions!inner (
            date,
            description,
            created_at,
            updated_at
          ),
          jobs (
            name
          ),
          vendors (
            name
          ),
          installers (
            first_name,
            last_name,
            company_name
          )
        `
        )
        .gte('transactions.date', tenYearsAgoISO)
        .limit(15000);

      if (lineErr) throw lineErr;

      const rawLines = (data ?? []) as any[];

      const txMap = new Map<number, any[]>();
      for (const line of rawLines) {
        const txId: number = line.transaction_id;
        if (!txMap.has(txId)) txMap.set(txId, []);
        txMap.get(txId)!.push(line);
      }

      const ledgerRows: LedgerRow[] = [];

      for (const [txId, lines] of txMap.entries()) {
        if (!lines.length) continue;
        const first = lines[0];
        const tx = first.transactions;

        const date: string = tx?.date ?? '';
        const createdAt: string = tx?.created_at ?? first.created_at;

        // Job name from any line that has a job_id
        const lineWithJob = lines.find((l: any) => l.jobs?.name);
        const jobName: string | null = lineWithJob?.jobs?.name ?? null;

        // Vendor / installer label
        let vendorInstaller = '';
        const withVendor = lines.find(
          (l: any) => l.vendors && l.vendors.name && l.vendors.name.trim() !== ''
        );
        if (withVendor?.vendors?.name) {
          vendorInstaller = withVendor.vendors.name;
        } else {
          const withInstaller = lines.find((l: any) => l.installers != null);
          if (withInstaller?.installers) {
            const inst = withInstaller.installers;
            const fullName = [inst.first_name, inst.last_name]
              .filter(Boolean)
              .join(' ')
              .trim();
            vendorInstaller = inst.company_name || fullName;
          }
        }

        // Cash side (asset/liability)
        const cashLine =
          lines.find((l: any) => {
            const t = l.accounts?.account_types?.name;
            return t === 'asset' || t === 'liability';
          }) ?? lines[0];

        const cashAccount: string | null =
          cashLine.accounts != null
            ? cashLine.accounts.code
              ? `${cashLine.accounts.name} - ${cashLine.accounts.code}`
              : cashLine.accounts.name
            : null;

        const cashAccountId: number | null =
          typeof cashLine.account_id === 'number' ? cashLine.account_id : null;

        const cashLineId: number = cashLine.id;

        // Type / category side (other account)
        const typeLine = lines.find((l: any) => l !== cashLine) ?? lines[0];
        const typeLabel: string | null = typeLine.accounts?.name ?? null;

        const amount = Number(cashLine.amount);
        const isCleared = lines.every((l: any) => !!l.is_cleared);
        const updatedAt: string = tx?.updated_at ?? createdAt;

        // Collect all account IDs and codes from all lines
        const allAccountIds: number[] = [];
        const allAccountCodes: (number | null)[] = [];
        for (const line of lines) {
          if (typeof line.account_id === 'number') {
            allAccountIds.push(line.account_id);
            const codeStr = line.accounts?.code;
            const codeNum = codeStr ? parseInt(codeStr, 10) : null;
            allAccountCodes.push(isNaN(codeNum as number) ? null : codeNum);
          }
        }

        ledgerRows.push({
          transaction_id: txId,
          line_id: cashLineId,
          date,
          created_at: createdAt,
          updated_at: updatedAt,
          description: tx?.description ?? null,
          job_name: jobName,
          vendor_installer: vendorInstaller || '',
          cash_account: cashAccount,
          cash_account_id: cashAccountId,
          type_label: typeLabel,
          amount,
          is_cleared: isCleared,
          all_account_ids: allAccountIds,
          all_account_codes: allAccountCodes,
        });
      }

      setAllRows(ledgerRows);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load ledger');
      setLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const { data, error: accErr } = await supabase
        .from('accounts')
        .select('id, name, code')
        .order('code', { ascending: true });
      
      if (accErr) throw accErr;
      
      const accounts: AccountOption[] = (data ?? []).map((a: any) => {
        const code = a.code ? parseInt(a.code, 10) : null;
        return {
          id: a.id,
          name: a.name,
          code: isNaN(code as number) ? null : code,
          label: a.code ? `${a.name} - ${a.code}` : a.name,
        };
      });
      
      setAllAccounts(accounts);
    } catch (err: any) {
      console.error('Failed to load accounts:', err);
    }
  }

  useEffect(() => {
    void loadLedger();
    void loadAccounts();
  }, []);

  // ---------- helpers ----------
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    return y && m && d ? `${Number(m)}/${Number(d)}/${y}` : dateStr;
  };

  const formatMoney = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  // Combine job name and description for display
  const getDisplayDescription = (row: LedgerRow): string => {
    if (row.job_name && row.description) {
      return `${row.job_name} / ${row.description}`;
    }
    return row.job_name || row.description || '';
  };

  const thStyleBase = {
    textAlign: 'left' as const,
    borderBottom: '1px solid #ccc',
    padding: '4px 4px',
  };
  const tdStyle = {
    padding: '6px 4px',
    borderBottom: '1px solid #eee',
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      // New field: default direction based on field type
      setSortField(field);
      const defaultDir: SortDir =
        field === 'date' || field === 'amount' ? 'desc' : 'asc';
      setSortDir(defaultDir);
    }
  };

  const sortableTh = (field: SortField, label: string, align: 'left' | 'right' | 'center' = 'left') => {
    const isActive = sortField === field;
    const arrow = isActive ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

    return (
      <th
        style={{
          ...thStyleBase,
          textAlign: align,
          cursor: 'pointer',
          userSelect: 'none' as const,
          whiteSpace: 'nowrap' as const,
          background: isActive ? '#f5f5f5' : 'transparent',
        }}
        onClick={() => handleSort(field)}
      >
        {label}
        {arrow}
      </th>
    );
  };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(e.target.value) || 25;
    setPageSize(newSize);
    setPage(1);
  };

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  useEffect(() => {
    setPage(1);
  }, [searchTerm, accountFilter, dateRangePreset, customStartDate, customEndDate]);

  const compareValues = (a: any, b: any, dir: SortDir) => {
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
  };

  // ---------- account list (for selector) ----------
  // Separate accounts by category based on code ranges
  const categorizedAccounts = useMemo(() => {
    const banks: AccountOption[] = [];
    const cards: AccountOption[] = [];
    const reAssets: AccountOption[] = [];
    const reLiabilities: AccountOption[] = [];
    const other: AccountOption[] = [];

    for (const acc of allAccounts) {
      if (acc.code !== null) {
        if (acc.code >= 1000 && acc.code <= 1999) {
          banks.push(acc);
        } else if (acc.code >= 2000 && acc.code <= 2999) {
          cards.push(acc);
        } else if (acc.code >= 63000 && acc.code <= 63999) {
          reAssets.push(acc);
        } else if (acc.code >= 64000 && acc.code <= 64999) {
          reLiabilities.push(acc);
        }
        // Note: we don't add to 'other' for accounts with codes outside these ranges
        // as they're likely income/expense accounts not relevant for this filter
      }
    }

    // Sort each category by code
    const sortByCode = (a: AccountOption, b: AccountOption) => {
      if (a.code === null && b.code === null) return a.name.localeCompare(b.name);
      if (a.code === null) return 1;
      if (b.code === null) return -1;
      return a.code - b.code;
    };

    banks.sort(sortByCode);
    cards.sort(sortByCode);
    reAssets.sort(sortByCode);
    reLiabilities.sort(sortByCode);

    return { banks, cards, reAssets, reLiabilities, other };
  }, [allAccounts]);

  // ---------- filtered + sorted rows ----------
  // Compute effective date range (from preset or custom)
  const effectiveDateRange = useMemo((): DateRange => {
    if (dateRangePreset === 'custom') {
      return {
        start: customStartDate || null,
        end: customEndDate || null,
      };
    }
    return getDateRangeForPreset(dateRangePreset);
  }, [dateRangePreset, customStartDate, customEndDate]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let rows = allRows;

    // Date range filter
    if (effectiveDateRange.start || effectiveDateRange.end) {
      rows = rows.filter((row) => {
        if (!row.date) return false;
        if (effectiveDateRange.start && row.date < effectiveDateRange.start) return false;
        if (effectiveDateRange.end && row.date > effectiveDateRange.end) return false;
        return true;
      });
    }

    // account filter - check if ANY line in the transaction matches
    if (accountFilter !== 'all') {
      rows = rows.filter((r) => {
        // If it's a specific account ID (number)
        if (typeof accountFilter === 'number') {
          return r.all_account_ids.includes(accountFilter);
        }
        // Otherwise it's a range filter - check if any account code matches
        return r.all_account_codes.some(code => codeMatchesFilter(code, accountFilter));
      });
    }

    // text search (include job_name in search)
    if (term) {
      rows = rows.filter((row) => {
        const haystacks: string[] = [
          formatDate(row.date),
          row.date ?? '',
          row.description ?? '',
          row.job_name ?? '',
          row.vendor_installer ?? '',
          row.cash_account ?? '',
          row.type_label ?? '',
          row.amount.toFixed(2),
        ];
        return haystacks.some((h) => h.toLowerCase().includes(term));
      });
    }

    // Always sort - pending first, then user's chosen sort within each group
    const sorted = [...rows].sort((a, b) => {
      // Pending always on top
      if (a.is_cleared !== b.is_cleared) {
        return a.is_cleared ? 1 : -1;
      }

      // Within same cleared status, apply user's sort
      let result = 0;

      switch (sortField) {
        case 'date':
          result = compareValues(a.date, b.date, sortDir);
          // Secondary: updated_at in same direction as date
          if (result === 0) {
            result = compareValues(a.updated_at, b.updated_at, sortDir);
          }
          break;
        case 'amount':
          result = compareValues(a.amount, b.amount, sortDir);
          break;
        case 'description':
          result = compareValues(
            getDisplayDescription(a),
            getDisplayDescription(b),
            sortDir
          );
          break;
        case 'vendor_installer':
          result = compareValues(a.vendor_installer, b.vendor_installer, sortDir);
          break;
        case 'cash_account':
          result = compareValues(a.cash_account, b.cash_account, sortDir);
          break;
        case 'type_label':
          result = compareValues(a.type_label, b.type_label, sortDir);
          break;
        case 'is_cleared':
          // Already sorted by cleared status above, so just use secondary sort
          break;
      }

      // For non-date sorts, secondary sort by date desc, then updated_at desc
      if (result === 0 && sortField !== 'date') {
        result = compareValues(a.date, b.date, 'desc');
        if (result === 0) {
          result = compareValues(a.updated_at, b.updated_at, 'desc');
        }
      }
      
      // Final tiebreaker: transaction_id for stability
      if (result === 0) {
        result = b.transaction_id - a.transaction_id;
      }

      return result;
    });

    return sorted;
  }, [allRows, searchTerm, sortField, sortDir, accountFilter, effectiveDateRange]);

  const totalCount = filteredRows.length;
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageRows = filteredRows.slice(startIndex, endIndex);

  // ---------- edit / delete ----------
  const openEditModal = async (row: LedgerRow) => {
    setEditingRow(row);
    setEditDate(row.date);
    setEditDescription(row.description ?? '');
    setEditAmount(Math.abs(row.amount).toFixed(2));
    setEditError(null);
    setRowActionError(null);

    // Load account options
    try {
      const { data: accounts, error: accErr } = await supabase
        .from('accounts')
        .select('id, name, code, account_type_id, account_types ( name )')
        .eq('is_active', true)
        .order('code');

      if (accErr) throw accErr;

      const allAccounts = (accounts ?? []) as any[];

      // Cash accounts: asset or liability
      const cashAccs = allAccounts
        .filter((a) => {
          const typeName = a.account_types?.name;
          return typeName === 'asset' || typeName === 'liability';
        })
        .map((a) => ({
          id: a.id,
          label: a.code ? `${a.name} - ${a.code}` : a.name,
        }));

      // Category accounts: income or expense
      const categoryAccs = allAccounts
        .filter((a) => {
          const typeName = a.account_types?.name;
          return typeName === 'income' || typeName === 'expense';
        })
        .map((a) => ({
          id: a.id,
          label: a.code ? `${a.name} - ${a.code}` : a.name,
        }));

      setCashAccountOptions(cashAccs);
      setCategoryAccountOptions(categoryAccs);

      // Get current account IDs from the transaction lines
      const { data: lines, error: lineErr } = await supabase
        .from('transaction_lines')
        .select('id, account_id, accounts ( account_types ( name ) )')
        .eq('transaction_id', row.transaction_id);

      if (lineErr) throw lineErr;

      const typedLines = (lines ?? []) as any[];

      const cashLine = typedLines.find((l) => {
        const t = l.accounts?.account_types?.name;
        return t === 'asset' || t === 'liability';
      });

      const categoryLine = typedLines.find((l) => {
        const t = l.accounts?.account_types?.name;
        return t === 'income' || t === 'expense';
      });

      setEditCashAccountId(cashLine?.account_id ?? null);
      setEditCategoryAccountId(categoryLine?.account_id ?? null);
    } catch (err: any) {
      console.error('Error loading accounts for edit:', err);
      setEditError('Failed to load account options');
    }
  };

  const closeEditModal = () => {
    if (editSaving) return;
    setEditingRow(null);
  };

  async function handleSaveEdit() {
    if (!editingRow) return;

    const txId = editingRow.transaction_id;
    const newDate = editDate.trim();
    const newDesc = editDescription.trim();
    const newAmountNum = Number(editAmount);

    if (!newDate) {
      setEditError('Date is required.');
      return;
    }
    if (!Number.isFinite(newAmountNum) || newAmountNum <= 0) {
      setEditError('Amount must be greater than zero.');
      return;
    }
    if (!editCashAccountId) {
      setEditError('Please select a bank/credit account.');
      return;
    }
    if (!editCategoryAccountId) {
      setEditError('Please select a category.');
      return;
    }

    setEditSaving(true);
    setEditError(null);
    setRowActionError(null);

    try {
      const { error: txErr } = await supabase
        .from('transactions')
        .update({
          date: newDate,
          description: newDesc || null,
        })
        .eq('id', txId);

      if (txErr) throw txErr;

      const { data: lines, error: lineErr } = await supabase
        .from('transaction_lines')
        .select(
          `
          id,
          amount,
          account_id,
          accounts (
            account_types ( name )
          )
        `
        )
        .eq('transaction_id', txId);

      if (lineErr) throw lineErr;

      const typedLines = (lines ?? []) as any[];

      if (typedLines.length === 0) {
        throw new Error('No lines found for this transaction.');
      }

      const sign = editingRow.amount >= 0 ? 1 : -1;
      const targetCashAmount = sign * newAmountNum;
      const targetCategoryAmount = -targetCashAmount;

      const cashLine = typedLines.find((l: any) => {
        const t = l.accounts?.account_types?.name;
        return t === 'asset' || t === 'liability';
      }) ?? typedLines[0];

      const categoryLine = typedLines.find((l: any) => l.id !== cashLine.id) ?? typedLines[0];

      // Update cash line (amount + account)
      const { error: cashUpdateErr } = await supabase
        .from('transaction_lines')
        .update({ 
          amount: targetCashAmount,
          account_id: editCashAccountId,
        })
        .eq('id', cashLine.id);

      if (cashUpdateErr) throw cashUpdateErr;

      // Update category line (amount + account) if different line
      if (categoryLine.id !== cashLine.id) {
        const { error: catUpdateErr } = await supabase
          .from('transaction_lines')
          .update({ 
            amount: targetCategoryAmount,
            account_id: editCategoryAccountId,
          })
          .eq('id', categoryLine.id);

        if (catUpdateErr) throw catUpdateErr;
      }

      // Find new labels for local state update
      const newCashLabel = cashAccountOptions.find((a) => a.id === editCashAccountId)?.label ?? null;
      const newCategoryLabel = categoryAccountOptions.find((a) => a.id === editCategoryAccountId)?.label ?? null;

      setAllRows((prev) =>
        prev.map((r) =>
          r.transaction_id === txId
            ? {
                ...r,
                date: newDate,
                description: newDesc || null,
                amount: targetCashAmount,
                cash_account: newCashLabel,
                cash_account_id: editCashAccountId,
                type_label: newCategoryLabel,
                updated_at: new Date().toISOString(),
              }
            : r
        )
      );

      setEditingRow(null);
    } catch (err: any) {
      console.error('Edit failed:', err);
      setEditError(err.message ?? 'Failed to save changes.');
      setRowActionError(err.message ?? 'Failed to save changes.');
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(row: LedgerRow) {
    const confirmed = window.confirm(
      `Delete this transaction?\n\n` +
        `Date: ${formatDate(row.date)}\n` +
        `Amount: ${formatMoney(row.amount)}\n` +
        `Description: ${getDisplayDescription(row) || '(no description)'}\n\n` +
        `This will delete ALL lines for this transaction. This cannot be undone.`
    );
    if (!confirmed) return;

    setRowActionError(null);

    try {
      const { error: linesErr } = await supabase
        .from('transaction_lines')
        .delete()
        .eq('transaction_id', row.transaction_id);
      if (linesErr) throw linesErr;

      const { error: txErr } = await supabase
        .from('transactions')
        .delete()
        .eq('id', row.transaction_id);
      if (txErr) throw txErr;

      setAllRows((prev) =>
        prev.filter((r) => r.transaction_id !== row.transaction_id)
      );
    } catch (err: any) {
      console.error('Delete failed:', err);
      setRowActionError(err.message ?? 'Failed to delete transaction.');
    }
  }

  // ---------- clear from ledger (RPC) ----------
  function handleMarkClearedFromLedger(row: LedgerRow) {
    if (row.is_cleared) return;
    setClearError(null);
    setRowActionError(null);
    setClearTarget(row);

    const defaultAmount = Math.abs(Number(row.amount)).toFixed(2);
    const todayISO = new Date().toISOString().slice(0, 10);

    setClearDate(row.date || todayISO);
    setClearDescription(row.description ?? '');
    setClearAmount(defaultAmount);

    setClearOpen(true);
  }

  async function confirmClearFromLedger() {
    if (!clearTarget) return;

    try {
      setClearError(null);
      setRowActionError(null);

      let finalAmount = Number(clearTarget.amount);
      const amountTrim = clearAmount.trim();

      if (amountTrim !== '') {
        const parsed = Number(amountTrim);
        if (Number.isNaN(parsed) || parsed <= 0) {
          setClearError('Invalid amount. Use a positive number like 58.15.');
          return;
        }
        const sign = Number(clearTarget.amount) < 0 ? -1 : 1;
        finalAmount = parsed * sign;
      }

      let newDate: string | null = null;
      const dateTrim = clearDate.trim();

      if (dateTrim !== '') {
        const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
        if (!isoPattern.test(dateTrim)) {
          setClearError('Invalid date. Use YYYY-MM-DD, e.g. 2025-03-01.');
          return;
        }
        const d = new Date(dateTrim + 'T00:00:00');
        if (Number.isNaN(d.getTime())) {
          setClearError('Invalid date value. Please check day/month.');
          return;
        }
        newDate = dateTrim;
      }

      let newDescription: string | null = null;
      const descTrim = clearDescription.trim();
      if (descTrim !== '') {
        newDescription = descTrim;
      }

      const { data, error: rpcErr } = await supabase.rpc(
        'mark_transaction_cleared',
        {
          p_transaction_id: clearTarget.transaction_id,
          p_clicked_line_id: clearTarget.line_id,
          p_new_amount: finalAmount,
          p_new_date: newDate,
          p_new_description: newDescription,
        }
      );

      if (rpcErr) throw rpcErr;

      setClearOpen(false);
      setClearTarget(null);
      setClearAmount('');
      setClearDate('');
      setClearDescription('');
      setClearError(null);

      await loadLedger();
    } catch (err: any) {
      console.error(err);
      setClearError(err.message ?? 'Failed to mark transaction cleared.');
      setRowActionError(err.message ?? 'Failed to mark transaction cleared.');
    }
  }

  // ---------- JSX ----------
  return (
    <div>
      <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>Ledger</h2>

      <div className="card">
        {loading && <p>Loading transactions...</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {rowActionError && !loading && (
        <p style={{ color: 'red', fontSize: 12, marginTop: 0 }}>
          {rowActionError}
        </p>
      )}

      {!loading && !error && (
        <>
          {/* controls row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              marginBottom: '0.5rem',
              fontSize: 13,
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            {/* page size */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Show</span>
              <select
                value={pageSize}
                onChange={handlePageSizeChange}
                style={{ padding: '4px 8px', fontSize: 13, borderRadius: 4, border: '1px solid #ccc', width: 'auto' }}
              >
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>rows</span>
            </div>

            {/* date range picker */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Date:</span>
              <select
                value={dateRangePreset}
                onChange={(e) => setDateRangePreset(e.target.value as DateRangePreset)}
                style={{ padding: '4px 8px', fontSize: 13, borderRadius: 4, border: '1px solid #ccc', width: 'auto' }}
              >
                <option value="last-12-months">Last 12 months</option>
                <option value="custom">Custom range</option>
              </select>
              {dateRangePreset === 'custom' && (
                <>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    style={{ padding: '4px 6px', fontSize: 13, borderRadius: 4, border: '1px solid #ccc' }}
                  />
                  <span>-</span>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    style={{ padding: '4px 6px', fontSize: 13, borderRadius: 4, border: '1px solid #ccc' }}
                  />
                </>
              )}
            </div>

            {/* account selector - tiered dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span>Account:</span>
              <select
                value={typeof accountFilter === 'number' ? String(accountFilter) : accountFilter}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'all' || val === 'banks' || val === 'cards' || val === 're-all' || val === 're-assets' || val === 're-liabilities') {
                    setAccountFilter(val as AccountFilter);
                  } else {
                    setAccountFilter(Number(val));
                  }
                }}
                style={{ padding: '4px 8px', fontSize: 13, borderRadius: 4, border: '1px solid #ccc', minWidth: 220 }}
              >
                <option value="all">All Accounts</option>
                
                {/* Banks group */}
                {categorizedAccounts.banks.length > 0 && (
                  <>
                    <option value="banks">── All Banks (1000-1999)</option>
                    {categorizedAccounts.banks.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        &nbsp;&nbsp;&nbsp;&nbsp;{acc.label}
                      </option>
                    ))}
                  </>
                )}
                
                {/* Cards group */}
                {categorizedAccounts.cards.length > 0 && (
                  <>
                    <option value="cards">── All Cards (2000-2999)</option>
                    {categorizedAccounts.cards.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        &nbsp;&nbsp;&nbsp;&nbsp;{acc.label}
                      </option>
                    ))}
                  </>
                )}
                
                {/* RE group */}
                {(categorizedAccounts.reAssets.length > 0 || categorizedAccounts.reLiabilities.length > 0) && (
                  <>
                    <option value="re-all">── All RE (63000-64999)</option>
                    
                    {/* RE Assets subgroup */}
                    {categorizedAccounts.reAssets.length > 0 && (
                      <>
                        <option value="re-assets">&nbsp;&nbsp;── All RE Assets (63000-63999)</option>
                        {categorizedAccounts.reAssets.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{acc.label}
                          </option>
                        ))}
                      </>
                    )}
                    
                    {/* RE Liabilities subgroup */}
                    {categorizedAccounts.reLiabilities.length > 0 && (
                      <>
                        <option value="re-liabilities">&nbsp;&nbsp;── All RE Liabilities (64000-64999)</option>
                        {categorizedAccounts.reLiabilities.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{acc.label}
                          </option>
                        ))}
                      </>
                    )}
                  </>
                )}
                
                {/* Other accounts */}
                {categorizedAccounts.other.length > 0 && (
                  <>
                    <option disabled>──────────</option>
                    {categorizedAccounts.other.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.label}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* fast search */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                flex: 1,
                maxWidth: 560,
                minWidth: 220,
              }}
            >
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search: date, description, job, vendor, account, type, amount..."
                style={{
                  flex: 1,
                  minWidth: 0,
                  padding: '4px 8px',
                  fontSize: 13,
                  borderRadius: 4,
                  border: '1px solid #ccc',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                    padding: '0 4px',
                  }}
                  aria-label="Clear fast search"
                >
                  ×
                </button>
              )}
            </div>

            {/* summary */}
            <div
              style={{
                marginLeft: 'auto',
                whiteSpace: 'nowrap',
                fontSize: 12,
              }}
            >
              Showing {totalCount === 0 ? 0 : startIndex + 1}-
              {Math.min(endIndex, totalCount)} of {totalCount}{' '}
              {accountFilter !== 'all' ? '(filtered)' : ''}
            </div>
          </div>

          {totalCount === 0 && (
            <p style={{ fontSize: 13, color: '#777' }}>
              No transactions found for this selection.
            </p>
          )}

          {totalCount > 0 && (
            <>
              <table className="table">
                <thead>
                  <tr>
                    {sortableTh('date', 'Date')}
                    {sortableTh('description', 'Description')}
                    {sortableTh('vendor_installer', 'Vendor / Installer')}
                    {sortableTh('cash_account', 'Account')}
                    {sortableTh('type_label', 'Category')}
                    {sortableTh('amount', 'Amount', 'right')}
                    {sortableTh('is_cleared', 'Cleared', 'center')}
                    <th
                      style={{
                        ...thStyleBase,
                        textAlign: 'right',
                        cursor: 'default',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr
                      key={row.transaction_id}
                      style={{
                        background: row.is_cleared ? 'transparent' : '#fffbe6',
                      }}
                    >
                      <td style={tdStyle}>{formatDate(row.date)}</td>
                      <td style={tdStyle}>{getDisplayDescription(row)}</td>
                      <td style={tdStyle}>{row.vendor_installer}</td>
                      <td style={tdStyle}>{row.cash_account}</td>
                      <td style={tdStyle}>{row.type_label}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>
                        {formatMoney(row.amount)}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {row.is_cleared ? '✓' : ''}
                      </td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {!row.is_cleared && (
                          <button
                            type="button"
                            onClick={() => handleMarkClearedFromLedger(row)}
                            style={{
                              border: '1px solid #0a7a3c',
                              background: '#e8f5e9',
                              borderRadius: 4,
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: 13,
                              color: '#0a7a3c',
                              marginRight: 4,
                              lineHeight: 1,
                            }}
                            title="Mark cleared"
                          >
                            ✓
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => openEditModal(row)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '0 4px',
                            fontSize: 14,
                          }}
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(row)}
                          style={{
                            border: 'none',
                            background: 'transparent',
                            cursor: 'pointer',
                            padding: '0 4px',
                            fontSize: 14,
                            color: '#b00020',
                          }}
                          title="Delete"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '0.5rem',
                  fontSize: 13,
                }}
              >
                <button
                  onClick={handlePrev}
                  disabled={page === 1}
                  style={{ padding: '0.2rem 0.6rem', fontSize: 13 }}
                >
                  Prev
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={handleNext}
                  disabled={page === totalPages}
                  style={{ padding: '0.2rem 0.6rem', fontSize: 13 }}
                >
                  Next
                </button>
              </div>
            </>
          )}
        </>
      )}

      {/* edit modal */}
      {editingRow && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1100,
          }}
          onClick={closeEditModal}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: '1rem',
              width: '90%',
              maxWidth: 480,
              boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.5rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>Edit transaction</h3>
              <button
                type="button"
                onClick={closeEditModal}
                disabled={editSaving}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 18,
                  cursor: editSaving ? 'default' : 'pointer',
                }}
              >
                ×
              </button>
            </div>

            {editingRow.job_name && (
              <p style={{ fontSize: 12, color: '#555', margin: '0 0 0.5rem 0' }}>
                Job: <strong>{editingRow.job_name}</strong>
              </p>
            )}

            <div style={{ fontSize: 13, marginBottom: '0.75rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: 2 }}>Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: 2 }}>
                  Description
                </label>
                <input
                  type="text"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 13,
                  }}
                />
              </div>

              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: 2 }}>
                  Bank / Credit Account
                </label>
                <select
                  value={editCashAccountId ?? ''}
                  onChange={(e) => setEditCashAccountId(Number(e.target.value) || null)}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 13,
                  }}
                >
                  <option value="">Select account...</option>
                  {cashAccountOptions.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: 2 }}>
                  Category
                </label>
                <select
                  value={editCategoryAccountId ?? ''}
                  onChange={(e) => setEditCategoryAccountId(Number(e.target.value) || null)}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 13,
                  }}
                >
                  <option value="">Select category...</option>
                  {categoryAccountOptions.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: 2 }}>
                  Amount ({editingRow.amount >= 0 ? 'inflow' : 'outflow'})
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    fontSize: 13,
                  }}
                />
              </div>

              {editError && (
                <p style={{ color: 'red', fontSize: 12 }}>{editError}</p>
              )}
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                fontSize: 13,
              }}
            >
              <button
                type="button"
                onClick={closeEditModal}
                disabled={editSaving}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  background: '#f5f5f5',
                  cursor: editSaving ? 'default' : 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveEdit()}
                disabled={editSaving}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  border: '1px solid #111',
                  background: '#111',
                  color: '#fff',
                  cursor: editSaving ? 'default' : 'pointer',
                }}
              >
                {editSaving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* clear-from-ledger modal */}
      {clearOpen && clearTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1200,
          }}
          onClick={() => {
            setClearOpen(false);
            setClearError(null);
          }}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: '1rem',
              width: '90%',
              maxWidth: 520,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '0.75rem',
              }}
            >
              <h3 style={{ margin: 0, fontSize: 16 }}>Clear transaction</h3>
              <button
                type="button"
                onClick={() => {
                  setClearOpen(false);
                  setClearError(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontSize: 18,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </div>

            <div
              style={{ fontSize: 12, color: '#555', marginBottom: '0.75rem' }}
            >
              <div>
                <strong>Account:</strong>{' '}
                {clearTarget.cash_account ?? '(unknown)'}
              </div>
              <div>
                <strong>Date:</strong> {formatDate(clearTarget.date)}
              </div>
              <div>
                <strong>Description:</strong>{' '}
                {getDisplayDescription(clearTarget) || '(none)'}
              </div>
            </div>

            {clearError && (
              <p style={{ color: 'red', fontSize: 13, marginBottom: '0.5rem' }}>
                {clearError}
              </p>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
                marginBottom: '0.75rem',
                fontSize: 13,
              }}
            >
              <label
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <span>Cleared date</span>
                <input
                  type="date"
                  value={clearDate}
                  onChange={(e) => setClearDate(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    fontSize: 13,
                  }}
                />
                <span style={{ fontSize: 11, color: '#777' }}>
                  Leave blank to keep the existing transaction date.
                </span>
              </label>

              <label
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <span>Description</span>
                <input
                  type="text"
                  value={clearDescription}
                  onChange={(e) => setClearDescription(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    fontSize: 13,
                  }}
                  placeholder="Leave blank to keep the existing description"
                />
              </label>

              <label
                style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <span>Final cleared amount (tip included)</span>
                <input
                  type="number"
                  step="0.01"
                  value={clearAmount}
                  onChange={(e) => setClearAmount(e.target.value)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid #ccc',
                    fontSize: 13,
                  }}
                />
                <span style={{ fontSize: 11, color: '#777' }}>
                  Enter a positive amount. The system will keep the debit/credit
                  sign automatically.
                </span>
              </label>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.5rem',
                marginTop: '0.25rem',
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setClearOpen(false);
                  setClearError(null);
                }}
                style={{
                  padding: '4px 10px',
                  fontSize: 13,
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  background: '#f5f5f5',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmClearFromLedger()}
                style={{
                  padding: '4px 10px',
                  fontSize: 13,
                  borderRadius: 4,
                  border: '1px solid #111',
                  background: '#111',
                  color: '#fff',
                  cursor: 'pointer',
                }}
              >
                Confirm clear
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}