import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';
import { getDayOfYearForYear } from '../../utils/date';
import {
  classifyLine,
  type ClassifiableLineInput,
} from '../../utils/accounts';

type RawLine = ClassifiableLineInput & {
  id: number;
  account_id: number;
  amount: number;
  is_cleared: boolean;
  transactions: { date: string } | null;
};

type MonthlyBucket = {
  label: string;
  // Job (Schedule C - non-RE business)
  jobIncome: number;
  jobExpenses: number;
  jobProfit: number;
  // Rental Real Estate (Schedule E) - currently deductible
  rentalIncome: number;
  rentalExpenses: number;
  rentalProfit: number;
  // Flip Inventory - capitalized, not deductible until sale
  flipExpenses: number;
  // Overhead (business expenses not tied to jobs or RE)
  marketing: number;
  overhead: number;
  // Derived - Tax view (excludes flip as it's inventory)
  taxableNet: number;
  // Derived - Economic view (cash reality including flip spend)
  economicNet: number;
  // Personal
  personal: number;
  // Final - True cash position
  trueNet: number;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function createEmptyBucket(label: string): MonthlyBucket {
  return {
    label,
    jobIncome: 0,
    jobExpenses: 0,
    jobProfit: 0,
    rentalIncome: 0,
    rentalExpenses: 0,
    rentalProfit: 0,
    flipExpenses: 0,
    marketing: 0,
    overhead: 0,
    taxableNet: 0,
    economicNet: 0,
    personal: 0,
    trueNet: 0,
  };
}

function createEmptyMonthBuckets(): MonthlyBucket[] {
  return MONTH_LABELS.map((label) => createEmptyBucket(label));
}

function deriveBucketTotals(bucket: MonthlyBucket): void {
  bucket.jobProfit = bucket.jobIncome - bucket.jobExpenses;
  bucket.rentalProfit = bucket.rentalIncome - bucket.rentalExpenses;
  // Taxable net excludes flip (inventory sits on balance sheet until sale)
  bucket.taxableNet = bucket.jobProfit + bucket.rentalProfit - bucket.marketing - bucket.overhead;
  // Economic net includes flip cash outflow (what actually left your bank account)
  bucket.economicNet = bucket.taxableNet - bucket.flipExpenses;
  bucket.trueNet = bucket.economicNet - bucket.personal;
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
          // NOTE: Intentionally including all transactions (cleared + pending) for complete P&L picture
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
      const dateStr = line.transactions?.date;
      if (!dateStr) continue;
      const d = new Date(dateStr + 'T00:00:00');
      if (Number.isNaN(d.getTime())) continue;

      const monthIndex = d.getMonth();
      const bucket = buckets[monthIndex];
      if (!bucket) continue;

      const rawAmount = Number(line.amount) || 0;
      const classification = classifyLine(line);

      // INCOME: use absolute value (income lines are negative credits in double-entry)
      if (classification.incomeCategory) {
        const amt = Math.abs(rawAmount);
        if (classification.isBusiness) {
          if (classification.incomeCategory === 'rental') {
            bucket.rentalIncome += amt;
          } else {
            bucket.jobIncome += amt;
          }
        }
        // Personal income not tracked in P&L
      }

      // EXPENSES: use signed amount (so refunds/credits offset debits)
      if (classification.expenseCategory) {
        const amt = rawAmount;
        if (classification.isPersonal) {
          bucket.personal += amt;
        } else if (classification.isBusiness) {
          if (classification.expenseCategory === 'flip') {
            // Flip expenses are inventory (capitalized), tracked separately
            bucket.flipExpenses += amt;
          } else if (classification.expenseCategory === 'rental') {
            bucket.rentalExpenses += amt;
          } else if (classification.expenseCategory === 'job') {
            bucket.jobExpenses += amt;
          } else if (classification.expenseCategory === 'marketing') {
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
      q.rentalIncome += m.rentalIncome;
      q.rentalExpenses += m.rentalExpenses;
      q.flipExpenses += m.flipExpenses;
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
      totals.rentalIncome += b.rentalIncome;
      totals.rentalExpenses += b.rentalExpenses;
      totals.flipExpenses += b.flipExpenses;
      totals.marketing += b.marketing;
      totals.overhead += b.overhead;
      totals.personal += b.personal;
    }

    // Convert to daily rate, then to monthly average
    const avg = createEmptyBucket('Avg');
    avg.jobIncome = (totals.jobIncome / dayOfYear) * daysPerMonth;
    avg.jobExpenses = (totals.jobExpenses / dayOfYear) * daysPerMonth;
    avg.rentalIncome = (totals.rentalIncome / dayOfYear) * daysPerMonth;
    avg.rentalExpenses = (totals.rentalExpenses / dayOfYear) * daysPerMonth;
    avg.flipExpenses = (totals.flipExpenses / dayOfYear) * daysPerMonth;
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
      total.rentalIncome += q.rentalIncome;
      total.rentalExpenses += q.rentalExpenses;
      total.flipExpenses += q.flipExpenses;
      total.marketing += q.marketing;
      total.overhead += q.overhead;
      total.personal += q.personal;
    }
    deriveBucketTotals(total);

    if (!dayOfYear) {
      return { quarterlyAverage: null, yearTotal: total };
    }

    // Quarterly average (daily rate x 91.25 days per quarter)
    const daysPerQuarter = 91.25;
    const avg = createEmptyBucket('Avg');
    avg.jobIncome = (total.jobIncome / dayOfYear) * daysPerQuarter;
    avg.jobExpenses = (total.jobExpenses / dayOfYear) * daysPerQuarter;
    avg.rentalIncome = (total.rentalIncome / dayOfYear) * daysPerQuarter;
    avg.rentalExpenses = (total.rentalExpenses / dayOfYear) * daysPerQuarter;
    avg.flipExpenses = (total.flipExpenses / dayOfYear) * daysPerQuarter;
    avg.marketing = (total.marketing / dayOfYear) * daysPerQuarter;
    avg.overhead = (total.overhead / dayOfYear) * daysPerQuarter;
    avg.personal = (total.personal / dayOfYear) * daysPerQuarter;

    deriveBucketTotals(avg);
    return { quarterlyAverage: avg, yearTotal: total };
  }, [quarterlyBuckets, year]);

  const currency = (value: number) => formatCurrency(value, 0);

  // Color helpers
  const profitClass = (val: number) => (val >= 0 ? 'profit-positive' : 'profit-negative');

  const renderRow = (bucket: MonthlyBucket, isHighlight = false) => {
    const rowClass = isHighlight ? 'highlight' : '';

    return (
      <tr key={bucket.label} className={rowClass}>
        <td className="row-header">{bucket.label}</td>
        {/* Job */}
        <td className="profit-income">{currency(bucket.jobIncome)}</td>
        <td className="profit-expense">{currency(bucket.jobExpenses)}</td>
        <td className={`section-end ${profitClass(bucket.jobProfit)}`}>{currency(bucket.jobProfit)}</td>
        {/* Rentals */}
        <td className="profit-income">{currency(bucket.rentalIncome)}</td>
        <td className="profit-expense">{currency(bucket.rentalExpenses)}</td>
        <td className={`section-end ${profitClass(bucket.rentalProfit)}`}>{currency(bucket.rentalProfit)}</td>
        {/* Flip Inventory */}
        <td className="section-end profit-expense">{currency(bucket.flipExpenses)}</td>
        {/* Overhead */}
        <td className="profit-expense">{currency(bucket.marketing)}</td>
        <td className="section-end profit-expense">{currency(bucket.overhead)}</td>
        {/* Taxable Net */}
        <td className={`section-end ${profitClass(bucket.taxableNet)}`}>{currency(bucket.taxableNet)}</td>
        {/* Economic Net */}
        <td className={`section-end ${profitClass(bucket.economicNet)}`}>{currency(bucket.economicNet)}</td>
        {/* Personal */}
        <td className="section-end profit-expense">{currency(bucket.personal)}</td>
        {/* True Net */}
        <td className={profitClass(bucket.trueNet)}>{currency(bucket.trueNet)}</td>
      </tr>
    );
  };

  const renderTableHeader = () => (
    <thead>
      {/* Group headers */}
      <tr>
        <th className="group left"></th>
        <th colSpan={3} className="group section-end">Jobs (Schedule C)</th>
        <th colSpan={3} className="group section-end">Rentals (Schedule E)</th>
        <th className="group section-end">Flips</th>
        <th colSpan={2} className="group section-end">Overhead</th>
        <th className="group section-end">Tax Net</th>
        <th className="group section-end">Econ Net</th>
        <th className="group section-end">Personal</th>
        <th className="group">True Net</th>
      </tr>
      {/* Column headers */}
      <tr>
        <th className="left">Period</th>
        {/* Job */}
        <th>Income</th>
        <th>Expenses</th>
        <th className="section-end">Profit</th>
        {/* Rentals */}
        <th>Income</th>
        <th>Expenses</th>
        <th className="section-end">Profit</th>
        {/* Flip Inventory */}
        <th className="section-end" title="Capitalized inventory, not deductible until sale">Inventory</th>
        {/* Overhead */}
        <th>Marketing</th>
        <th className="section-end">Other</th>
        {/* Tax Net */}
        <th className="section-end" title="Excludes flip inventory">(No Flip)</th>
        {/* Economic Net */}
        <th className="section-end" title="Includes flip cash outflow">(+Flip)</th>
        {/* Personal */}
        <th className="section-end">Expenses</th>
        {/* True Net */}
        <th>Cash Flow</th>
      </tr>
    </thead>
  );

  if (loading) return <p>Loading profit summary...</p>;
  if (error) return <p className="text-danger">Error: {error}</p>;

  return (
    <div>
      <div className="profit-header">
        <h2>Profit Summary</h2>
        <label className="profit-year-select">
          Year:
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {Array.from({ length: new Date().getFullYear() - 2019 }, (_, i) => new Date().getFullYear() - i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Monthly table */}
      <div className="card profit-table-wrap">
        <h3 className="mt-0">Monthly Breakdown</h3>
        <table className="profit-table">
          {renderTableHeader()}
          <tbody>
            {monthlyBuckets.map((m) => renderRow(m))}
            {monthlyAverage && renderRow(monthlyAverage, true)}
          </tbody>
        </table>
      </div>

      {/* Quarterly table */}
      <div className="card profit-table-wrap">
        <h3 className="mt-0">Quarterly Summary</h3>
        <table className="profit-table">
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