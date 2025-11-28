import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayLocalISO } from '../utils/date';

type Purpose = 'business' | 'personal' | 'mixed';

type AccountOption = {
  id: number;
  name: string;
  code: string | null;
  accountTypeId: number;
  balance: number | null;
};

type RawAccountRow = {
  id: number;
  name: string;
  code: string | null;
  is_active: boolean | null;
  account_type_id: number;
};

type RawLineRow = {
  account_id: number;
  amount: number;
  accounts: any; // Supabase nested join shape is messy, we'll normalize manually
};

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value);
}

export function Transfers({ onTransferSaved }: { onTransferSaved?: () => void }) {
  const [bankAccounts, setBankAccounts] = useState<AccountOption[]>([]);
  const [cardAccounts, setCardAccounts] = useState<AccountOption[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);

  const [date, setDate] = useState(todayLocalISO());
  const [description, setDescription] = useState('Bank → Card payment');
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
        // 1) Load all active accounts
        const { data, error } = await supabase
          .from('accounts')
          .select('id, name, code, is_active, account_type_id')
          .eq('is_active', true);

        if (error) throw error;

        const rows = (data ?? []) as RawAccountRow[];

        const baseAccounts: AccountOption[] = rows.map((row) => ({
          id: row.id,
          name: row.name,
          code: row.code,
          accountTypeId: row.account_type_id,
          balance: null,
        }));

        // 2) Collect only bank + card IDs for balances
        const idsForBalances = Array.from(
          new Set(
            baseAccounts
              .filter(
                (acc) => acc.accountTypeId === 1 || acc.accountTypeId === 2,
              )
              .map((acc) => acc.id),
          ),
        );

        let balanceMap = new Map<number, number>();

        if (idsForBalances.length > 0) {
          // 3) Load all lines for those accounts, with normal_side info
          const { data: lineRows, error: lineError } = await supabase
            .from('transaction_lines')
            .select(
              'account_id, amount, accounts(account_types(normal_side))',
            )
            .in('account_id', idsForBalances);

          if (lineError) {
            console.error(
              'Failed to load transaction_lines for Transfers view',
              lineError,
            );
          } else if (lineRows) {
            const lines = lineRows as RawLineRow[];

            lines.forEach((row) => {
                const accountId = row.account_id;
                let normalSide: string = 'debit';

                const accData = row.accounts;

                if (Array.isArray(accData)) {
                    // accounts is an array
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
                    // accounts is a single object
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

        const accountsWithBalances: AccountOption[] = baseAccounts.map((acc) => ({
          ...acc,
          balance: balanceMap.has(acc.id)
            ? balanceMap.get(acc.id) ?? null
            : null,
        }));

        // 4) Bank accounts: account_type_id = 1
        const banks = accountsWithBalances
          .filter((acc) => acc.accountTypeId === 1)
          .sort((a, b) => {
            // Put Checking Business (id 1) first, then by code/name
            if (a.id === 1) return -1;
            if (b.id === 1) return 1;
            const codeA = a.code || a.name;
            const codeB = b.code || b.name;
            return codeA.localeCompare(codeB);
          });

        // 5) Credit cards: account_type_id = 2
        const cards = accountsWithBalances
          .filter((acc) => acc.accountTypeId === 2)
          .sort((a, b) => {
            const codeA = a.code || a.name;
            const codeB = b.code || b.name;
            return codeA.localeCompare(codeB);
          });

        setBankAccounts(banks);
        setCardAccounts(cards);
      } catch (err) {
        console.error('Failed to load accounts for Transfers view', err);
        setAccountsError('Failed to load accounts.');
      } finally {
        setLoadingAccounts(false);
      }
    }

    void loadAccounts();
  }, []);

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
      // 1) Create parent transaction
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

      // 2) Two lines that net to zero:
      //    - From (bank):  amount = -amt  → money leaving bank
      //    - To (card):    amount = +amt  → card liability goes down
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
    } catch (err: any) {
      setSaveError(err?.message ?? 'Failed to save transfer.');
    } finally {
      setSaving(false);
    }
  }

  const hasBankAccounts = bankAccounts.length > 0;
  const hasCardAccounts = cardAccounts.length > 0;

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Pay Credit Card from Bank</h2>
      <p style={{ marginTop: 0, marginBottom: '0.75rem', fontSize: 13 }}>
        This transfer moves money from a <strong>bank account</strong> to a{' '}
        <strong>credit card</strong>, reducing card debt without touching your P&amp;L.
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

          {/* From (Bank) */}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span style={{ marginBottom: 2 }}>From (Bank)</span>
            {loadingAccounts ? (
              <span style={{ fontSize: 12 }}>Loading accounts…</span>
            ) : accountsError ? (
              <span style={{ fontSize: 12, color: 'red' }}>{accountsError}</span>
            ) : !hasBankAccounts ? (
              <span style={{ fontSize: 12 }}>
                No bank accounts (type 1) found. Check your accounts table.
              </span>
            ) : (
              <select
                value={fromAccountId}
                onChange={(e) => setFromAccountId(e.target.value)}
                style={{ padding: '4px 6px' }}
              >
                <option value="">Select bank account…</option>
                {bankAccounts.map((acc) => {
                  const balanceText = formatCurrency(acc.balance);
                  const labelBase = acc.code
                    ? `${acc.code} — ${acc.name}`
                    : acc.name;
                  const label = balanceText
                    ? `${labelBase} — ${balanceText}`
                    : labelBase;

                  return (
                    <option key={acc.id} value={acc.id}>
                      {label}
                    </option>
                  );
                })}
              </select>
            )}
          </label>

          {/* To (Credit Card) */}
          <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span style={{ marginBottom: 2 }}>To (Credit Card)</span>
            {loadingAccounts ? (
              <span style={{ fontSize: 12 }}>Loading accounts…</span>
            ) : accountsError ? (
              <span style={{ fontSize: 12, color: 'red' }}>{accountsError}</span>
            ) : !hasCardAccounts ? (
              <span style={{ fontSize: 12 }}>
                No credit card accounts (type 2) found. Check your accounts table.
              </span>
            ) : (
              <select
                value={toAccountId}
                onChange={(e) => setToAccountId(e.target.value)}
                style={{ padding: '4px 6px' }}
              >
                <option value="">Select credit card…</option>
                {cardAccounts.map((acc) => {
                  const balanceText = formatCurrency(acc.balance);
                  const labelBase = acc.code
                    ? `${acc.code} — ${acc.name}`
                    : acc.name;
                  const label = balanceText
                    ? `${labelBase} — ${balanceText}`
                    : labelBase;

                  return (
                    <option key={acc.id} value={acc.id}>
                      {label}
                    </option>
                  );
                })}
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
              placeholder="Pay Business Visa from Checking"
            />
          </label>
        </div>

        {saveError && (
          <p style={{ color: 'red', fontSize: 12, marginBottom: '0.5rem' }}>
            {saveError}
          </p>
        )}
        {saveSuccess && (
          <p style={{ color: 'green', fontSize: 12, marginBottom: '0.5rem' }}>
            {saveSuccess}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || !hasBankAccounts || !hasCardAccounts}
          style={{ padding: '6px 10px' }}
        >
          {saving ? 'Saving…' : 'Save transfer'}
        </button>
      </form>
    </div>
  );
}
