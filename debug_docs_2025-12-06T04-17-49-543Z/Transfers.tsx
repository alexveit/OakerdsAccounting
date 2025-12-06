import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayLocalISO } from '../utils/date';
import { formatCurrencyOptional } from '../utils/format';
import { isBankCode, isCreditCardCode, type Purpose } from '../utils/accounts';

type AccountOption = {
  id: number;
  name: string;
  code: string | null;
  accountTypeId: number;
  accountTypeName: string;
  balance: number | null;
};

type RawAccountRow = {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean | null;
  account_type_id: number;
  account_types: { name: string; normal_side: string } | null;
};

type RawLineRow = {
  account_id: number;
  amount: number;
  accounts: any;
};

// Check if account is a regular bank (codes 1000-1999)
function isBankAccount(acc: AccountOption): boolean {
  if (isBankCode(acc.code)) return true;
  // Fallback for accounts without code
  return acc.code === null && acc.accountTypeName === 'asset';
}

// Check if account is a credit card (codes 2000-2999)
function isCreditCardAccount(acc: AccountOption): boolean {
  return isCreditCardCode(acc.code);
}

export function Transfers({ onTransferSaved }: { onTransferSaved?: () => void }) {
  const [allAccounts, setAllAccounts] = useState<AccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [date, setDate] = useState(todayLocalISO());
  const [description, setDescription] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [purpose, setPurpose] = useState<Purpose>('business');

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadAccounts() {
      setLoadingAccounts(true);
      setAccountsError(null);

      try {
        // Load all active accounts with account type info
        const { data, error } = await supabase
          .from('accounts')
          .select('id, name, code, is_active, account_type_id, account_types ( name, normal_side )')
          .eq('is_active', true);

        if (error) throw error;

        const rows = (data ?? []) as unknown as RawAccountRow[];

        const baseAccounts: AccountOption[] = rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          accountTypeId: row.account_type_id,
          accountTypeName: row.account_types?.name ?? '',
          balance: null,
        }));

        // Filter to only bank and credit card accounts (by code range)
        const transferableAccounts = baseAccounts.filter(
          (acc) => isBankAccount(acc) || isCreditCardAccount(acc)
        );

        const idsForBalances = transferableAccounts.map((acc) => acc.id);

        const balanceMap = new Map<number, number>();

        if (idsForBalances.length > 0) {
          const { data: lineRows, error: lineError } = await supabase
            .from('transaction_lines')
            .select('account_id, amount, accounts(account_types(normal_side))')
            .in('account_id', idsForBalances);

          if (lineError) {
            console.error('Failed to load transaction_lines for Transfers view', lineError);
          } else if (lineRows) {
            const lines = lineRows as unknown as RawLineRow[];

            lines.forEach((row) => {
              const accountId = row.account_id;
              let normalSide: string = 'debit';

              const accData = row.accounts;

              if (Array.isArray(accData)) {
                const firstAcc = accData[0];
                if (firstAcc && firstAcc.account_types) {
                  const at = firstAcc.account_types;
                  if (Array.isArray(at)) {
                    normalSide = at[0]?.normal_side ?? 'debit';
                  } else if (at && typeof at === 'object') {
                    normalSide = at.normal_side ?? 'debit';
                  }
                }
              } else if (accData && typeof accData === 'object') {
                const at = accData.account_types;
                if (Array.isArray(at)) {
                  normalSide = at[0]?.normal_side ?? 'debit';
                } else if (at && typeof at === 'object') {
                  normalSide = at.normal_side ?? 'debit';
                }
              }

              const current = balanceMap.get(accountId) ?? 0;
              const delta = normalSide === 'credit' ? -row.amount : row.amount;

              balanceMap.set(accountId, current + delta);
            });
          }
        }

        const accountsWithBalances: AccountOption[] = transferableAccounts.map((acc) => ({
          ...acc,
          balance: balanceMap.has(acc.id) ? balanceMap.get(acc.id) ?? null : null,
        }));

        // Sort: banks first (by code), then cards (by code)
        accountsWithBalances.sort((a, b) => {
          const aIsBank = isBankAccount(a);
          const bIsBank = isBankAccount(b);

          // Banks first
          if (aIsBank && !bIsBank) return -1;
          if (!aIsBank && bIsBank) return 1;

          // Within same type, sort by code
          const codeA = a.code || a.name;
          const codeB = b.code || b.name;
          return codeA.localeCompare(codeB);
        });

        setAllAccounts(accountsWithBalances);
      } catch (err) {
        console.error('Failed to load accounts for Transfers view', err);
        setAccountsError('Failed to load accounts.');
      } finally {
        setLoadingAccounts(false);
      }
    }

    void loadAccounts();
  }, []);

  // Generate default description based on selected accounts
  useEffect(() => {
    const fromAcc = allAccounts.find((a) => a.id === Number(fromAccountId));
    const toAcc = allAccounts.find((a) => a.id === Number(toAccountId));

    if (fromAcc && toAcc) {
      const fromLabel = fromAcc.code ? fromAcc.code : fromAcc.name;
      const toLabel = toAcc.code ? toAcc.code : toAcc.name;
      setDescription(`Transfer ${fromLabel} â†’ ${toLabel}`);
    } else {
      setDescription('');
    }
  }, [fromAccountId, toAccountId, allAccounts]);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    const fromId = Number(fromAccountId);
    const toId = Number(toAccountId);
    const amt = Number(amount);

    if (!fromId || !toId) {
      setSaveError('Please select both From and To accounts.');
      return;
    }

    if (fromId === toId) {
      setSaveError('From and To accounts must be different.');
      return;
    }

    if (!amt || !Number.isFinite(amt) || amt <= 0) {
      setSaveError('Amount must be a positive number.');
      return;
    }

    if (!date) {
      setSaveError('Please choose a date.');
      return;
    }

    setSaving(true);
    try {
      // Create parent transaction
      const { data: tx, error: txError } = await supabase
        .from('transactions')
        .insert({
          date,
          description: description.trim() || 'Account transfer',
        })
        .select('id')
        .single();

      if (txError || !tx) {
        console.error('Failed to create transfer transaction', txError);
        throw new Error('Could not create transfer transaction.');
      }

      const transactionId = tx.id as number;

      // Two lines that net to zero:
      // - From: amount = -amt â†’ money leaving
      // - To:   amount = +amt â†’ money arriving
      const { error: lineError } = await supabase.from('transaction_lines').insert([
        {
          transaction_id: transactionId,
          account_id: fromId,
          amount: -amt,
          is_cleared: true,
          purpose,
        },
        {
          transaction_id: transactionId,
          account_id: toId,
          amount: amt,
          is_cleared: true,
          purpose,
        },
      ]);

      if (lineError) {
        console.error('Failed to insert transfer lines', lineError);
        throw new Error('Could not save transfer lines.');
      }

      setSaveSuccess('Transfer saved.');
      setAmount('');

      if (onTransferSaved) {
        onTransferSaved();
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save transfer.';
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  }

  const hasAccounts = allAccounts.length > 0;

  // Separate accounts for display grouping
  const bankAccounts = allAccounts.filter(isBankAccount);
  const cardAccounts = allAccounts.filter(isCreditCardAccount);

  const renderAccountOption = (acc: AccountOption) => {
    const balanceText = formatCurrencyOptional(acc.balance);
    const labelBase = acc.code ? `${acc.code} - ${acc.name}` : acc.name;
    const label = balanceText ? `${labelBase} - ${balanceText}` : labelBase;
    return (
      <option key={acc.id} value={acc.id}>
        {label}
      </option>
    );
  };

  return (
    <div>
      
      <p style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: 13 }}>
        Move money between <strong>bank accounts</strong> and/or{' '}
        <strong>credit cards</strong> without affecting P&amp;L.
      </p>

      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            columnGap: '0.75rem',
            rowGap: '0.5rem',
            marginBottom: '1rem',
          }}
        >
          {/* Date */}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span style={{ marginBottom: 2 }}>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{ padding: '4px 6px' }}
            />
          </label>

          {/* Purpose */}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span style={{ marginBottom: 2 }}>Purpose</span>
            <select
              value={purpose}
              onChange={(e) => setPurpose(e.target.value as Purpose)}
              style={{ padding: '4px 6px' }}
            >
              <option value="business">Business</option>
              <option value="personal">Personal</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>

          {/* From Account */}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span style={{ marginBottom: 2 }}>From</span>
            {loadingAccounts ? (
              <span style={{ fontSize: 12 }}>Loading accounts...</span>
            ) : accountsError ? (
              <span style={{ fontSize: 12, color: 'red' }}>{accountsError}</span>
            ) : !hasAccounts ? (
              <span style={{ fontSize: 12 }}>No transferable accounts found.</span>
            ) : (
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                style={{ padding: '4px 6px' }}
              >
                <option value="">Select account...</option>
                {bankAccounts.length > 0 && (
                  <optgroup label="Bank Accounts">
                    {bankAccounts.map(renderAccountOption)}
                  </optgroup>
                )}
                {cardAccounts.length > 0 && (
                  <optgroup label="Credit Cards">
                    {cardAccounts.map(renderAccountOption)}
                  </optgroup>
                )}
              </select>
            )}
          </label>

          {/* To Account */}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span style={{ marginBottom: 2 }}>To</span>
            {loadingAccounts ? (
              <span style={{ fontSize: 12 }}>Loading accounts...</span>
            ) : accountsError ? (
              <span style={{ fontSize: 12, color: 'red' }}>{accountsError}</span>
            ) : !hasAccounts ? (
              <span style={{ fontSize: 12 }}>No transferable accounts found.</span>
            ) : (
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                style={{ padding: '4px 6px' }}
              >
                <option value="">Select account...</option>
                {bankAccounts.length > 0 && (
                  <optgroup label="Bank Accounts">
                    {bankAccounts.map(renderAccountOption)}
                  </optgroup>
                )}
                {cardAccounts.length > 0 && (
                  <optgroup label="Credit Cards">
                    {cardAccounts.map(renderAccountOption)}
                  </optgroup>
                )}
              </select>
            )}
          </label>

          {/* Amount */}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span style={{ marginBottom: 2 }}>Amount</span>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              style={{ padding: '4px 6px' }}
            />
          </label>

          {/* Description */}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span style={{ marginBottom: 2 }}>Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              style={{ padding: '4px 6px' }}
              placeholder="Transfer description"
            />
          </label>
        </div>

        {saveError && (
          <p style={{ color: 'red', fontSize: 12, marginBottom: '0.5rem' }}>{saveError}</p>
        )}
        {saveSuccess && (
          <p style={{ color: 'green', fontSize: 12, marginBottom: '0.5rem' }}>{saveSuccess}</p>
        )}

        <button type="submit" disabled={saving || !hasAccounts} style={{ padding: '6px 10px' }}>
          {saving ? 'Saving...' : 'Save transfer'}
        </button>
      </form>
    </div>
  );
}