import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type LedgerRow = {
  transaction_id: number;
  date: string;
  created_at: string;
  updated_at: string;
  description: string | null;
  vendor_installer: string;
  cash_account: string | null;
  type_label: string | null;
  amount: number;
  is_cleared: boolean;
};

export function LedgerView() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  // Load ledger with server-side pagination
  useEffect(() => {
    async function loadLedger() {
      setLoading(true);
      setError(null);
      
      try {
        const startIndex = (page - 1) * pageSize;
        const endIndex = startIndex + pageSize - 1;

        // Load ONE page of data from materialized view
        const { data, error: lineErr, count } = await supabase
          .from('ledger_mv')
          .select('*', { count: 'exact' })
          .range(startIndex, endIndex);

        if (lineErr) throw lineErr;

        setRows((data ?? []) as LedgerRow[]);
        setTotalCount(count ?? 0);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load ledger');
        setLoading(false);
      }
    }
    
    loadLedger();
  }, [page, pageSize]); // Reload when page or pageSize changes

  const totalPages = totalCount === 0 ? 1 : Math.ceil(totalCount / pageSize);

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

  const thStyle = { textAlign: 'left' as const, borderBottom: '1px solid #ccc' };
  const tdStyle = { padding: '6px 4px', borderBottom: '1px solid #eee' };

  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(e.target.value) || 25;
    setPageSize(newSize);
    setPage(1);
  };

  const handlePrev = () => {
    setPage((p) => Math.max(1, p - 1));
  };

  const handleNext = () => {
    setPage((p) => Math.min(totalPages, p + 1));
  };

  return (
    <div className="card">
      <h2>Ledger</h2>
      {loading && <p>Loading transactions…</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!loading && !error && totalCount === 0 && <p>No transactions found.</p>}

      {!loading && !error && totalCount > 0 && (
        <>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '0.5rem',
              fontSize: 13,
            }}
          >
            <div>
              Show{' '}
              <select value={pageSize} onChange={handlePageSizeChange}>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>{' '}
              rows
            </div>
            <div>
              Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
            </div>
          </div>

          <table className="table">
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Vendor / Installer</th>
                <th style={thStyle}>Account (Cash side)</th>
                <th style={thStyle}>Type (Category side)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Cleared</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.transaction_id}>
                  <td style={tdStyle}>{formatDate(row.date)}</td>
                  <td style={tdStyle}>{row.description}</td>
                  <td style={tdStyle}>{row.vendor_installer}</td>
                  <td style={tdStyle}>{row.cash_account}</td>
                  <td style={tdStyle}>{row.type_label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatMoney(row.amount)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{row.is_cleared ? '✓' : ''}</td>
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
    </div>
  );
}