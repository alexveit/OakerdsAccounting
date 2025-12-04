// src/components/ledger/LedgerEditModal.tsx

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { LedgerRow, AccountSelectOption } from './types';

export type EditModalResult = {
  date: string;
  description: string | null;
  amount: number;
  cashAccountId: number;
  cashAccountLabel: string | null;
  categoryAccountLabel: string | null;
};

type LedgerEditModalProps = {
  row: LedgerRow;
  onClose: () => void;
  onSave: (txId: number, result: EditModalResult) => void;
  onError: (message: string) => void;
};

export function LedgerEditModal({ row, onClose, onSave, onError }: LedgerEditModalProps) {
  const [editDate, setEditDate] = useState(row.date);
  const [editDescription, setEditDescription] = useState(row.description ?? '');
  const [editAmount, setEditAmount] = useState(Math.abs(row.amount).toFixed(2));
  const [editCashAccountId, setEditCashAccountId] = useState<number | null>(null);
  const [editCategoryAccountId, setEditCategoryAccountId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cashAccountOptions, setCashAccountOptions] = useState<AccountSelectOption[]>([]);
  const [categoryAccountOptions, setCategoryAccountOptions] = useState<AccountSelectOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Load account options on mount
  useEffect(() => {
    async function loadAccounts() {
      try {
        const { data: accounts, error: accErr } = await supabase
          .from('accounts')
          .select('id, name, code, account_type_id, account_types ( name )')
          .eq('is_active', true)
          .order('code');

        if (accErr) throw accErr;

        const allAccts = (accounts ?? []) as any[];

        // Cash accounts: asset or liability
        const cashAccs = allAccts
          .filter((a) => {
            const typeName = a.account_types?.name;
            return typeName === 'asset' || typeName === 'liability';
          })
          .map((a) => ({
            id: a.id,
            label: a.code ? `${a.name} - ${a.code}` : a.name,
          }));

        // Category accounts: income or expense
        const categoryAccs = allAccts
          .filter((a) => {
            const typeName = a.account_types?.name;
            return typeName === 'income' || typeName === 'expense';
          })
          .map((a) => ({
            id: a.id,
            label: a.code ? `${a.name} - ${a.code}` : a.name,
          }));

        setCashAccountOptions(cashAccs);
        setCategoryAccountOptions(categoryAccs);

        // Get current account IDs from the transaction lines
        const { data: lines, error: lineErr } = await supabase
          .from('transaction_lines')
          .select('id, account_id, accounts ( account_types ( name ) )')
          .eq('transaction_id', row.transaction_id);

        if (lineErr) throw lineErr;

        const typedLines = (lines ?? []) as any[];

        const cashLine = typedLines.find((l) => {
          const t = l.accounts?.account_types?.name;
          return t === 'asset' || t === 'liability';
        });

        const categoryLine = typedLines.find((l) => {
          const t = l.accounts?.account_types?.name;
          return t === 'income' || t === 'expense';
        });

        setEditCashAccountId(cashLine?.account_id ?? null);
        setEditCategoryAccountId(categoryLine?.account_id ?? null);
        setLoading(false);
      } catch (err: any) {
        console.error('Error loading accounts for edit:', err);
        setError('Failed to load account options');
        setLoading(false);
      }
    }

    void loadAccounts();
  }, [row.transaction_id]);

  const handleClose = () => {
    if (saving) return;
    onClose();
  };

  async function handleSave() {
    const txId = row.transaction_id;
    const newDate = editDate.trim();
    const newDesc = editDescription.trim();
    const newAmountNum = Number(editAmount);

    if (!newDate) {
      setError('Date is required.');
      return;
    }
    if (!Number.isFinite(newAmountNum) || newAmountNum <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }
    if (!editCashAccountId) {
      setError('Please select a bank/credit account.');
      return;
    }
    if (!editCategoryAccountId) {
      setError('Please select a category.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: txErr } = await supabase
        .from('transactions')
        .update({
          date: newDate,
          description: newDesc || null,
        })
        .eq('id', txId);

      if (txErr) throw txErr;

      const { data: lines, error: lineErr } = await supabase
        .from('transaction_lines')
        .select(
          `
          id,
          amount,
          account_id,
          accounts (
            account_types ( name )
          )
        `
        )
        .eq('transaction_id', txId);

      if (lineErr) throw lineErr;

      const typedLines = (lines ?? []) as any[];

      if (typedLines.length === 0) {
        throw new Error('No lines found for this transaction.');
      }

      const sign = row.amount >= 0 ? 1 : -1;
      const targetCashAmount = sign * newAmountNum;
      const targetCategoryAmount = -targetCashAmount;

      const cashLine =
        typedLines.find((l: any) => {
          const t = l.accounts?.account_types?.name;
          return t === 'asset' || t === 'liability';
        }) ?? typedLines[0];

      const categoryLine = typedLines.find((l: any) => l.id !== cashLine.id) ?? typedLines[0];

      // Update cash line (amount + account)
      const { error: cashUpdateErr } = await supabase
        .from('transaction_lines')
        .update({
          amount: targetCashAmount,
          account_id: editCashAccountId,
        })
        .eq('id', cashLine.id);

      if (cashUpdateErr) throw cashUpdateErr;

      // Update category line (amount + account) if different line
      if (categoryLine.id !== cashLine.id) {
        const { error: catUpdateErr } = await supabase
          .from('transaction_lines')
          .update({
            amount: targetCategoryAmount,
            account_id: editCategoryAccountId,
          })
          .eq('id', categoryLine.id);

        if (catUpdateErr) throw catUpdateErr;
      }

      // Find new labels for state update
      const newCashLabel = cashAccountOptions.find((a) => a.id === editCashAccountId)?.label ?? null;
      const newCategoryLabel =
        categoryAccountOptions.find((a) => a.id === editCategoryAccountId)?.label ?? null;

      onSave(txId, {
        date: newDate,
        description: newDesc || null,
        amount: targetCashAmount,
        cashAccountId: editCashAccountId,
        cashAccountLabel: newCashLabel,
        categoryAccountLabel: newCategoryLabel,
      });
    } catch (err: any) {
      console.error('Edit failed:', err);
      const message = err.message ?? 'Failed to save changes.';
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
        zIndex: 1100,
      }}
      onClick={handleClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 8,
          padding: '1rem',
          width: '90%',
          maxWidth: 480,
          boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16 }}>Edit transaction</h3>
          <button
            type="button"
            onClick={handleClose}
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

        {row.job_name && (
          <p style={{ fontSize: 12, color: '#555', margin: '0 0 0.5rem 0' }}>
            Job: <strong>{row.job_name}</strong>
          </p>
        )}

        {loading ? (
          <p style={{ fontSize: 13, color: '#777' }}>Loading...</p>
        ) : (
          <div style={{ fontSize: 13, marginBottom: '0.75rem' }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: 2 }}>Date</label>
              <input
                type="date"
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: 2 }}>Description</label>
              <input
                type="text"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 13,
                }}
              />
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: 2 }}>Bank / Credit Account</label>
              <select
                value={editCashAccountId ?? ''}
                onChange={(e) => setEditCashAccountId(Number(e.target.value) || null)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 13,
                }}
              >
                <option value="">Select account...</option>
                {cashAccountOptions.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: 2 }}>Category</label>
              <select
                value={editCategoryAccountId ?? ''}
                onChange={(e) => setEditCategoryAccountId(Number(e.target.value) || null)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 13,
                }}
              >
                <option value="">Select category...</option>
                {categoryAccountOptions.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: 2 }}>
                Amount ({row.amount >= 0 ? 'inflow' : 'outflow'})
              </label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                style={{
                  width: '100%',
                  padding: '4px 6px',
                  fontSize: 13,
                }}
              />
            </div>

            {error && <p style={{ color: 'red', fontSize: 12 }}>{error}</p>}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '0.5rem',
            fontSize: 13,
          }}
        >
          <button
            type="button"
            onClick={handleClose}
            disabled={saving}
            style={{
              padding: '4px 10px',
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
            onClick={() => void handleSave()}
            disabled={saving || loading}
            style={{
              padding: '4px 10px',
              borderRadius: 4,
              border: '1px solid #111',
              background: '#111',
              color: '#fff',
              cursor: saving || loading ? 'default' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
