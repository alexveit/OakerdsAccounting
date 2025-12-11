import { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDate, todayLocalISO } from '../utils/date';
import { computeCcBalances } from '../utils/ccTracking';
import type { CcBalance, CcSettleTransferParams, CcTrackableLine } from '../utils/ccTracking';
import { CcBadgeList } from '../components/shared/CcBadge';
import { CcSettleModal } from '../components/shared/CcSettleModal';
import { CcStatusCell } from '../components/shared/CcStatusCell';

// Re-export for App.tsx
export type { CcSettleTransferParams } from '../utils/ccTracking';

type Job = {
  id: number;
  name: string;
  address: string | null;
  status: string | null;
  start_date?: string | null;
  end_date?: string | null;
  lead_source_id?: number | null;
  lead_sources?: { id: number; name: string; nick_name: string | null } | null;
};

type Line = CcTrackableLine & {
  job_id: number | null;
  is_cleared: boolean;
  transaction_id: number;
  transactions: { date: string; description: string | null } | null;
  vendors: { name: string } | null;
  installers: { first_name: string; last_name: string | null } | null;
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
  lineId: number | null;  // The CC line ID (for settle selection)
  ccAccountId: number | null;
  ccAccountName: string | null;
  date: string;
  description: string;
  vendorInstaller: string;
  accountName: string;
  typeName: string;
  amount: number;
  cleared: boolean;
  isCcTransaction: boolean;
  ccSettled: boolean;
};

type JobData = {
  totals: Totals;
  ledgerRows: JobLedgerRow[];
  ccBalances: CcBalance[];
};

type SettleModalData = {
  jobId: number;
  jobName: string;
  cc: CcBalance;
};

export function JobDetailView({
  onAddJobTransaction,
  onNavigateToTransfer,
}: {
  onAddJobTransaction?: (jobId: number) => void;
  onNavigateToTransfer?: (params: CcSettleTransferParams) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobDataById, setJobDataById] = useState<Record<number, JobData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [groupByLeadSource, setGroupByLeadSource] = useState<boolean>(false);
  const [selectedLeadSource, setSelectedLeadSource] = useState<string>('all');

  const [endDateByJob, setEndDateByJob] = useState<Record<number, string>>({});
  const [expandedJobs, setExpandedJobs] = useState<Record<number, boolean>>(() => {
    // Restore expanded state from localStorage
    try {
      const saved = localStorage.getItem('jobDetailView_expandedJobs');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Ref for debouncing localStorage writes
  const expandedJobsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist expanded state to localStorage with debounce
  useEffect(() => {
    if (expandedJobsSaveRef.current) {
      clearTimeout(expandedJobsSaveRef.current);
    }
    expandedJobsSaveRef.current = setTimeout(() => {
      localStorage.setItem('jobDetailView_expandedJobs', JSON.stringify(expandedJobs));
    }, 300);

    return () => {
      if (expandedJobsSaveRef.current) {
        clearTimeout(expandedJobsSaveRef.current);
      }
    };
  }, [expandedJobs]);

  // CC Settle modal state
  const [settleModal, setSettleModal] = useState<SettleModalData | null>(null);
  
  // CC bulk selection state
  const [selectedCcLineIds, setSelectedCcLineIds] = useState<Set<number>>(new Set());
  const [ccSettleError, setCcSettleError] = useState<string | null>(null);

  const today = todayLocalISO();

  // ------------------------------------------------------------
  // LOAD JOBS + LINES
  // ------------------------------------------------------------
  useEffect(() => {
    async function loadAll() {
      setLoading(true);
      setError(null);

      try {
        // Load jobs with lead source
        const { data: jobsData, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, name, address, status, start_date, end_date, lead_source_id, lead_sources ( id, name, nick_name )')
          .order('start_date', { ascending: false });

        if (jobsErr) throw jobsErr;
        const loadedJobs = (jobsData ?? []).map((j: Record<string, unknown>) => ({
          ...j,
          lead_sources: Array.isArray(j.lead_sources) ? j.lead_sources[0] ?? null : j.lead_sources,
        })) as Job[];
        setJobs(loadedJobs);

        // Initialize end dates
        setEndDateByJob((prev) => {
          const next = { ...prev };
          for (const j of loadedJobs) {
            if (!next[j.id]) next[j.id] = j.end_date || today;
          }
          return next;
        });

        // Load job transaction lines
        // Step 1: Get category lines (income/expense) that have job_id
        const { data: categoryLineData, error: categoryErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            job_id,
            transaction_id
          `)
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

        if (txIds.length === 0) {
          setJobDataById({});
          setLoading(false);
          return;
        }

        // Step 2: Get ALL lines for those transactions (includes cash lines)
        const { data: lineData, error: lineErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            job_id,
            amount,
            is_cleared,
            cc_settled,
            transaction_id,
            transactions ( date, description ),
            accounts ( id, name, account_types ( name ) ),
            vendors ( name ),
            installers ( first_name, last_name )
          `)
          .in('transaction_id', txIds);

        if (lineErr) throw lineErr;

        const allLines = (lineData ?? []) as unknown as Line[];

        // Group lines by job (using txToJob mapping since cash lines don't have job_id)
        const linesByJob = new Map<number, Line[]>();
        for (const line of allLines) {
          const jobId = line.job_id ?? txToJob.get(line.transaction_id);
          if (!jobId) continue;
          const arr = linesByJob.get(jobId) ?? [];
          arr.push(line);
          linesByJob.set(jobId, arr);
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

          // Calculate totals from transaction lines
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

          // Use shared utility for CC balances
          const ccBalances = computeCcBalances(sorted);

          const txMap = new Map<number, JobLedgerRow>();

          for (const line of sorted) {
            const txId = line.transaction_id;
            const type = line.accounts?.account_types?.name ?? '';

            let row = txMap.get(txId);
            if (!row) {
              row = {
                transactionId: txId,
                lineId: null,
                ccAccountId: null,
                ccAccountName: null,
                date: line.transactions?.date ?? '',
                description: line.transactions?.description ?? '',
                vendorInstaller: '',
                accountName: '',
                typeName: '',
                amount: 0,
                cleared: true,
                isCcTransaction: false,
                ccSettled: true,
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

              // Track if this is a CC (liability) transaction
              if (type === 'liability') {
                row.isCcTransaction = true;
                row.lineId = line.id;
                row.ccAccountId = line.accounts?.id ?? null;
                row.ccAccountName = line.accounts?.name ?? null;
                if (!line.cc_settled) row.ccSettled = false;
              }
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

          jobData[jobId] = { totals, ledgerRows, ccBalances };
        }

        setJobDataById(jobData);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Error loading jobs');
      } finally {
        setLoading(false);
      }
    }

    void loadAll();
  }, [today]);

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
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error closing job');
    }
  }

  function handleToggleJob(id: number) {
    setExpandedJobs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  // ------------------------------------------------------------
  // CC SETTLE HANDLERS
  // ------------------------------------------------------------
  function handleOpenSettleModal(job: Job, cc: CcBalance) {
    setSettleModal({ jobId: job.id, jobName: job.name, cc });
  }

  function handleToggleCcSelect(lineId: number) {
    setSelectedCcLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
    setCcSettleError(null);
  }

  function handleSettleSelectedCc(jobId: number, jobName: string) {
    setCcSettleError(null);

    if (selectedCcLineIds.size === 0) {
      setCcSettleError('No CC lines selected');
      return;
    }

    // Get the job's ledger rows
    const data = jobDataById[jobId];
    if (!data) return;

    // Get selected rows
    const selectedRows = data.ledgerRows.filter(
      (r) => r.lineId !== null && selectedCcLineIds.has(r.lineId)
    );

    // Validate all are unsettled CC
    const invalidRows = selectedRows.filter((r) => !r.isCcTransaction || r.ccSettled);
    if (invalidRows.length > 0) {
      setCcSettleError('Selection includes non-CC or already settled transactions');
      return;
    }

    // Validate all from same CC account
    const uniqueAccountIds = new Set(selectedRows.map((r) => r.ccAccountId).filter(Boolean));
    if (uniqueAccountIds.size > 1) {
      const accountNames = [...new Set(selectedRows.map((r) => r.ccAccountName).filter(Boolean))].join(', ');
      setCcSettleError(`Selected lines are from different credit cards: ${accountNames}`);
      return;
    }

    // Build CcBalance for modal
    const firstRow = selectedRows[0];
    if (!firstRow || firstRow.ccAccountId === null || firstRow.ccAccountName === null) {
      setCcSettleError('Invalid CC transaction: missing account information');
      return;
    }

    const totalAmount = Math.round(selectedRows.reduce((sum, r) => sum + Math.abs(r.amount), 0) * 100) / 100;
    const lineIds = selectedRows.map((r) => r.lineId).filter((id): id is number => id !== null);

    const ccBalance: CcBalance = {
      accountId: firstRow.ccAccountId,
      accountName: firstRow.ccAccountName,
      unclearedAmount: totalAmount,
      lineIds,
    };

    setSettleModal({ jobId, jobName, cc: ccBalance });
  }

  if (loading) return <p>Loading jobs...</p>;

  // ------------------------------------------------------------
  // YEAR FILTERING + LEAD SOURCE FILTERING
  // ------------------------------------------------------------
  const years = Array.from(
    new Set(
      jobs.map((j) => j.start_date?.slice(0, 4)).filter((y): y is string => !!y)
    )
  )
    .sort()
    .reverse();

  // Build unique lead sources from jobs
  const leadSourcesMap = new Map<number, { id: number; name: string; nick_name: string | null }>();
  for (const job of jobs) {
    if (job.lead_sources) {
      leadSourcesMap.set(job.lead_sources.id, job.lead_sources);
    }
  }
  const leadSources = Array.from(leadSourcesMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  const filteredJobs = jobs.filter((j) => {
    // Year filter
    if (selectedYear !== 'all' && j.start_date?.slice(0, 4) !== selectedYear) {
      return false;
    }
    // Lead source filter
    if (selectedLeadSource !== 'all') {
      const sourceId = j.lead_sources?.id;
      if (selectedLeadSource === 'none') {
        if (sourceId) return false;
      } else {
        if (String(sourceId) !== selectedLeadSource) return false;
      }
    }
    return true;
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
  // GROUP BY LEAD SOURCE (for closed jobs)
  // ------------------------------------------------------------
  const closedByLeadSource = new Map<string, Job[]>();
  if (groupByLeadSource) {
    for (const job of closedJobs) {
      const key = job.lead_sources?.name ?? 'No Lead Source';
      const arr = closedByLeadSource.get(key) ?? [];
      arr.push(job);
      closedByLeadSource.set(key, arr);
    }
  }

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

  // ------------------------------------------------------------
  // RENDER CARD
  // ------------------------------------------------------------
  const renderJobCard = (job: Job) => {
    const data = jobDataById[job.id];
    if (!data) return null;

    const { totals, ledgerRows, ccBalances } = data;
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

        {/* STATUS + LEAD SOURCE */}
        <div style={{ fontSize: 12, color: '#777', marginBottom: 4, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <span>
            Status:{' '}
            <strong style={{ color: job.status === 'closed' ? '#b00020' : '#0a7a3c' }}>
              {job.status || 'open'}
            </strong>
          </span>
          {job.lead_sources && (
            <span>
              Source: <strong>{job.lead_sources.nick_name || job.lead_sources.name}</strong>
            </span>
          )}
        </div>

        {/* CC BALANCE INDICATOR */}
        {/* CC BALANCE INDICATOR */}
        <CcBadgeList 
          ccBalances={ccBalances} 
          onBadgeClick={(cc) => handleOpenSettleModal(job, cc)} 
        />

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
            {job.start_date ? formatLocalDate(job.start_date) : '-'}
          </span>

          {/* END DATE + CLOSE BUTTON */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <strong>End:</strong>{' '}
            {job.status === 'closed' ? (
              job.end_date ? formatLocalDate(job.end_date) : '-'
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
                  void handleCloseJob(job);
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
                e.stopPropagation();
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
          <span>{isExpanded ? '▼' : '▶'}</span>
          <span>Transactions</span>
        </h3>

        {isExpanded && (
          <div onClick={(e) => e.stopPropagation()}>
            {ledgerRows.length === 0 && (
              <p style={{ fontSize: 13 }}>No transactions found for this job.</p>
            )}

            {ledgerRows.length > 0 && (
              <>
                {/* CC Selection Action Bar */}
                {(() => {
                  const selectedInJob = ledgerRows.filter(
                    (r) => r.lineId !== null && selectedCcLineIds.has(r.lineId)
                  );
                  if (selectedInJob.length === 0) return null;
                  
                  return (
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        padding: '0.5rem 0.75rem',
                        backgroundColor: '#f0f9ff',
                        borderRadius: 4,
                        marginBottom: '0.5rem',
                        fontSize: 13,
                      }}
                    >
                      <span style={{ fontWeight: 500 }}>
                        {selectedInJob.length} CC transaction{selectedInJob.length > 1 ? 's' : ''} selected
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSettleSelectedCc(job.id, job.name);
                        }}
                        style={{
                          padding: '0.25rem 0.75rem',
                          backgroundColor: '#2563eb',
                          color: 'white',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Settle Selected CC
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedCcLineIds(new Set());
                        }}
                        style={{
                          padding: '0.25rem 0.5rem',
                          backgroundColor: 'transparent',
                          color: '#666',
                          border: '1px solid #ccc',
                          borderRadius: 4,
                          cursor: 'pointer',
                          fontSize: 12,
                        }}
                      >
                        Clear
                      </button>
                      {ccSettleError && (
                        <span style={{ color: '#b91c1c', fontSize: 12 }}>{ccSettleError}</span>
                      )}
                    </div>
                  );
                })()}

                <table
                  style={{
                    borderCollapse: 'collapse',
                    width: '100%',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <Th align="center" style={{ width: 30 }}></Th>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th>Account</Th>
                      <Th>Type</Th>
                      <Th>Vendor / Installer</Th>
                      <Th align="right">Amount</Th>
                      <Th align="center">Cleared</Th>
                      <Th align="center">CC</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerRows.map((row) => {
                      // Combine uncleared styling (yellow) with unsettled CC styling (light red)
                      // CC unsettled takes precedence
                      let rowBg: string | undefined;
                      if (row.isCcTransaction && !row.ccSettled) {
                        rowBg = '#fef2f2'; // Light red for unsettled CC
                      } else if (!row.cleared) {
                        rowBg = '#fffbe6'; // Yellow for uncleared
                      }
                      
                      const canSelectForSettle = row.isCcTransaction && !row.ccSettled && row.lineId !== null;
                      const isSelected = row.lineId !== null && selectedCcLineIds.has(row.lineId);
                      
                      return (
                        <tr 
                          key={row.transactionId} 
                          style={{ backgroundColor: rowBg }}
                        >
                          <Td align="center">
                            {canSelectForSettle && (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onClick={(e) => e.stopPropagation()}
                                onChange={() => row.lineId !== null && handleToggleCcSelect(row.lineId)}
                                style={{ cursor: 'pointer' }}
                              />
                            )}
                          </Td>
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
                          <Td align="center">
                            <CcStatusCell 
                              isCcTransaction={row.isCcTransaction} 
                              ccSettled={row.ccSettled} 
                            />
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    );
  };

  // ------------------------------------------------------------
  // RENDER MAIN
  // ------------------------------------------------------------
  return (
    <div>
      <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>Jobs</h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}

      {/* Filters row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
          marginBottom: '1rem',
        }}
      >
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: 14 }}>
          Year:
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{ padding: '0.25rem 0.5rem', fontSize: 14 }}
          >
            <option value="all">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontSize: 14 }}>
          Lead Source:
          <select
            value={selectedLeadSource}
            onChange={(e) => setSelectedLeadSource(e.target.value)}
            style={{ padding: '0.25rem 0.5rem', fontSize: 14 }}
          >
            <option value="all">All sources</option>
            <option value="none">No lead source</option>
            {leadSources.map((ls) => (
              <option key={ls.id} value={ls.id}>
                {ls.nick_name || ls.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: 13 }}>
          <input
            type="checkbox"
            checked={groupByLeadSource}
            onChange={(e) => setGroupByLeadSource(e.target.checked)}
          />
          Group closed by lead source
        </label>
      </div>

      {filteredJobs.length === 0 && (
        <p style={{ marginTop: '1rem' }}>No jobs found for the selected filters.</p>
      )}

      {filteredJobs.length > 0 && (
        <>
          {/* Open Jobs Section */}
          {openJobs.length > 0 && (
            <>
              <h3 style={{ marginTop: '0.5rem', marginBottom: '0.75rem', color: '#0a7a3c' }}>
                Open Jobs ({openJobs.length})
              </h3>
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  alignItems: 'flex-start',
                  marginBottom: '1.5rem',
                }}
              >
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {openCols.left.map((job) => renderJobCard(job))}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  {openCols.right.map((job) => renderJobCard(job))}
                </div>
              </div>
            </>
          )}

          {/* Closed Jobs Section */}
          {closedJobs.length > 0 && (
            <>
              {groupByLeadSource ? (
                // Grouped by lead source
                Array.from(closedByLeadSource.entries())
                  .sort(([a], [b]) => {
                    // "No Lead Source" goes last
                    if (a === 'No Lead Source') return 1;
                    if (b === 'No Lead Source') return -1;
                    return a.localeCompare(b);
                  })
                  .map(([sourceName, sourceJobs]) => {
                    const sourceCols = buildColumns(sourceJobs);
                    return (
                      <div key={sourceName}>
                        <h3 style={{ marginTop: '1rem', marginBottom: '0.75rem', color: '#555' }}>
                          {sourceName} ({sourceJobs.length})
                        </h3>
                        <div
                          style={{
                            display: 'flex',
                            gap: '1rem',
                            alignItems: 'flex-start',
                            marginBottom: '1rem',
                          }}
                        >
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {sourceCols.left.map((job) => renderJobCard(job))}
                          </div>
                          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                            {sourceCols.right.map((job) => renderJobCard(job))}
                          </div>
                        </div>
                      </div>
                    );
                  })
              ) : (
                // Not grouped
                <>
                  <h3 style={{ marginTop: '1rem', marginBottom: '0.75rem', color: '#b00020' }}>
                    Closed Jobs ({closedJobs.length})
                  </h3>
                  <div
                    style={{
                      display: 'flex',
                      gap: '1rem',
                      alignItems: 'flex-start',
                    }}
                  >
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {closedCols.left.map((job) => renderJobCard(job))}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                      {closedCols.right.map((job) => renderJobCard(job))}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}

      {/* CC SETTLE MODAL */}
      {settleModal && (
        <CcSettleModal
          entityName={settleModal.jobName}
          cc={settleModal.cc}
          onClose={() => {
            setSettleModal(null);
            setCcSettleError(null);
          }}
          onSettled={() => {
            // Update local state: mark rows as settled and update ccBalances
            setJobDataById((prev) => {
              const jobDataItem = prev[settleModal.jobId];
              if (!jobDataItem) return prev;
              
              const settledLineIds = new Set(settleModal.cc.lineIds);
              
              return {
                ...prev,
                [settleModal.jobId]: {
                  ...jobDataItem,
                  // Mark settled rows
                  ledgerRows: jobDataItem.ledgerRows.map((row) =>
                    row.lineId !== null && settledLineIds.has(row.lineId)
                      ? { ...row, ccSettled: true }
                      : row
                  ),
                  // Remove or update CC balance
                  ccBalances: jobDataItem.ccBalances
                    .map((cc) => {
                      if (cc.accountId !== settleModal.cc.accountId) return cc;
                      // Remove settled line IDs from this balance
                      const remainingLineIds = cc.lineIds.filter((id) => !settledLineIds.has(id));
                      if (remainingLineIds.length === 0) return null;
                      // Recalculate amount from remaining rows
                      const remainingAmount = Math.round(jobDataItem.ledgerRows
                        .filter((r) => r.lineId !== null && remainingLineIds.includes(r.lineId))
                        .reduce((sum, r) => sum + Math.abs(r.amount), 0) * 100) / 100;
                      return { ...cc, lineIds: remainingLineIds, unclearedAmount: remainingAmount };
                    })
                    .filter((cc): cc is CcBalance => cc !== null),
                },
              };
            });
            // Clear selection
            setSelectedCcLineIds(new Set());
            setSettleModal(null);
            setCcSettleError(null);
          }}
          onNavigateToTransfer={onNavigateToTransfer}
        />
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
  style,
}: {
  children?: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  style?: React.CSSProperties;
}) {
  return (
    <th
      style={{
        borderBottom: '1px solid #ccc',
        textAlign: align,
        padding: '4px 6px',
        ...style,
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
