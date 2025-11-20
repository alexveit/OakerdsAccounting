import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type ExpenseRow = {
  account_id: number;
  account_name: string;
  total: number;
};

type RawLine = {
  account_id: number;
  amount: number;
  is_cleared: boolean;
  accounts: {
    id: number;
    name: string;
    account_type_id: number;
  };
  transactions: {
    date: string;
  };
};

export function ExpenseByCategory() {
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  useEffect(() => {
    async function loadExpenses() {
      setLoading(true);
      setError(null);

      try {
        // 1) Find the id for the "expense" account type
        const { data: typeRow, error: typeErr } = await supabase
          .from('account_types')
          .select('id')
          .eq('name', 'expense')
          .maybeSingle();

        if (typeErr) throw typeErr;
        if (!typeRow) {
          throw new Error('Account type "expense" not found');
        }

        const expenseTypeId = (typeRow as { id: number }).id;

        // 2) Calculate the year date range
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        // 3) Load cleared expense lines for that year,
        //    joining to accounts + transactions so the DB does the filtering.
        const { data, error: lineErr } = await supabase
          .from('transaction_lines')
          .select(
            `
              account_id,
              amount,
              is_cleared,
              accounts!inner (
                id,
                name,
                account_type_id
              ),
              transactions!inner (
                date
              )
            `
          )
          .eq('is_cleared', true)
          .eq('accounts.account_type_id', expenseTypeId)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        if (lineErr) throw lineErr;

        const rawLines: RawLine[] = (data ?? []) as any[];

        // 4) Aggregate totals by account_id
        const totalsMap = new Map<number, { account_name: string; total: number }>();

        for (const line of rawLines) {
          const accountId = line.account_id;
          const accountName = line.accounts?.name ?? 'Unknown';

          if (!totalsMap.has(accountId)) {
            totalsMap.set(accountId, { account_name: accountName, total: 0 });
          }

          const existing = totalsMap.get(accountId)!;
          existing.total += line.amount ?? 0;
        }

        // 5) Convert to array and sort by largest expense first
        const aggregated: ExpenseRow[] = Array.from(totalsMap.entries()).map(
          ([account_id, { account_name, total }]) => ({
            account_id,
            account_name,
            total,
          })
        );

        aggregated.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));

        setRows(aggregated);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load expense data');
        setLoading(false);
      }
    }

    loadExpenses();
  }, [year]);

  return (
    <div className="card">
      <h2>Expense by Category</h2>

      <label style={{ display: 'block', marginBottom: '1rem' }}>
        Year:{' '}
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {Array.from({ length: 6 }).map((_, i) => {
            const y = currentYear - i;
            return (
              <option key={y} value={y}>
                {y}
              </option>
            );
          })}
        </select>
      </label>

      {loading && <p>Loading…</p>}
      {error && <p style={{ color: 'red' }}>Error: {error}</p>}
      {!loading && !error && rows.length === 0 && (
        <p>No data for {year}.</p>
      )}

      {rows.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ccc' }}>
                Category
              </th>
              <th style={{ textAlign: 'right', borderBottom: '1px solid #ccc' }}>
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.account_id}>
                <td
                  style={{
                    borderBottom: '1px solid #eee',
                    padding: '6px 4px',
                  }}
                >
                  {r.account_name}
                </td>
                <td
                  style={{
                    textAlign: 'right',
                    borderBottom: '1px solid #eee',
                    padding: '6px 4px',
                  }}
                >
                  {r.total.toLocaleString('en-US', {
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
