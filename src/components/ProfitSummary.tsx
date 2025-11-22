import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';

type RawLine = {
  id: number;
  account_id: number;
  amount: number;
  is_cleared: boolean;
  purpose: string | null;
  job_id: number | null;
  accounts: { name: string; account_types: { name: string } | null } | null;
  transactions: { date: string } | null;
};

type MonthlyBucket = {
  label: string; gross: number; jobExp: number; prof: number;
  bussExp: number; taxNet: number; otherExp: number; pureNet: number;
};

const createEmptyMonthBuckets = (): MonthlyBucket[] =>
  ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((label) => ({
    label, gross: 0, jobExp: 0, prof: 0, bussExp: 0, taxNet: 0, otherExp: 0, pureNet: 0
  }));

// Get day-of-year for the selected year:
// - Past year: use full-year days (365/366)
// - Current year: use today's day-of-year
// - Future year: return null (no meaningful run-rate)
function getDayOfYearForYear(selectedYear: number): number | null {
  const today = new Date();
  const currentYear = today.getFullYear();

  if (selectedYear < currentYear) {
    const isLeap = (selectedYear % 4 === 0 && selectedYear % 100 !== 0) || selectedYear % 400 === 0;
    return isLeap ? 366 : 365;
  }

  if (selectedYear > currentYear) return null;

  const startOfYear = new Date(selectedYear, 0, 1);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = todayMidnight.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return dayOfYear > 0 ? dayOfYear : null;
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
          .select(`id, account_id, amount, is_cleared, purpose, job_id, accounts (name, account_types (name)), transactions!inner (date)`)
          .eq('is_cleared', true)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        if (lineErr) throw lineErr;

        const raw: RawLine[] = (data ?? []) as any[];
        setLines(raw);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load profit summary');
        setLoading(false);
      }
    }
    load();
  }, [year]);

  // Calculate monthly income/expense buckets from cleared transactions
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
      const purpose = line.purpose ?? 'business';

      if (accType === 'income' && (purpose === 'business' || purpose === 'mixed')) {
        bucket.gross += amt;
      } else if (accType === 'expense') {
        const isBusiness = purpose === 'business' || purpose === 'mixed';
        const isPersonal = purpose === 'personal';

        if (isBusiness && line.job_id !== null) bucket.jobExp += amt;
        else if (isBusiness) bucket.bussExp += amt;
        else if (isPersonal) bucket.otherExp += amt;
      }
    }

    // Derive dependent fields
    for (const b of buckets) {
      b.prof = b.gross - b.jobExp;
      b.taxNet = b.prof - b.bussExp;
      b.pureNet = b.taxNet - b.otherExp;
    }

    return buckets;
  }, [lines]);

  // Aggregate monthly buckets into quarterly totals
  const quarterlyBuckets = useMemo<MonthlyBucket[]>(() => {
    const quarters: MonthlyBucket[] = [
      { label: 'Q1', gross: 0, jobExp: 0, prof: 0, bussExp: 0, taxNet: 0, otherExp: 0, pureNet: 0 },
      { label: 'Q2', gross: 0, jobExp: 0, prof: 0, bussExp: 0, taxNet: 0, otherExp: 0, pureNet: 0 },
      { label: 'Q3', gross: 0, jobExp: 0, prof: 0, bussExp: 0, taxNet: 0, otherExp: 0, pureNet: 0 },
      { label: 'Q4', gross: 0, jobExp: 0, prof: 0, bussExp: 0, taxNet: 0, otherExp: 0, pureNet: 0 },
    ];

    monthlyBuckets.forEach((m, i) => {
      const qIndex = Math.floor(i / 3);
      const q = quarters[qIndex];
      q.gross += m.gross;
      q.jobExp += m.jobExp;
      q.bussExp += m.bussExp;
      q.otherExp += m.otherExp;
    });

    for (const q of quarters) {
      q.prof = q.gross - q.jobExp;
      q.taxNet = q.prof - q.bussExp;
      q.pureNet = q.taxNet - q.otherExp;
    }

    return quarters;
  }, [monthlyBuckets]);

  // Calculate monthly average using run-rate method (30.42 days/month)
  const monthlyAverage: MonthlyBucket | null = useMemo(() => {
    if (monthlyBuckets.length === 0) return null;

    const dayOfYear = getDayOfYearForYear(year);
    if (!dayOfYear) return null;

    const daysPerMonth = 30.42;

    // YTD totals for base flows
    let totalGross = 0, totalJobExp = 0, totalBussExp = 0, totalOtherExp = 0;
    for (const b of monthlyBuckets) {
      totalGross += b.gross;
      totalJobExp += b.jobExp;
      totalBussExp += b.bussExp;
      totalOtherExp += b.otherExp;
    }

    // Daily pace for each category
    const dailyGross = totalGross / dayOfYear;
    const dailyJobExp = totalJobExp / dayOfYear;
    const dailyBussExp = totalBussExp / dayOfYear;
    const dailyOtherExp = totalOtherExp / dayOfYear;

    const avg: MonthlyBucket = {
      label: 'Average',
      gross: dailyGross * daysPerMonth,
      jobExp: dailyJobExp * daysPerMonth,
      prof: 0,
      bussExp: dailyBussExp * daysPerMonth,
      taxNet: 0,
      otherExp: dailyOtherExp * daysPerMonth,
      pureNet: 0,
    };

    // Derive relationships from run-rate flows
    avg.prof = avg.gross - avg.jobExp;
    avg.taxNet = avg.prof - avg.bussExp;
    avg.pureNet = avg.taxNet - avg.otherExp;

    return avg;
  }, [monthlyBuckets, year]);

  // Calculate quarterly average using run-rate method (*3 months) and total
  const quarterAverageAndTotal = useMemo(() => {
    if (quarterlyBuckets.length === 0) {
      return { avg: null as MonthlyBucket | null, total: null as MonthlyBucket | null };
    }

    // Total (actual YTD by quarter sum)
    const total: MonthlyBucket = { label: 'Total', gross: 0, jobExp: 0, prof: 0, bussExp: 0, taxNet: 0, otherExp: 0, pureNet: 0 };
    for (const q of quarterlyBuckets) {
      total.gross += q.gross;
      total.jobExp += q.jobExp;
      total.bussExp += q.bussExp;
      total.taxNet += q.taxNet;
      total.otherExp += q.otherExp;
      total.pureNet += q.pureNet;
    }

    const dayOfYear = getDayOfYearForYear(year);
    if (!dayOfYear) return { avg: null, total };

    const daysPerMonth = 30.42;

    // Use same YTD base flows from months to compute quarter run-rate
    let totalGross = 0, totalJobExp = 0, totalBussExp = 0, totalOtherExp = 0;
    for (const m of monthlyBuckets) {
      totalGross += m.gross;
      totalJobExp += m.jobExp;
      totalBussExp += m.bussExp;
      totalOtherExp += m.otherExp;
    }

    const dailyGross = totalGross / dayOfYear;
    const dailyJobExp = totalJobExp / dayOfYear;
    const dailyBussExp = totalBussExp / dayOfYear;
    const dailyOtherExp = totalOtherExp / dayOfYear;

    const avg: MonthlyBucket = {
      label: 'Average',
      gross: dailyGross * daysPerMonth * 3,
      jobExp: dailyJobExp * daysPerMonth * 3,
      prof: 0,
      bussExp: dailyBussExp * daysPerMonth * 3,
      taxNet: 0,
      otherExp: dailyOtherExp * daysPerMonth * 3,
      pureNet: 0,
    };

    avg.prof = avg.gross - avg.jobExp;
    avg.taxNet = avg.prof - avg.bussExp;
    avg.pureNet = avg.taxNet - avg.otherExp;

    return { avg, total };
  }, [quarterlyBuckets, monthlyBuckets, year]);

  const currency = (value: number) => value.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

  const thStyle: React.CSSProperties = { textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid #ccc', background: '#f5f5f5' };
  const tdStyle: React.CSSProperties = { textAlign: 'right', padding: '4px 6px', borderBottom: '1px solid #eee' };
  const rowHeaderStyle: React.CSSProperties = { textAlign: 'left', padding: '4px 6px', borderBottom: '1px solid #eee', fontWeight: 500, background: '#f9f9f9' };

  const renderRow = (bucket: MonthlyBucket, isHeader = false) => (
    <tr key={bucket.label}>
      <td style={{ ...rowHeaderStyle, fontWeight: isHeader ? 600 : 500 }}>{bucket.label}</td>
      <td style={{ ...tdStyle, color: '#0a7a3c' }}>{currency(bucket.gross)}</td>
      <td style={{ ...tdStyle, color: '#b00020' }}>{currency(bucket.jobExp)}</td>
      <td style={{ ...tdStyle, color: bucket.prof >= 0 ? '#0a7a3c' : '#b00020' }}>{currency(bucket.prof)}</td>
      <td style={{ ...tdStyle, color: '#b00020' }}>{currency(bucket.bussExp)}</td>
      <td style={{ ...tdStyle, color: bucket.taxNet >= 0 ? '#0a7a3c' : '#b00020' }}>{currency(bucket.taxNet)}</td>
      <td style={{ ...tdStyle, color: '#b00020' }}>{currency(bucket.otherExp)}</td>
      <td style={{ ...tdStyle, color: bucket.pureNet >= 0 ? '#0a7a3c' : '#b00020' }}>{currency(bucket.pureNet)}</td>
    </tr>
  );

  if (loading) return <p>Loading profit summary…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <div style={{ marginBottom: '0.75rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <h2 style={{ margin: 0 }}>Yearly Profit Summary</h2>
        <span style={{ fontSize: 14, color: '#555' }}>Year:</span>
        <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value) || new Date().getFullYear())} style={{ width: 80, padding: '2px 4px' }} />
      </div>

      {/* Monthly table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginTop: 0 }}>Monthly</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>Month</th>
              <th style={thStyle}>Gross (+)</th>
              <th style={thStyle}>Job Exp (-)</th>
              <th style={thStyle}>Prof (+)</th>
              <th style={thStyle}>Buss Exp (-)</th>
              <th style={thStyle}>Tax Net (+)</th>
              <th style={thStyle}>Other Exp (-)</th>
              <th style={thStyle}>Pure Net (+)</th>
            </tr>
          </thead>
          <tbody>
            {monthlyBuckets.map((m) => renderRow(m))}
            {monthlyAverage && renderRow(monthlyAverage, true)}
          </tbody>
        </table>
      </div>

      {/* Quarterly table */}
      <div className="card">
        <h3 style={{ marginTop: 0 }}>Quarterly</h3>
        <table className="table">
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left' }}>Quarter</th>
              <th style={thStyle}>Gross (+)</th>
              <th style={thStyle}>Job Exp (-)</th>
              <th style={thStyle}>Prof (+)</th>
              <th style={thStyle}>Buss Exp (-)</th>
              <th style={thStyle}>Tax Net (+)</th>
              <th style={thStyle}>Other Exp (-)</th>
              <th style={thStyle}>Pure Net (+)</th>
            </tr>
          </thead>
          <tbody>
            {quarterlyBuckets.map((q) => renderRow(q))}
            {quarterAverageAndTotal.avg && renderRow(quarterAverageAndTotal.avg, true)}
            {quarterAverageAndTotal.total && renderRow(quarterAverageAndTotal.total, true)}
          </tbody>
        </table>
      </div>
    </div>
  );
}