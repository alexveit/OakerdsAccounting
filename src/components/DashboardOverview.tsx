import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type AccountRow = {
  id: number;
  name: string;
  code: string | null;
  account_types: { name: string } | null;
};

type LineRow = {
  id: number;
  account_id: number;
  amount: number;
  is_cleared: boolean;
  transaction_id: number;
  purpose: string | null;
  accounts?: { name: string; code: string | null; account_types?: { name: string } | null } | null;
  transactions?: { date: string; description: string | null } | null;
  jobs?: { name: string } | null;
};

type AccountWithBalance = AccountRow & { balance: number };

export function DashboardOverview() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [pendingCash, setPendingCash] = useState<LineRow[]>([]);
  const [pendingCard, setPendingCard] = useState<LineRow[]>([]);
  const [jobGrossYtd, setJobGrossYtd] = useState(0);
  const [rentGrossYtd, setRentGrossYtd] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load all accounts and transaction lines, calculate balances, extract pending transactions, and compute YTD income
  async function loadBalances() {
    setLoading(true);
    setError(null);

    try {
      // Fetch all accounts with their type information
      const { data: accountsData, error: accountsErr } = await supabase
        .from('accounts')
        .select('id, name, code, account_types(name)');
      if (accountsErr) throw accountsErr;

      const rawAccounts: AccountRow[] = (accountsData ?? []) as any[];

      // Fetch all transaction lines with related account, transaction, and job data
      const { data: linesData, error: linesErr } = await supabase
        .from('transaction_lines')
        .select(`id, account_id, amount, is_cleared, transaction_id, purpose, accounts (name, code, account_types (name)), transactions (date, description), jobs (name)`);
      if (linesErr) throw linesErr;

      const rawLines: LineRow[] = (linesData ?? []) as any[];

      // Calculate balances: assets include pending, liabilities/other only include cleared
      const sums: Record<number, number> = {};
      for (const line of rawLines) {
        const accType = line.accounts?.account_types?.name;
        const isAsset = accType === 'asset';
        const isLiability = accType === 'liability';
        const shouldCount = (isAsset && !Number.isNaN(line.amount)) || (isLiability && line.is_cleared) || (!isAsset && !isLiability && line.is_cleared);
        if (!shouldCount) continue;
        sums[line.account_id] = (sums[line.account_id] ?? 0) + Number(line.amount);
      }

      // Attach calculated balances to accounts
      const withBalances: AccountWithBalance[] = rawAccounts.map((a) => ({ ...a, balance: sums[a.id] ?? 0 }));
      setAccounts(withBalances);

      // Extract pending (uncleared) transactions for assets and liabilities
      setPendingCash(rawLines.filter((l) => l.accounts?.account_types?.name === 'asset' && !l.is_cleared));
      setPendingCard(rawLines.filter((l) => l.accounts?.account_types?.name === 'liability' && !l.is_cleared));

      // Compute Income Snapshot: Job/Rent gross YTD for business income only (cleared transactions)
      const currentYear = new Date().getFullYear();
      let jobYtd = 0;
      let rentYtd = 0;

      for (const line of rawLines) {
        const accType = line.accounts?.account_types?.name;
        if (accType !== 'income' || !line.is_cleared) continue;

        const purpose = line.purpose ?? 'business';
        if (purpose !== 'business') continue;

        const dateStr = line.transactions?.date;
        if (!dateStr) continue;

        const lineYear = new Date(dateStr + 'T00:00:00').getFullYear();
        if (lineYear !== currentYear) continue;

        const incomeAccountName = line.accounts?.name ?? '';
        const amt = Math.abs(Number(line.amount));

        if (incomeAccountName === 'Income - Job') jobYtd += amt;
        else if (incomeAccountName === 'Income - Rental') rentYtd += amt;
      }

      setJobGrossYtd(jobYtd);
      setRentGrossYtd(rentYtd);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load balances');
      setLoading(false);
    }
  }

  useEffect(() => { loadBalances(); }, []);

  // Mark a pending transaction as cleared, optionally updating the amount (e.g., to include tip)
  async function handleMarkCleared(line: LineRow) {
    setError(null);
    try {
      // Prompt user for final cleared amount
      const defaultValue = Math.abs(Number(line.amount)).toFixed(2);
      const input = window.prompt('Final cleared amount (tip included). Leave blank to keep the current amount.', defaultValue);
      if (input === null) return;

      let finalAmount = Number(line.amount);
      if (input.trim() !== '') {
        const parsed = Number(input.trim());
        if (Number.isNaN(parsed) || parsed <= 0) {
          alert('Invalid amount. Please use a positive number like 58.15');
          return;
        }
        const sign = Number(line.amount) < 0 ? -1 : 1;
        finalAmount = parsed * sign;
      }

      const absFinal = Math.abs(finalAmount);

      // Fetch all lines in this transaction to maintain double-entry balance
      const { data: siblingData, error: siblingErr } = await supabase
        .from('transaction_lines')
        .select('id, amount')
        .eq('transaction_id', line.transaction_id);
      if (siblingErr) throw siblingErr;

      const siblings: { id: number; amount: number }[] = (siblingData ?? []) as any[];

      // Update clicked line with new amount, update other lines to maintain balance
      const updates = siblings.map((row) => {
        if (row.id === line.id) return { id: row.id, amount: finalAmount };
        const otherSign = Number(row.amount) < 0 ? -1 : 1;
        return { id: row.id, amount: absFinal * otherSign };
      });

      // Mark all lines in transaction as cleared with updated amounts
      for (const u of updates) {
        const { error: updateErr } = await supabase
          .from('transaction_lines')
          .update({ amount: u.amount, is_cleared: true })
          .eq('id', u.id);
        if (updateErr) throw updateErr;
      }

      await loadBalances();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to mark line cleared');
    }
  }

  // Delete a pending transaction entirely (both sides of double-entry)
  async function handleDeletePending(line: LineRow) {
    if (!window.confirm('Remove this pending transaction (both sides) from the database?')) return;

    try {
      // Delete all transaction lines for this transaction
      const { error: deleteLinesErr } = await supabase.from('transaction_lines').delete().eq('transaction_id', line.transaction_id);
      if (deleteLinesErr) throw deleteLinesErr;

      // Delete the parent transaction record
      const { error: deleteTxnErr } = await supabase.from('transactions').delete().eq('id', line.transaction_id);
      if (deleteTxnErr) throw deleteTxnErr;

      await loadBalances();
    } catch (err: any) {
      console.error('Error deleting pending transaction', err);
      window.alert(err.message ?? 'Failed to delete pending transaction.');
    }
  }

  if (loading) return <p>Loading balances…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  // Separate accounts by type and calculate totals
  const cashAccounts = accounts.filter((a) => a.account_types?.name === 'asset');
  const cardAccounts = accounts.filter((a) => a.account_types?.name === 'liability');
  const totalCash = cashAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalCard = cardAccounts.reduce((sum, a) => sum + a.balance, 0);
  const pendingCashTotal = pendingCash.reduce((sum, l) => sum + Number(l.amount), 0);
  const pendingCardTotal = pendingCard.reduce((sum, l) => sum + Number(l.amount), 0);
  const netPosition = totalCash + totalCard;
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
          <PendingList title="Pending Bank Transactions" lines={pendingCash} emptyMessage="No pending bank transactions." onMarkCleared={handleMarkCleared} onDelete={handleDeletePending} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <AccountList title="Cards & Loans" accounts={cardAccounts} emptyMessage="No liability accounts found." />
          <PendingList title="Pending Card Transactions" lines={pendingCard} emptyMessage="No pending card transactions." onMarkCleared={handleMarkCleared} onDelete={handleDeletePending} />
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

function AccountList({ title, accounts, emptyMessage }: { title: string; accounts: AccountWithBalance[]; emptyMessage: string }) {
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
              const label = acc.code ? `${acc.name} - ${acc.code}` : acc.name;
              return (
                <tr key={acc.id}>
                  <td style={tdStyle}>{label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {acc.balance.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
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

function PendingList({ title, lines, emptyMessage, onMarkCleared, onDelete }: { title: string; lines: LineRow[]; emptyMessage: string; onMarkCleared: (line: LineRow) => void; onDelete: (line: LineRow) => void }) {
  const thStyle = { textAlign: 'left' as const, borderBottom: '1px solid #ddd', padding: '3px 4px' };
  const tdStyle = { padding: '3px 4px', borderBottom: '1px solid #f2f2f2' };
  const btnStyle = { borderRadius: 999, border: '1px solid #ccc', padding: '2px 8px', background: '#f5f5f5', cursor: 'pointer', fontSize: 12 };

  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{title}</h3>
      {lines.length === 0 && <p style={{ fontSize: 13, color: '#777' }}>{emptyMessage}</p>}
      {lines.length > 0 && (
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
            {lines.map((line) => {
              const accountCode = line.accounts?.code ?? line.accounts?.name ?? 'Unknown';
              const jobName = line.jobs?.name ?? '';
              const desc = line.transactions?.description ?? '';
              const description = jobName && desc ? `${jobName} / ${desc}` : jobName || desc || '';
              const amountText = Number(line.amount).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

              return (
                <tr key={line.id}>
                  <td style={tdStyle}>{accountCode}</td>
                  <td style={tdStyle}>{description}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>{amountText}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>
                    <button type="button" onClick={() => onMarkCleared(line)} style={{ ...btnStyle, marginRight: 4 }}>Cleared</button>
                    <button type="button" onClick={() => onDelete(line)} style={{ ...btnStyle, border: '1px solid #e09999', background: '#ffecec' }}>Remove</button>
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