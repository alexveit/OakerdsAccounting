import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDate } from '../utils/date';

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

const MONTH_KEYS = [
  '01', '02', '03', '04', '05', '06',
  '07', '08', '09', '10', '11', '12',
];

/*
const formatMonthLabel = (monthKey: string) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
};
*/

const formatMonthShort = (monthKey: string) => {
  const [, m] = monthKey.split('-').map(Number);
  return new Date(2000, m - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
  });
};

type SimpleTableRow = {
  key: string | number;
  label: string;
  value: number;
  onClick?: () => void;
  highlight?: boolean;
};

type SimpleTableProps = {
  headerLabel: string;
  headerValue: string;
  rows: SimpleTableRow[];
  formatMoney: (value: number) => string;
  showTotal?: boolean;
  totalLabel?: string;
};

function SimpleTable({
  headerLabel,
  headerValue,
  rows,
  formatMoney,
  showTotal = false,
  totalLabel = 'Total',
}: SimpleTableProps) {
  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    borderBottom: '1px solid #ccc',
    padding: '6px 4px',
  };
  const tdStyle: React.CSSProperties = {
    borderBottom: '1px solid #eee',
    padding: '6px 4px',
  };

  const total = rows.reduce((sum, r) => sum + r.value, 0);

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
            style={{
              cursor: r.onClick ? 'pointer' : undefined,
              background: r.highlight ? '#fffde7' : undefined,
            }}
          >
            <td style={tdStyle}>{r.label}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>
              {formatMoney(r.value)}
            </td>
          </tr>
        ))}
        {showTotal && (
          <tr style={{ fontWeight: 600, background: '#f5f5f5' }}>
            <td style={{ ...tdStyle, borderTop: '2px solid #ccc' }}>{totalLabel}</td>
            <td style={{ ...tdStyle, borderTop: '2px solid #ccc', textAlign: 'right' }}>
              {formatMoney(total)}
            </td>
          </tr>
        )}
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
  const currentMonth = `${currentYear}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  const [year, setYear] = useState<number>(currentYear);

  const [viewMode, setViewMode] = useState<ViewMode>('year');
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [selectedAccountName, setSelectedAccountName] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAllTransactions, setShowAllTransactions] = useState(false);

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
      setShowAllTransactions(false);

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

  // Show all 12 months, even if $0
  const monthRows = useMemo(() => {
    if (!selectedAccountId) return [];
    
    const map = new Map<string, number>();
    
    // Initialize all months with 0
    for (const m of MONTH_KEYS) {
      map.set(`${year}-${m}`, 0);
    }
    
    // Sum up actual values
    for (const line of rawLines) {
      if (line.account_id !== selectedAccountId) continue;
      const dateStr = line.transactions?.date;
      if (!dateStr) continue;
      const monthKey = dateStr.slice(0, 7);
      if (map.has(monthKey)) {
        map.set(monthKey, (map.get(monthKey) ?? 0) + (line.amount ?? 0));
      }
    }
    
    return Array.from(map.entries())
      .map(([monthKey, total]) => ({ monthKey, total }))
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  }, [rawLines, selectedAccountId, year]);

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
        // If showing all transactions, skip month/date filters
        if (showAllTransactions) return true;
        if (selectedMonth && !dateStr.startsWith(selectedMonth)) return false;
        if (selectedDate && dateStr !== selectedDate) return false;
        return true;
      })
      .sort((a, b) =>
        (a.transactions?.date ?? '').localeCompare(b.transactions?.date ?? '')
      );
  }, [rawLines, selectedAccountId, selectedMonth, selectedDate, showAllTransactions]);

  // Calculate running totals for detail view
  const detailLinesWithRunning = useMemo(() => {
    let running = 0;
    return detailLines.map((line) => {
      running += line.amount ?? 0;
      return { ...line, runningTotal: running };
    });
  }, [detailLines]);

  const handleCategoryClick = (row: ExpenseRow) => {
    setSelectedAccountId(row.account_id);
    setSelectedAccountName(row.account_name);
    setSelectedMonth(null);
    setSelectedDate(null);
    setShowAllTransactions(false);
    setViewMode('month');
  };

  const handleMonthClick = (monthKey: string) => {
    setSelectedMonth(monthKey);
    setSelectedDate(null);
    setShowAllTransactions(false);
    setViewMode('day');
  };

  const handleDayClick = (dateStr: string) => {
    setSelectedDate(dateStr);
    setShowAllTransactions(false);
    setViewMode('detail');
  };

  const handleShowAllTransactions = () => {
    setSelectedMonth(null);
    setSelectedDate(null);
    setShowAllTransactions(true);
    setViewMode('detail');
  };

  const resetToYear = () => {
    setViewMode('year');
    setSelectedAccountId(null);
    setSelectedAccountName('');
    setSelectedMonth(null);
    setSelectedDate(null);
    setShowAllTransactions(false);
  };

  const backToCategory = () => {
    setViewMode('month');
    setSelectedMonth(null);
    setSelectedDate(null);
    setShowAllTransactions(false);
  };

  const backToMonth = () => {
    setViewMode('day');
    setSelectedDate(null);
    setShowAllTransactions(false);
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    borderBottom: '1px solid #ccc',
    padding: '6px 4px',
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
  const breadcrumbBtn: React.CSSProperties = {
    border: 'none',
    background: 'none',
    padding: 0,
    margin: 0,
    cursor: 'pointer',
    textDecoration: 'underline',
    fontSize: 12,
    color: '#1976d2',
  };

  return (
    <div className="card">
      

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

      {/* Clickable breadcrumbs */}
      <div style={{ fontSize: 12, color: '#777', marginBottom: '0.75rem' }}>
        <strong>View:</strong>{' '}
        {viewMode === 'year' ? (
          <span>{year}</span>
        ) : (
          <button type="button" onClick={resetToYear} style={breadcrumbBtn}>
            {year}
          </button>
        )}
        {viewMode !== 'year' && selectedAccountName && (
          <>
            {'  >  '}
            {viewMode === 'month' ? (
              <span>{selectedAccountName}</span>
            ) : (
              <button type="button" onClick={backToCategory} style={breadcrumbBtn}>
                {selectedAccountName}
              </button>
            )}
          </>
        )}
        {(viewMode === 'day' || (viewMode === 'detail' && !showAllTransactions)) && selectedMonth && (
          <>
            {'  >  '}
            {viewMode === 'day' ? (
              <span>{formatMonthShort(selectedMonth)}</span>
            ) : (
              <button type="button" onClick={backToMonth} style={breadcrumbBtn}>
                {formatMonthShort(selectedMonth)}
              </button>
            )}
          </>
        )}
        {viewMode === 'detail' && showAllTransactions && (
          <>{'  >  '}<span>All Transactions</span></>
        )}
        {viewMode === 'detail' && selectedDate && !showAllTransactions && (
          <>{'  >  '}<span>{formatLocalDate(selectedDate)}</span></>
        )}
      </div>

      {loading && <p>Loading...</p>}
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
                onChange={(e) => setCategorySort(e.target.value as CategorySort)}
                style={{ fontSize: 12 }}
              >
                <option value="total">Total (largest first)</option>
                <option value="name">Category name (A-Z)</option>
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
            showTotal
            totalLabel="Grand Total"
          />
        </>
      )}

      {/* MONTH VIEW */}
      {viewMode === 'month' && selectedAccountId && (
        <>
          <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <button type="button" onClick={resetToYear} style={btnStyle}>← All categories</button>
            <button
              type="button"
              onClick={handleShowAllTransactions}
              style={{ ...btnStyle, background: '#e3f2fd' }}
            >
              View all transactions
            </button>
          </div>
          <p style={{ fontSize: 12, color: '#777', marginBottom: '0.5rem' }}>
            Click a month to see daily totals.
          </p>
          <SimpleTable
            headerLabel="Month"
            headerValue="Total"
            rows={monthRows.map((m) => ({
              key: m.monthKey,
              label: formatMonthShort(m.monthKey),
              value: m.total,
              onClick: m.total !== 0 ? () => handleMonthClick(m.monthKey) : undefined,
              highlight: m.monthKey === currentMonth && year === currentYear,
            }))}
            formatMoney={formatMoney}
            showTotal
            totalLabel="Year Total"
          />
        </>
      )}

      {/* DAY VIEW */}
      {viewMode === 'day' && selectedAccountId && selectedMonth && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            <button type="button" onClick={backToCategory} style={btnStyle}>
              ← Months
            </button>
            <button type="button" onClick={resetToYear} style={btnStyle}>
              ← All categories
            </button>
          </div>
          {dayRows.length === 0 && <p>No expense lines for this month.</p>}
          {dayRows.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: '#777', marginBottom: '0.5rem' }}>
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
                showTotal
                totalLabel="Month Total"
              />
            </>
          )}
        </>
      )}

      {/* DETAIL VIEW */}
      {viewMode === 'detail' && selectedAccountId && (
        <>
          <div style={{ marginBottom: '0.75rem' }}>
            {!showAllTransactions && selectedDate && (
              <button type="button" onClick={backToMonth} style={btnStyle}>
                â† Days
              </button>
            )}
            {!showAllTransactions && (
              <button type="button" onClick={backToCategory} style={btnStyle}>
                â† Months
              </button>
            )}
            {showAllTransactions && (
              <button type="button" onClick={backToCategory} style={btnStyle}>
                â† Back to months
              </button>
            )}
            <button type="button" onClick={resetToYear} style={btnStyle}>
              â† All categories
            </button>
          </div>
          {detailLinesWithRunning.length === 0 && <p>No transactions found.</p>}
          {detailLinesWithRunning.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th style={thStyle}>Date</th>
                    <th style={thStyle}>Description</th>
                    <th style={thStyle}>Job</th>
                    <th style={thStyle}>Vendor / Installer</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Running</th>
                  </tr>
                </thead>
                <tbody>
                  {detailLinesWithRunning.map((line) => {
                    const tDate = formatLocalDate(line.transactions?.date);
                    const desc = line.transactions?.description ?? '';
                    const jobName = line.jobs?.name ?? '';
                    let party = line.vendors?.nick_name ?? '';
                    if (line.installers) {
                      const fullName = `${line.installers.first_name} ${line.installers.last_name ?? ''}`.trim();
                      party = party ? `${party} / ${fullName}` : fullName;
                    }
                    return (
                      <tr key={line.id}>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{tDate}</td>
                        <td style={tdStyle}>{desc}</td>
                        <td style={tdStyle}>{jobName}</td>
                        <td style={tdStyle}>{party}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          {formatMoney(line.amount)}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: '#777' }}>
                          {formatMoney(line.runningTotal)}
                        </td>
                      </tr>
                    );
                  })}
                  {/* Total row */}
                  <tr style={{ fontWeight: 600, background: '#f5f5f5' }}>
                    <td style={{ ...tdStyle, borderTop: '2px solid #ccc' }} colSpan={4}>
                      Total ({detailLinesWithRunning.length} transactions)
                    </td>
                    <td style={{ ...tdStyle, borderTop: '2px solid #ccc', textAlign: 'right' }}>
                      {formatMoney(detailLinesWithRunning.reduce((sum, l) => sum + l.amount, 0))}
                    </td>
                    <td style={{ ...tdStyle, borderTop: '2px solid #ccc' }}>&nbsp;</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}