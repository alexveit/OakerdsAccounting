import { useEffect, useState, type CSSProperties } from 'react';
import { supabase } from '../lib/supabaseClient';
import { NewTransactionForm } from './NewTransactionForm';
import { NewJobForm } from './NewJobForm';
import { NewRealEstateDealForm } from './NewRealEstateDealForm';
import { Transfers } from './Transfers';
import { formatCurrency } from '../utils/format';
import { isBankCode, isCreditCardCode } from '../utils/accounts';

type EntryTab = 'transaction' | 'job' | 'deal' | 'transfer';

type AccountBalance = {
  account_id: number;
  account_name: string;
  account_code: string | null;
  account_type: string;
  balance: number;
};

export function NewEntryView({ initialJobId }: { initialJobId?: number | null }) {
  const [tab, setTab] = useState<EntryTab>('transaction');

  const [allAccounts, setAllAccounts] = useState<AccountBalance[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  // Shared loader so we can refresh after each transaction save
  async function loadAccounts() {
    setLoadingAccounts(true);
    setAccountsError(null);

    try {
      const { data, error } = await supabase
        .from('account_balances_v')
        .select('*');

      if (error) throw error;

      const accounts: AccountBalance[] = ((data ?? []) as any[])
        .map((row: any) => ({
          account_id: Number(row.account_id),
          account_name: String(row.account_name),
          account_code: row.account_code ?? null,
          account_type: String(row.account_type),
          balance: Number(row.balance) || 0,
        }))
        .sort((a, b) => {
          // Always put account_id = 1 first
          if (a.account_id === 1) return -1;
          if (b.account_id === 1) return 1;
          // Then sort by code/name
          const codeA = a.account_code || a.account_name;
          const codeB = b.account_code || b.account_name;
          return codeA.localeCompare(codeB);
        });

      setAllAccounts(accounts);
      setLoadingAccounts(false);
    } catch (err: unknown) {
      console.error(err);
      setAccountsError(err instanceof Error ? err.message : 'Failed to load accounts');
      setLoadingAccounts(false);
    }
  }

  useEffect(() => {
    void loadAccounts();
  }, []);

  // Filter into banks and credit cards (exclude RE assets)
  const bankAccounts = allAccounts.filter((a) => isBankCode(a.account_code));
  const creditCardAccounts = allAccounts.filter((a) => isCreditCardCode(a.account_code));

  const bankTotal = bankAccounts.reduce((sum, a) => sum + a.balance, 0);
  const cardTotal = creditCardAccounts.reduce((sum, a) => sum + a.balance, 0);

  const gap = '0.75rem';

  const thStyle: CSSProperties = {
    textAlign: 'left',
    borderBottom: '1px solid #ddd',
    padding: '3px 4px',
    fontSize: 12,
    fontWeight: 600,
  };
  const tdStyle: CSSProperties = {
    padding: '3px 4px',
    borderBottom: '1px solid #f2f2f2',
    fontSize: 13,
  };
  const totalRowStyle: CSSProperties = {
    ...tdStyle,
    fontWeight: 600,
    borderTop: '2px solid #ccc',
    borderBottom: 'none',
    paddingTop: '6px',
  };

  const renderAccountTable = (
    accounts: AccountBalance[],
    total: number,
    isCard = false
  ) => {
    if (loadingAccounts) {
      return <p style={{ fontSize: 13, color: '#777' }}>Loading…</p>;
    }
    if (accountsError) {
      return <p style={{ color: 'red', fontSize: 13 }}>Error: {accountsError}</p>;
    }
    if (accounts.length === 0) {
      return <p style={{ fontSize: 13, color: '#777' }}>No accounts found.</p>;
    }

    return (
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={thStyle}>Account</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map((acc) => (
            <tr key={acc.account_id}>
              <td style={tdStyle}>{acc.account_name}</td>
              <td
                style={{
                  ...tdStyle,
                  textAlign: 'right',
                  color: isCard && acc.balance < 0 ? '#b00020' : undefined,
                }}
              >
                {formatCurrency(acc.balance, 2)}
              </td>
            </tr>
          ))}
          <tr>
            <td style={totalRowStyle}>Total</td>
            <td
              style={{
                ...totalRowStyle,
                textAlign: 'right',
                color: isCard ? '#b00020' : (total >= 0 ? '#0a7a3c' : '#b00020'),
              }}
            >
              {formatCurrency(total, 2)}
            </td>
          </tr>
        </tbody>
      </table>
    );
  };

  return (
    <div>
      <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>New Entry</h2>

      {/* Tabs */}
      <div className="tab-strip">
        <button
          type="button"
          className={`tab ${tab === 'transaction' ? 'tab--active' : ''}`}
          onClick={() => setTab('transaction')}
        >
          Transaction
        </button>
        <button
          type="button"
          className={`tab ${tab === 'job' ? 'tab--active' : ''}`}
          onClick={() => setTab('job')}
        >
          Job
        </button>
        <button
          type="button"
          className={`tab ${tab === 'deal' ? 'tab--active' : ''}`}
          onClick={() => setTab('deal')}
        >
          RE Deal
        </button>
        <button
          type="button"
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
          marginTop: '0.75rem',
        }}
      >
        {tab === 'transaction' && (
          <>
            {/* LEFT: New Transaction Form */}
            <div style={{ flex: '0 0 auto' }}>
              <div className="card" style={{ padding: '1rem' }}>
                <NewTransactionForm
                  initialJobId={initialJobId ?? null}
                  onTransactionSaved={loadAccounts}
                />
              </div>
            </div>

            {/* RIGHT: Account Balances */}
            <div style={{ display: 'flex', flexDirection: 'column', gap }}>
              {/* Cash & Banks Card */}
              <div className="card" style={{ minWidth: 260 }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: 15 }}>
                  Cash &amp; Banks
                </h3>
                {renderAccountTable(bankAccounts, bankTotal, false)}
              </div>

              {/* Credit Cards Card */}
              <div className="card" style={{ minWidth: 260 }}>
                <h3 style={{ marginTop: 0, marginBottom: '0.5rem', fontSize: 15 }}>
                  Credit Cards
                </h3>
                {renderAccountTable(creditCardAccounts, cardTotal, true)}
              </div>
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
            <Transfers onTransferSaved={loadAccounts} />
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
