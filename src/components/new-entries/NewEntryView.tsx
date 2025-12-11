import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { NewTransactionForm } from './NewTransactionForm';
import { NewJobForm } from './NewJobForm';
import { Transfers } from '../ledger/Transfers';
import { BalancesCard, type AccountBalance } from '../shared/BalancesCard';

type EntryTab = 'transaction' | 'job' | 'transfer';

type RawAccountBalanceRow = {
  account_id: number;
  account_name: string;
  account_code: string | null;
  account_type: string;
  balance: number;
};

export type InitialTransferParams = {
  toAccountId: number;
  toAccountName: string;
  amount: number;
  description: string;
  lineIdsToSettle: number[];
};

export function NewEntryView({
  initialJobId,
  initialTransfer,
  onTransferComplete,
}: {
  initialJobId?: number | null;
  initialTransfer?: InitialTransferParams | null;
  onTransferComplete?: () => void;
}) {
  const [tab, setTab] = useState<EntryTab>(initialTransfer ? 'transfer' : 'transaction');

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

      const accounts: AccountBalance[] = ((data ?? []) as unknown as RawAccountBalanceRow[])
        .map((row) => ({
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
          className={`tab ${tab === 'transfer' ? 'tab--active' : ''}`}
          onClick={() => setTab('transfer')}
        >
          Transfer
        </button>
      </div>

      {/* Content - centered */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          marginTop: '0.75rem',
        }}
      >
        {tab === 'transaction' && (
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            {/* LEFT: New Transaction Form */}
            <div className="card" style={{ padding: '1rem', maxWidth: 480 }}>
              <NewTransactionForm
                initialJobId={initialJobId ?? null}
                onTransactionSaved={loadAccounts}
              />
            </div>

            {/* RIGHT: Balances Card */}
            <BalancesCard
              accounts={allAccounts}
              loading={loadingAccounts}
              error={accountsError}
            />
          </div>
        )}
        
        {tab === 'transfer' && (
          <div
            className="card"
            style={{
              maxWidth: 900,
              padding: '1rem',
            }}
          >
            <Transfers
              onTransferSaved={loadAccounts}
              initialTransfer={initialTransfer}
              onTransferComplete={onTransferComplete}
            />
          </div>
        )}

        {tab === 'job' && (
          <div
            className="card"
            style={{
              maxWidth: 560,
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
