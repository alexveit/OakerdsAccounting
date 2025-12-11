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
  isCcTransaction: boolean;
  ccSettled: boolean;
};

type CcBalance = {
  accountName: string;
  unclearedAmount: number;
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
  ccBalances: CcBalance[];
};

type FilterMode = 'open' | 'closed';

// Raw types from Supabase queries
type RawJob = {
  id: number;
  name: string;
  address: string | null;
  status: string | null;
  start_date: string | null;
};

type RawTransactionLine = {
  id: number;
  job_id: number | null;
  amount: number;
  is_cleared: boolean;
  cc_settled: boolean;
  installer_id: number | null;
  vendor_id: number | null;
  transaction_id: number;
  transactions: { id: number; date: string; description: string | null } | null;
  accounts: { name: string; account_types: { name: string } | null } | null;
  vendors: { name: string } | null;
  installers: { first_name: string; last_name: string | null } | null;
};

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
          .order('start_date', { ascending: false });

        if (jobsErr) throw jobsErr;

        // Step 1: Get category lines (income/expense) that have job_id
        const { data: categoryLineData, error: categoryErr } = await supabase
          .from('transaction_lines')
          .select('id, job_id, transaction_id')
          .not('job_id', 'is', null);

        if (categoryErr) throw categoryErr;

        // Collect unique transaction IDs and map transaction -> job
        const txToJob = new Map<number, number>();
        for (const line of categoryLineData ?? []) {
          if (line.job_id && line.transaction_id) {
            txToJob.set(line.transaction_id, line.job_id);
          }
        }

        const txIds = [...txToJob.keys()];

        let rawLines: RawTransactionLine[] = [];
        
        if (txIds.length > 0) {
          // Step 2: Get ALL lines for those transactions (includes cash lines)
          const { data: linesData, error: linesErr } = await supabase
            .from('transaction_lines')
            .select(`
              id, job_id, amount, is_cleared, cc_settled, installer_id, vendor_id, transaction_id,
              transactions ( id, date, description ),
              accounts ( name, account_types ( name ) ),
              vendors ( name ),
              installers ( first_name, last_name )
            `)
            .in('transaction_id', txIds);

          if (linesErr) throw linesErr;
          rawLines = (linesData ?? []) as unknown as RawTransactionLine[];
        }

        // Group lines by job (using txToJob mapping since cash lines don't have job_id)
        const linesByJob = new Map<number, RawTransactionLine[]>();
        for (const line of rawLines) {
          const jobId = line.job_id ?? txToJob.get(line.transaction_id);
          if (!jobId) continue;
          const arr = linesByJob.get(jobId) ?? [];
          arr.push(line);
          linesByJob.set(jobId, arr);
        }

        const rawJobs = (jobsData ?? []) as unknown as RawJob[];
        const summaries: JobSummary[] = rawJobs.map((job) => {
          const lines = linesByJob.get(job.id) ?? [];
          let income = 0, labor = 0, materials = 0, otherExpenses = 0;
          let hasIncome = false, hasLabor = false;
          const txMap = new Map<number, Transaction>();
          const ccUnclearedByAccount = new Map<string, number>();

          for (const line of lines) {
            const typeName = line.accounts?.account_types?.name ?? '';
            const accountName = line.accounts?.name ?? '';
            const amt = Number(line.amount) || 0;
            const txId = line.transaction_id;
            const tx = line.transactions;

            if (txId && !txMap.has(txId)) {
              txMap.set(txId, {
                id: txId,
                date: tx?.date ?? '',
                description: tx?.description ?? '',
                amount: 0,
                type: 'other',
                cleared: true,
                vendorInstaller: null,
                accountName: accountName,
                isCcTransaction: false,
                ccSettled: true,
              });
            }

            const txEntry = txMap.get(txId);
            if (txEntry) {
              if (typeName === 'asset' || typeName === 'liability') {
                txEntry.amount = Math.abs(amt);
                // Track CC status for liability accounts
                if (typeName === 'liability') {
                  txEntry.isCcTransaction = true;
                  if (!line.cc_settled) txEntry.ccSettled = false;
                }
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
                  txEntry.vendorInstaller = `${line.installers.first_name} ${line.installers.last_name ?? ''}`.trim();
                } else if (line.vendors) {
                  txEntry.vendorInstaller = line.vendors.name;
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
            } else if (typeName === 'liability' && !line.cc_settled) {
              const existing = ccUnclearedByAccount.get(accountName) ?? 0;
              ccUnclearedByAccount.set(accountName, existing + Math.abs(amt));
            }
          }

          const transactions = Array.from(txMap.values()).sort((a, b) =>
            new Date(a.date).getTime() - new Date(b.date).getTime()
          );

          const ccBalances: CcBalance[] = Array.from(ccUnclearedByAccount.entries())
            .filter(([, amt]) => amt > 0)
            .map(([accountName, unclearedAmount]) => ({ accountName, unclearedAmount }))
            .sort((a, b) => b.unclearedAmount - a.unclearedAmount);

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
            ccBalances,
          };
        });

        setJobs(summaries);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load jobs');
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
    if (filter === 'open') result = result.filter((j) => j.status === 'open' || j.status === null);
    if (filter === 'closed') result = result.filter((j) => j.status === 'closed');
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
        {(['open', 'closed'] as FilterMode[]).map((mode) => (
          <button
            key={mode}
            onClick={() => setFilter(mode)}
            style={{ ...styles.filterBtn, ...(filter === mode ? styles.filterBtnActive : {}) }}
          >
            {mode === 'open' ? 'Open' : 'Closed'}
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
                {/* CC Balance Indicator */}
                {job.ccBalances.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginTop: 4, marginBottom: 4 }}>
                    {job.ccBalances.map((cc) => (
                      <span
                        key={cc.accountName}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.2rem',
                          fontSize: 10,
                          background: '#fef2f2',
                          color: '#b91c1c',
                          padding: '2px 6px',
                          borderRadius: 999,
                          border: '1px solid #fecaca',
                        }}
                      >
                        💳 {cc.accountName}: ${cc.unclearedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </span>
                    ))}
                  </div>
                )}
                <div style={styles.financials}>
                  <div style={styles.finRow}>
                    <span style={styles.finLabel}>Client</span>
                    <span style={styles.finAmount}>{job.hasIncome ? formatCurrency(job.income, 0) : '-'}</span>
                  </div>
                  <div style={styles.finRow}>
                    <span style={styles.finLabel}>Installer</span>
                    <span style={styles.finAmount}>{job.hasLabor ? formatCurrency(job.labor, 0) : '-'}</span>
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
                    job.transactions.map((tx) => {
                      // Row styling: subtle left border for unsettled CC, no background change
                      const isUnsettledCc = tx.isCcTransaction && !tx.ccSettled;
                      const rowStyle: React.CSSProperties = {
                        ...styles.txRow,
                        ...(isUnsettledCc && { borderLeft: '3px solid #f87171' }),
                      };
                      
                      return (
                        <div key={tx.id} style={rowStyle}>
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
                            <div style={styles.txStatus}>
                              {isUnsettledCc && (
                                <span style={{ color: '#f87171', marginRight: 4 }}>💳</span>
                              )}
                              <span style={{ color: tx.cleared ? '#10b981' : '#ef4444' }}>
                                {tx.cleared ? '✓' : '○'}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
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
