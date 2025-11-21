import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayLocalISO } from '../utils/date';


// --- Local date formatting helper (prevents timezone shifting) ---
function formatLocalDate(dateStr?: string | null) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${Number(m)}/${Number(d)}/${y}`;
}

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
  amount: number;
  is_cleared: boolean;
  transaction_id: number;
  transactions: {
    date: string;
    description: string | null;
  } | null;
  accounts: {
    name: string;
    account_types: { name: string } | null;
  } | null;
  vendors: {
    name: string;
  } | null;
  installers: {
    first_name: string;
    last_name: string | null;
  } | null;
};

type Totals = {
  income: number;
  materials: number;
  labor: number;
  otherExpenses: number;
  profit: number;
};

// One-row-per-transaction for this job, like the main Ledger
type JobLedgerRow = {
  transactionId: number;
  date: string;
  description: string;
  vendorInstaller: string;
  accountName: string; // cash-side accounts.name
  typeName: string;    // category-side accounts.name
  amount: number;
  cleared: boolean;
};

export function JobDetailView() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [job, setJob] = useState<Job | null>(null);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

  // NEW: ledger-style rows for this job
  const [jobLedgerRows, setJobLedgerRows] = useState<JobLedgerRow[]>([]);

  // NEW: local editable end-date input
  const [endDateInput, setEndDateInput] = useState<string>('');

  // Load all jobs once
  useEffect(() => {
    async function loadJobs() {
      setLoadingJobs(true);
      setError(null);
      const { data, error } = await supabase
        .from('jobs')
        .select('id, name, address, status, start_date, end_date')
        .order('created_at', { ascending: false });

      if (error) {
        console.error(error);
        setError(error.message);
        setJobs([]);
      } else {
        setJobs((data ?? []) as Job[]);
      }
      setLoadingJobs(false);
    }

    loadJobs();
  }, []);

  // When a job is selected, load its lines
  useEffect(() => {
    if (!selectedJobId) {
      setJob(null);
      setTotals(null);
      setEndDateInput('');
      setJobLedgerRows([]);
      return;
    }

    async function loadJobAndLines() {
      setLoading(true);
      setError(null);

      const jobIdNum = Number(selectedJobId);

      try {
        // Load job (with dates)
        const { data: jobData, error: jobErr } = await supabase
          .from('jobs')
          .select('id, name, address, status, start_date, end_date')
          .eq('id', jobIdNum)
          .single();

        if (jobErr) throw jobErr;
        const loadedJob = jobData as Job;
        setJob(loadedJob);

        // Prepopulate editable end date:
        setEndDateInput(loadedJob.end_date || todayLocalISO());

        // Load transaction lines for this job
        const { data: lineData, error: lineErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            amount,
            is_cleared,
            transaction_id,
            transactions (
              date,
              description
            ),
            accounts (
              name,
              account_types ( name )
            ),
            vendors (
              name
            ),
            installers (
              first_name,
              last_name
            )
          `)
          .eq('job_id', jobIdNum);

        if (lineErr) throw lineErr;

        const rawLines = (lineData ?? []) as any[];

        // Sort by transaction date ascending
        const sorted: Line[] = rawLines.sort((a, b) => {
          const da = a.transactions?.date
            ? new Date(a.transactions.date).getTime()
            : 0;
          const db = b.transactions?.date
            ? new Date(b.transactions.date).getTime()
            : 0;
          return da - db;
        });


        // Compute totals (unchanged)
        const totals: Totals = {
          income: 0,
          materials: 0,
          labor: 0,
          otherExpenses: 0,
          profit: 0,
        };

        for (const line of sorted) {
          const accType = line.accounts?.account_types?.name ?? null;

          if (accType === 'income') {
            // income lines are stored as negative (e.g. -4900),
            // so flip the sign
            totals.income += -line.amount;
          } else if (accType === 'expense') {
            // Decide what kind of expense this is:
            //  - if installer present => labor
            //  - else if vendor present => materials
            //  - else => other
            if (line.installers) {
              totals.labor += line.amount;
            } else if (line.vendors) {
              totals.materials += line.amount;
            } else {
              totals.otherExpenses += line.amount;
            }
          }
        }

        totals.profit =
          totals.income -
          (totals.materials + totals.labor + totals.otherExpenses);

        setTotals(totals);

        // NEW: build one-row-per-transaction ledger for this job
        const map = new Map<number, JobLedgerRow>();

        for (const line of sorted) {
          const txId = line.transaction_id;
          const accType = line.accounts?.account_types?.name ?? '';
          const accName = line.accounts?.name ?? '';

          let row = map.get(txId);
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
            map.set(txId, row);
          }

          // if any line isn't cleared, the whole transaction isn't cleared
          if (!line.is_cleared) row.cleared = false;

          // Vendor / Installer (from category side if available)
          if (!row.vendorInstaller) {
            if (line.installers) {
              row.vendorInstaller = `${line.installers.first_name} ${
                line.installers.last_name ?? ''
              }`.trim();
            } else if (line.vendors) {
              row.vendorInstaller = line.vendors.name;
            }
          }

          // Cash side: asset/liability → accountName and amount
          if (accType === 'asset' || accType === 'liability') {
            row.accountName = accName;
            const mag = Math.abs(line.amount ?? 0);
            if (mag > 0) row.amount = mag;
          }

          // Category side: income/expense → typeName (category account name)
          if ((accType === 'income' || accType === 'expense') && !row.typeName) {
            row.typeName = accName;
          }
        }

        const ledgerRows = Array.from(map.values()).sort((a, b) => {
          const da = a.date ? new Date(a.date).getTime() : 0;
          const db = b.date ? new Date(b.date).getTime() : 0;
          return da - db; // ascending for job view
        });

        setJobLedgerRows(ledgerRows);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Error loading job detail');
        setJob(null);
        setTotals(null);
        setJobLedgerRows([]);
      } finally {
        setLoading(false);
      }
    }

    loadJobAndLines();
  }, [selectedJobId]);

  async function handleCloseJob() {
    if (!job) return;
    setError(null);
    setClosing(true);

    try {
      const chosenEndDate = endDateInput || todayLocalISO();

      const { error } = await supabase
        .from('jobs')
        .update({
          status: 'closed',
          end_date: chosenEndDate,
        })
        .eq('id', job.id);

      if (error) throw error;

      setJob({ ...job, status: 'closed', end_date: chosenEndDate });
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error closing job');
    } finally {
      setClosing(false);
    }
  }

  if (loadingJobs) {
    return <p>Loading jobs…</p>;
  }

  return (
    <div>
      <h2>Job Detail</h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      <label>
        Job
        <select
          value={selectedJobId}
          onChange={(e) => setSelectedJobId(e.target.value)}
        >
          <option value="">Select a job…</option>
          {jobs.map((j) => (
            <option key={j.id} value={j.id}>
              {j.name}
            </option>
          ))}
        </select>
      </label>

      {!selectedJobId && (
        <p style={{ marginTop: '1rem' }}>Choose a job to see its details.</p>
      )}

      {selectedJobId && loading && <p>Loading job details…</p>}

      {job && totals && !loading && (
        <>
          {/* Job card */}
          <div
            style={{
              marginTop: '1rem',
              marginBottom: '1.5rem',
              borderRadius: 12,
              border: '1px solid #eee',
              padding: '1rem 1.25rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
              background: '#fff',
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: '0.25rem' }}>
              {job.name}
            </h3>
            {job.address && (
              <div style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>
                {job.address}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>
              Status: <strong>{job.status || 'open'}</strong>
            </div>

            {/* Start / End dates */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.75rem',
                fontSize: 12,
                color: '#555',
                marginBottom: 8,
              }}
            >
              <span>
                <strong>Start:</strong>{' '}
                {job.start_date ? formatLocalDate(job.start_date) : '—'}
              </span>

              <span>
                <strong>End:</strong>{' '}
                {job.status !== 'closed' ? (
                  <input
                    type="date"
                    value={endDateInput}
                    onChange={(e) => setEndDateInput(e.target.value)}
                    style={{ fontSize: 12 }}
                  />
                ) : job.end_date ? (
                  formatLocalDate(job.end_date)
                ) : (
                  '—'
                )}
              </span>
            </div>

            {job.status !== 'closed' && (
              <button
                onClick={handleCloseJob}
                disabled={closing}
                style={{
                  padding: '0.3rem 0.8rem',
                  borderRadius: 999,
                  border: '1px solid #b00020',
                  background: '#fff5f5',
                  color: '#b00020',
                  fontSize: 12,
                  cursor: 'pointer',
                  marginBottom: '0.5rem',
                }}
              >
                {closing ? 'Closing…' : 'Close Job'}
              </button>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.75rem',
                fontSize: 14,
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
              <Stat
                label="Margin"
                value={
                  totals.income > 0
                    ? (totals.profit / totals.income) * 100
                    : 0
                }
                suffix="%"
              />
            </div>
          </div>

          {/* Transaction list - now one row per transaction for this job */}
          <h3>Transactions</h3>
          {jobLedgerRows.length === 0 && (
            <p>No transactions found for this job.</p>
          )}

          {jobLedgerRows.length > 0 && (
            <table
              style={{
                borderCollapse: 'collapse',
                width: '100%',
                fontSize: 14,
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
                {jobLedgerRows.map((row) => (
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
}

// Small presentational helpers
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
