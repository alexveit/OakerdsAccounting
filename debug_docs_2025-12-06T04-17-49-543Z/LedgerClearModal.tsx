// src/components/ledger/LedgerClearModal.tsx

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { LedgerRow } from './types';
import { formatDate } from './utils';

type LedgerClearModalProps = {
  row: LedgerRow;
  onClose: () => void;
  onSuccess: () => void;
  onError: (message: string) => void;
};

/**
 * Get display description combining job name and description
 */
function getDisplayDescription(row: LedgerRow): string {
  if (row.job_name && row.description) {
    return `${row.job_name} / ${row.description}`;
  }
  return row.job_name || row.description || '';
}

export function LedgerClearModal({ row, onClose, onSuccess, onError }: LedgerClearModalProps) {
  const defaultAmount = Math.abs(Number(row.amount)).toFixed(2);
  const todayISO = new Date().toISOString().slice(0, 10);

  const [clearDate, setClearDate] = useState(row.date || todayISO);
  const [clearDescription, setClearDescription] = useState(row.description ?? '');
  const [clearAmount, setClearAmount] = useState(defaultAmount);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleConfirm() {
    try {
      setError(null);
      setSaving(true);

      let finalAmount = Number(row.amount);
      const amountTrim = clearAmount.trim();

      if (amountTrim !== '') {
        const parsed = Number(amountTrim);
        if (Number.isNaN(parsed) || parsed <= 0) {
          setError('Invalid amount. Use a positive number like 58.15.');
          setSaving(false);
          return;
        }
        const sign = Number(row.amount) < 0 ? -1 : 1;
        finalAmount = parsed * sign;
      }

      let newDate: string | null = null;
      const dateTrim = clearDate.trim();

      if (dateTrim !== '') {
        const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
        if (!isoPattern.test(dateTrim)) {
          setError('Invalid date. Use YYYY-MM-DD, e.g. 2025-03-01.');
          setSaving(false);
          return;
        }
        const d = new Date(dateTrim + 'T00:00:00');
        if (Number.isNaN(d.getTime())) {
          setError('Invalid date value. Please check day/month.');
          setSaving(false);
          return;
        }
        newDate = dateTrim;
      }

      let newDescription: string | null = null;
      const descTrim = clearDescription.trim();
      if (descTrim !== '') {
        newDescription = descTrim;
      }

      const { error: rpcErr } = await supabase.rpc('mark_transaction_cleared', {
        p_transaction_id: row.transaction_id,
        p_clicked_line_id: row.line_id,
        p_new_amount: finalAmount,
        p_new_date: newDate,
        p_new_description: newDescription,
      });

      if (rpcErr) throw rpcErr;

      onSuccess();
    } catch (err: any) {
      console.error(err);
      const message = err.message ?? 'Failed to mark transaction cleared.';
      setError(message);
      onError(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1200,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '1rem',
          width: '90%',
          maxWidth: 520,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.75rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Clear transaction</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ fontSize: 12, color: '#555', marginBottom: '0.75rem' }}>
          <div>
            <strong>Account:</strong> {row.cash_account ?? '(unknown)'}
          </div>
          <div>
            <strong>Date:</strong> {formatDate(row.date)}
          </div>
          <div>
            <strong>Description:</strong> {getDisplayDescription(row) || '(none)'}
          </div>
        </div>

        {error && (
          <p style={{ color: 'red', fontSize: 13, marginBottom: '0.5rem' }}>{error}</p>
        )}

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            marginBottom: '0.75rem',
            fontSize: 13,
          }}
        >
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Cleared date</span>
            <input
              type="date"
              value={clearDate}
              onChange={(e) => setClearDate(e.target.value)}
              disabled={saving}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #ccc',
                fontSize: 13,
              }}
            />
            <span style={{ fontSize: 11, color: '#777' }}>
              Leave blank to keep the existing transaction date.
            </span>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Description</span>
            <input
              type="text"
              value={clearDescription}
              onChange={(e) => setClearDescription(e.target.value)}
              disabled={saving}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #ccc',
                fontSize: 13,
              }}
              placeholder="Leave blank to keep the existing description"
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span>Final cleared amount (tip included)</span>
            <input
              type="number"
              step="0.01"
              value={clearAmount}
              onChange={(e) => setClearAmount(e.target.value)}
              disabled={saving}
              style={{
                padding: '4px 8px',
                borderRadius: 4,
                border: '1px solid #ccc',
                fontSize: 13,
              }}
            />
            <span style={{ fontSize: 11, color: '#777' }}>
              Enter a positive amount. The system will keep the debit/credit sign automatically.
            </span>
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            marginTop: '0.25rem',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            style={{
              padding: '4px 10px',
              fontSize: 13,
              borderRadius: 4,
              border: '1px solid #ccc',
              background: '#f5f5f5',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            style={{
              padding: '4px 10px',
              fontSize: 13,
              borderRadius: 4,
              border: '1px solid #111',
              background: '#111',
              color: '#fff',
              cursor: saving ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Confirm clear'}
          </button>
        </div>
      </div>
    </div>
  );
}
