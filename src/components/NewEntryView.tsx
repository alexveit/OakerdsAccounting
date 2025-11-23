import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabaseClient';
import { NewTransactionForm } from './NewTransactionForm';
import { NewJobForm } from './NewJobForm';

type EntryTab = 'transaction' | 'job';

type AccountRow = {
  id: number;
  name: string;
  code: string | null;
  account_types: { name: string } | null;
};

type LineRow = {
  account_id: number;
  amount: number;
  accounts?: {
    account_types?: { name: string } | null;
  } | null;
};

type CashAccount = AccountRow & { balance: number };

export function NewEntryView() {
  const [tab, setTab] = useState<EntryTab>('transaction');

  const [cashAccounts, setCashAccounts] = useState<CashAccount[]>([]);
  const [loadingCash, setLoadingCash] = useState(true);
  const [cashError, setCashError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCashAccounts() {
      setLoadingCash(true);
      setCashError(null);

      try {
        // 1) Load accounts with their type
        const { data: accData, error: accErr } = await supabase
          .from('accounts')
          .select('id, name, code, account_types(name)');
        if (accErr) throw accErr;

        const rawAccounts = (accData ?? []) as any[];

        const accounts: AccountRow[] = rawAccounts.map((a: any) => ({
          id: Number(a.id),
          name: String(a.name),
          code: a.code ?? null,
          account_types: a.account_types
            ? ({ name: String(a.account_types.name) } as { name: string })
            : null,
        }));

        // 2) Load transaction lines with account type info
        const { data: lineData, error: lineErr } = await supabase
          .from('transaction_lines')
          .select('account_id, amount, accounts(account_types(name))');
        if (lineErr) throw lineErr;

        const rawLines = (lineData ?? []) as any[];

        const lines: LineRow[] = rawLines.map((l: any) => ({
          account_id: Number(l.account_id),
          amount: Number(l.amount),
          accounts: l.accounts
            ? {
                account_types: l.accounts.account_types
                  ? ({
                      name: String(l.accounts.account_types.name),
                    } as { name: string })
                  : null,
              }
            : null,
        }));

        // 3) Sum only asset-account lines (includes pending)
        const sums: Record<number, number> = {};
        for (const line of lines) {
          const accType = line.accounts?.account_types?.name;
          if (accType !== 'asset') continue;

          const amt = Number(line.amount) || 0;
          if (Number.isNaN(amt)) continue;

          sums[line.account_id] = (sums[line.account_id] ?? 0) + amt;
        }

        // 4) Build cash accounts with balances
        const cashOnly: CashAccount[] = accounts
          .filter((a) => a.account_types?.name === 'asset')
          .map((a) => ({
            ...a,
            balance: sums[a.id] ?? 0,
          }));

        setCashAccounts(cashOnly);
        setLoadingCash(false);
      } catch (err: any) {
        console.error(err);
        setCashError(err.message ?? 'Failed to load cash accounts');
        setLoadingCash(false);
      }
    }

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
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        {tab === 'transaction' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(520px, 1fr) minmax(260px, 1fr)',
              gap,
              alignItems: 'flex-start',
            }}
          >
            {/* LEFT: New Transaction form */}
            <div className="card" style={{ padding: '1rem' }}>
              <NewTransactionForm />
            </div>

            {/* RIGHT: Cash & Bank Accounts */}
            <div className="card">
              <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                Cash &amp; Bank Accounts
              </h3>

              {loadingCash && (
                <p style={{ fontSize: 13 }}>Loading…</p>
              )}

              {cashError && (
                <p style={{ color: 'red', fontSize: 13 }}>
                  Error: {cashError}
                </p>
              )}

              {!loadingCash && !cashError && cashAccounts.length === 0 && (
                <p style={{ fontSize: 13, color: '#777' }}>
                  No asset accounts found.
                </p>
              )}

              {!loadingCash && !cashError && cashAccounts.length > 0 && (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={thStyle}>Account</th>
                      <th style={{ ...thStyle, textAlign: 'right' }}>
                        Balance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {cashAccounts.map((acc) => {
                      const label = acc.code
                        ? `${acc.name} - ${acc.code}`
                        : acc.name;

                      return (
                        <tr key={acc.id}>
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
          </div>
        ) : (
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
      </div>
    </div>
  );
}
