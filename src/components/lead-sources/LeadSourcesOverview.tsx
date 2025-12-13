import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';

type LeadSource = {
  id: number;
  name: string;
  nick_name: string | null;
  is_active: boolean;
  marketing_account_id: number | null;
};

type LeadSourceStats = {
  jobCount: number;
  grossIncome: number;
  jobExpenses: number;
  profit: number;
  marketingSpend: number;
  roi: number | null;
};

type RawJobForLeadSource = {
  id: number;
  lead_source_id: number | null;
  start_date: string | null;
};

type RawTxLineForLeadSource = {
  amount: number;
  account_id: number;
  job_id: number | null;
  accounts: { account_types: { name: string } } | null;
  transactions: { date: string } | null;
};

type LeadSourcesOverviewProps = {
  onLeadSourceSelect?: (leadSourceId: number) => void;
};

export function LeadSourcesOverview({ onLeadSourceSelect }: LeadSourcesOverviewProps) {
  const currentYear = new Date().getFullYear();

  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [stats, setStats] = useState<Record<number, LeadSourceStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [year, setYear] = useState<number | 'all'>(currentYear);
  const [sortMode, setSortMode] = useState<'name' | 'profitDesc' | 'roiDesc' | 'jobsDesc'>('profitDesc');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1) Load lead sources with marketing_account_id
        const { data: sourcesData, error: sourcesErr } = await supabase
          .from('lead_sources')
          .select('id, name, nick_name, is_active, marketing_account_id')
          .order('name', { ascending: true });

        if (sourcesErr) throw sourcesErr;

        const sourcesTyped: LeadSource[] = (sourcesData ?? []) as LeadSource[];

        // Build reverse map: marketing_account_id -> lead_source_id
        const marketingAccountToLeadSource: Record<number, number> = {};
        for (const source of sourcesTyped) {
          if (source.marketing_account_id) {
            marketingAccountToLeadSource[source.marketing_account_id] = source.id;
          }
        }

        // 2) Load jobs with their lead sources
        const { data: jobsData, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, lead_source_id, start_date');

        if (jobsErr) throw jobsErr;

        const rawJobs = (jobsData ?? []) as unknown as RawJobForLeadSource[];
        // Filter jobs by year for job count
        const filteredJobs = year === 'all'
          ? rawJobs
          : rawJobs.filter((job) => {
              const startYear = job.start_date?.slice(0, 4);
              return startYear === String(year);
            });

        const jobCountMap: Record<number, number> = {};
        const jobToLeadSource: Record<number, number> = {};
        
        for (const job of rawJobs) {
          if (job.lead_source_id) {
            jobToLeadSource[job.id] = job.lead_source_id;
          }
        }
        for (const job of filteredJobs) {
          if (job.lead_source_id) {
            jobCountMap[job.lead_source_id] = (jobCountMap[job.lead_source_id] || 0) + 1;
          }
        }

        // 3) Load all transaction lines
        let txQuery = supabase
          .from('transaction_lines')
          .select(`
            amount,
            account_id,
            job_id,
            accounts!inner ( account_types!inner ( name ) ),
            transactions!inner ( date )
          `)
          .eq('is_cleared', true);

        if (year !== 'all') {
          const startDate = `${year}-01-01`;
          const endDate = `${year}-12-31`;
          txQuery = txQuery
            .gte('transactions.date', startDate)
            .lte('transactions.date', endDate);
        }

        const { data: txData, error: txErr } = await txQuery;

        if (txErr) throw txErr;

        // Aggregate:
        // - grossIncome & jobExpenses: via job_id -> lead_source_id
        // - marketingSpend: via account_id -> marketing_account_id -> lead_source_id
        const grossIncomeMap: Record<number, number> = {};
        const jobExpenseMap: Record<number, number> = {};
        const marketingSpendMap: Record<number, number> = {};

        const rawTxLines = (txData ?? []) as unknown as RawTxLineForLeadSource[];
        for (const line of rawTxLines) {
          const accType = line.accounts?.account_types?.name;
          const accountId = line.account_id;
          const amount = Math.abs(Number(line.amount) || 0);
          const jobId = line.job_id;

          // Marketing spend: check if account_id is a marketing account for a lead source
          const leadSourceFromMarketing = marketingAccountToLeadSource[accountId];
          if (leadSourceFromMarketing && accType === 'expense') {
            marketingSpendMap[leadSourceFromMarketing] = (marketingSpendMap[leadSourceFromMarketing] || 0) + amount;
            continue; // Don't double-count as job expense
          }

          // Job-related income/expense: attribute via job's lead source
          if (jobId) {
            const jobLeadSourceId = jobToLeadSource[jobId];
            if (jobLeadSourceId) {
              if (accType === 'income') {
                grossIncomeMap[jobLeadSourceId] = (grossIncomeMap[jobLeadSourceId] || 0) + amount;
              } else if (accType === 'expense') {
                jobExpenseMap[jobLeadSourceId] = (jobExpenseMap[jobLeadSourceId] || 0) + amount;
              }
            }
          }
        }

        // Combine stats
        const combinedStats: Record<number, LeadSourceStats> = {};
        for (const source of sourcesTyped) {
          const grossIncome = grossIncomeMap[source.id] || 0;
          const jobExpenses = jobExpenseMap[source.id] || 0;
          const profit = grossIncome - jobExpenses;
          const marketingSpend = marketingSpendMap[source.id] || 0;
          const roi = marketingSpend > 0 ? profit / marketingSpend : null;

          combinedStats[source.id] = {
            jobCount: jobCountMap[source.id] || 0,
            grossIncome,
            jobExpenses,
            profit,
            marketingSpend,
            roi,
          };
        }

        setLeadSources(sourcesTyped);
        setStats(combinedStats);
        setLoading(false);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load lead sources');
        setLoading(false);
      }
    }

    loadData();
  }, [year]);

  if (loading) return <p>Loading lead sources...</p>;
  if (error) return <p className="text-danger">Error: {error}</p>;
  if (leadSources.length === 0) return <p>No lead sources found.</p>;

  // Filter and sort
  const filteredSources = showInactive
    ? leadSources
    : leadSources.filter((s) => s.is_active);

  const sortedSources = [...filteredSources].sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    const statsA = stats[a.id] || { jobCount: 0, grossIncome: 0, jobExpenses: 0, profit: 0, marketingSpend: 0, roi: null };
    const statsB = stats[b.id] || { jobCount: 0, grossIncome: 0, jobExpenses: 0, profit: 0, marketingSpend: 0, roi: null };

    if (sortMode === 'name') {
      return nameA.localeCompare(nameB);
    }

    if (sortMode === 'jobsDesc') {
      return statsB.jobCount - statsA.jobCount;
    }

    if (sortMode === 'roiDesc') {
      // Sort nulls to the bottom
      if (statsA.roi === null && statsB.roi === null) return 0;
      if (statsA.roi === null) return 1;
      if (statsB.roi === null) return -1;
      return statsB.roi - statsA.roi;
    }

    // profitDesc
    return statsB.profit - statsA.profit;
  });

  // Totals
  const totalJobs = sortedSources.reduce((sum, s) => sum + (stats[s.id]?.jobCount || 0), 0);
  const totalGrossIncome = sortedSources.reduce((sum, s) => sum + (stats[s.id]?.grossIncome || 0), 0);
  const totalProfit = sortedSources.reduce((sum, s) => sum + (stats[s.id]?.profit || 0), 0);
  const totalMarketingSpend = sortedSources.reduce((sum, s) => sum + (stats[s.id]?.marketingSpend || 0), 0);
  const totalRoi = totalMarketingSpend > 0 ? totalProfit / totalMarketingSpend : null;

  // Generate year options (current year down to 2020)
  const yearOptions = Array.from(
    { length: currentYear - 2019 },
    (_, i) => currentYear - i
  );

  // Format lead source display name: "Name (nickname)" only if nickname differs
  const formatSourceName = (source: LeadSource): string => {
    if (source.nick_name && source.nick_name !== source.name) {
      return `${source.name} (${source.nick_name})`;
    }
    return source.name;
  };

  const formatRoi = (roi: number | null): string => {
    if (roi === null) return '-';
    return `${roi.toFixed(1)}x`;
  };

  // Color helpers for dynamic values
  const profitColorClass = (value: number) => value >= 0 ? 'text-success' : 'text-danger';
  const roiColorClass = (roi: number | null) => roi !== null ? (roi >= 1 ? 'text-success' : 'text-danger') : '';

  return (
    <div className="card">
      {/* Controls row */}
      <div className="filter-row mb-2">
        <label className="filter-label">
          Year:
          <select
            value={year}
            onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">All Time</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        <label className="filter-label">
          Sort by:
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'name' | 'profitDesc' | 'roiDesc' | 'jobsDesc')}
          >
            <option value="name">Name (A to Z)</option>
            <option value="profitDesc">Profit (High to Low)</option>
            <option value="roiDesc">ROI (High to Low)</option>
            <option value="jobsDesc">Jobs (High to Low)</option>
          </select>
        </label>

        <label className="filter-label--sm">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <table className="table">
        <thead>
          <tr>
            <Th>Lead Source</Th>
            <Th align="right">Jobs</Th>
            <Th align="right">Gross Income</Th>
            <Th align="right">Profit</Th>
            <Th align="right">Marketing Spend</Th>
            <Th align="right">ROI</Th>
          </tr>
        </thead>

        <tbody>
          {sortedSources.map((s) => {
            const sourceStats = stats[s.id] || { jobCount: 0, grossIncome: 0, jobExpenses: 0, profit: 0, marketingSpend: 0, roi: null };

            return (
              <tr 
                key={s.id} 
                className={`${!s.is_active ? 'opacity-50' : ''} ${onLeadSourceSelect ? 'cursor-pointer' : ''}`}
                onClick={() => onLeadSourceSelect?.(s.id)}
                title={onLeadSourceSelect ? 'Click to edit' : undefined}
              >
                <Td>{formatSourceName(s)}</Td>
                <Td align="right">{sourceStats.jobCount}</Td>
                <Td align="right">{formatCurrency(sourceStats.grossIncome, 0)}</Td>
                <Td align="right" className={`font-semibold ${profitColorClass(sourceStats.profit)}`}>
                  {formatCurrency(sourceStats.profit, 0)}
                </Td>
                <Td align="right" className={sourceStats.marketingSpend > 0 ? 'text-danger' : ''}>
                  {formatCurrency(sourceStats.marketingSpend, 0)}
                </Td>
                <Td align="right" className={`font-semibold ${roiColorClass(sourceStats.roi)}`}>
                  {formatRoi(sourceStats.roi)}
                </Td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr>
            <Th>Total</Th>
            <Th align="right">{totalJobs}</Th>
            <Th align="right">{formatCurrency(totalGrossIncome, 0)}</Th>
            <Th align="right" className={`font-bold ${profitColorClass(totalProfit)}`}>
              {formatCurrency(totalProfit, 0)}
            </Th>
            <Th align="right" className="text-danger">{formatCurrency(totalMarketingSpend, 0)}</Th>
            <Th align="right" className={`font-bold ${roiColorClass(totalRoi)}`}>
              {formatRoi(totalRoi)}
            </Th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <th
      className={className}
      style={{
        borderBottom: '1px solid #ccc',
        textAlign: align,
        padding: '4px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  className = '',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
}) {
  return (
    <td
      className={className}
      style={{
        padding: '3px 6px',
        textAlign: align,
        borderBottom: '1px solid #f2f2f2',
        verticalAlign: 'top',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}
