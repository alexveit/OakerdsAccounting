import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';
import { getDayOfYearForYear } from '../../utils/date';
import { isMarketingExpenseCode, isRentalExpenseCode, isFlipExpenseCode, isPersonalREExpenseCode } from '../../utils/accounts';

type RawLine = {
  id: number;
  account_id: number;
  amount: number;
  is_cleared: boolean;
  purpose: string | null;
  job_id: number | null;
  accounts: {
    name: string;
    code: string | null;
    account_types: { name: string } | null;
  } | null;
  transactions: { date: string } | null;
};

type GroupKey = 'job' | 'marketing' | 'rental' | 'flip' | 'overhead' | 'personalRE' | 'other';

type CategoryTotals = {
  accountId: number;
  accountName: string;
  monthly: number[];   // 12 months
  quarterly: number[]; // 4 quarters
  total: number;       // year total
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

function createEmptyMonthly(): number[] {
  return new Array(12).fill(0);
}

export function CategoriesSummaryView() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [lines, setLines] = useState<RawLine[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Load CLEARED expense lines for selected year
  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);

      try {
        const startDate = `${year}-01-01`;
        const endDate = `${year}-12-31`;

        const { data, error: lineErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            account_id,
            amount,
            is_cleared,
            purpose,
            job_id,
            accounts (
              name,
              code,
              account_types (name)
            ),
            transactions!inner (date)
          `)
          .eq('is_cleared', true)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        if (lineErr) throw lineErr;

        setLines((data ?? []) as unknown as RawLine[]);
        setLoading(false);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load category summary');
        setLoading(false);
      }
    }

    load();
  }, [year]);

  const grouped = useMemo<{
    job: CategoryTotals[];
    marketing: CategoryTotals[];
    rental: CategoryTotals[];
    flip: CategoryTotals[];
    overhead: CategoryTotals[];
    personalRE: CategoryTotals[];
    other: CategoryTotals[];
  }>(() => {
    const maps: Record<GroupKey, Map<number, CategoryTotals>> = {
      job: new Map(),
      marketing: new Map(),
      rental: new Map(),
      flip: new Map(),
      overhead: new Map(),
      personalRE: new Map(),
      other: new Map(),
    };

    for (const line of lines) {
      const accType = line.accounts?.account_types?.name;
      if (accType !== 'expense') continue;

      const dateStr = line.transactions?.date;
      if (!dateStr) continue;
      const d = new Date(dateStr + 'T00:00:00');
      if (Number.isNaN(d.getTime())) continue;
      const monthIndex = d.getMonth();

      const amt = Number(line.amount) || 0;

      const purpose = line.purpose ?? 'business';
      const isBusiness = purpose === 'business' || purpose === 'mixed';
      const isPersonal = purpose === 'personal';

      const code = line.accounts?.code ?? '';

      let group: GroupKey | null = null;

      if (isPersonalREExpenseCode(code)) {
        group = 'personalRE';
      } else if (isPersonal) {
        group = 'other';
      } else if (isBusiness && isFlipExpenseCode(code)) {
        group = 'flip';
      } else if (isBusiness && isRentalExpenseCode(code)) {
        group = 'rental';
      } else if (isBusiness && line.job_id !== null) {
        group = 'job';
      } else if (isBusiness && isMarketingExpenseCode(code)) {
        group = 'marketing';
      } else if (isBusiness) {
        group = 'overhead';
      }

      if (!group) continue;

      const map = maps[group];
      const accountId = line.account_id;
      const accountName = line.accounts?.name ?? 'Unknown';

      let cat = map.get(accountId);
      if (!cat) {
        cat = {
          accountId,
          accountName,
          monthly: createEmptyMonthly(),
          quarterly: [0, 0, 0, 0],
          total: 0,
        };
        map.set(accountId, cat);
      }

      cat.monthly[monthIndex] += amt;
      cat.total += amt;
    }

    // Compute quarter totals and sort by descending total inside each group
    const finalizeGroup = (map: Map<number, CategoryTotals>): CategoryTotals[] => {
      const arr = Array.from(map.values());

      for (const c of arr) {
        const m = c.monthly;
        c.quarterly[0] = m[0] + m[1] + m[2];
        c.quarterly[1] = m[3] + m[4] + m[5];
        c.quarterly[2] = m[6] + m[7] + m[8];
        c.quarterly[3] = m[9] + m[10] + m[11];
      }

      arr.sort((a, b) => b.total - a.total);
      return arr;
    };

    return {
      job: finalizeGroup(maps.job),
      marketing: finalizeGroup(maps.marketing),
      rental: finalizeGroup(maps.rental),
      flip: finalizeGroup(maps.flip),
      overhead: finalizeGroup(maps.overhead),
      personalRE: finalizeGroup(maps.personalRE),
      other: finalizeGroup(maps.other),
    };
  }, [lines]);

  const currency = (value: number) => formatCurrency(value, 2);

  function renderGroupTable(title: string, categories: CategoryTotals[]) {
    const dayOfYear = getDayOfYearForYear(year);
    const daysPerMonth = 30.42;

    if (categories.length === 0) {
      return (
        <div className="card expenses-summary__card">
          <h3 className="expenses-summary__card-title">{title}</h3>
          <p className="expenses-summary__empty">
            No expenses in this group for the selected year.
          </p>
        </div>
      );
    }

    // Group total (sum of all category totals)
    const groupTotal = categories.reduce((sum, c) => sum + c.total, 0);

    // Monthly and quarterly run-rate averages per account
    let monthlyAvg: number[] = [];
    let quarterlyAvg: number[] = [];
    if (dayOfYear) {
      monthlyAvg = categories.map((c) => {
        const totalYTD = c.monthly.reduce((s, v) => s + v, 0);
        const daily = totalYTD / dayOfYear;
        return daily * daysPerMonth;
      });
      quarterlyAvg = monthlyAvg.map((v) => v * 3);
    } else {
      monthlyAvg = categories.map(() => 0);
      quarterlyAvg = categories.map(() => 0);
    }

    const monthRows: { label: string; values: number[] }[] = [];
    MONTH_LABELS.forEach((label, idx) => {
      monthRows.push({
        label,
        values: categories.map((c) => c.monthly[idx] || 0),
      });
    });

    const quarterRows: { label: string; values: number[] }[] = [];
    QUARTER_LABELS.forEach((label, idx) => {
      quarterRows.push({
        label,
        values: categories.map((c) => c.quarterly[idx] || 0),
      });
    });

    const totalRow = {
      label: 'Total',
      values: categories.map((c) => c.total),
    };

    return (
      <div className="card expenses-summary__card">
        {/* Header with group total */}
        <h3 className="expenses-summary__card-header">
          <span>{title}</span>
          <span className="expenses-summary__card-total">
            {currency(groupTotal)}
          </span>
        </h3>

        <div className="expenses-summary__scroll">
          <table className="table expenses-summary-table">
            <thead>
              <tr>
                <th className="left">Month</th>
                {categories.map((c) => (
                  <th key={c.accountId}>
                    {c.accountName}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Month rows */}
              {monthRows.map((row) => (
                <tr key={row.label}>
                  <td className="row-header">{row.label}</td>
                  {row.values.map((v, idx) => (
                    <td key={idx}>
                      {currency(v)}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Monthly average row */}
              <tr className="avg-row">
                <td className="row-header">
                  Avg
                </td>
                {monthlyAvg.map((v, idx) => (
                  <td key={idx}>
                    {currency(v)}
                  </td>
                ))}
              </tr>

              {/* Spacer between months and quarters */}
              <tr className="spacer-row">
                <td colSpan={categories.length + 1} />
              </tr>

              {/* Quarter rows */}
              {quarterRows.map((row) => (
                <tr key={row.label}>
                  <td className="row-header">{row.label}</td>
                  {row.values.map((v, idx) => (
                    <td key={idx}>
                      {currency(v)}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Quarterly average row */}
              <tr className="avg-row">
                <td className="row-header">
                  Avg
                </td>
                {quarterlyAvg.map((v, idx) => (
                  <td key={idx}>
                    {currency(v)}
                  </td>
                ))}
              </tr>

              {/* Total row */}
              <tr className="total-row">
                <td className="row-header">
                  Total
                </td>
                {totalRow.values.map((v, idx) => (
                  <td key={idx}>
                    {currency(v)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (loading) return <p>Loading category summary...</p>;
  if (error) return <p className="text-error">Error: {error}</p>;

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div>
      <div className="expenses-summary__controls">
        <span className="expenses-summary__label">Year:</span>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="expenses-summary__year-select"
        >
          {yearOptions.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {renderGroupTable('Job Expenses', grouped.job)}
      {renderGroupTable('Marketing Expenses', grouped.marketing)}
      {renderGroupTable('Overhead Expenses', grouped.overhead)}
      {renderGroupTable('Rental Expenses', grouped.rental)}
      {renderGroupTable('Flip Expenses', grouped.flip)}
      {renderGroupTable('Personal RE Expenses', grouped.personalRE)}
      {renderGroupTable('Other Personal Expenses', grouped.other)}
    </div>
  );
}