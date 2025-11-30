import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/format';
import { getDayOfYearForYear } from '../utils/date';
import {
  isRentalIncomeCode,
  isRealEstateExpenseCode,
  isMarketingExpenseCode,
  type Purpose,
} from '../utils/accounts';

type RawLine = {
  id: number;
  account_id: number;
  amount: number;
  is_cleared: boolean;
  purpose: Purpose | null;
  job_id: number | null;
  accounts: {
    name: string;
    code: string | null;
    account_types: { name: string } | null;
  } | null;
  transactions: { date: string } | null;
};

type MonthlyBucket = {
  label: string;
  // Job (Schedule C - non-RE business)
  jobIncome: number;
  jobExpenses: number;
  jobProfit: number;
  // Real Estate (Schedule E)
  reIncome: number;
  reExpenses: number;
  reProfit: number;
  // Overhead (business expenses not tied to jobs or RE)
  marketing: number;
  overhead: number;
  // Derived
  taxableNet: number;
  // Personal
  personal: number;
  // Final
  trueNet: number;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function createEmptyBucket(label: string): MonthlyBucket {
  return {
    label,
    jobIncome: 0,
    jobExpenses: 0,
    jobProfit: 0,
    reIncome: 0,
    reExpenses: 0,
    reProfit: 0,
    marketing: 0,
    overhead: 0,
    taxableNet: 0,
    personal: 0,
    trueNet: 0,
  };
}

function createEmptyMonthBuckets(): MonthlyBucket[] {
  return MONTH_LABELS.map((label) => createEmptyBucket(label));
}

function deriveBucketTotals(bucket: MonthlyBucket): void {
  bucket.jobProfit = bucket.jobIncome - bucket.jobExpenses;
  bucket.reProfit = bucket.reIncome - bucket.reExpenses;
  bucket.taxableNet = bucket.jobProfit + bucket.reProfit - bucket.marketing - bucket.overhead;
  bucket.trueNet = bucket.taxableNet - bucket.personal;
}

export function ProfitSummary() {
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [lines, setLines] = useState<RawLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        setError(err instanceof Error ? err.message : 'Failed to load profit summary');
        setLoading(false);
      }
    }
    void load();
  }, [year]);

  // Calculate monthly buckets from cleared transactions
  const monthlyBuckets = useMemo<MonthlyBucket[]>(() => {
    const buckets = createEmptyMonthBuckets();

    for (const line of lines) {
      const accType = line.accounts?.account_types?.name;
      if (!accType) continue;

      const dateStr = line.transactions?.date;
      if (!dateStr) continue;
      const d = new Date(dateStr + 'T00:00:00');
      if (Number.isNaN(d.getTime())) continue;

      const monthIndex = d.getMonth();
      const bucket = buckets[monthIndex];
      if (!bucket) continue;

      const amt = Math.abs(Number(line.amount) || 0);
      const purpose: Purpose = line.purpose ?? 'business';
      const code = line.accounts?.code ?? '';

      const isBusiness = purpose === 'business' || purpose === 'mixed';
      const isPersonal = purpose === 'personal';

      // INCOME
      if (accType === 'income') {
        if (isBusiness) {
          if (isRentalIncomeCode(code)) {
            bucket.reIncome += amt;
          } else {
            bucket.jobIncome += amt;
          }
        }
        // Personal income not tracked in P&L
      }

      // EXPENSES
      else if (accType === 'expense') {
        if (isPersonal) {
          bucket.personal += amt;
        } else if (isBusiness) {
          if (isRealEstateExpenseCode(code)) {
            bucket.reExpenses += amt;
          } else if (line.job_id !== null) {
            bucket.jobExpenses += amt;
          } else if (isMarketingExpenseCode(code)) {
            bucket.marketing += amt;
          } else {
            bucket.overhead += amt;
          }
        }
      }
    }

    // Derive dependent fields
    for (const bucket of buckets) {
      deriveBucketTotals(bucket);
    }

    return buckets;
  }, [lines]);

  // Aggregate monthly buckets into quarterly totals
  const quarterlyBuckets = useMemo<MonthlyBucket[]>(() => {
    const quarters: MonthlyBucket[] = [
      createEmptyBucket('Q1'),
      createEmptyBucket('Q2'),
      createEmptyBucket('Q3'),
      createEmptyBucket('Q4'),
    ];

    monthlyBuckets.forEach((m, i) => {
      const qIndex = Math.floor(i / 3);
      const q = quarters[qIndex];

      q.jobIncome += m.jobIncome;
      q.jobExpenses += m.jobExpenses;
      q.reIncome += m.reIncome;
      q.reExpenses += m.reExpenses;
      q.marketing += m.marketing;
      q.overhead += m.overhead;
      q.personal += m.personal;
    });

    // Derive totals for each quarter
    for (const q of quarters) {
      deriveBucketTotals(q);
    }

    return quarters;
  }, [monthlyBuckets]);

  // Calculate monthly average using run-rate method
  const monthlyAverage = useMemo<MonthlyBucket | null>(() => {
    const dayOfYear = getDayOfYearForYear(year);
    if (!dayOfYear) return null;

    const daysPerMonth = 30.42;

    // Sum YTD totals
    const totals = createEmptyBucket('Avg');
    for (const b of monthlyBuckets) {
      totals.jobIncome += b.jobIncome;
      totals.jobExpenses += b.jobExpenses;
      totals.reIncome += b.reIncome;
      totals.reExpenses += b.reExpenses;
      totals.marketing += b.marketing;
      totals.overhead += b.overhead;
      totals.personal += b.personal;
    }

    // Convert to daily rate, then to monthly average
    const avg = createEmptyBucket('Avg');
    avg.jobIncome = (totals.jobIncome / dayOfYear) * daysPerMonth;
    avg.jobExpenses = (totals.jobExpenses / dayOfYear) * daysPerMonth;
    avg.reIncome = (totals.reIncome / dayOfYear) * daysPerMonth;
    avg.reExpenses = (totals.reExpenses / dayOfYear) * daysPerMonth;
    avg.marketing = (totals.marketing / dayOfYear) * daysPerMonth;
    avg.overhead = (totals.overhead / dayOfYear) * daysPerMonth;
    avg.personal = (totals.personal / dayOfYear) * daysPerMonth;

    deriveBucketTotals(avg);
    return avg;
  }, [monthlyBuckets, year]);

  // Calculate quarterly average and YTD total
  const { quarterlyAverage, yearTotal } = useMemo(() => {
    const dayOfYear = getDayOfYearForYear(year);

    // YTD Total
    const total = createEmptyBucket('Total');
    for (const q of quarterlyBuckets) {
      total.jobIncome += q.jobIncome;
      total.jobExpenses += q.jobExpenses;
      total.reIncome += q.reIncome;
      total.reExpenses += q.reExpenses;
      total.marketing += q.marketing;
      total.overhead += q.overhead;
      total.personal += q.personal;
    }
    deriveBucketTotals(total);

    if (!dayOfYear) {
      return { quarterlyAverage: null, yearTotal: total };
    }

    // Quarterly average (daily rate Ã— 91.25 days per quarter)
    const daysPerQuarter = 91.25;
    const avg = createEmptyBucket('Avg');
    avg.jobIncome = (total.jobIncome / dayOfYear) * daysPerQuarter;
    avg.jobExpenses = (total.jobExpenses / dayOfYear) * daysPerQuarter;
    avg.reIncome = (total.reIncome / dayOfYear) * daysPerQuarter;
    avg.reExpenses = (total.reExpenses / dayOfYear) * daysPerQuarter;
    avg.marketing = (total.marketing / dayOfYear) * daysPerQuarter;
    avg.overhead = (total.overhead / dayOfYear) * daysPerQuarter;
    avg.personal = (total.personal / dayOfYear) * daysPerQuarter;

    deriveBucketTotals(avg);
    return { quarterlyAverage: avg, yearTotal: total };
  }, [quarterlyBuckets, year]);

  const currency = (value: number) => formatCurrency(value, 0);

  // Styles
  const thStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '4px 6px',
    borderBottom: '2px solid #ccc',
    background: '#f5f5f5',
    whiteSpace: 'nowrap',
    fontSize: 12,
  };

  const thGroupStyle: React.CSSProperties = {
    textAlign: 'center',
    padding: '4px 6px',
    borderBottom: '1px solid #ddd',
    background: '#e8e8e8',
    fontWeight: 600,
    fontSize: 13,
  };

  const tdStyle: React.CSSProperties = {
    textAlign: 'right',
    padding: '4px 6px',
    borderBottom: '1px solid #eee',
    fontSize: 13,
  };

  const rowHeaderStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '4px 6px',
    borderBottom: '1px solid #eee',
    fontWeight: 500,
    background: '#fafafa',
    fontSize: 13,
  };

  // Vertical divider style for section separators
  const sectionBorder = '2px solid #ccc';

  const profitColor = (val: number) => (val >= 0 ? '#0a7a3c' : '#b00020');
  const expenseColor = '#b00020';
  const incomeColor = '#0a7a3c';

  const renderRow = (bucket: MonthlyBucket, isHighlight = false) => {
    const bgStyle = isHighlight ? { background: '#f0f4ff' } : {};
    const fontWeight = isHighlight ? 600 : 400;

    return (
      <tr key={bucket.label}>
        <td style={{ ...rowHeaderStyle, fontWeight: isHighlight ? 700 : 500, ...bgStyle }}>
          {bucket.label}
        </td>
        {/* Job */}
        <td style={{ ...tdStyle, color: incomeColor, fontWeight, ...bgStyle }}>
          {currency(bucket.jobIncome)}
        </td>
        <td style={{ ...tdStyle, color: expenseColor, fontWeight, ...bgStyle }}>
          {currency(bucket.jobExpenses)}
        </td>
        <td style={{ ...tdStyle, color: profitColor(bucket.jobProfit), fontWeight, borderRight: sectionBorder, ...bgStyle }}>
          {currency(bucket.jobProfit)}
        </td>
        {/* RE */}
        <td style={{ ...tdStyle, color: incomeColor, fontWeight, ...bgStyle }}>
          {currency(bucket.reIncome)}
        </td>
        <td style={{ ...tdStyle, color: expenseColor, fontWeight, ...bgStyle }}>
          {currency(bucket.reExpenses)}
        </td>
        <td style={{ ...tdStyle, color: profitColor(bucket.reProfit), fontWeight, borderRight: sectionBorder, ...bgStyle }}>
          {currency(bucket.reProfit)}
        </td>
        {/* Overhead */}
        <td style={{ ...tdStyle, color: expenseColor, fontWeight, ...bgStyle }}>
          {currency(bucket.marketing)}
        </td>
        <td style={{ ...tdStyle, color: expenseColor, fontWeight, borderRight: sectionBorder, ...bgStyle }}>
          {currency(bucket.overhead)}
        </td>
        {/* Taxable Net */}
        <td style={{ ...tdStyle, color: profitColor(bucket.taxableNet), fontWeight, borderRight: sectionBorder, ...bgStyle }}>
          {currency(bucket.taxableNet)}
        </td>
        {/* Personal */}
        <td style={{ ...tdStyle, color: expenseColor, fontWeight, borderRight: sectionBorder, ...bgStyle }}>
          {currency(bucket.personal)}
        </td>
        {/* True Net */}
        <td style={{ ...tdStyle, color: profitColor(bucket.trueNet), fontWeight, ...bgStyle }}>
          {currency(bucket.trueNet)}
        </td>
      </tr>
    );
  };

  const renderTableHeader = () => (
    <thead>
      {/* Group headers */}
      <tr>
        <th style={{ ...thGroupStyle, textAlign: 'left' }}></th>
        <th colSpan={3} style={{ ...thGroupStyle, borderRight: sectionBorder }}>Jobs (Schedule C)</th>
        <th colSpan={3} style={{ ...thGroupStyle, borderRight: sectionBorder }}>Real Estate (Schedule E)</th>
        <th colSpan={2} style={{ ...thGroupStyle, borderRight: sectionBorder }}>Overhead</th>
        <th style={{ ...thGroupStyle, borderRight: sectionBorder }}>Taxable</th>
        <th style={{ ...thGroupStyle, borderRight: sectionBorder }}>Personal</th>
        <th style={thGroupStyle}>Net</th>
      </tr>
      {/* Column headers */}
      <tr>
        <th style={{ ...thStyle, textAlign: 'left' }}>Period</th>
        {/* Job */}
        <th style={thStyle}>Income</th>
        <th style={thStyle}>Expenses</th>
        <th style={{ ...thStyle, borderRight: sectionBorder }}>Profit</th>
        {/* RE */}
        <th style={thStyle}>Income</th>
        <th style={thStyle}>Expenses</th>
        <th style={{ ...thStyle, borderRight: sectionBorder }}>Profit</th>
        {/* Overhead */}
        <th style={thStyle}>Marketing</th>
        <th style={{ ...thStyle, borderRight: sectionBorder }}>Other</th>
        {/* Taxable */}
        <th style={{ ...thStyle, borderRight: sectionBorder }}>Net</th>
        {/* Personal */}
        <th style={{ ...thStyle, borderRight: sectionBorder }}>Expenses</th>
        {/* True Net */}
        <th style={thStyle}>True Net</th>
      </tr>
    </thead>
  );

  if (loading) return <p>Loading profit summary...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <div
        style={{
          marginBottom: '0.75rem',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'center',
        }}
      >
        <h2 style={{ margin: 0 }}>Profit Summary</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 14 }}>
          Year:
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ padding: '0.25rem 0.5rem', fontSize: 14 }}
          >
            {Array.from({ length: new Date().getFullYear() - 2019 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Monthly table */}
      <div className="card" style={{ marginBottom: '1.5rem', overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Monthly Breakdown</h3>
        <table className="table" style={{ minWidth: 1100 }}>
          {renderTableHeader()}
          <tbody>
            {monthlyBuckets.map((m) => renderRow(m))}
            {monthlyAverage && renderRow(monthlyAverage, true)}
          </tbody>
        </table>
      </div>

      {/* Quarterly table */}
      <div className="card" style={{ overflowX: 'auto' }}>
        <h3 style={{ marginTop: 0 }}>Quarterly Summary</h3>
        <table className="table" style={{ minWidth: 1100 }}>
          {renderTableHeader()}
          <tbody>
            {quarterlyBuckets.map((q) => renderRow(q))}
            {quarterlyAverage && renderRow(quarterlyAverage, true)}
            {yearTotal && renderRow(yearTotal, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}