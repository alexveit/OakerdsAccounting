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
  updated_at: string;
  job_name: string | null;
};

type YTDIncome = {
  year: number;
  income_account: string;
  total_income: number;
};

type YTDExpense = {
  year: number;
  expense_segment: string;
  total_expense: number;
};

export function DashboardOverview() {
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [ytdIncome, setYtdIncome] = useState<YTDIncome[]>([]);
  const [ytdExpense, setYtdExpense] = useState<YTDExpense[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Clear-transaction modal state
  const [clearOpen, setClearOpen] = useState(false);
  const [clearTarget, setClearTarget] = useState<PendingTransaction | null>(null);
  const [clearAmount, setClearAmount] = useState<string>('');
  const [clearDate, setClearDate] = useState<string>('');
  const [clearDescription, setClearDescription] = useState<string>('');
  const [clearError, setClearError] = useState<string | null>(null);

  // Load dashboard data from live views
  async function loadDashboardData() {
    setLoading(true);
    setError(null);

    try {
      const currentYear = new Date().getFullYear();

      // Account balances
      const { data: balancesData, error: balancesErr } = await supabase
        .from('account_balances_v')
        .select('*');

      if (balancesErr) throw balancesErr;
      setAccountBalances((balancesData ?? []) as AccountBalance[]);

      // Pending transactions
      const { data: pendingData, error: pendingErr } = await supabase
        .from('pending_transactions_v')
        .select('*');

      if (pendingErr) throw pendingErr;
      setPendingTransactions((pendingData ?? []) as PendingTransaction[]);

      // YTD income
      const { data: incomeData, error: incomeErr } = await supabase
        .from('ytd_income_v')
        .select('*')
        .eq('year', currentYear);

      if (incomeErr) throw incomeErr;
      setYtdIncome((incomeData ?? []) as YTDIncome[]);

      // YTD expenses
      const { data: expenseData, error: expenseErr } = await supabase
        .from('ytd_expense_v')
        .select('*')
        .eq('year', currentYear);

      if (expenseErr) throw expenseErr;
      setYtdExpense((expenseData ?? []) as YTDExpense[]);

      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load dashboard data');
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  // Open the clear-transaction modal with defaults
  function handleMarkCleared(pending: PendingTransaction) {
    setError(null);
    setClearError(null);
    setClearTarget(pending);

    const defaultAmount = Math.abs(Number(pending.amount)).toFixed(2);
    const todayISO = new Date().toISOString().slice(0, 10);

    setClearDate(pending.transaction_date || todayISO);
    setClearDescription(pending.description ?? '');
    setClearAmount(defaultAmount);
    
    setClearOpen(true);
  }

  // Confirm clear: validate and call RPC
  async function confirmClear() {
    if (!clearTarget) return;

    try {
      setClearError(null);
      setError(null);

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
        // blank => keep existing transaction.date
        newDate = null;
      }

      // ----- Description handling -----
      let newDescription: string | null = null;
      const descTrim = clearDescription.trim();
      if (descTrim !== '') {
        newDescription = descTrim;
      } else {
        // blank => keep existing description
        newDescription = null;
      }

      const { data, error: rpcErr } = await supabase.rpc('mark_transaction_cleared', {
        p_transaction_id: clearTarget.transaction_id,
        p_clicked_line_id: clearTarget.line_id,
        p_new_amount: finalAmount,
        p_new_date: newDate,
        p_new_description: newDescription,
      });

      if (rpcErr) throw rpcErr;
      console.log('Transaction marked cleared:', data);

      // Close modal, reset local state, reload dashboard
      setClearOpen(false);
      setClearTarget(null);
      setClearAmount('');
      setClearDate('');
      setClearDescription('');
      setClearError(null);

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
      if (a.account_id === 1) return -1;
      if (b.account_id === 1) return 1;

      const codeA = a.account_code || a.account_name;
      const codeB = b.account_code || b.account_name;
      return codeA.localeCompare(codeB);
    });
  };

  // Separate accounts by type and apply custom sort
  const cashAccounts = sortAccounts(accountBalances.filter(a => a.account_type === 'asset'));
  const cardAccounts = sortAccounts(accountBalances.filter(a => a.account_type === 'liability'));

  // Calculate totals
  const totalCash = cashAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalCard = cardAccounts.reduce((sum, a) => sum + Number(a.balance), 0);

  // Separate pending by type
  const pendingCash = pendingTransactions.filter(p => p.account_type === 'asset');
  const pendingCard = pendingTransactions.filter(p => p.account_type === 'liability');

  const pendingCashTotal = pendingCash.reduce((sum, p) => sum + Number(p.amount), 0);
  const pendingCardTotal = pendingCard.reduce((sum, p) => sum + Number(p.amount), 0);

  const netPosition = totalCash - totalCard;

  // Extract YTD income
  const jobGrossYtd =
    ytdIncome.find(i => i.income_account === 'Income - Job')?.total_income ?? 0;
  const rentGrossYtd =
    ytdIncome.find(i => i.income_account === 'Income - Rental')?.total_income ?? 0;
  const totalGrossYtd = jobGrossYtd + rentGrossYtd;

  // Extract YTD expenses
  const contractingExpYtd =
    ytdExpense.find(e => e.expense_segment === 'Contracting Business')?.total_expense ?? 0;
  const rentalExpYtd =
    ytdExpense.find(e => e.expense_segment === 'Rental Operations')?.total_expense ?? 0;
  const personalExpYtd =
    ytdExpense.find(e => e.expense_segment === 'Personal')?.total_expense ?? 0;
  const totalExpYtd = contractingExpYtd + rentalExpYtd + personalExpYtd;

  // Optional: business net before personal
  const businessNetYtd =
    jobGrossYtd + rentGrossYtd - contractingExpYtd - rentalExpYtd;

  return (
    <div>
      {/* Income Snapshot */}
      <h2>Gross YTD Income Snapshot</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <SummaryCard label="Contracting" value={jobGrossYtd} />
        <SummaryCard label="Rent" value={rentGrossYtd} />
        <SummaryCard label="Total" value={totalGrossYtd} />
      </div>

      {/* Expense Snapshot */}
      <h2>YTD Expense Snapshot</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <SummaryCard label="Contracting" value={contractingExpYtd} />
        <SummaryCard label="Rental" value={rentalExpYtd} />
        <SummaryCard label="Personal" value={personalExpYtd} />
        <SummaryCard label="Total" value={totalExpYtd} />
        {/* Optional: uncomment if you want a quick business net card */}
        {/* <SummaryCard
          label="Business Net (Income - Contracting - Rental)"
          value={businessNetYtd}
          highlight={businessNetYtd >= 0 ? 'positive' : 'negative'}
        /> */}
      </div>

      {/* Balances Overview */}
      <h2>Balances Overview</h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <SummaryCard label="Total Cash / Bank" value={totalCash} />
        <SummaryCard label="Total Cards / Loans" value={totalCard} />
        <SummaryCard label="Pending Bank Transactions" value={pendingCashTotal} />
        <SummaryCard label="Pending Card Transactions" value={pendingCardTotal} />
        <SummaryCard
          label="Net Position (Cash - Cards)"
          value={netPosition}
          highlight={netPosition >= 0 ? 'positive' : 'negative'}
        />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <AccountList
            title="Cash & Bank Accounts"
            accounts={cashAccounts}
            emptyMessage="No asset accounts found."
          />
          <PendingList
            title="Pending Bank Transactions"
            pending={pendingCash}
            emptyMessage="No pending bank transactions."
            onMarkCleared={handleMarkCleared}
            onDelete={handleDeletePending}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <AccountList
            title="Cards & Loans"
            accounts={cardAccounts}
            emptyMessage="No liability accounts found."
          />
          <PendingList
            title="Pending Card Transactions"
            pending={pendingCard}
            emptyMessage="No pending card transactions."
            onMarkCleared={handleMarkCleared}
            onDelete={handleDeletePending}
          />
        </div>
      </div>

      {/* Clear-transaction modal */}
      {clearOpen && clearTarget && (
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
                <strong>Account:</strong>{' '}
                {clearTarget.account_code ?? clearTarget.account_name}
              </div>
              <div>
                <strong>Job:</strong>{' '}
                {clearTarget.job_name ?? '(none)'}
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
                onClick={() => void confirmClear()}
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

function SummaryCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: 'positive' | 'negative';
}) {
  let color = '#111';
  if (highlight === 'positive') color = '#0a7a3c';
  if (highlight === 'negative') color = '#b00020';

  const text = value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid #eee',
        padding: '0.6rem 0.9rem',
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 16, color: '#777', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 22, color }}>{text}</div>
    </div>
  );
}

function AccountList({
  title,
  accounts,
  emptyMessage,
}: {
  title: string;
  accounts: AccountBalance[];
  emptyMessage: string;
}) {
  const thStyle = {
    textAlign: 'left' as const,
    borderBottom: '1px solid #ddd',
    padding: '3px 4px',
  };
  const tdStyle = { padding: '3px 4px', borderBottom: '1px solid #f2f2f2' };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{title}</h3>
      {accounts.length === 0 && (
        <p style={{ fontSize: 13, color: '#777' }}>{emptyMessage}</p>
      )}
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
              const label = acc.account_code
                ? `${acc.account_name} - ${acc.account_code}`
                : acc.account_name;
              return (
                <tr key={acc.account_id}>
                  <td style={tdStyle}>{label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {Number(acc.balance).toLocaleString('en-US', {
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
  );
}

function PendingList({
  title,
  pending,
  emptyMessage,
  onMarkCleared,
  onDelete,
}: {
  title: string;
  pending: PendingTransaction[];
  emptyMessage: string;
  onMarkCleared: (p: PendingTransaction) => void;
  onDelete: (p: PendingTransaction) => void;
}) {
  const thStyle = {
    textAlign: 'left' as const,
    borderBottom: '1px solid #ddd',
    padding: '3px 4px',
  };
  const tdStyle = { padding: '3px 4px', borderBottom: '1px solid #f2f2f2' };
  const btnStyle = {
    borderRadius: 999,
    border: '1px solid #ccc',
    padding: '2px 8px',
    background: '#f5f5f5',
    cursor: 'pointer',
    fontSize: 12,
  };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{title}</h3>
      {pending.length === 0 && (
        <p style={{ fontSize: 13, color: '#777' }}>{emptyMessage}</p>
      )}
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
              const description =
                jobName && desc ? `${jobName} / ${desc}` : jobName || desc || '';
              const amountText = Number(p.amount).toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
              });

              return (
                <tr key={p.line_id}>
                  <td style={tdStyle}>{accountCode}</td>
                  <td style={tdStyle}>{description}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{amountText}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button
                      type="button"
                      onClick={() => onMarkCleared(p)}
                      style={{ ...btnStyle, marginRight: 4 }}
                    >
                      Cleared
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(p)}
                      style={{
                        border: 'none',
                        background: 'transparent',
                        cursor: 'pointer',
                        padding: '0 4px',
                        fontSize: 14,
                        color: '#b00020',
                      }}
                      title="Remove"
                    >
                      ×
                    </button>
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
