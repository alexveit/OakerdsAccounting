import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type LeadSource = {
  id: number;
  name: string;
  nick_name: string | null;
  is_active: boolean;
};

type LeadSourceStats = {
  jobCount: number;
  ytdIncome: number;
};

export function LeadSourcesOverview() {
  const [leadSources, setLeadSources] = useState<LeadSource[]>([]);
  const [stats, setStats] = useState<Record<number, LeadSourceStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'name' | 'incomeDesc' | 'jobsDesc'>('incomeDesc');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1) Load lead sources
        const { data: sourcesData, error: sourcesErr } = await supabase
          .from('lead_sources')
          .select('id, name, nick_name, is_active')
          .order('name', { ascending: true });

        if (sourcesErr) throw sourcesErr;

        const sourcesTyped: LeadSource[] = (sourcesData ?? []) as LeadSource[];

        // 2) Load job counts per lead source
        const { data: jobsData, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, lead_source_id');

        if (jobsErr) throw jobsErr;

        const jobCountMap: Record<number, number> = {};
        for (const job of jobsData ?? []) {
          if (job.lead_source_id) {
            jobCountMap[job.lead_source_id] = (jobCountMap[job.lead_source_id] || 0) + 1;
          }
        }

        // 3) Load YTD income per lead source via jobs
        // Income is linked to job_id on transaction_lines, and jobs have lead_source_id
        const currentYear = new Date().getFullYear();
        const startDate = `${currentYear}-01-01`;
        const endDate = `${currentYear}-12-31`;

        const { data: incomeData, error: incomeErr } = await supabase
          .from('transaction_lines')
          .select(`
            amount,
            job_id,
            jobs!inner ( lead_source_id ),
            accounts!inner ( account_types!inner ( name ) ),
            transactions!inner ( date )
          `)
          .eq('is_cleared', true)
          .not('job_id', 'is', null)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        if (incomeErr) throw incomeErr;

        const incomeMap: Record<number, number> = {};
        for (const line of incomeData ?? []) {
          const accType = (line.accounts as any)?.account_types?.name;
          const leadSourceId = (line.jobs as any)?.lead_source_id;
          if (accType === 'income' && leadSourceId) {
            const amount = Math.abs(Number(line.amount) || 0);
            incomeMap[leadSourceId] = (incomeMap[leadSourceId] || 0) + amount;
          }
        }

        // Combine stats
        const combinedStats: Record<number, LeadSourceStats> = {};
        for (const source of sourcesTyped) {
          combinedStats[source.id] = {
            jobCount: jobCountMap[source.id] || 0,
            ytdIncome: incomeMap[source.id] || 0,
          };
        }

        setLeadSources(sourcesTyped);
        setStats(combinedStats);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load lead sources');
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) return <p>Loading lead sources...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (leadSources.length === 0) return <p>No lead sources found.</p>;

  function formatMoney(value: number) {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });
  }

  // Filter and sort
  const filteredSources = showInactive
    ? leadSources
    : leadSources.filter((s) => s.is_active);

  const sortedSources = [...filteredSources].sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    const statsA = stats[a.id] || { jobCount: 0, ytdIncome: 0 };
    const statsB = stats[b.id] || { jobCount: 0, ytdIncome: 0 };

    if (sortMode === 'name') {
      return nameA.localeCompare(nameB);
    }

    if (sortMode === 'jobsDesc') {
      return statsB.jobCount - statsA.jobCount;
    }

    // incomeDesc
    return statsB.ytdIncome - statsA.ytdIncome;
  });

  // Totals
  const totalJobs = sortedSources.reduce((sum, s) => sum + (stats[s.id]?.jobCount || 0), 0);
  const totalIncome = sortedSources.reduce((sum, s) => sum + (stats[s.id]?.ytdIncome || 0), 0);

  return (
    <div className="card">
      {/* Controls row */}
      <div
        style={{
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: 13 }}>Sort by:</label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'name' | 'incomeDesc' | 'jobsDesc')}
            style={{ padding: '0.25rem 0.5rem', fontSize: 13, width: 'auto' }}
          >
            <option value="name">Name (A to Z)</option>
            <option value="incomeDesc">Income (High to Low)</option>
            <option value="jobsDesc">Jobs (High to Low)</option>
          </select>
        </div>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
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
            <Th>Nickname</Th>
            <Th align="right">Jobs</Th>
            <Th align="right">YTD Income (Cleared)</Th>
          </tr>
        </thead>

        <tbody>
          {sortedSources.map((s) => {
            const sourceStats = stats[s.id] || { jobCount: 0, ytdIncome: 0 };

            return (
              <tr key={s.id} style={{ opacity: s.is_active ? 1 : 0.5 }}>
                <Td>{s.name}</Td>
                <Td>{s.nick_name ?? ''}</Td>
                <Td align="right">{sourceStats.jobCount}</Td>
                <Td align="right">{formatMoney(sourceStats.ytdIncome)}</Td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr>
            <Th>Total</Th>
            <Th></Th>
            <Th align="right">{totalJobs}</Th>
            <Th align="right">{formatMoney(totalIncome)}</Th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
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
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
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
