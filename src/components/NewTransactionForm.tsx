import { useEffect, useState, type KeyboardEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { FormEvent } from 'react';
import { todayLocalISO } from '../utils/date';

type Job = {
  id: number;
  name: string;
};

type Vendor = {
  id: number;
  nick_name: string;
};

type Installer = {
  id: number;
  first_name: string;
  last_name: string | null;
};

type Account = {
  id: number;
  name: string;
  code: string | null;
  account_types: { name: string } | null;
  purpose_default: 'business' | 'personal' | 'mixed' | null;
};

type TxType = 'income' | 'expense';
type ExpenseKind = 'material' | 'labor' | 'other';

type NewTransactionFormProps = {
  initialJobId?: number | null;
  onTransactionSaved?: () => void;
};

export function NewTransactionForm({
  initialJobId,
  onTransactionSaved,
}: NewTransactionFormProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // form state
  const [linkToJob, setLinkToJob] = useState<boolean>(!!initialJobId);
  const [jobId, setJobId] = useState<string>(
    initialJobId != null ? String(initialJobId) : ''
  );
  const [date, setDate] = useState<string>(() => todayLocalISO());

  const [txType, setTxType] = useState<TxType>('expense');
  const [expenseKind, setExpenseKind] = useState<ExpenseKind>('material');

  const [vendorId, setVendorId] = useState<string>('');
  const [installerId, setInstallerId] = useState<string>('');

  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [categoryAccountId, setCategoryAccountId] = useState<string>('');

  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');

  const [isCleared, setIsCleared] = useState<boolean>(false);

  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      setError(null);
      try {
        // Jobs (only open, newest first)
        const { data: jobsData, error: jobsErr } = await supabase
          .from('jobs')
          .select('id, name, status, start_date');

        if (jobsErr) throw jobsErr;

        const openJobs = (jobsData ?? []).filter((j) => j.status !== 'closed');

        const sortedOpenJobs = openJobs.sort((a, b) => {
          const da = a.start_date ? new Date(a.start_date).getTime() : 0;
          const db = b.start_date ? new Date(b.start_date).getTime() : 0;
          return db - da;
        });

        setJobs(sortedOpenJobs);

        // Vendors
        const { data: vendorsData, error: vendorsErr } = await supabase
          .from('vendors')
          .select('id, nick_name')
          .order('nick_name', { ascending: true });
        if (vendorsErr) throw vendorsErr;
        setVendors((vendorsData ?? []) as Vendor[]);

        // Installers
        const { data: installersData, error: installersErr } = await supabase
          .from('installers')
          .select('id, first_name, last_name')
          .order('first_name', { ascending: true });
        if (installersErr) throw installersErr;
        setInstallers((installersData ?? []) as Installer[]);

        // Accounts
        const { data: accountsData, error: accountsErr } = await supabase
          .from('accounts')
          .select('id, name, code, purpose_default, account_types(name)');

        if (accountsErr) throw accountsErr;

        const normalizedAccounts: Account[] = (accountsData ?? []).map(
          (a: any) => ({
            id: a.id,
            name: a.name,
            code: a.code ?? null,
            account_types: a.account_types ?? null,
            purpose_default: (a.purpose_default ?? null) as Account['purpose_default'],
          })
        );

        // Custom sort: account_id = 1 first, 4 second, then by ID number
        const sortedAccounts = normalizedAccounts.sort((a, b) => {
          // Priority rules
          const priorityA =
            a.id === 1
              ? 0
              : a.id === 4
              ? 1
              : 2;

          const priorityB =
            b.id === 1
              ? 0
              : b.id === 4
              ? 1
              : 2;

          if (priorityA !== priorityB) {
            return priorityA - priorityB;
          }

          return a.id - b.id;
        });

        setAccounts(sortedAccounts);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Error loading options');
      } finally {
        setLoading(false);
      }
    }

    void loadOptions();
  }, []);

  useEffect(() => {
    if (initialJobId != null) {
      setLinkToJob(true);
      setJobId(String(initialJobId));
    }
  }, [initialJobId]);

  const cashAccounts = accounts.filter(
    (a) =>
      a.account_types?.name === 'asset' ||
      a.account_types?.name === 'liability'
  );

  const incomeAccounts = accounts.filter(
    (a) => a.account_types?.name === 'income'
  );
  const expenseAccounts = accounts.filter(
    (a) => a.account_types?.name === 'expense'
  );

  const categoryAccounts =
    txType === 'income' ? incomeAccounts : expenseAccounts;

  const [categoryTypeahead, setCategoryTypeahead] = useState('');
  const [lastCategoryTypeTime, setLastCategoryTypeTime] = useState<number>(0);

  const sortedCategoryAccounts = [...categoryAccounts].sort((a, b) => {
    const purposeRank = (p: Account['purpose_default'] | null | undefined) => {
      if (p === 'business') return 0;
      if (p === 'personal') return 1;
      return 2; // mixed/unknown/undefined
    };

    const rankA = purposeRank(a.purpose_default);
    const rankB = purposeRank(b.purpose_default);

    if (rankA !== rankB) return rankA - rankB;

    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    return nameA.localeCompare(nameB);
  });

  function handleCategoryKeyDown(e: KeyboardEvent<HTMLSelectElement>) {
    const key = e.key;

    // Ignore navigation / modifier keys
    if (
      key.length !== 1 ||
      e.altKey ||
      e.metaKey ||
      e.ctrlKey
    ) {
      return;
    }

    e.preventDefault();

    const now = Date.now();
    const resetWindowMs = 800;

    let buffer =
      now - lastCategoryTypeTime > resetWindowMs
        ? key
        : categoryTypeahead + key;

    buffer = buffer.toLowerCase();

    setCategoryTypeahead(buffer);
    setLastCategoryTypeTime(now);

    const currentIndex = sortedCategoryAccounts.findIndex(
      (a) => String(a.id) === categoryAccountId
    );

    const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;

    const ordered = [
      ...sortedCategoryAccounts.slice(startIndex),
      ...sortedCategoryAccounts.slice(0, startIndex),
    ];

    const match = ordered.find((a) => {
      const label = `${a.code ? `${a.code} – ` : ''}${a.name}`.toLowerCase();
      return label.includes(buffer);
    });

    if (match) {
      setCategoryAccountId(String(match.id));
    }
  }

  function formatInstaller(i: Installer) {
    return `${i.first_name} ${i.last_name ?? ''}`.trim();
  }

  function purposeForAccount(accountId: number): 'business' | 'personal' | 'mixed' {
    const acc = accounts.find((a) => a.id === accountId);
    const def = acc?.purpose_default;

    if (def === 'personal') return 'personal';
    if (def === 'mixed') return 'mixed';

    return 'business';
  }

  const effectiveExpenseKind: ExpenseKind =
    linkToJob && txType === 'expense' ? expenseKind : 'other';

  // Check if date is more than 7 days in future
  const isDateFuture = (() => {
    if (!date) return false;
    const selectedDate = new Date(date + 'T00:00:00');
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    return selectedDate > sevenDaysFromNow;
  })();

  // Check if amount is large
  const isAmountLarge = Number(amount) > 10000;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const amt = Number(amount);

    // === BASIC VALIDATION (blocking) ===
    if (linkToJob && !jobId) {
      setError('Job is required when linking this transaction to a job.');
      return;
    }
    if (!cashAccountId) {
      setError('Pay from / deposit to account is required.');
      return;
    }
    if (!categoryAccountId) {
      setError('Category account is required.');
      return;
    }
    if (!amt || amt <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    // Only enforce vendor/installer when needed
    if (txType === 'expense' && linkToJob) {
      if (effectiveExpenseKind === 'material' && !vendorId) {
        setError('Vendor is required for material job expense.');
        return;
      }
      if (effectiveExpenseKind === 'labor' && !installerId) {
        setError('Installer is required for labor job expense.');
        return;
      }
    }

    // === ENHANCED VALIDATION (warnings) ===

    // Warning 1: Large amount (possible typo)
    if (amt > 10000) {
      const confirm = window.confirm(
        `⚠️ Large Amount Warning\n\n` +
          `You entered: ${amt.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
          })}\n\n` +
          `This is unusually large. Did you mean to enter this amount?\n\n` +
          `Common mistake: $100,000 instead of $1,000.00\n\n` +
          `Click OK to proceed, or Cancel to fix it.`
      );
      if (!confirm) return;
    }

    // Warning 2: Future date (more than 7 days ahead)
    const selectedDate = new Date(date + 'T00:00:00');
    const today = new Date();
    const sevenDaysFromNow = new Date(today);
    sevenDaysFromNow.setDate(today.getDate() + 7);

    if (selectedDate > sevenDaysFromNow) {
      const confirm = window.confirm(
        `⚠️ Future Date Warning\n\n` +
          `The date you selected is more than a week in the future.\n\n` +
          `Selected: ${selectedDate.toLocaleDateString()}\n` +
          `Today: ${today.toLocaleDateString()}\n\n` +
          `Is this correct?\n\n` +
          `Click OK to proceed, or Cancel to fix it.`
      );
      if (!confirm) return;
    }

    // Warning 3: Check for potential duplicate transactions
    if (txType === 'expense' && vendorId && description) {
      try {
        const threeDaysAgo = new Date(selectedDate);
        threeDaysAgo.setDate(selectedDate.getDate() - 3);
        const threeDaysForward = new Date(selectedDate);
        threeDaysForward.setDate(selectedDate.getDate() + 3);

        const { data: recentLines, error: dupErr } = await supabase
          .from('transaction_lines')
          .select('id, amount, transactions(date, description)')
          .eq('vendor_id', Number(vendorId))
          .gte('transactions.date', threeDaysAgo.toISOString().split('T')[0])
          .lte('transactions.date', threeDaysForward.toISOString().split('T')[0])
          .limit(10);

        if (!dupErr && recentLines && recentLines.length > 0) {
          const possibleDuplicate = recentLines.find((line: any) => {
            const lineAmt = Math.abs(Number(line.amount));
            const amtMatch = Math.abs(lineAmt - amt) < 1; // Within $1
            const descMatch =
              line.transactions?.description
                ?.toLowerCase()
                .includes(description.toLowerCase());
            return amtMatch || descMatch;
          });

          if (possibleDuplicate) {
            const dupDate = (possibleDuplicate as any).transactions?.date;
            const dupAmt = Math.abs(Number((possibleDuplicate as any).amount));
            const dupDesc = (possibleDuplicate as any).transactions
              ?.description;

            const confirm = window.confirm(
              `⚠️ Possible Duplicate Transaction\n\n` +
                `Found a similar transaction:\n` +
                `Date: ${dupDate}\n` +
                `Amount: ${dupAmt.toLocaleString('en-US', {
                  style: 'currency',
                  currency: 'USD',
                })}\n` +
                `Description: ${dupDesc}\n\n` +
                `Are you sure you want to create another transaction?\n\n` +
                `Click OK to proceed, or Cancel to review.`
            );
            if (!confirm) return;
          }
        }
      } catch (err) {
        console.warn('Duplicate check failed:', err);
      }
    }

    // === PROCEED WITH SAVE ===
    setSaving(true);
    try {
      const job_id = linkToJob && jobId ? Number(jobId) : null;
      const cash_id = Number(cashAccountId);
      const category_id = Number(categoryAccountId);

      const vendor_id =
        txType === 'expense' &&
        linkToJob &&
        effectiveExpenseKind === 'material'
          ? vendorId
            ? Number(vendorId)
            : null
          : null;

      const installer_id =
        txType === 'expense' &&
        linkToJob &&
        effectiveExpenseKind === 'labor'
          ? installerId
            ? Number(installerId)
            : null
          : null;

      // --- derive a single transaction-level purpose ---
      const cashPurposeDefault = purposeForAccount(cash_id);
      const categoryPurposeDefault = purposeForAccount(category_id);

      let txPurpose: 'business' | 'personal' =
        cashPurposeDefault === 'personal' ||
        categoryPurposeDefault === 'personal'
          ? 'personal'
          : 'business';

      const cashPurpose = txPurpose;
      const categoryPurpose = txPurpose;
      // ---------------------------------------------------

      let line1: any;
      let line2: any;

      if (txType === 'income') {
        line1 = {
          account_id: cash_id,
          amount: amt,
          job_id,
          vendor_id: null,
          installer_id: null,
          purpose: cashPurpose,
          is_cleared: isCleared,
        };

        line2 = {
          account_id: category_id,
          amount: -amt,
          job_id,
          vendor_id: null,
          installer_id: null,
          purpose: categoryPurpose,
          is_cleared: isCleared,
        };
      } else {
        // expense
        line1 = {
          account_id: category_id,
          amount: amt,
          job_id,
          vendor_id,
          installer_id,
          purpose: categoryPurpose,
          is_cleared: isCleared,
        };

        line2 = {
          account_id: cash_id,
          amount: -amt,
          job_id,
          vendor_id: null,
          installer_id: null,
          purpose: cashPurpose,
          is_cleared: isCleared,
        };
      }

      const { data, error: rpcErr } = await supabase.rpc(
        'create_transaction',
        {
          p_date: date,
          p_description: description || null,
          p_line1: line1,
          p_line2: line2,
          p_purpose: txPurpose,
        }
      );

      if (rpcErr) throw rpcErr;

      console.log('Transaction created:', data);

      setSuccess('Transaction saved.');
      setAmount('');
      setDescription('');
      setVendorId('');
      setInstallerId('');
      setIsCleared(false);
      if (onTransactionSaved) {
        onTransactionSaved();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error saving transaction');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p>Loading options…</p>;
  }

  return (
    <div>
      <h2>New Transaction</h2>

      {error && (
        <p style={{ color: 'red', marginTop: '0.5rem' }}>{error}</p>
      )}
      {success && (
        <p style={{ color: 'green', marginTop: '0.5rem' }}>{success}</p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ maxWidth: 520, display: 'grid', gap: '0.75rem' }}
      >
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <input
            type="checkbox"
            checked={linkToJob}
            onChange={(e) => setLinkToJob(e.target.checked)}
          />
          Relates to a job?
        </label>

        {linkToJob && (
          <label>
            Job
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
            >
              <option value="">Select job…</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={new Date(
              new Date().setFullYear(new Date().getFullYear() + 1)
            )
              .toISOString()
              .split('T')[0]}
            min="2000-01-01"
            style={{
              borderColor: isDateFuture ? '#ff9800' : undefined,
              borderWidth: isDateFuture ? '2px' : undefined,
            }}
          />
          {isDateFuture && (
            <span
              style={{
                fontSize: 12,
                color: '#ff9800',
                marginTop: '4px',
                display: 'block',
              }}
            >
              ⚠️ This date is in the future. Is this correct?
            </span>
          )}
        </label>

        <label>
          Type
          <select
            value={txType}
            onChange={(e) => setTxType(e.target.value as TxType)}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>

        {txType === 'expense' && linkToJob && (
          <label>
            Expense kind
            <select
              value={expenseKind}
              onChange={(e) =>
                setExpenseKind(e.target.value as ExpenseKind)
              }
            >
              <option value="material">Material</option>
              <option value="labor">Labor</option>
              <option value="other">Other</option>
            </select>
          </label>
        )}

        {txType === 'expense' &&
          linkToJob &&
          effectiveExpenseKind === 'material' && (
            <label>
              Vendor
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                <option value="">Select vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nick_name}
                  </option>
                ))}
              </select>
            </label>
          )}

        {txType === 'expense' &&
          linkToJob &&
          effectiveExpenseKind === 'labor' && (
            <label>
              Installer
              <select
                value={installerId}
                onChange={(e) => setInstallerId(e.target.value)}
              >
                <option value="">Select installer…</option>
                {installers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {formatInstaller(i)}
                  </option>
                ))}
              </select>
            </label>
          )}

        <label>
          Pay from / deposit to (bank or card)
          <select
            value={cashAccountId}
            onChange={(e) => setCashAccountId(e.target.value)}
          >
            <option value="">Select account…</option>
            {cashAccounts.map((a) => {
              const isCard = a.account_types?.name === 'liability';
              const label = `${a.code ? `${a.code} – ` : ''}${a.name}${
                isCard ? ' (card)' : ''
              }`;
              return (
                <option key={a.id} value={a.id}>
                  {label}
                </option>
              );
            })}
          </select>
        </label>

        <label>
          Category ({txType === 'income' ? 'income account' : 'expense account'})
          <select
            value={categoryAccountId}
            onChange={(e) => setCategoryAccountId(e.target.value)}
            onKeyDown={handleCategoryKeyDown}
          >
            <option value="">Select category…</option>
            {sortedCategoryAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code ? `${a.code} – ` : ''}
                {a.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Description
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. HD materials, Audible, GL Insurance…"
          />
        </label>

        <label>
          Amount
          <input
            type="number"
            step="0.01"
            min="0"
            max="9999999"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              const val = Number(e.target.value);
              if (val > 0 && error?.includes('Amount')) {
                setError(null);
              }
            }}
            style={{
              borderColor: isAmountLarge ? '#ff9800' : undefined,
              borderWidth: isAmountLarge ? '2px' : undefined,
            }}
          />
          {isAmountLarge && (
            <span
              style={{
                fontSize: 12,
                color: '#ff9800',
                marginTop: '4px',
                display: 'block',
              }}
            >
              ⚠️ This is a large amount. Double-check before saving.
            </span>
          )}
        </label>

        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <input
            type="checkbox"
            checked={isCleared}
            onChange={(e) => setIsCleared(e.target.checked)}
          />
          Cleared already?
        </label>

        <button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save Transaction'}
        </button>
      </form>
    </div>
  );
}
