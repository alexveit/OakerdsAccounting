import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type AccountBalance = {
  account_id: number;
  account_name: string;
  account_code: string | null;
  account_type: string;
  balance: number;
};

type PendingTransaction = {
  line_id: number;
  transaction_id: number;
  account_id: number;
  amount: number;
  purpose: string | null;
  account_name: string;
  account_code: string | null;
  account_type: string;
  transaction_date: string;
  description: string | null;
  updated_at: string;  // ← Add this
  job_name: string | null;
};

type YTDIncome = {
  year: number;
  income_account: string;
  total_income: number;
};

export function DashboardOverview() {
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [ytdIncome, setYtdIncome] = useState<YTDIncome[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load precomputed data from materialized views
  async function loadDashboardData() {
    setLoading(true);
    setError(null);

    try {
      const currentYear = new Date().getFullYear();

      // Load account balances from materialized view
      const { data: balancesData, error: balancesErr } = await supabase
        .from('account_balances_mv')
        .select('*');
      
      if (balancesErr) throw balancesErr;
      setAccountBalances((balancesData ?? []) as AccountBalance[]);

      // Load pending transactions from materialized view
      const { data: pendingData, error: pendingErr } = await supabase
        .from('pending_transactions_mv')
        .select('*');
      
      if (pendingErr) throw pendingErr;
      setPendingTransactions((pendingData ?? []) as PendingTransaction[]);

      // Load YTD income from materialized view
      const { data: incomeData, error: incomeErr } = await supabase
        .from('ytd_income_mv')
        .select('*')
        .eq('year', currentYear);
      
      if (incomeErr) throw incomeErr;
      setYtdIncome((incomeData ?? []) as YTDIncome[]);

      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load dashboard data');
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboardData(); }, []);

  // Mark a pending transaction as cleared
  async function handleMarkCleared(pending: PendingTransaction) {
    setError(null);
    try {
      const defaultValue = Math.abs(Number(pending.amount)).toFixed(2);
      const input = window.prompt('Final cleared amount (tip included). Leave blank to keep the current amount.', defaultValue);
      if (input === null) return;

      let finalAmount = Number(pending.amount);
      if (input.trim() !== '') {
        const parsed = Number(input.trim());
        if (Number.isNaN(parsed) || parsed <= 0) {
          alert('Invalid amount. Please use a positive number like 58.15');
          return;
        }
        const sign = Number(pending.amount) < 0 ? -1 : 1;
        finalAmount = parsed * sign;
      }

      // Call the RPC function (which now refreshes views automatically)
      const { data, error: rpcErr } = await supabase.rpc('mark_transaction_cleared', {
        p_transaction_id: pending.transaction_id,
        p_clicked_line_id: pending.line_id,
        p_new_amount: finalAmount,
      });

      if (rpcErr) throw rpcErr;
      console.log('Transaction marked cleared:', data);

      await loadDashboardData();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to mark line cleared');
    }
  }

  // Delete a pending transaction
  async function handleDeletePending(pending: PendingTransaction) {
    if (!window.confirm('Remove this pending transaction (both sides) from the database?')) return;

    try {
      // Call the RPC function (which now refreshes views automatically)
      const { data, error: rpcErr } = await supabase.rpc('delete_transaction', {
        p_transaction_id: pending.transaction_id,
      });

      if (rpcErr) throw rpcErr;
      console.log('Transaction deleted:', data);

      await loadDashboardData();
    } catch (err: any) {
      console.error('Error deleting pending transaction', err);
      window.alert(err.message ?? 'Failed to delete pending transaction.');
    }
  }

  if (loading) return <p>Loading balances…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  // Custom sort: account_id = 1 first, then by code
  const sortAccounts = (accounts: AccountBalance[]) => {
    return accounts.sort((a, b) => {
      // Always put account_id = 1 first
      if (a.account_id === 1) return -1;
      if (b.account_id === 1) return 1;
      
      // Then sort by code/name
      const codeA = a.account_code || a.account_name;
      const codeB = b.account_code || b.account_name;
      return codeA.localeCompare(codeB);
    });
  };

  // Separate accounts by type and apply custom sort
  const cashAccounts = sortAccounts(
    accountBalances.filter(a => a.account_type === 'asset')
  );

  const cardAccounts = sortAccounts(
    accountBalances.filter(a => a.account_type === 'liability')
  );

  // Calculate totals
  const totalCash = cashAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalCard = cardAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
  
  // Separate pending by type
  const pendingCash = pendingTransactions.filter(p => p.account_type === 'asset');
  const pendingCard = pendingTransactions.filter(p => p.account_type === 'liability');
  
  const pendingCashTotal = pendingCash.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingCardTotal = pendingCard.reduce((sum, p) => sum + Number(p.amount), 0);
  
  const netPosition = totalCash + totalCard;

  // Extract YTD income
  const jobGrossYtd = ytdIncome.find(i => i.income_account === 'Income - Job')?.total_income ?? 0;
  const rentGrossYtd = ytdIncome.find(i => i.income_account === 'Income - Rental')?.total_income ?? 0;
  const totalGrossYtd = jobGrossYtd + rentGrossYtd;

  return (
    <div>
      {/* Income Snapshot */}
      <h2>Income Snapshot</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <SummaryCard label="Job Gross Income YTD" value={jobGrossYtd} />
        <SummaryCard label="Rent Gross Income YTD" value={rentGrossYtd} />
        <SummaryCard label="Total Gross Income YTD" value={totalGrossYtd} />
      </div>

      {/* Balances Overview */}
      <h2>Balances Overview</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <SummaryCard label="Total Cash / Bank" value={totalCash} />
        <SummaryCard label="Total Cards / Loans" value={totalCard} />
        <SummaryCard label="Pending Bank Transactions" value={pendingCashTotal} />
        <SummaryCard label="Pending Card Transactions" value={pendingCardTotal} />
        <SummaryCard label="Net Position (Cash - Cards)" value={netPosition} highlight={netPosition >= 0 ? 'positive' : 'negative'} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <AccountList title="Cash & Bank Accounts" accounts={cashAccounts} emptyMessage="No asset accounts found." />
          <PendingList title="Pending Bank Transactions" pending={pendingCash} emptyMessage="No pending bank transactions." onMarkCleared={handleMarkCleared} onDelete={handleDeletePending} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <AccountList title="Cards & Loans" accounts={cardAccounts} emptyMessage="No liability accounts found." />
          <PendingList title="Pending Card Transactions" pending={pendingCard} emptyMessage="No pending card transactions." onMarkCleared={handleMarkCleared} onDelete={handleDeletePending} />
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ label, value, highlight }: { label: string; value: number; highlight?: 'positive' | 'negative' }) {
  let color = '#111';
  if (highlight === 'positive') color = '#0a7a3c';
  if (highlight === 'negative') color = '#b00020';

  const text = value.toLocaleString(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  return (
    <div style={{ borderRadius: 12, border: '1px solid #eee', padding: '0.6rem 0.9rem', background: '#fff' }}>
      <div style={{ fontSize: 16, color: '#777', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 22, color }}>{text}</div>
    </div>
  );
}

function AccountList({ title, accounts, emptyMessage }: { title: string; accounts: AccountBalance[]; emptyMessage: string }) {
  const thStyle = { textAlign: 'left' as const, borderBottom: '1px solid #ddd', padding: '3px 4px' };
  const tdStyle = { padding: '3px 4px', borderBottom: '1px solid #f2f2f2' };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{title}</h3>
      {accounts.length === 0 && <p style={{ fontSize: 13, color: '#777' }}>{emptyMessage}</p>}
      {accounts.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th style={thStyle}>Account</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => {
              const label = acc.account_code ? `${acc.account_name} - ${acc.account_code}` : acc.account_name;
              return (
                <tr key={acc.account_id}>
                  <td style={tdStyle}>{label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {Number(acc.balance).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PendingList({ 
  title, 
  pending, 
  emptyMessage, 
  onMarkCleared, 
  onDelete 
}: { 
  title: string; 
  pending: PendingTransaction[]; 
  emptyMessage: string; 
  onMarkCleared: (p: PendingTransaction) => void; 
  onDelete: (p: PendingTransaction) => void 
}) {
  const thStyle = { textAlign: 'left' as const, borderBottom: '1px solid #ddd', padding: '3px 4px' };
  const tdStyle = { padding: '3px 4px', borderBottom: '1px solid #f2f2f2' };
  const btnStyle = { borderRadius: 999, border: '1px solid #ccc', padding: '2px 8px', background: '#f5f5f5', cursor: 'pointer', fontSize: 12 };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{title}</h3>
      {pending.length === 0 && <p style={{ fontSize: 13, color: '#777' }}>{emptyMessage}</p>}
      {pending.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th style={thStyle}>Account</th>
              <th style={thStyle}>Description</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pending.map((p) => {
              const accountCode = p.account_code ?? p.account_name;
              const jobName = p.job_name ?? '';
              const desc = p.description ?? '';
              const description = jobName && desc ? `${jobName} / ${desc}` : jobName || desc || '';
              const amountText = Number(p.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

              return (
                <tr key={p.line_id}>
                  <td style={tdStyle}>{accountCode}</td>
                  <td style={tdStyle}>{description}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{amountText}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button type="button" onClick={() => onMarkCleared(p)} style={{ ...btnStyle, marginRight: 4 }}>Cleared</button>
                    <button type="button" onClick={() => onDelete(p)} style={{ ...btnStyle, border: '1px solid #e09999', background: '#ffecec' }}>Remove</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}