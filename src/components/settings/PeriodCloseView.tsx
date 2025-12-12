// src/components/settings/PeriodCloseView.tsx

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

type ClosedPeriod = {
  year_month: string;
  closed_at: string;
  closed_by: string | null;
  notes: string | null;
  is_latest: boolean;
};

type RawClosedPeriod = {
  year_month: string;
  closed_at: string;
  closed_by: string | null;
  notes: string | null;
  is_latest: boolean;
};

export function PeriodCloseView() {
  const [closedPeriods, setClosedPeriods] = useState<ClosedPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Close period form state
  const [nextPeriodToClose, setNextPeriodToClose] = useState<string | null>(null);
  const [closeNotes, setCloseNotes] = useState('');
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState<string | null>(null);
  const [closeSuccess, setCloseSuccess] = useState<string | null>(null);

  // Reopen form state
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);
  const [showReopenConfirm, setShowReopenConfirm] = useState(false);

  useEffect(() => {
    loadClosedPeriods();
  }, []);

  async function loadClosedPeriods() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: err } = await supabase
        .from('period_close_status_v')
        .select('*')
        .order('year_month', { ascending: false });

      if (err) throw err;

      const periods = (data ?? []) as unknown as RawClosedPeriod[];
      setClosedPeriods(periods);

      // Calculate next period to close
      if (periods.length > 0) {
        const latest = periods[0].year_month;
        const year = parseInt(latest.substring(0, 4), 10);
        const month = parseInt(latest.substring(5, 7), 10);

        if (month === 12) {
          setNextPeriodToClose(`${year + 1}-01`);
        } else {
          setNextPeriodToClose(`${year}-${String(month + 1).padStart(2, '0')}`);
        }
      } else {
        // No periods closed yet - default to last month
        const now = new Date();
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        setNextPeriodToClose(
          `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`
        );
      }
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load closed periods');
    } finally {
      setLoading(false);
    }
  }

  async function handleClosePeriod() {
    if (!nextPeriodToClose) return;

    setClosing(true);
    setCloseError(null);
    setCloseSuccess(null);

    try {
      const { error: err } = await supabase.rpc('close_period', {
        p_year_month: nextPeriodToClose,
        p_closed_by: 'User',
        p_notes: closeNotes || null,
      });

      if (err) throw err;

      setCloseSuccess(`Period ${nextPeriodToClose} closed successfully`);
      setCloseNotes('');
      await loadClosedPeriods();
    } catch (err: unknown) {
      console.error(err);
      setCloseError(err instanceof Error ? err.message : 'Failed to close period');
    } finally {
      setClosing(false);
    }
  }

  async function handleReopenPeriod() {
    const latestPeriod = closedPeriods.find((p) => p.is_latest);
    if (!latestPeriod || !reopenReason.trim()) return;

    setReopening(true);
    setCloseError(null);
    setCloseSuccess(null);

    try {
      const { error: err } = await supabase.rpc('reopen_period', {
        p_year_month: latestPeriod.year_month,
        p_reason: reopenReason,
      });

      if (err) throw err;

      setCloseSuccess(`Period ${latestPeriod.year_month} reopened`);
      setReopenReason('');
      setShowReopenConfirm(false);
      await loadClosedPeriods();
    } catch (err: unknown) {
      console.error(err);
      setCloseError(err instanceof Error ? err.message : 'Failed to reopen period');
    } finally {
      setReopening(false);
    }
  }

  function formatPeriodLabel(yearMonth: string): string {
    const [year, month] = yearMonth.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthIndex = parseInt(month, 10) - 1;
    return `${monthNames[monthIndex]} ${year}`;
  }

  const latestClosed = closedPeriods.find((p) => p.is_latest);

  if (loading) {
    return <p>Loading period close status...</p>;
  }

  if (error) {
    return <p className="text-negative">Error: {error}</p>;
  }

  return (
    <div>
      <h2 className="mt-0 mb-4">Period Close</h2>

      {/* Status Summary */}
      <div className="card mb-6">
        <h3 className="mt-0 mb-2">Current Status</h3>
        {latestClosed ? (
          <p className="m-0 text-sm">
            <span className="font-medium">Closed through:</span>{' '}
            <span className="text-positive font-semibold">
              {formatPeriodLabel(latestClosed.year_month)}
            </span>
          </p>
        ) : (
          <p className="m-0 text-sm text-amber-600">
            No periods closed yet. Transactions can be edited for any date.
          </p>
        )}
      </div>

      {/* Close Next Period */}
      <div className="card mb-6">
        <h3 className="mt-0 mb-4">Close Period</h3>

        {closeError && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            {closeError}
          </div>
        )}

        {closeSuccess && (
          <div className="p-3 mb-4 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
            {closeSuccess}
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Next period to close</label>
          <div className="text-xl font-semibold text-blue-600">
            {nextPeriodToClose ? formatPeriodLabel(nextPeriodToClose) : 'N/A'}
          </div>
          <p className="text-xs text-muted mt-1">
            Periods must be closed sequentially. Once closed, transactions in this period cannot
            be created, modified, or deleted.
          </p>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">Notes (optional)</label>
          <input
            type="text"
            value={closeNotes}
            onChange={(e) => setCloseNotes(e.target.value)}
            placeholder="e.g., Year-end close after tax filing"
          />
        </div>

        <button
          onClick={handleClosePeriod}
          disabled={closing || !nextPeriodToClose}
          className="btn btn-primary"
        >
          {closing ? 'Closing...' : `Close ${nextPeriodToClose ? formatPeriodLabel(nextPeriodToClose) : ''}`}
        </button>
      </div>

      {/* Reopen Period (if any closed) */}
      {latestClosed && (
        <div className="card mb-6 bg-amber-50 border-amber-200">
          <h3 className="mt-0 mb-4 text-amber-800">Reopen Period</h3>

          {!showReopenConfirm ? (
            <div>
              <p className="text-sm text-muted mb-3">
                You can reopen the most recent closed period if you need to make corrections. This
                should be rare.
              </p>
              <button
                onClick={() => setShowReopenConfirm(true)}
                className="btn border-amber-500 text-amber-700 hover:bg-amber-100"
              >
                Reopen {formatPeriodLabel(latestClosed.year_month)}...
              </button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-amber-800 font-medium mb-3">
                Are you sure? This will allow edits to transactions in{' '}
                {formatPeriodLabel(latestClosed.year_month)}.
              </p>

              <div className="mb-3">
                <label className="block text-sm font-medium mb-1">
                  Reason for reopening (required)
                </label>
                <input
                  type="text"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="e.g., Found missing transaction that needs to be added"
                />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleReopenPeriod}
                  disabled={reopening || !reopenReason.trim()}
                  className="btn bg-amber-600 text-white border-amber-600 hover:bg-amber-700"
                >
                  {reopening ? 'Reopening...' : 'Confirm Reopen'}
                </button>
                <button
                  onClick={() => {
                    setShowReopenConfirm(false);
                    setReopenReason('');
                  }}
                  className="btn"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* History */}
      <div className="card">
        <h3 className="mt-0 mb-4">Closed Period History</h3>

        {closedPeriods.length === 0 ? (
          <p className="text-sm text-muted">No periods have been closed yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Period</th>
                <th>Closed At</th>
                <th>By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {closedPeriods.map((period) => (
                <tr key={period.year_month}>
                  <td className="font-medium">
                    {formatPeriodLabel(period.year_month)}
                    {period.is_latest && (
                      <span className="badge badge-info ml-2">Latest</span>
                    )}
                  </td>
                  <td className="text-muted">
                    {new Date(period.closed_at).toLocaleString()}
                  </td>
                  <td className="text-muted">{period.closed_by || '-'}</td>
                  <td className="text-muted">{period.notes || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
