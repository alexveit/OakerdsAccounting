import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDate, todayLocalISO } from '../utils/date';

type Job = {
  id: number;
  name: string;
  address: string | null;
  status: string | null;
  start_date?: string | null;
  end_date?: string | null;
};

type Line = {
  id: number;
  job_id: number | null;
  amount: number;
  is_cleared: boolean;
  transaction_id: number;
  transactions: any;
  accounts: any;
  vendors: any;
  installers: any;
};

type Totals = {
  income: number;
  materials: number;
  labor: number;
  otherExpenses: number;
  profit: number;
};

type JobLedgerRow = {
  transactionId: number;
  date: string;
  description: string;
  vendorInstaller: string;
  accountName: string;
  typeName: string;
  amount: number;
  cleared: boolean;
};

type JobData = {
  totals: Totals;
  ledgerRows: JobLedgerRow[];
};

export function JobDetailView({onAddJobTransaction,}: {onAddJobTransaction?: (jobId: number) => void;}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobDataById, setJobDataById] = useState<Record<number, JobData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<string>('all');

  const [endDateByJob, setEndDateByJob] = useState<Record<number, string>>({});
  const [expandedJobs, setExpandedJobs] = useState<Record<number, boolean>>({});

  const today = todayLocalISO();

  // ------------------------------------------------------------
  // LOAD JOBS + LINES
  // ------------------------------------------------------------
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);

      try {
        // Load jobs
        const { data: jobsData, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, name, address, status, start_date, end_date')
          .order('created_at', { ascending: false });

        if (jobsErr) throw jobsErr;
        const jobs = (jobsData ?? []) as Job[];
        setJobs(jobs);

        // Initialize end dates
        setEndDateByJob((prev) => {
          const next = { ...prev };
          for (const j of jobs) {
            if (!next[j.id]) next[j.id] = j.end_date || today;
          }
          return next;
        });

                   // Load job transaction lines
        const { data: lineData, error: lineErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            job_id,
            amount,
            is_cleared,
            transaction_id,
            transactions ( date, description ),
            accounts ( name, account_types ( name ) ),
            vendors ( name ),
            installers ( first_name, last_name )
          `)
          .not('job_id', 'is', null);

        if (lineErr) throw lineErr;

        const allLines = (lineData ?? []) as Line[];

        // Group lines by job
        const linesByJob = new Map<number, Line[]>();
        for (const line of allLines) {
          if (!line.job_id) continue;
          const arr = linesByJob.get(line.job_id) ?? [];
          arr.push(line);
          linesByJob.set(line.job_id, arr);
        }

        // Build totals + ledger per job
        const jobData: Record<number, JobData> = {};

        for (const [jobId, lines] of linesByJob.entries()) {
          const sorted = [...lines].sort((a, b) => {
            const da = a.transactions?.date ? new Date(a.transactions.date).getTime() : 0;
            const db = b.transactions?.date ? new Date(b.transactions.date).getTime() : 0;
            return da - db;
          });

          const totals: Totals = {
            income: 0,
            materials: 0,
            labor: 0,
            otherExpenses: 0,
            profit: 0,
          };

          for (const line of sorted) {
            const type = line.accounts?.account_types?.name ?? null;

            if (type === 'income') {
              totals.income += -line.amount;
            } else if (type === 'expense') {
              if (line.installers) totals.labor += line.amount;
              else if (line.vendors) totals.materials += line.amount;
              else totals.otherExpenses += line.amount;
            }
          }

          totals.profit = totals.income - (totals.materials + totals.labor + totals.otherExpenses);

          const txMap = new Map<number, JobLedgerRow>();

          for (const line of sorted) {
            const txId = line.transaction_id;
            const type = line.accounts?.account_types?.name ?? '';

            let row = txMap.get(txId);
            if (!row) {
              row = {
                transactionId: txId,
                date: line.transactions?.date ?? '',
                description: line.transactions?.description ?? '',
                vendorInstaller: '',
                accountName: '',
                typeName: '',
                amount: 0,
                cleared: true,
              };
              txMap.set(txId, row);
            }

            if (!line.is_cleared) row.cleared = false;

            if (!row.vendorInstaller) {
              if (line.installers) {
                row.vendorInstaller = `${line.installers.first_name} ${line.installers.last_name ?? ''}`.trim();
              } else if (line.vendors) {
                row.vendorInstaller = line.vendors.name;
              }
            }

            if (type === 'asset' || type === 'liability') {
              row.accountName = line.accounts?.name ?? '';
              const mag = Math.abs(line.amount);
              if (mag > 0) row.amount = mag;
            }

            if ((type === 'income' || type === 'expense') && !row.typeName) {
              row.typeName = line.accounts?.name ?? '';
            }
          }

          const ledgerRows = Array.from(txMap.values()).sort((a, b) => {
            const da = a.date ? new Date(a.date).getTime() : 0;
            const db = b.date ? new Date(b.date).getTime() : 0;
            return da - db;
          });

          jobData[jobId] = { totals, ledgerRows };
        }

        setJobDataById(jobData);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Error loading jobs');
      } finally {
        setLoading(false);
      }
    }

    loadAll();
  }, []);

  // ------------------------------------------------------------
  // CLOSE JOB
  // ------------------------------------------------------------
  async function handleCloseJob(job: Job) {
    if (!window.confirm(`Close job "${job.name}"?`)) return;

    try {
      const chosenEnd = endDateByJob[job.id] || today;

      const { error: updErr } = await supabase
        .from('jobs')
        .update({ status: 'closed', end_date: chosenEnd })
        .eq('id', job.id);

      if (updErr) throw updErr;

      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id ? { ...j, status: 'closed', end_date: chosenEnd } : j
        )
      );
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error closing job');
    }
  }

  function handleToggleJob(id: number) {
    setExpandedJobs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  if (loading) return <p>Loading jobs…</p>;

  // ------------------------------------------------------------
  // YEAR FILTERING
  // ------------------------------------------------------------
  const years = Array.from(
    new Set(
      jobs.map((j) => j.start_date?.slice(0, 4)).filter((y): y is string => !!y)
    )
  )
    .sort()
    .reverse();

  const filteredJobs = jobs.filter((j) => {
    if (selectedYear === 'all') return true;
    return j.start_date?.slice(0, 4) === selectedYear;
  });

  // ------------------------------------------------------------
  // OPEN-FIRST SORT
  // ------------------------------------------------------------
  const openJobs = filteredJobs
    .filter((j) => j.status !== 'closed')
    .sort((a, b) => {
      const da = a.start_date ? new Date(a.start_date).getTime() : 0;
      const db = b.start_date ? new Date(b.start_date).getTime() : 0;
      return da - db;
    });

  const closedJobs = filteredJobs
    .filter((j) => j.status === 'closed')
    .sort((a, b) => {
      const da = a.start_date ? new Date(a.start_date).getTime() : 0;
      const db = b.start_date ? new Date(b.start_date).getTime() : 0;
      return da - db;
    });

  // ------------------------------------------------------------
  // COLUMN BUILDER (bottom-up tetris per group)
  // ------------------------------------------------------------
  function buildColumns(list: Job[]) {
    const left: Job[] = [];
    const right: Job[] = [];
    for (let i = 0; i < list.length; i += 2) {
      left.push(list[i]);
      if (i + 1 < list.length) right.push(list[i + 1]);
    }
    left.reverse();
    right.reverse();
    return { left, right };
  }

  const openCols = buildColumns(openJobs);
  const closedCols = buildColumns(closedJobs);

  const leftCol = [...openCols.left, ...closedCols.left];
  const rightCol = [...openCols.right, ...closedCols.right];

  // ------------------------------------------------------------
  // RENDER CARD
  // ------------------------------------------------------------
  const renderJobCard = (job: Job) => {
    const data = jobDataById[job.id];
    if (!data) return null;

    const { totals, ledgerRows } = data;
    const marginPct = totals.income > 0 ? (totals.profit / totals.income) * 100 : 0;

    const isExpanded = expandedJobs[job.id] ?? false;
    const endInputValue = endDateByJob[job.id] || job.end_date || today;

    return (
      <div
        key={job.id}
        onClick={() => handleToggleJob(job.id)}
        style={{
          marginBottom: '1rem',
          borderRadius: 12,
          border: '1px solid #eee',
          padding: '1rem 1.25rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          background: '#fff',
          cursor: 'pointer',
        }}
      >
        {/* NAME */}
        <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>{job.name}</h3>

        {job.address && (
          <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>
            {job.address}
          </div>
        )}

        {/* STATUS */}
        <div style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>
          Status:{' '}
          <strong style={{ color: job.status === 'closed' ? '#b00020' : '#0a7a3c' }}>
            {job.status || 'open'}
          </strong>
        </div>

        {/* --- Start / End / Close job on same row --- */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            fontSize: 12,
            color: '#555',
            marginBottom: 8,
            flexWrap: 'wrap',
          }}
        >
          {/* START DATE */}
          <span>
            <strong>Start:</strong>{' '}
            {job.start_date ? formatLocalDate(job.start_date) : '—'}
          </span>

          {/* END DATE + CLOSE BUTTON */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <strong>End:</strong>{' '}
            {job.status === 'closed' ? (
              job.end_date ? formatLocalDate(job.end_date) : '—'
            ) : (
              <input
                type="date"
                value={endInputValue}
                onChange={(e) =>
                  setEndDateByJob((prev) => ({
                    ...prev,
                    [job.id]: e.target.value,
                  }))
                }
                onClick={(e) => e.stopPropagation()}
                style={{ fontSize: 12 }}
              />
            )}

            {job.status !== 'closed' && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCloseJob(job);
                }}
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: 999,
                  border: '1px solid #b00020',
                  background: '#fff5f5',
                  color: '#b00020',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Close Job
              </button>
            )}
          </span>
        </div>

        {/* QUICK ADD TRANSACTION BUTTON (only for open jobs) */}
        {job.status !== 'closed' && onAddJobTransaction && (
          <div style={{ marginTop: '0.5rem', marginBottom: '0.5rem' }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation(); // don't toggle expand when clicking
                onAddJobTransaction(job.id);
              }}
              style={{
                padding: '0.3rem 0.8rem',
                borderRadius: 999,
                border: '1px solid #111',
                background: '#111',
                color: '#fff',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              + Add Transaction
            </button>
          </div>
        )}

        {/* STATS */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
            gap: '0.75rem',
            fontSize: 14,
            marginBottom: '0.75rem',
          }}
        >
          <Stat label="Income" value={totals.income} money />
          <Stat label="Materials" value={totals.materials} money />
          <Stat label="Labor" value={totals.labor} money />
          <Stat label="Other Exp." value={totals.otherExpenses} money />
          <Stat
            label="Profit"
            value={totals.profit}
            money
            highlight={totals.profit >= 0 ? 'positive' : 'negative'}
          />
          <Stat label="Margin" value={marginPct} suffix="%" />
        </div>

        {/* TRANSACTIONS */}
        <h3
          style={{
            marginTop: '1.25rem',
            borderTop: '1px solid #eee',
            paddingTop: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: 15,
          }}
        >
          <span>{isExpanded ? '▾' : '▸'}</span>
          <span>Transactions</span>
        </h3>

        {isExpanded && (
          <>
            {ledgerRows.length === 0 && (
              <p style={{ fontSize: 13 }}>No transactions found for this job.</p>
            )}

            {ledgerRows.length > 0 && (
              <table
                style={{
                  borderCollapse: 'collapse',
                  width: '100%',
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr>
                    <Th>Date</Th>
                    <Th>Description</Th>
                    <Th>Account</Th>
                    <Th>Type</Th>
                    <Th>Vendor / Installer</Th>
                    <Th align="right">Amount</Th>
                    <Th align="center">Cleared</Th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerRows.map((row) => (
                    <tr key={row.transactionId}>
                      <Td>{formatLocalDate(row.date)}</Td>
                      <Td>{row.description}</Td>
                      <Td>{row.accountName}</Td>
                      <Td>{row.typeName}</Td>
                      <Td>{row.vendorInstaller}</Td>
                      <Td align="right">
                        {row.amount.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Td>
                      <Td align="center">{row.cleared ? '✓' : ''}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    );
  };

  // ------------------------------------------------------------
  // RENDER MAIN
  // ------------------------------------------------------------
  return (
    <div>
      <h2>Job Detail</h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <label>
        Year{' '}
        <select
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>

      {filteredJobs.length === 0 && (
        <p style={{ marginTop: '1rem' }}>No jobs found for this year.</p>
      )}

      {filteredJobs.length > 0 && (
        <div
          style={{
            marginTop: '1rem',
            display: 'flex',
            gap: '1rem',
            alignItems: 'flex-start',
          }}
        >
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {leftCol.map((job) => renderJobCard(job))}
          </div>

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            {rightCol.map((job) => renderJobCard(job))}
          </div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// SMALL PRESENTATIONAL HELPERS
// ------------------------------------------------------------
function Stat({
  label,
  value,
  money,
  suffix,
  highlight,
}: {
  label: string;
  value: number;
  money?: boolean;
  suffix?: string;
  highlight?: 'positive' | 'negative';
}) {
  let color = '#111';
  if (highlight === 'positive') color = '#0a7a3c';
  if (highlight === 'negative') color = '#b00020';

  const display = money
    ? `$${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : `${value.toFixed(1)}${suffix ?? ''}`;

  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#777' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color }}>{display}</div>
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
      }}
    >
      {children}
    </td>
  );
}
