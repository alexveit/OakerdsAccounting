import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type LineRow = {
  transaction_id: number;
  amount: number;
  is_cleared: boolean;
  transactions: {
    date: string;
    description: string | null;
    created_at: string;
  } | null;
  accounts: { name: string; account_types: { name: string } | null } | null;
  vendors: { name: string } | null;
  installers: { first_name: string; last_name: string | null } | null;
};

type LedgerRow = {
  transactionId: number;
  date: string;
  createdAt: string;
  description: string;
  vendorInstaller: string;
  cashAccount: string;
  typeLabel: string;
  amount: number;
  cleared: boolean;
};

export function LedgerView() {
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // pagination
  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    async function loadLedger() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: lineErr } = await supabase
          .from('transaction_lines')
          .select(`
            transaction_id,
            amount,
            is_cleared,
            transactions (
              date,
              description,
              created_at
            ),
            accounts (
              name,
              account_types ( name )
            ),
            vendors ( name ),
            installers ( first_name, last_name )
          `);

        if (lineErr) throw lineErr;

        const rawLines: LineRow[] = (data ?? []) as any[];
        const map = new Map<number, LedgerRow>();

        for (const line of rawLines) {
          const txId = line.transaction_id;
          const accType = line.accounts?.account_types?.name ?? '';
          const accName = line.accounts?.name ?? '';

          let row = map.get(txId);
          if (!row) {
            row = {
              transactionId: txId,
              date: line.transactions?.date ?? '',
              createdAt: line.transactions?.created_at ?? '',
              description: line.transactions?.description ?? '',
              vendorInstaller: '',
              cashAccount: '',
              typeLabel: '',
              amount: 0,
              cleared: true,
            };
            map.set(txId, row);
          }

          // if any line not cleared, tx not cleared
          if (!line.is_cleared) row.cleared = false;

          // vendor / installer
          if (!row.vendorInstaller) {
            if (line.installers) {
              row.vendorInstaller = `${line.installers.first_name} ${
                line.installers.last_name ?? ''
              }`.trim();
            } else if (line.vendors) {
              row.vendorInstaller = line.vendors.name;
            }
          }

          // cash side: asset / liability
          if (accType === 'asset' || accType === 'liability') {
            row.cashAccount = accName;
            const mag = Math.abs(line.amount ?? 0);
            if (mag > 0) row.amount = mag;
          }

          // category side: income / expense
          if ((accType === 'income' || accType === 'expense') && !row.typeLabel) {
            row.typeLabel = accName;
          }
        }

        // sort: date desc, then created_at desc
        const ledgerRows = Array.from(map.values()).sort((a, b) => {
          const da = a.date ? new Date(a.date).getTime() : 0;
          const db = b.date ? new Date(b.date).getTime() : 0;
          if (db !== da) return db - da;

          const ca = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const cb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return cb - ca;
        });

        setRows(ledgerRows);
        setPage(1); // reset to first page after load
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load ledger');
        setLoading(false);
      }
    }
    loadLedger();
  }, []);

  // if pageSize changes and current page is out of range, clamp it
  const totalRows = rows.length;
  const totalPages = totalRows === 0 ? 1 : Math.ceil(totalRows / pageSize);
  const currentPage = Math.min(page, totalPages);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalRows);
  const pageRows = rows.slice(startIndex, endIndex);

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
    setPage(1); // reset to first page when page size changes
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
      {!loading && !error && totalRows === 0 && <p>No transactions found.</p>}

      {!loading && !error && totalRows > 0 && (
        <>
          {/* Page size + summary */}
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
              Showing {startIndex + 1}–{endIndex} of {totalRows}
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
              {pageRows.map((row) => (
                <tr key={row.transactionId}>
                  <td style={tdStyle}>{formatDate(row.date)}</td>
                  <td style={tdStyle}>{row.description}</td>
                  <td style={tdStyle}>{row.vendorInstaller}</td>
                  <td style={tdStyle}>{row.cashAccount}</td>
                  <td style={tdStyle}>{row.typeLabel}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{formatMoney(row.amount)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{row.cleared ? '✓' : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination controls */}
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
              disabled={currentPage === 1}
              style={{ padding: '0.2rem 0.6rem', fontSize: 13 }}
            >
              Prev
            </button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={handleNext}
              disabled={currentPage === totalPages}
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
