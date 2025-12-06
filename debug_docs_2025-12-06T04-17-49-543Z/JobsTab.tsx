import { useEffect, useState, useMemo } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';
import { mobileStyles as styles, TX_COLORS } from './mobileStyles';

// ============================================================
// TYPES
// ============================================================

type TransactionType = 'income' | 'labor' | 'materials' | 'expense' | 'other';

type Transaction = {
  id: number;
  date: string;
  description: string;
  amount: number;
  type: TransactionType;
  cleared: boolean;
  vendorInstaller: string | null;
  accountName: string;
};

type JobSummary = {
  id: number;
  name: string;
  address: string | null;
  status: string | null;
  income: number;
  labor: number;
  materials: number;
  otherExpenses: number;
  profit: number;
  hasIncome: boolean;
  hasLabor: boolean;
  transactions: Transaction[];
};

type FilterMode = 'open' | 'all';

// ============================================================
// COMPONENT
// ============================================================

export function JobsTab() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterMode>('open');
  const [expandedJobId, setExpandedJobId] = useState<number | null>(null);

  // ----------------------------------------------------------
  // LOAD DATA
  // ----------------------------------------------------------
  useEffect(() => {
    async function loadJobs() {
      setLoading(true);
      setError(null);

      try {
        const { data: jobsData, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, name, address, status, start_date')
          .order('created_at', { ascending: false });

        if (jobsErr) throw jobsErr;

        const { data: linesData, error: linesErr } = await supabase
          .from('transaction_lines')
          .select(`
            id, job_id, amount, is_cleared, installer_id, vendor_id, transaction_id,
            transactions ( id, date, description ),
            accounts ( name, account_types ( name ) ),
            vendors ( name ),
            installers ( first_name, last_name )
          `)
          .not('job_id', 'is', null);

        if (linesErr) throw linesErr;

        const linesByJob = new Map<number, typeof linesData>();
        for (const line of linesData ?? []) {
          if (!line.job_id) continue;
          const arr = linesByJob.get(line.job_id) ?? [];
          arr.push(line);
          linesByJob.set(line.job_id, arr);
        }

        const summaries: JobSummary[] = (jobsData ?? []).map((job: any) => {
          const lines = linesByJob.get(job.id) ?? [];
          let income = 0, labor = 0, materials = 0, otherExpenses = 0;
          let hasIncome = false, hasLabor = false;
          const txMap = new Map<number, Transaction>();

          for (const line of lines) {
            const typeName = (line.accounts as any)?.account_types?.name ?? '';
            const amt = Number(line.amount) || 0;
            const txId = line.transaction_id;
            const tx = line.transactions as any;

            if (txId && !txMap.has(txId)) {
              txMap.set(txId, {
                id: txId,
                date: tx?.date ?? '',
                description: tx?.description ?? '',
                amount: 0,
                type: 'other',
                cleared: true,
                vendorInstaller: null,
                accountName: (line.accounts as any)?.name ?? '',
              });
            }

            const txEntry = txMap.get(txId);
            if (txEntry) {
              if (typeName === 'asset' || typeName === 'liability') {
                txEntry.amount = Math.abs(amt);
              }
              if (typeName === 'income') {
                txEntry.type = 'income';
              } else if (typeName === 'expense') {
                if (line.installer_id) txEntry.type = 'labor';
                else if (line.vendor_id) txEntry.type = 'materials';
                else if (txEntry.type !== 'income') txEntry.type = 'expense';
              }
              if (!txEntry.vendorInstaller) {
                if (line.installers) {
                  txEntry.vendorInstaller = `${(line.installers as any).first_name} ${(line.installers as any).last_name ?? ''}`.trim();
                } else if (line.vendors) {
                  txEntry.vendorInstaller = (line.vendors as any).name;
                }
              }
              if (!line.is_cleared) txEntry.cleared = false;
            }

            if (typeName === 'income') {
              income += -amt;
              hasIncome = true;
            } else if (typeName === 'expense') {
              if (line.installer_id) { labor += amt; hasLabor = true; }
              else if (line.vendor_id) materials += amt;
              else otherExpenses += amt;
            }
          }

          const transactions = Array.from(txMap.values()).sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );

          return {
            id: job.id,
            name: job.name,
            address: job.address,
            status: job.status,
            income,
            labor,
            materials,
            otherExpenses,
            profit: income - (labor + materials + otherExpenses),
            hasIncome,
            hasLabor,
            transactions,
          };
        });

        setJobs(summaries);
      } catch (err: any) {
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
    if (filter === 'open') result = result.filter((j) => j.status === 'open');
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (j) => j.name.toLowerCase().includes(q) || (j.address && j.address.toLowerCase().includes(q))
      );
    }
    return result;
  }, [jobs, filter, search]);

  // ----------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [, m, d] = dateStr.split('-');
    return `${Number(m)}/${Number(d)}`;
  };

  // ----------------------------------------------------------
  // RENDER
  // ----------------------------------------------------------
  if (loading) return <div style={styles.loading}>Loading jobs...</div>;
  if (error) return <div style={styles.error}>{error}</div>;

  return (
    <div style={styles.tabContent}>
      <input
        type="text"
        placeholder="Search jobs..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={styles.searchInput}
      />

      <div style={styles.filterRow}>
        {(['open', 'all'] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            style={{ ...styles.filterBtn, ...(filter === mode ? styles.filterBtnActive : {}) }}
          >
            {mode === 'open' ? 'Open' : 'All'}
          </button>
        ))}
      </div>

      <div style={styles.countText}>{filteredJobs.length} jobs</div>

      <div style={styles.cardList}>
        {filteredJobs.map((job) => {
          const isExpanded = expandedJobId === job.id;
          return (
            <div key={job.id} style={styles.card}>
              <div style={styles.cardTouchable} onClick={() => setExpandedJobId(isExpanded ? null : job.id)}>
                <div style={styles.cardHeader}>
                  <div style={styles.jobName}>{job.name}</div>
                  <div style={{ ...styles.statusBadge, backgroundColor: job.status === 'open' ? '#10b981' : '#6b7280' }}>
                    {job.status ?? 'open'}
                  </div>
                </div>
                {job.address && <div style={styles.address}>{job.address}</div>}
                <div style={styles.financials}>
                  <div style={styles.finRow}>
                    <span style={styles.finLabel}>Client</span>
                    <span style={styles.finAmount}>{job.hasIncome ? formatCurrency(job.income, 0) : '—'}</span>
                  </div>
                  <div style={styles.finRow}>
                    <span style={styles.finLabel}>Installer</span>
                    <span style={styles.finAmount}>{job.hasLabor ? formatCurrency(job.labor, 0) : '—'}</span>
                  </div>
                  <div style={styles.finRow}>
                    <span style={styles.finLabel}>Profit</span>
                    <span style={{ ...styles.finAmount, color: job.profit >= 0 ? '#10b981' : '#ef4444', fontWeight: 600 }}>
                      {formatCurrency(job.profit, 0)}
                    </span>
                  </div>
                </div>
                <div style={styles.expandHint}>{isExpanded ? '▲ Hide' : '▼ Transactions'}</div>
              </div>

              {isExpanded && (
                <div style={styles.transactionsSection}>
                  {job.transactions.length === 0 ? (
                    <div style={styles.noTransactions}>No transactions</div>
                  ) : (
                    job.transactions.map((tx) => (
                      <div key={tx.id} style={styles.txRow}>
                        <div style={styles.txLeft}>
                          <div style={styles.txDate}>{formatDate(tx.date)}</div>
                          <div style={styles.txDetails}>
                            <div style={styles.txDesc}>{tx.description || tx.accountName}</div>
                            {tx.vendorInstaller && <div style={styles.txVendor}>{tx.vendorInstaller}</div>}
                          </div>
                        </div>
                        <div style={styles.txRight}>
                          <div style={{ ...styles.txAmount, color: TX_COLORS[tx.type] }}>
                            {tx.type === 'income' ? '+' : ''}{formatCurrency(tx.amount, 0)}
                          </div>
                          <div style={{ ...styles.txCleared, color: tx.cleared ? '#10b981' : '#ef4444' }}>
                            {tx.cleared ? '✓' : '○'}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filteredJobs.length === 0 && (
        <div style={styles.empty}>No jobs found</div>
      )}
    </div>
  );
}

export default JobsTab;
