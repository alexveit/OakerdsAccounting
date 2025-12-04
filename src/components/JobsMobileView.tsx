import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/format';

// ============================================================
// TYPES
// ============================================================

type JobSummary = {
  id: number;
  name: string;
  address: string | null;
  status: string | null;
  startDate: string | null;
  income: number;
  labor: number;
  materials: number;
  otherExpenses: number;
  profit: number;
  clientPaid: boolean;      // All income lines cleared
  installerPaid: boolean;   // All installer expense lines cleared
  hasIncome: boolean;
  hasLabor: boolean;
};

type FilterMode = 'all' | 'open' | 'unpaid';

// ============================================================
// COMPONENT
// ============================================================

export function JobsMobileView() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('open');

  // ----------------------------------------------------------
  // LOAD DATA
  // ----------------------------------------------------------
  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      setError(null);

      try {
        // Fetch all jobs
        const { data: jobsData, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, name, address, status, start_date')
          .order('created_at', { ascending: false });

        if (jobsErr) throw jobsErr;

        // Fetch all job-linked transaction lines with account type info
        const { data: linesData, error: linesErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            job_id,
            amount,
            is_cleared,
            installer_id,
            vendor_id,
            accounts!inner ( account_types!inner ( name ) )
          `)
          .not('job_id', 'is', null);

        if (linesErr) throw linesErr;

        // Group lines by job and compute summaries
        const linesByJob = new Map<number, typeof linesData>();
        for (const line of linesData ?? []) {
          if (!line.job_id) continue;
          const arr = linesByJob.get(line.job_id) ?? [];
          arr.push(line);
          linesByJob.set(line.job_id, arr);
        }

        const summaries: JobSummary[] = (jobsData ?? []).map((job: any) => {
          const lines = linesByJob.get(job.id) ?? [];

          let income = 0;
          let labor = 0;
          let materials = 0;
          let otherExpenses = 0;
          let allIncomeCleared = true;
          let allInstallerCleared = true;
          let hasIncome = false;
          let hasLabor = false;

          for (const line of lines) {
            const typeName = (line.accounts as any)?.account_types?.name ?? '';
            const amt = Number(line.amount) || 0;

            if (typeName === 'income') {
              income += -amt; // Income is negative in ledger
              hasIncome = true;
              if (!line.is_cleared) allIncomeCleared = false;
            } else if (typeName === 'expense') {
              if (line.installer_id) {
                labor += amt;
                hasLabor = true;
                if (!line.is_cleared) allInstallerCleared = false;
              } else if (line.vendor_id) {
                materials += amt;
              } else {
                otherExpenses += amt;
              }
            }
          }

          const profit = income - (labor + materials + otherExpenses);

          return {
            id: job.id,
            name: job.name,
            address: job.address,
            status: job.status,
            startDate: job.start_date,
            income,
            labor,
            materials,
            otherExpenses,
            profit,
            clientPaid: hasIncome ? allIncomeCleared : true,
            installerPaid: hasLabor ? allInstallerCleared : true,
            hasIncome,
            hasLabor,
          };
        });

        setJobs(summaries);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load jobs');
      } finally {
        setLoading(false);
      }
    }

    loadJobs();
  }, []);

  // ----------------------------------------------------------
  // FILTER + SEARCH
  // ----------------------------------------------------------
  const filteredJobs = useMemo(() => {
    let result = jobs;

    // Apply filter
    if (filter === 'open') {
      result = result.filter((j) => j.status === 'open');
    } else if (filter === 'unpaid') {
      result = result.filter((j) => !j.clientPaid || !j.installerPaid);
    }

    // Apply search
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) =>
          j.name.toLowerCase().includes(q) ||
          (j.address && j.address.toLowerCase().includes(q))
      );
    }

    return result;
  }, [jobs, filter, search]);

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading jobs...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Jobs</h1>
        <div style={styles.subtitle}>{filteredJobs.length} jobs</div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by name or address..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={styles.searchInput}
      />

      {/* Filter Tabs */}
      <div style={styles.filterRow}>
        {(['all', 'open', 'unpaid'] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            style={{
              ...styles.filterBtn,
              ...(filter === mode ? styles.filterBtnActive : {}),
            }}
          >
            {mode === 'all' ? 'All' : mode === 'open' ? 'Open' : 'Unpaid'}
          </button>
        ))}
      </div>

      {/* Job Cards */}
      <div style={styles.cardList}>
        {filteredJobs.length === 0 ? (
          <div style={styles.empty}>No jobs match your filters</div>
        ) : (
          filteredJobs.map((job) => (
            <div key={job.id} style={styles.card}>
              {/* Job Header */}
              <div style={styles.cardHeader}>
                <div style={styles.jobName}>{job.name}</div>
                <div
                  style={{
                    ...styles.statusBadge,
                    backgroundColor:
                      job.status === 'open' ? '#10b981' : '#6b7280',
                  }}
                >
                  {job.status ?? 'open'}
                </div>
              </div>

              {job.address && (
                <div style={styles.address}>{job.address}</div>
              )}

              {/* Financials */}
              <div style={styles.financials}>
                {/* Client Payment */}
                <div style={styles.finRow}>
                  <span style={styles.finLabel}>Client</span>
                  <span style={styles.finAmount}>
                    {job.hasIncome ? formatCurrency(job.income, 0) : '—'}
                  </span>
                  {job.hasIncome && (
                    <span
                      style={{
                        ...styles.paidBadge,
                        backgroundColor: job.clientPaid ? '#10b981' : '#ef4444',
                      }}
                    >
                      {job.clientPaid ? '✓ Paid' : 'Unpaid'}
                    </span>
                  )}
                </div>

                {/* Installer Payment */}
                <div style={styles.finRow}>
                  <span style={styles.finLabel}>Installer</span>
                  <span style={styles.finAmount}>
                    {job.hasLabor ? formatCurrency(job.labor, 0) : '—'}
                  </span>
                  {job.hasLabor && (
                    <span
                      style={{
                        ...styles.paidBadge,
                        backgroundColor: job.installerPaid
                          ? '#10b981'
                          : '#ef4444',
                      }}
                    >
                      {job.installerPaid ? '✓ Paid' : 'Unpaid'}
                    </span>
                  )}
                </div>

                {/* Profit */}
                <div style={styles.finRow}>
                  <span style={styles.finLabel}>Profit</span>
                  <span
                    style={{
                      ...styles.finAmount,
                      color: job.profit >= 0 ? '#10b981' : '#ef4444',
                      fontWeight: 600,
                    }}
                  >
                    {formatCurrency(job.profit, 0)}
                  </span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        Oakerds Accounting • Mobile View
      </div>
    </div>
  );
}

// ============================================================
// STYLES (Inline for portability)
// ============================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#111827',
    color: '#f3f4f6',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '16px',
    paddingBottom: '80px',
  },
  header: {
    marginBottom: '16px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    margin: 0,
    color: '#fff',
  },
  subtitle: {
    fontSize: '14px',
    color: '#9ca3af',
    marginTop: '4px',
  },
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '1px solid #374151',
    borderRadius: '8px',
    backgroundColor: '#1f2937',
    color: '#f3f4f6',
    marginBottom: '12px',
    boxSizing: 'border-box',
  },
  filterRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
  },
  filterBtn: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '14px',
    fontWeight: 500,
    border: '1px solid #374151',
    borderRadius: '8px',
    backgroundColor: '#1f2937',
    color: '#9ca3af',
    cursor: 'pointer',
  },
  filterBtnActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#fff',
  },
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid #374151',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '4px',
  },
  jobName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    flex: 1,
    paddingRight: '8px',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#fff',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  address: {
    fontSize: '13px',
    color: '#9ca3af',
    marginBottom: '12px',
  },
  financials: {
    borderTop: '1px solid #374151',
    paddingTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  finRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  finLabel: {
    fontSize: '13px',
    color: '#9ca3af',
    width: '60px',
    flexShrink: 0,
  },
  finAmount: {
    fontSize: '14px',
    color: '#f3f4f6',
    flex: 1,
  },
  paidBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#fff',
  },
  loading: {
    textAlign: 'center',
    padding: '48px 16px',
    color: '#9ca3af',
  },
  error: {
    textAlign: 'center',
    padding: '48px 16px',
    color: '#ef4444',
  },
  empty: {
    textAlign: 'center',
    padding: '32px 16px',
    color: '#6b7280',
    fontSize: '14px',
  },
  footer: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '12px 16px',
    backgroundColor: '#111827',
    borderTop: '1px solid #374151',
    textAlign: 'center',
    fontSize: '12px',
    color: '#6b7280',
  },
};

export default JobsMobileView;
