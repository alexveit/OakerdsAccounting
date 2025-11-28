import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabaseClient';
import { NewTransactionForm } from './NewTransactionForm';
import { NewJobForm } from './NewJobForm';
import { NewRealEstateDealForm } from './NewRealEstateDealForm';
import { Transfers } from './Transfers';

type EntryTab = 'transaction' | 'job' | 'deal' | 'transfer';

type CashAccount = {
  account_id: number;
  account_name: string;
  account_code: string | null;
  account_type: string;
  balance: number;
};

export function NewEntryView({ initialJobId }: { initialJobId?: number | null }) {
  const [tab, setTab] = useState<EntryTab>('transaction');

  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [loadingCash, setLoadingCash] = useState(true);
  const [cashError, setCashError] = useState<string | null>(null);

  // Shared loader so we can refresh after each transaction save
  async function loadCashAccounts() {
    setLoadingCash(true);
    setCashError(null);

    try {
      // Load account balances from the same materialized view used on the dashboard
      const { data, error } = await supabase
        .from('account_balances_v')
        .select('*');

      if (error) throw error;

      const rawBalances = (data ?? []) as any[];

      // Keep only asset-type accounts and normalize types
      const cashOnly: CashAccount[] = rawBalances
        .map((row: any) => ({
          account_id: Number(row.account_id),
          account_name: String(row.account_name),
          account_code: row.account_code ?? null,
          account_type: String(row.account_type),
          balance: Number(row.balance) || 0,
        }))
        .filter((a) => a.account_type === 'asset')
        .sort((a, b) => {
          // Always put account_id = 1 first
          if (a.account_id === 1) return -1;
          if (b.account_id === 1) return 1;

          // Then sort by code/name
          const codeA = a.account_code || a.account_name;
          const codeB = b.account_code || b.account_name;
          return codeA.localeCompare(codeB);
        });

      setCashAccounts(cashOnly);
      setLoadingCash(false);
    } catch (err: any) {
      console.error(err);
      setCashError(err.message ?? 'Failed to load cash accounts');
      setLoadingCash(false);
    }
  }

  useEffect(() => {
    void loadCashAccounts();
  }, []);

  const gap = '0.75rem';

  const thStyle: CSSProperties = {
    textAlign: 'left',
    borderBottom: '1px solid #ddd',
    padding: '3px 4px',
  };
  const tdStyle: CSSProperties = {
    padding: '3px 4px',
    borderBottom: '1px solid #f2f2f2',
  };

  return (
    <div>
      {/* Tabs */}
      <div className="tab-strip">
        <button
          className={`tab ${tab === 'transaction' ? 'tab--active' : ''}`}
          onClick={() => setTab('transaction')}
        >
          New Transaction
        </button>
        <button
          className={`tab ${tab === 'job' ? 'tab--active' : ''}`}
          onClick={() => setTab('job')}
        >
          New Job
        </button>
        <button
          className={`tab ${tab === 'deal' ? 'tab--active' : ''}`}
          onClick={() => setTab('deal')}
        >
          New RE Deal
        </button>
        <button
          className={`tab ${tab === 'transfer' ? 'tab--active' : ''}`}
          onClick={() => setTab('transfer')}
        >
          Transfer
        </button>
      </div>

      {/* Content */}
      <div
        style={{
          display: 'flex',
          flexDirection: tab === 'transaction' ? 'row' : 'column',
          alignItems: 'flex-start',
          gap,
        }}
      >
        {tab === 'transaction' && (
          <>
            {/* LEFT: New Transaction Form */}
            <div style={{ flex: '0 0 auto' }}>
              <div className="card" style={{ padding: '1rem' }}>
                <NewTransactionForm
                  initialJobId={initialJobId ?? null}
                  onTransactionSaved={loadCashAccounts}
                />
              </div>
            </div>

            {/* RIGHT: Cash & Bank Accounts */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                Cash &amp; Bank Accounts
              </h3>

              {loadingCash && <p style={{ fontSize: 13 }}>Loading…</p>}

              {cashError && (
                <p style={{ color: 'red', fontSize: 13 }}>
                  Error: {cashError}
                </p>
              )}

              {!loadingCash && !cashError && cashAccounts.length === 0 && (
                <p style={{ fontSize: 13 }}>No cash/bank accounts found.</p>
              )}

              {!loadingCash && !cashError && cashAccounts.length > 0 && (
                <table
                  style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th style={thStyle}>Account</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashAccounts.map((acc) => {
                      const label = acc.account_code
                        ? `${acc.account_name} - ${acc.account_code}`
                        : acc.account_name;

                      return (
                        <tr key={acc.account_id}>
                          <td style={tdStyle}>{label}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            {acc.balance.toLocaleString('en-US', {
                              style: 'currency',
                              currency: 'USD',
                              minimumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
        
        {tab === 'transfer' && (
          <div
            className="card"
            style={{
              maxWidth: 900,
              margin: '0 auto',
              padding: '1rem',
            }}
          >
            <Transfers onTransferSaved={loadCashAccounts} />
          </div>
        )}

        {tab === 'job' && (
          <div
            className="card"
            style={{
              maxWidth: 560,
              margin: '0 auto',
              padding: '1rem',
            }}
          >
            <NewJobForm />
          </div>
        )}

        {tab === 'deal' && (
          <div
            className="card"
            style={{
              maxWidth: 900,
              margin: '0 auto',
              padding: '1rem',
            }}
          >
            <NewRealEstateDealForm />
          </div>
        )}
      </div>
    </div>
  );
}
