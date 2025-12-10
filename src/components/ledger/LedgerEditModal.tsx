// src/components/ledger/LedgerEditModal.tsx

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { VendorSelect } from '../shared/VendorSelect';
import { InstallerSelect } from '../shared/InstallerSelect';
import { JobSelect } from '../shared/JobSelect';
import type { LedgerRow, AccountSelectOption } from './types';

export type EditModalResult = {
  date: string;
  description: string | null;
  amount: number;
  cashAccountId: number;
  cashAccountLabel: string | null;
  categoryAccountLabel: string | null;
  jobName: string | null;
  vendorInstaller: string;
};

type LedgerEditModalProps = {
  row: LedgerRow;
  onClose: () => void;
  onSave: (txId: number, result: EditModalResult) => void;
  onError: (message: string) => void;
};

type LineInfo = {
  id: number;
  account_id: number;
  amount: number;
  accountType: string;
};

export function LedgerEditModal({ row, onClose, onSave, onError }: LedgerEditModalProps) {
  const [editDate, setEditDate] = useState(row.date);
  const [editDescription, setEditDescription] = useState(row.description ?? '');
  const [editAmount, setEditAmount] = useState(Math.abs(row.amount).toFixed(2));
  const [editCashAccountId, setEditCashAccountId] = useState<number | null>(null);
  const [editCategoryAccountId, setEditCategoryAccountId] = useState<number | null>(null);
  
  // Transfer-specific state
  const [editToAccountId, setEditToAccountId] = useState<number | null>(null);
  const [isTransfer, setIsTransfer] = useState(false);

  // Job/vendor/installer IDs only - components handle their own data loading
  const [editJobId, setEditJobId] = useState<number | null>(null);
  const [editVendorId, setEditVendorId] = useState<number | null>(null);
  const [editInstallerId, setEditInstallerId] = useState<number | null>(null);
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [cashAccountOptions, setCashAccountOptions] = useState<AccountSelectOption[]>([]);
  const [categoryAccountOptions, setCategoryAccountOptions] = useState<AccountSelectOption[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Store line info for save operation
  const [lineInfo, setLineInfo] = useState<LineInfo[]>([]);

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
            label: a.code ? `${a.code} - ${a.name}` : a.name,
          }));

        // Category accounts: income or expense
        const categoryAccs = allAccts
          .filter((a) => {
            const typeName = a.account_types?.name;
            return typeName === 'income' || typeName === 'expense';
          })
          .map((a) => ({
            id: a.id,
            label: a.code ? `${a.code} - ${a.name}` : a.name,
          }));

        setCashAccountOptions(cashAccs);
        setCategoryAccountOptions(categoryAccs);

        // Get current account IDs from the transaction lines
        const { data: lines, error: lineErr } = await supabase
          .from('transaction_lines')
          .select('id, account_id, amount, accounts ( account_types ( name ) )')
          .eq('transaction_id', row.transaction_id);

        if (lineErr) throw lineErr;

        const typedLines = (lines ?? []) as any[];
        
        // Build line info for later use
        const parsedLines: LineInfo[] = typedLines.map((l) => ({
          id: l.id,
          account_id: l.account_id,
          amount: l.amount,
          accountType: l.accounts?.account_types?.name ?? '',
        }));
        setLineInfo(parsedLines);

        // Determine if this is a transfer (both lines are asset/liability)
        const cashLines = parsedLines.filter(
          (l) => l.accountType === 'asset' || l.accountType === 'liability'
        );
        const categoryLines = parsedLines.filter(
          (l) => l.accountType === 'income' || l.accountType === 'expense'
        );
        
        const isTx = cashLines.length >= 2 && categoryLines.length === 0;
        setIsTransfer(isTx);

        if (isTx) {
          // Transfer: find the "from" (negative amount) and "to" (positive amount) accounts
          const fromLine = parsedLines.find((l) => l.amount < 0);
          const toLine = parsedLines.find((l) => l.amount > 0);
          setEditCashAccountId(fromLine?.account_id ?? null);
          setEditToAccountId(toLine?.account_id ?? null);
        } else {
          // Regular transaction
          const cashLine = parsedLines.find(
            (l) => l.accountType === 'asset' || l.accountType === 'liability'
          );
          const categoryLine = parsedLines.find(
            (l) => l.accountType === 'income' || l.accountType === 'expense'
          );
          setEditCashAccountId(cashLine?.account_id ?? null);
          setEditCategoryAccountId(categoryLine?.account_id ?? null);
        }

        // Get current job/vendor/installer from category line (where they belong)
        const { data: detailLines } = await supabase
          .from('transaction_lines')
          .select('job_id, vendor_id, installer_id, accounts ( account_types ( name ) )')
          .eq('transaction_id', row.transaction_id);
        
        // Find the category line (income/expense) to get job/vendor/installer
        const catLine = (detailLines ?? []).find((l: any) => {
          const typeName = l.accounts?.account_types?.name;
          return typeName === 'income' || typeName === 'expense';
        }) as { job_id: number | null; vendor_id: number | null; installer_id: number | null } | undefined;
        
        if (catLine) {
          setEditJobId(catLine.job_id);
          setEditVendorId(catLine.vendor_id);
          setEditInstallerId(catLine.installer_id);
        }

        setLoading(false);
      } catch (err: unknown) {
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
      setError(isTransfer ? 'Please select a From account.' : 'Please select a bank/credit account.');
      return;
    }
    if (isTransfer && !editToAccountId) {
      setError('Please select a To account.');
      return;
    }
    if (!isTransfer && !editCategoryAccountId) {
      setError('Please select a category.');
      return;
    }
    if (isTransfer && editCashAccountId === editToAccountId) {
      setError('From and To accounts must be different.');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Update transaction header
      const { error: txErr } = await supabase
        .from('transactions')
        .update({
          date: newDate,
          description: newDesc || null,
        })
        .eq('id', txId);

      if (txErr) throw txErr;

      if (lineInfo.length === 0) {
        throw new Error('No lines found for this transaction.');
      }

      if (isTransfer) {
        // Transfer: update both lines as cash accounts
        // From line: negative amount
        // To line: positive amount
        const fromLine = lineInfo.find((l) => l.amount < 0) ?? lineInfo[0];
        const toLine = lineInfo.find((l) => l.amount > 0) ?? lineInfo[1] ?? lineInfo[0];

        const { error: fromErr } = await supabase
          .from('transaction_lines')
          .update({
            amount: -newAmountNum,
            account_id: editCashAccountId,
          })
          .eq('id', fromLine.id);

        if (fromErr) throw fromErr;

        if (toLine.id !== fromLine.id) {
          const { error: toErr } = await supabase
            .from('transaction_lines')
            .update({
              amount: newAmountNum,
              account_id: editToAccountId,
            })
            .eq('id', toLine.id);

          if (toErr) throw toErr;
        }

        // Find labels for callback
        const fromLabel = cashAccountOptions.find((a) => a.id === editCashAccountId)?.label ?? null;
        const toLabel = cashAccountOptions.find((a) => a.id === editToAccountId)?.label ?? null;

        onSave(txId, {
          date: newDate,
          description: newDesc || null,
          amount: -newAmountNum, // From perspective shows negative
          cashAccountId: editCashAccountId!,
          cashAccountLabel: fromLabel,
          categoryAccountLabel: toLabel, // For transfers, this shows the "to" account
          jobName: null,
          vendorInstaller: '',
        });
      } else {
        // Regular transaction
        const sign = row.amount >= 0 ? 1 : -1;
        const targetCashAmount = sign * newAmountNum;
        const targetCategoryAmount = -targetCashAmount;

        const cashLine = lineInfo.find(
          (l) => l.accountType === 'asset' || l.accountType === 'liability'
        ) ?? lineInfo[0];

        const categoryLine = lineInfo.find((l) => l.id !== cashLine.id) ?? lineInfo[0];

        // Update cash line (amount + account)
        const { error: cashUpdateErr } = await supabase
          .from('transaction_lines')
          .update({
            amount: targetCashAmount,
            account_id: editCashAccountId,
          })
          .eq('id', cashLine.id);

        if (cashUpdateErr) throw cashUpdateErr;

        // Update category line (amount + account + job/vendor/installer) if different line
        if (categoryLine.id !== cashLine.id) {
          const { error: catUpdateErr } = await supabase
            .from('transaction_lines')
            .update({
              amount: targetCategoryAmount,
              account_id: editCategoryAccountId,
              job_id: editJobId,
              vendor_id: editVendorId,
              installer_id: editInstallerId,
            })
            .eq('id', categoryLine.id);

          if (catUpdateErr) throw catUpdateErr;
        }

        // Find new labels for state update
        const newCashLabel = cashAccountOptions.find((a) => a.id === editCashAccountId)?.label ?? null;
        const newCategoryLabel =
          categoryAccountOptions.find((a) => a.id === editCategoryAccountId)?.label ?? null;
        
        // Fetch job/vendor/installer names from DB for UI update
        let newJobName: string | null = null;
        let vendorName: string | null = null;
        let installerName: string | null = null;

        if (editJobId) {
          const { data: jobData } = await supabase.from('jobs').select('name').eq('id', editJobId).single();
          newJobName = jobData?.name ?? null;
        }
        if (editVendorId) {
          const { data: vendorData } = await supabase.from('vendors').select('nick_name').eq('id', editVendorId).single();
          vendorName = vendorData?.nick_name ?? null;
        }
        if (editInstallerId) {
          const { data: instData } = await supabase.from('installers').select('first_name, last_name').eq('id', editInstallerId).single();
          installerName = instData ? `${instData.first_name ?? ''} ${instData.last_name ?? ''}`.trim() : null;
        }
        const newVendorInstaller = [vendorName, installerName].filter(Boolean).join(' / ');

        onSave(txId, {
          date: newDate,
          description: newDesc || null,
          amount: targetCashAmount,
          cashAccountId: editCashAccountId!,
          cashAccountLabel: newCashLabel,
          categoryAccountLabel: newCategoryLabel,
          jobName: newJobName,
          vendorInstaller: newVendorInstaller,
        });
      }
    } catch (err: unknown) {
      console.error('Edit failed:', err);
      const message = err instanceof Error ? err.message : 'Failed to save changes.';
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
          <h3 style={{ margin: 0, fontSize: 16 }}>
            {isTransfer ? 'Edit transfer' : 'Edit transaction'}
          </h3>
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
            x
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
            {isTransfer && (
              <p style={{ fontSize: 12, color: '#666', background: '#f5f5f5', padding: '0.5rem', borderRadius: 4, marginBottom: '0.5rem' }}>
                This is a transfer between accounts.
              </p>
            )}

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

            {isTransfer ? (
              <>
                {/* Transfer: From and To accounts */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: 2 }}>From Account</label>
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
                  <label style={{ display: 'block', marginBottom: 2 }}>To Account</label>
                  <select
                    value={editToAccountId ?? ''}
                    onChange={(e) => setEditToAccountId(Number(e.target.value) || null)}
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
              </>
            ) : (
              <>
                {/* Regular transaction: Cash account and Category */}
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

                {/* Job/Vendor/Installer */}
                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: 2 }}>
                    Job <span style={{ color: '#999', fontWeight: 'normal' }}>(optional)</span>
                  </label>
                  <JobSelect
                    value={editJobId}
                    onChange={setEditJobId}
                  />
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: 2 }}>
                    Vendor <span style={{ color: '#999', fontWeight: 'normal' }}>(optional)</span>
                  </label>
                  <VendorSelect
                    value={editVendorId}
                    onChange={setEditVendorId}
                  />
                </div>

                <div style={{ marginBottom: '0.5rem' }}>
                  <label style={{ display: 'block', marginBottom: 2 }}>
                    Installer <span style={{ color: '#999', fontWeight: 'normal' }}>(optional)</span>
                  </label>
                  <InstallerSelect
                    value={editInstallerId}
                    onChange={setEditInstallerId}
                  />
                </div>
              </>
            )}

            <div style={{ marginBottom: '0.5rem' }}>
              <label style={{ display: 'block', marginBottom: 2 }}>
                Amount {isTransfer ? '' : `(${row.amount >= 0 ? 'inflow' : 'outflow'})`}
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
