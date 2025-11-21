import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

type ViewMode = 'year' | 'month' | 'day' | 'detail';
type CategorySort = 'total' | 'name';

type ExpenseRow = { account_id: number; account_name: string; total: number };

type RawLine = {
  id: number;
  account_id: number;
  amount: number;
  is_cleared: boolean;
  accounts: { id: number; name: string; account_type_id: number } | null;
  transactions: { date: string; description: string | null } | null;
  vendors: { nick_name: string } | null;
  installers: { first_name: string; last_name: string | null } | null;
  jobs: { name: string } | null;
};

const formatLocalDate = (dateStr?: string | null) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
};

const formatMonthLabel = (monthKey: string) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
};

type SimpleTableRow = {
  key: string | number;
  label: string;
  value: number;
  onClick?: () => void;
};

type SimpleTableProps = {
  headerLabel: string;
  headerValue: string;
  rows: SimpleTableRow[];
  formatMoney: (value: number) => string;
};

function SimpleTable({ headerLabel, headerValue, rows, formatMoney }: SimpleTableProps) {
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    borderBottom: '1px solid #ccc',
  };
  const tdStyle: React.CSSProperties = {
    borderBottom: '1px solid #eee',
    padding: '6px 4px',
  };

  return (
    <table className="table">
      <thead>
        <tr>
          <th style={thStyle}>{headerLabel}</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>{headerValue}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.key}
            onClick={r.onClick}
            style={r.onClick ? { cursor: 'pointer' } : undefined}
          >
            <td style={tdStyle}>{r.label}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              {formatMoney(r.value)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ExpenseByCategory() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [rawLines, setRawLines] = useState<RawLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  const [viewMode, setViewMode] = useState<ViewMode>('year');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedAccountName, setSelectedAccountName] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const [categorySort, setCategorySort] = useState<CategorySort>('total');

  useEffect(() => {
    async function loadExpenses() {
      setLoading(true);
      setError(null);
      setViewMode('year');
      setSelectedAccountId(null);
      setSelectedAccountName('');
      setSelectedMonth(null);
      setSelectedDate(null);

      try {
        const { data: typeRow, error: typeErr } = await supabase
          .from('account_types')
          .select('id')
          .eq('name', 'expense')
          .maybeSingle();

        if (typeErr) throw typeErr;
        if (!typeRow) throw new Error('Account type "expense" not found');

        const expenseTypeId = (typeRow as { id: number }).id;
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        const { data, error: lineErr } = await supabase
          .from('transaction_lines')
          .select(
            `id, account_id, amount, is_cleared, 
            accounts!inner (id, name, account_type_id),
            transactions!inner (date, description),
            vendors (nick_name),
            installers (first_name, last_name),
            jobs (name)`
          )
          .eq('is_cleared', true)
          .eq('accounts.account_type_id', expenseTypeId)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        if (lineErr) throw lineErr;

        const raw: RawLine[] = (data ?? []) as any[];
        setRawLines(raw);

        const totalsMap = new Map<number, { account_name: string; total: number }>();
        for (const line of raw) {
          const accountId = line.account_id;
          const accountName = line.accounts?.name ?? 'Unknown';
          if (!totalsMap.has(accountId)) {
            totalsMap.set(accountId, { account_name: accountName, total: 0 });
          }
          totalsMap.get(accountId)!.total += line.amount ?? 0;
        }

        const aggregated: ExpenseRow[] = Array.from(
          totalsMap.entries()
        ).map(([account_id, { account_name, total }]) => ({
          account_id,
          account_name,
          total,
        }));

        // NOTE: we don't sort here so we can let the memoized sorter
        // handle "by total" vs "by name" dynamically.
        setRows(aggregated);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load expense data');
        setLoading(false);
      }
    }
    loadExpenses();
  }, [year]);

  const formatMoney = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    if (categorySort === 'total') {
      arr.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
    } else {
      arr.sort((a, b) => a.account_name.localeCompare(b.account_name));
    }
    return arr;
  }, [rows, categorySort]);

  const monthRows = useMemo(() => {
    if (!selectedAccountId) return [];
    const map = new Map<string, number>();
    for (const line of rawLines) {
      if (line.account_id !== selectedAccountId) continue;
      const dateStr = line.transactions?.date;
      if (!dateStr) continue;
      const monthKey = dateStr.slice(0, 7);
      map.set(monthKey, (map.get(monthKey) ?? 0) + (line.amount ?? 0));
    }
    return Array.from(map.entries())
      .map(([monthKey, total]) => ({ monthKey, total }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [rawLines, selectedAccountId]);

  const dayRows = useMemo(() => {
    if (!selectedAccountId || !selectedMonth) return [];
    const map = new Map<string, number>();
    for (const line of rawLines) {
      if (line.account_id !== selectedAccountId) continue;
      const dateStr = line.transactions?.date;
      if (!dateStr || !dateStr.startsWith(selectedMonth)) continue;
      map.set(dateStr, (map.get(dateStr) ?? 0) + (line.amount ?? 0));
    }
    return Array.from(map.entries())
      .map(([dateStr, total]) => ({ dateStr, total }))
      .sort((a, b) => a.dateStr.localeCompare(b.dateStr));
  }, [rawLines, selectedAccountId, selectedMonth]);

  const detailLines = useMemo(() => {
    if (!selectedAccountId) return [];
    return rawLines
      .filter((line) => {
        if (line.account_id !== selectedAccountId) return false;
        const dateStr = line.transactions?.date;
        if (!dateStr) return false;
        if (selectedMonth && !dateStr.startsWith(selectedMonth)) return false;
        if (selectedDate && dateStr !== selectedDate) return false;
        return true;
      })
      .sort((a, b) =>
        (a.transactions?.date ?? '').localeCompare(
          b.transactions?.date ?? ''
        )
      );
  }, [rawLines, selectedAccountId, selectedMonth, selectedDate]);

  const handleCategoryClick = (row: ExpenseRow) => {
    setSelectedAccountId(row.account_id);
    setSelectedAccountName(row.account_name);
    setSelectedMonth(null);
    setSelectedDate(null);
    setViewMode('month');
  };

  const handleMonthClick = (monthKey: string) => {
    setSelectedMonth(monthKey);
    setSelectedDate(null);
    setViewMode('day');
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setViewMode('detail');
  };

  const resetToYear = () => {
    setViewMode('year');
    setSelectedAccountId(null);
    setSelectedAccountName('');
    setSelectedMonth(null);
    setSelectedDate(null);
  };

  const backToMonth = () => {
    setViewMode('month');
    setSelectedDate(null);
  };

  const backToDay = () => setViewMode('day');

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    borderBottom: '1px solid #ccc',
  };
  const tdStyle: React.CSSProperties = {
    borderBottom: '1px solid #eee',
    padding: '6px 4px',
  };
  const btnStyle: React.CSSProperties = {
    borderRadius: 999,
    border: '1px solid #ccc',
    padding: '2px 8px',
    background: '#f5f5f5',
    cursor: 'pointer',
    fontSize: 12,
    marginRight: '0.5rem',
  };

  return (
    <div className="card">
      <h2>Expense by Category</h2>

      <label style={{ display: 'block', marginBottom: '0.75rem' }}>
        Year:{' '}
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {Array.from({ length: 6 }).map((_, i) => {
            const y = currentYear - i;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </select>
      </label>

      <div style={{ fontSize: 12, color: '#777', marginBottom: '0.75rem' }}>
        <strong>View:</strong>{' '}
        {viewMode === 'year' ? (
          <span>{year}</span>
        ) : (
          <button
            type="button"
            onClick={resetToYear}
            style={{
              border: 'none',
              background: 'none',
              padding: 0,
              margin: 0,
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: 12,
            }}
          >
            {year}
          </button>
        )}
        {viewMode !== 'year' && selectedAccountName && (
          <>
            {'  ›  '} <span>{selectedAccountName}</span>
          </>
        )}
        {viewMode === 'day' && selectedMonth && (
          <>
            {'  ›  '} <span>{formatMonthLabel(selectedMonth)}</span>
          </>
        )}
        {viewMode === 'detail' && selectedDate && (
          <>
            {'  ›  '} <span>{formatLocalDate(selectedDate)}</span>
          </>
        )}
      </div>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!loading && !error && viewMode === 'year' && rows.length === 0 && (
        <p>No data for {year}.</p>
      )}

      {/* YEAR VIEW */}
      {viewMode === 'year' && rows.length > 0 && (
        <>
          <div
            style={{
              marginBottom: '0.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <p style={{ fontSize: 12, color: '#777', margin: 0 }}>
              Click a category to see a month-by-month breakdown.
            </p>
            <span style={{ marginLeft: 'auto', fontSize: 12 }}>
              Sort by:{' '}
              <select
                value={categorySort}
                onChange={(e) =>
                  setCategorySort(e.target.value as CategorySort)
                }
                style={{ fontSize: 12 }}
              >
                <option value="total">Total (largest first)</option>
                <option value="name">Category name (A → Z)</option>
              </select>
            </span>
          </div>

          <SimpleTable
            headerLabel="Category"
            headerValue="Total"
            rows={sortedRows.map((r) => ({
              key: r.account_id,
              label: r.account_name,
              value: r.total,
              onClick: () => handleCategoryClick(r),
            }))}
            formatMoney={formatMoney}
          />
        </>
      )}

      {/* MONTH VIEW */}
      {viewMode === 'month' && selectedAccountId && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <button type="button" onClick={resetToYear} style={btnStyle}>
              ← Back to all categories
            </button>
          </div>
          {monthRows.length === 0 && (
            <p>No expense lines for this category in {year}.</p>
          )}
          {monthRows.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: '#777' }}>
                Click a month to see daily totals.
              </p>
              <SimpleTable
                headerLabel="Month"
                headerValue="Total"
                rows={monthRows.map((m) => ({
                  key: m.monthKey,
                  label: formatMonthLabel(m.monthKey),
                  value: m.total,
                  onClick: () => handleMonthClick(m.monthKey),
                }))}
                formatMoney={formatMoney}
              />
            </>
          )}
        </>
      )}

      {/* DAY VIEW */}
      {viewMode === 'day' && selectedAccountId && selectedMonth && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <button type="button" onClick={backToMonth} style={btnStyle}>
              ← Back to months
            </button>
            <button type="button" onClick={resetToYear} style={btnStyle}>
              ← Back to all categories
            </button>
          </div>
          {dayRows.length === 0 && <p>No expense lines for this month.</p>}
          {dayRows.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: '#777' }}>
                Click a day to see individual transactions.
              </p>
              <SimpleTable
                headerLabel="Date"
                headerValue="Total"
                rows={dayRows.map((d) => ({
                  key: d.dateStr,
                  label: formatLocalDate(d.dateStr),
                  value: d.total,
                  onClick: () => handleDayClick(d.dateStr),
                }))}
                formatMoney={formatMoney}
              />
            </>
          )}
        </>
      )}

      {/* DETAIL VIEW */}
      {viewMode === 'detail' && selectedAccountId && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <button type="button" onClick={backToDay} style={btnStyle}>
              ← Back to days
            </button>
            <button
              type="button"
              onClick={backToMonth}
              style={{ ...btnStyle, marginLeft: 0 }}
            >
              ← Back to months
            </button>
            <button
              type="button"
              onClick={resetToYear}
              style={{ ...btnStyle, marginLeft: '0.5rem' }}
            >
              ← Back to all categories
            </button>
          </div>
          {detailLines.length === 0 && <p>No transactions found for this day.</p>}
          {detailLines.length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th style={thStyle}>Date</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>Job</th>
                  <th style={thStyle}>Vendor / Installer</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {detailLines.map((line) => {
                  const tDate = formatLocalDate(line.transactions?.date);
                  const desc = line.transactions?.description ?? '';
                  const jobName = line.jobs?.name ?? '';
                  let party = line.vendors?.nick_name ?? '';
                  if (line.installers) {
                    const fullName = `${line.installers.first_name} ${
                      line.installers.last_name ?? ''
                    }`.trim();
                    party = party ? `${party} / ${fullName}` : fullName;
                  }
                  return (
                    <tr key={line.id}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                        {tDate}
                      </td>
                      <td style={tdStyle}>{desc}</td>
                      <td style={tdStyle}>{jobName}</td>
                      <td style={tdStyle}>{party}</td>
                      <td
                        style={{
                          ...tdStyle,
                          textAlign: 'right',
                        }}
                      >
                        {formatMoney(line.amount)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
