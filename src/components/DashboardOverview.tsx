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
  accounts?: {
    name: string;
    account_types?: { name: string } | null;
  } | null;
};

type AccountWithBalance = AccountRow & { balance: number };

export function DashboardOverview() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [pendingCash, setPendingCash] = useState<LineRow[]>([]);
  const [pendingCard, setPendingCard] = useState<LineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadBalances() {
    setLoading(true);
    setError(null);

    try {
      // 1) Load all accounts with their types
      const { data: accountsData, error: accountsErr } = await supabase
        .from('accounts')
        .select('id, name, code, account_types(name)');

      if (accountsErr) throw accountsErr;

      const rawAccounts: AccountRow[] = (accountsData ?? []) as any[];

      // 2) Load all lines with account + account type joined
      const { data: linesData, error: linesErr } = await supabase
        .from('transaction_lines')
        .select(
          `
            id,
            account_id,
            amount,
            is_cleared,
            transaction_id,
            accounts (
              name,
              account_types (name)
            )
          `
        );

      if (linesErr) throw linesErr;

      const rawLines: LineRow[] = (linesData ?? []) as any[];

      // 3) Sum amounts per account_id with different rules for assets vs liabilities
      const sums: Record<number, number> = {};
      for (const line of rawLines) {
        const accType = line.accounts?.account_types?.name;
        const isAsset = accType === 'asset';
        const isLiability = accType === 'liability';

        // - Assets: include cleared + pending
        // - Liabilities: cleared only
        // - Everything else: cleared only
        const shouldCount =
          (isAsset && !Number.isNaN(line.amount)) ||
          (isLiability && line.is_cleared) ||
          (!isAsset && !isLiability && line.is_cleared);

        if (!shouldCount) continue;

        const current = sums[line.account_id] ?? 0;
        sums[line.account_id] = current + Number(line.amount);
      }

      const withBalances: AccountWithBalance[] = rawAccounts.map((a) => ({
        ...a,
        balance: sums[a.id] ?? 0,
      }));

      setAccounts(withBalances);

      // 4) Derive pending lists
      const pendingCashLines = rawLines.filter((l) => {
        const typeName = l.accounts?.account_types?.name;
        return typeName === 'asset' && !l.is_cleared;
      });

      const pendingCardLines = rawLines.filter((l) => {
        const typeName = l.accounts?.account_types?.name;
        return typeName === 'liability' && !l.is_cleared;
      });

      setPendingCash(pendingCashLines);
      setPendingCard(pendingCardLines);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load balances');
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBalances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleMarkCleared(line: LineRow) {
    setError(null);

    try {
      // Ask for final cleared amount. Default to current (abs) amount.
      const defaultValue = Math.abs(Number(line.amount)).toFixed(2);
      const input = window.prompt(
        'Final cleared amount (tip included). Leave blank to keep the current amount.',
        defaultValue
      );

      // If user clicked Cancel, do nothing
      if (input === null) {
        return;
      }

      let finalAmount = Number(line.amount);

      if (input.trim() !== '') {
        const parsed = Number(input.trim());
        if (Number.isNaN(parsed) || parsed <= 0) {
          alert('Invalid amount. Please use a positive number like 58.15');
          return;
        }

        // Preserve original sign (negative for charges, positive for deposits)
        const sign = Number(line.amount) < 0 ? -1 : 1;
        finalAmount = parsed * sign;
      }

      const absFinal = Math.abs(finalAmount);

      // Load all lines for this transaction so we can:
      //  - mark ALL of them cleared
      //  - keep double-entry balanced by updating both sides
      const { data: siblingData, error: siblingErr } = await supabase
        .from('transaction_lines')
        .select('id, amount')
        .eq('transaction_id', line.transaction_id);

      if (siblingErr) throw siblingErr;

      const siblings: { id: number; amount: number }[] =
        (siblingData ?? []) as any[];

      // Build updates for each row
      const updates = siblings.map((row) => {
        if (row.id === line.id) {
          // This is the bank/card line the user clicked
          return {
            id: row.id,
            amount: finalAmount,
          };
        }

        // Other side(s): keep original sign, but match the new absolute amount
        const otherSign = Number(row.amount) < 0 ? -1 : 1;
        return {
          id: row.id,
          amount: absFinal * otherSign,
        };
      });

      // Apply updates one by one (safer than upsert here)
      for (const u of updates) {
        const { error: updateErr } = await supabase
          .from('transaction_lines')
          .update({
            amount: u.amount,
            is_cleared: true,
          })
          .eq('id', u.id);

        if (updateErr) throw updateErr;
      }

      await loadBalances();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to mark line cleared');
    }
  }

  if (loading) {
    return <p>Loading balances…</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>Error: {error}</p>;
  }

  const cashAccounts = accounts.filter(
    (a) => a.account_types?.name === 'asset'
  );
  const cardAccounts = accounts.filter(
    (a) => a.account_types?.name === 'liability'
  );

  const totalCash = cashAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalCard = cardAccounts.reduce((sum, a) => sum + a.balance, 0);

  const pendingCashTotal = pendingCash.reduce(
    (sum, l) => sum + Number(l.amount),
    0
  );
  const pendingCardTotal = pendingCard.reduce(
    (sum, l) => sum + Number(l.amount),
    0
  );

  const netPosition = totalCash - totalCard;

  return (
    <div>
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
        <SummaryCard
          label="Pending Bank Transactions"
          value={pendingCashTotal}
        />
        <SummaryCard
          label="Pending Card Transactions"
          value={pendingCardTotal}
        />
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
            lines={pendingCash}
            emptyMessage="No pending bank transactions."
            onMarkCleared={handleMarkCleared}
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
            lines={pendingCard}
            emptyMessage="No pending card transactions."
            onMarkCleared={handleMarkCleared}
          />
        </div>
      </div>
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
      <div style={{ fontSize: 12, color: '#777', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 16, color }}>{text}</div>
    </div>
  );
}

function AccountList({
  title,
  accounts,
  emptyMessage,
}: {
  title: string;
  accounts: AccountWithBalance[];
  emptyMessage: string;
}) {
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
              <th
                style={{
                  textAlign: 'left',
                  borderBottom: '1px solid #ddd',
                  padding: '3px 4px',
                }}
              >
                Account
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: '3px 4px',
                }}
              >
                Balance
              </th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((acc) => (
              <tr key={acc.id}>
                <td
                  style={{
                    padding: '3px 4px',
                    borderBottom: '1px solid #f2f2f2',
                  }}
                >
                  {acc.name}
                </td>
                <td
                  style={{
                    padding: '3px 4px',
                    textAlign: 'right',
                    borderBottom: '1px solid #f2f2f2',
                  }}
                >
                  {acc.balance.toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    minimumFractionDigits: 2,
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function PendingList({
  title,
  lines,
  emptyMessage,
  onMarkCleared,
}: {
  title: string;
  lines: LineRow[];
  emptyMessage: string;
  onMarkCleared: (line: LineRow) => void;
}) {
  return (
    <div className="card">
      <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{title}</h3>
      {lines.length === 0 && (
        <p style={{ fontSize: 13, color: '#777' }}>{emptyMessage}</p>
      )}
      {lines.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th
                style={{
                  textAlign: 'left',
                  borderBottom: '1px solid #ddd',
                  padding: '3px 4px',
                }}
              >
                Account
              </th>
              <th
                style={{
                  textAlign: 'right',
                  borderBottom: '1px solid #ddd',
                  padding: '3px 4px',
                }}
              >
                Amount
              </th>
              <th
                style={{
                  textAlign: 'center',
                  borderBottom: '1px solid #ddd',
                  padding: '3px 4px',
                }}
              >
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const accountName = line.accounts?.name ?? 'Unknown Account';
              const amountText = Number(line.amount).toLocaleString('en-US', {
                style: 'currency',
                currency: 'USD',
                minimumFractionDigits: 2,
              });

              return (
                <tr key={line.id}>
                  <td
                    style={{
                      padding: '3px 4px',
                      borderBottom: '1px solid #f2f2f2',
                    }}
                  >
                    {accountName}
                  </td>
                  <td
                    style={{
                      padding: '3px 4px',
                      textAlign: 'right',
                      borderBottom: '1px solid #f2f2f2',
                    }}
                  >
                    {amountText}
                  </td>
                  <td
                    style={{
                      padding: '3px 4px',
                      textAlign: 'center',
                      borderBottom: '1px solid #f2f2f2',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onMarkCleared(line)}
                      style={{
                        borderRadius: 999,
                        border: '1px solid #ccc',
                        padding: '2px 8px',
                        background: '#f5f5f5',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      Mark cleared
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
