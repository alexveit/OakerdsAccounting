import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type LedgerRow = {
  transaction_id: number;
  line_id: number; // cash-side line id (for clear RPC)
  date: string;
  created_at: string;
  updated_at: string;
  description: string | null;
  vendor_installer: string;
  cash_account: string | null;
  cash_account_id: number | null;
  type_label: string | null;
  amount: number;
  is_cleared: boolean;
};

type SortField =
  | 'date'
  | 'description'
  | 'vendor_installer'
  | 'cash_account'
  | 'type_label'
  | 'amount';

type SortDir = 'asc' | 'desc';

type AccountFilter = 'all' | number;

export function LedgerView() {
  const [allRows, setAllRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [rowActionError, setRowActionError] = useState<string | null>(null);

  const [deepOpen, setDeepOpen] = useState(false);
  const [deepTerm, setDeepTerm] = useState('');
  const [deepLoading, setDeepLoading] = useState(false);
  const [deepError, setDeepError] = useState<string | null>(null);
  const [deepRows, setDeepRows] = useState<LedgerRow[]>([]);

  const [editingRow, setEditingRow] = useState<LedgerRow | null>(null);
  const [editDate, setEditDate] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');

  // Clear-transaction modal state (same logic as Dashboard, but using LedgerRow)
  const [clearOpen, setClearOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<LedgerRow | null>(null);
  const [clearAmount, setClearAmount] = useState<string>('');
  const [clearDate, setClearDate] = useState<string>('');
  const [clearDescription, setClearDescription] = useState<string>('');
  const [clearError, setClearError] = useState<string | null>(null);

  // ---------- load ledger (shared, so we can call after clear) ----------
  async function loadLedger() {
    setLoading(true);
    setError(null);
    setRowActionError(null);

    try {
      const now = new Date();
      const oneYearAgo = new Date(now);
      oneYearAgo.setFullYear(now.getFullYear() - 1);
      const oneYearAgoISO = oneYearAgo.toISOString().slice(0, 10);

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
        .gte('transactions.date', oneYearAgoISO)
        .limit(10000);

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
          typeof cashLine.account_id === 'number'
            ? cashLine.account_id
            : null;

        const cashLineId: number = cashLine.id;

        // Type / category side (other account)
        const typeLine = lines.find((l: any) => l !== cashLine) ?? lines[0];
        const typeLabel: string | null = typeLine.accounts?.name ?? null;

        const amount = Number(cashLine.amount);
        const isCleared = lines.every((l: any) => !!l.is_cleared);
        const updatedAt: string = tx?.updated_at ?? createdAt;

        ledgerRows.push({
          transaction_id: txId,
          line_id: cashLineId,
          date,
          created_at: createdAt,
          updated_at: updatedAt,
          description: tx?.description ?? null,
          vendor_installer: vendorInstaller || '',
          cash_account: cashAccount,
          cash_account_id: cashAccountId,
          type_label: typeLabel,
          amount,
          is_cleared: isCleared,
        });
      }

      // default: pending first, newest first
      ledgerRows.sort((a, b) => {
        if (a.is_cleared !== b.is_cleared) {
          return a.is_cleared ? 1 : -1;
        }
        if (a.date !== b.date) {
          return a.date < b.date ? 1 : -1;
        }
        if (a.updated_at !== b.updated_at) {
          return a.updated_at < b.updated_at ? 1 : -1;
        }
        return a.transaction_id - b.transaction_id;
      });

      setAllRows(ledgerRows);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load ledger');
      setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    void loadLedger();
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

  const thStyleBase = {
    textAlign: 'left' as const,
    borderBottom: '1px solid #ccc',
    padding: '4px 4px',
  };
  const tdStyle = {
    padding: '6px 4px',
    borderBottom: '1px solid #eee',
  };

  const sortableTh = (field: SortField, label: string) => {
    const isActive = sortField === field;
    const arrow = !isActive ? '' : sortDir === 'asc' ? ' ▲' : ' ▼';

    return (
      <th
        style={{
          ...thStyleBase,
          cursor: 'pointer',
          userSelect: 'none' as const,
          whiteSpace: 'nowrap' as const,
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
  }, [searchTerm, accountFilter]);

  const handleSort = (field: SortField) => {
    setSortField((prevField) => {
      if (prevField === field) {
        setSortDir((prevDir) => (prevDir === 'asc' ? 'desc' : 'asc'));
        return prevField;
      } else {
        const defaultDir: SortDir =
          field === 'date' || field === 'amount' ? 'desc' : 'asc';
        setSortDir(defaultDir);
        return field;
      }
    });
  };

  const compareValues = (a: any, b: any, dir: SortDir) => {
    if (a == null && b == null) return 0;
    if (a == null) return dir === 'asc' ? 1 : -1;
    if (b == null) return dir === 'asc' ? -1 : 1;

    if (typeof a === 'number' && typeof b === 'number') {
      return dir === 'asc' ? a - b : b - a;
    }

    const sa = String(a).toLowerCase();
    const sb = String(b).toLowerCase();
    if (sa === sb) return 0;
    if (dir === 'asc') return sa < sb ? -1 : 1;
    return sa > sb ? -1 : 1;
  };

  // ---------- account list (for selector) ----------
  const cashAccountsList = useMemo(() => {
    const map = new Map<number, string>();
    for (const row of allRows) {
      if (row.cash_account_id != null && row.cash_account) {
        map.set(row.cash_account_id, row.cash_account);
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[1].localeCompare(b[1])
    );
  }, [allRows]);

  // ---------- filtered + sorted rows ----------
  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let rows = allRows;

    // account filter first
    if (accountFilter !== 'all') {
      rows = rows.filter(
        (r) => r.cash_account_id === accountFilter
      );
    }

    // text search
    if (term) {
      rows = rows.filter((row) => {
        const haystacks: string[] = [
          formatDate(row.date),
          row.date ?? '',
          row.description ?? '',
          row.vendor_installer ?? '',
          row.cash_account ?? '',
          row.type_label ?? '',
          row.amount.toFixed(2),
        ];
        return haystacks.some((h) => h.toLowerCase().includes(term));
      });
    }

    if (!sortField) {
      return rows;
    }

    const dir = sortDir;
    const sorted = [...rows].sort((a, b) => {
      switch (sortField) {
        case 'date':
          return compareValues(a.date, b.date, dir);
        case 'amount':
          return compareValues(a.amount, b.amount, dir);
        case 'description':
          return compareValues(a.description, b.description, dir);
        case 'vendor_installer':
          return compareValues(a.vendor_installer, b.vendor_installer, dir);
        case 'cash_account':
          return compareValues(a.cash_account, b.cash_account, dir);
        case 'type_label':
          return compareValues(a.type_label, b.type_label, dir);
        default:
          return 0;
      }
    });

    return sorted;
  }, [allRows, searchTerm, sortField, sortDir, accountFilter]);

  const totalCount = filteredRows.length;
  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageRows = filteredRows.slice(startIndex, endIndex);

  // ---------- deep search ----------
  async function runDeepSearch() {
    const term = deepTerm.trim().toLowerCase();
    if (!term) {
      setDeepRows([]);
      return;
    }

    try {
      setDeepLoading(true);
      setDeepError(null);

      const baseRows =
        accountFilter === 'all'
          ? allRows
          : allRows.filter((r) => r.cash_account_id === accountFilter);

      const matches = baseRows.filter((row) => {
        const haystacks: string[] = [
          formatDate(row.date),
          row.date ?? '',
          row.description ?? '',
          row.vendor_installer ?? '',
          row.cash_account ?? '',
          row.type_label ?? '',
          row.amount.toFixed(2),
        ];
        return haystacks.some((h) => h.toLowerCase().includes(term));
      });

      setDeepRows(matches.slice(0, 500));
      setDeepLoading(false);
    } catch (err: any) {
      console.error('Deep search error:', err);
      setDeepError(err.message ?? 'Failed to run deep search');
      setDeepLoading(false);
    }
  }

  const handleOpenDeep = () => {
    setDeepOpen(true);
    setDeepError(null);
    setDeepRows([]);
  };

  const handleCloseDeep = () => {
    setDeepOpen(false);
  };

  // ---------- edit / delete ----------
  const openEditModal = (row: LedgerRow) => {
    setEditingRow(row);
    setEditDate(row.date);
    setEditDescription(row.description ?? '');
    setEditAmount(Math.abs(row.amount).toFixed(2));
    setEditError(null);
    setRowActionError(null);
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

    setEditSaving(true);
    setEditError(null);
    setRowActionError(null);

    try {
      // update transaction header
      const { error: txErr } = await supabase
        .from('transactions')
        .update({
          date: newDate,
          description: newDesc || null,
        })
        .eq('id', txId);

      if (txErr) throw txErr;

      // load lines
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

      // keep sign from current ledger row
      const sign = editingRow.amount >= 0 ? 1 : -1;
      const targetCashAmount = sign * newAmountNum;
      const targetTypeAmount = -targetCashAmount;

      const cashLine =
        typedLines.find((l: any) => {
          const t = l.accounts?.account_types?.name;
          return t === 'asset' || t === 'liability';
        }) ?? typedLines[0];

      const typeLine =
        typedLines.find((l: any) => l.id !== cashLine.id) ?? typedLines[0];

      // update both sides, keep double-entry balanced
      const updates: any[] = [];

      updates.push(
        supabase
          .from('transaction_lines')
          .update({ amount: targetCashAmount })
          .eq('id', cashLine.id)
      );

      if (typeLine.id === cashLine.id) {
        updates.push(
          supabase
            .from('transaction_lines')
            .update({ amount: targetTypeAmount })
            .eq('id', typeLine.id)
        );
      } else {
        updates.push(
          supabase
            .from('transaction_lines')
            .update({ amount: targetTypeAmount })
            .eq('id', typeLine.id)
        );
      }

      const results: any[] = await Promise.all(updates);

      for (const r of results) {
        if (r && r.error) throw r.error;
      }

      // update local state for the edited transaction
      setAllRows((prev) =>
        prev.map((r) =>
          r.transaction_id === txId
            ? {
                ...r,
                date: newDate,
                description: newDesc || null,
                amount: targetCashAmount,
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
        `Description: ${row.description ?? '(no description)'}\n\n` +
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

      // ----- Amount validation -----
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

      // ----- Date validation -----
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
      } else {
        newDate = null; // keep existing transaction date
      }

      // ----- Description handling -----
      let newDescription: string | null = null;
      const descTrim = clearDescription.trim();
      if (descTrim !== '') {
        newDescription = descTrim;
      } else {
        newDescription = null; // keep existing
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
      console.log('Transaction marked cleared from ledger:', data);

      // Close modal + reset state
      setClearOpen(false);
      setClearTarget(null);
      setClearAmount('');
      setClearDate('');
      setClearDescription('');
      setClearError(null);

      // Reload ledger so pending/cleared flags and amounts stay in sync
      await loadLedger();
    } catch (err: any) {
      console.error(err);
      setClearError(err.message ?? 'Failed to mark transaction cleared.');
      setRowActionError(err.message ?? 'Failed to mark transaction cleared.');
    }
  }

  // ---------- JSX ----------
  return (
    <div className="card">
      {/* header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Ledger</h2>
        <button
          type="button"
          onClick={handleOpenDeep}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #111',
            background: '#111',
            color: '#fff',
            cursor: 'pointer',
          }}
        >
          Deep search…
        </button>
      </div>

      {loading && <p>Loading transactions…</p>}
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
            <div>
              Show{' '}
              <select value={pageSize} onChange={handlePageSizeChange}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>{' '}
              rows
            </div>

            {/* account selector */}
            <div>
              Account:{' '}
              <select
                value={accountFilter === 'all' ? 'all' : String(accountFilter)}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'all') {
                    setAccountFilter('all');
                  } else {
                    setAccountFilter(Number(val));
                  }
                }}
              >
                <option value="all">All cash & card accounts</option>
                {cashAccountsList.map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
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
                placeholder="Fast search: date, description, vendor, account, type, amount…"
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
              Showing {totalCount === 0 ? 0 : startIndex + 1}–
              {Math.min(endIndex, totalCount)} of {totalCount}{' '}
              {accountFilter !== 'all' ? '(filtered by account)' : '(all accounts)'}
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
                    {sortableTh('cash_account', 'Account (Cash side)')}
                    {sortableTh('type_label', 'Type (Category side)')}
                    {sortableTh('amount', 'Amount')}
                    <th
                      style={{
                        ...thStyleBase,
                        textAlign: 'center',
                        cursor: 'default',
                      }}
                    >
                      Cleared
                    </th>
                    <th
                      style={{
                        ...thStyleBase,
                        textAlign: 'center',
                        cursor: 'default',
                      }}
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.transaction_id}>
                      <td style={tdStyle}>{formatDate(row.date)}</td>
                      <td style={tdStyle}>{row.description}</td>
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
                          textAlign: 'center',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {!row.is_cleared && (
                          <button
                            type="button"
                            onClick={() => handleMarkClearedFromLedger(row)}
                            style={{
                              borderRadius: 999,
                              border: '1px solid #ccc',
                              padding: '2px 6px',
                              background: '#f5f5f5',
                              cursor: 'pointer',
                              fontSize: 11,
                              marginRight: 4,
                            }}
                            title="Mark cleared"
                          >
                            Cleared
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

      {/* deep search modal */}
      {deepOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
          onClick={handleCloseDeep}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: 8,
              padding: '1rem',
              width: '90%',
              maxWidth: 1000,
              maxHeight: '80vh',
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
              <h3 style={{ margin: 0, fontSize: 16 }}>
                Deep search (current ledger window)
              </h3>
              <button
                type="button"
                onClick={handleCloseDeep}
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
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              {/* deep search input + clear */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  flex: 1,
                }}
              >
                <input
                  type="text"
                  value={deepTerm}
                  onChange={(e) => setDeepTerm(e.target.value)}
                  placeholder="Search by keyword, vendor, account, type, amount…"
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '4px 8px',
                    fontSize: 13,
                    borderRadius: 4,
                    border: '1px solid #ccc',
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      void runDeepSearch();
                    }
                  }}
                />
                {deepTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setDeepTerm('');
                      setDeepRows([]);
                      setDeepError(null);
                    }}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      fontSize: 14,
                      lineHeight: 1,
                      padding: '0 4px',
                    }}
                    aria-label="Clear deep search"
                  >
                    ×
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => void runDeepSearch()}
                disabled={deepLoading || !deepTerm.trim()}
                style={{
                  padding: '4px 10px',
                  fontSize: 13,
                  borderRadius: 4,
                  border: '1px solid #111',
                  background: deepLoading ? '#888' : '#111',
                  color: '#fff',
                  cursor: deepLoading || !deepTerm.trim() ? 'default' : 'pointer',
                }}
              >
                {deepLoading ? 'Searching…' : 'Search'}
              </button>
            </div>

            {deepError && (
              <p style={{ color: 'red', fontSize: 13, marginBottom: '0.5rem' }}>
                {deepError}
              </p>
            )}

            <div style={{ fontSize: 12, color: '#555', marginBottom: '0.5rem' }}>
              {deepRows.length > 0
                ? `Showing ${deepRows.length} result(s) (limited to 500).`
                : deepLoading
                ? 'Searching…'
                : deepTerm.trim()
                ? 'No matches found for this term in the current selection.'
                : 'Type a term and press Enter or click Search.'}
            </div>

            <div style={{ overflow: 'auto', flex: 1 }}>
              {deepRows.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={thStyleBase}>Date</th>
                      <th style={thStyleBase}>Description</th>
                      <th style={thStyleBase}>Vendor / Installer</th>
                      <th style={thStyleBase}>Account (Cash side)</th>
                      <th style={thStyleBase}>Type (Category side)</th>
                      <th
                        style={{
                          ...thStyleBase,
                          textAlign: 'right',
                        }}
                      >
                        Amount
                      </th>
                      <th
                        style={{
                          ...thStyleBase,
                          textAlign: 'center',
                        }}
                      >
                        Cleared
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {deepRows.map((row) => (
                      <tr key={`deep-${row.transaction_id}-${row.date}`}>
                        <td style={tdStyle}>{formatDate(row.date)}</td>
                        <td style={tdStyle}>{row.description}</td>
                        <td style={tdStyle}>{row.vendor_installer}</td>
                        <td style={tdStyle}>{row.cash_account}</td>
                        <td style={tdStyle}>{row.type_label}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {formatMoney(row.amount)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'center' }}>
                          {row.is_cleared ? '✓' : ''}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
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

            <div style={{ fontSize: 13, marginBottom: '0.75rem' }}>
              <div style={{ marginBottom: '0.5rem' }}>
                <label style={{ display: 'block', marginBottom: 2 }}>
                  Date
                </label>
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
                {editSaving ? 'Saving…' : 'Save changes'}
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

            <div style={{ fontSize: 12, color: '#555', marginBottom: '0.75rem' }}>
              <div>
                <strong>Account:</strong> {clearTarget.cash_account ?? '(unknown)'}
              </div>
              <div>
                <strong>Date:</strong> {formatDate(clearTarget.date)}
              </div>
              <div>
                <strong>Description:</strong> {clearTarget.description ?? '(none)'}
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
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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

              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
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
                  Enter a positive amount. The system will keep the debit/credit sign
                  automatically.
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
  );
}
