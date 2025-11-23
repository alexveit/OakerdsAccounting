import { useEffect, useState } from 'react';
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

// NEW: allow parent to preselect a job
type NewTransactionFormProps = {
  initialJobId?: number | null;
};

export function NewTransactionForm({ initialJobId }: NewTransactionFormProps) {
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

  // expenseKind only meaningful when linkToJob && txType === 'expense'
  const [expenseKind, setExpenseKind] = useState<ExpenseKind>('material');

  const [vendorId, setVendorId] = useState<string>('');
  const [installerId, setInstallerId] = useState<string>('');

  const [cashAccountId, setCashAccountId] = useState<string>(''); // bank / card
  const [categoryAccountId, setCategoryAccountId] = useState<string>(''); // income or expense

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

        // Filter only open jobs
        const openJobs = (jobsData ?? []).filter(j => j.status !== 'closed');

        // Sort by newest first
        const sortedOpenJobs = openJobs.sort((a, b) => {
          const da = a.start_date ? new Date(a.start_date).getTime() : 0;
          const db = b.start_date ? new Date(b.start_date).getTime() : 0;
          return db - da; // newest first
        });

        setJobs(sortedOpenJobs);

        // Vendors
        const { data: vendorsData, error: vendorsErr } = await supabase
          .from('vendors')
          .select('id, nick_name')
          .order('name', { ascending: true });
        if (vendorsErr) throw vendorsErr;
        setVendors((vendorsData ?? []) as Vendor[]);

        // Installers
        const { data: installersData, error: installersErr } = await supabase
          .from('installers')
          .select('id, first_name, last_name')
          .order('first_name', { ascending: true });
        if (installersErr) throw installersErr;
        setInstallers((installersData ?? []) as Installer[]);

        // Accounts with their types and default purpose
        const { data: accountsData, error: accountsErr } = await supabase
          .from('accounts')
          .select('id, name, code, purpose_default, account_types(name)')
          .order('code', { ascending: true });
        if (accountsErr) throw accountsErr;

        const normalizedAccounts: Account[] = (accountsData ?? []).map(
          (a: any) => ({
            id: a.id,
            name: a.name,
            code: a.code ?? null,
            account_types: a.account_types ?? null,
            purpose_default: (a.purpose_default ??
              null) as Account['purpose_default'],
          })
        );

        setAccounts(normalizedAccounts);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Error loading options');
      } finally {
        setLoading(false);
      }
    }

    loadOptions();
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

  function formatInstaller(i: Installer) {
    return `${i.first_name} ${i.last_name ?? ''}`.trim();
  }

  function purposeForAccount(
    accountId: number
  ): 'business' | 'personal' {
    const acc = accounts.find((a) => a.id === accountId);
    const def = acc?.purpose_default;
    if (def === 'personal') return 'personal';
    // treat mixed or null as business by default
    return 'business';
  }

  // Effective expense kind: only meaningful when this is a job expense
  const effectiveExpenseKind: ExpenseKind =
    linkToJob && txType === 'expense' ? expenseKind : 'other';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const amt = Number(amount);

    // Validation
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

    // Only enforce vendor/installer when:
    // - it's an expense
    // - it relates to a job
    // - AND the effectiveExpenseKind really needs it
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

    setSaving(true);
    try {
      const job_id =
        linkToJob && jobId ? Number(jobId) : null;
      const cash_id = Number(cashAccountId);
      const category_id = Number(categoryAccountId);

      const vendor_id =
        txType === 'expense' && linkToJob && effectiveExpenseKind === 'material'
          ? (vendorId ? Number(vendorId) : null)
          : null;

      const installer_id =
        txType === 'expense' && linkToJob && effectiveExpenseKind === 'labor'
          ? (installerId ? Number(installerId) : null)
          : null;

      // 1) Create transaction header
      const { data: txData, error: txErr } = await supabase
        .from('transactions')
        .insert({
          date,
          description: description || null,
        })
        .select('id')
        .single();

      if (txErr) throw txErr;
      const transactionId = txData.id;

      // Default purposes derived from accounts
      const cashPurpose = purposeForAccount(cash_id);
      const categoryPurpose = purposeForAccount(category_id);

      // 2) Build lines (double-entry)
      const lines: any[] = [];

      if (txType === 'income') {
        // Income:
        //  - debit cash/bank (asset)   +amount
        //  - credit income             -amount
        lines.push(
          {
            transaction_id: transactionId,
            account_id: cash_id,
            amount: amt,
            job_id,
            purpose: cashPurpose,
            is_cleared: isCleared,
          },
          {
            transaction_id: transactionId,
            account_id: category_id,
            amount: -amt,
            job_id,
            purpose: categoryPurpose,
            is_cleared: isCleared,
          }
        );
      } else {
        // Expense:
        //  - debit expense             +amount
        //  - credit cash/bank/card     -amount
        const baseExpenseLine: any = {
          transaction_id: transactionId,
          account_id: category_id,
          amount: amt,
          job_id,
          purpose: categoryPurpose,
          is_cleared: isCleared,
        };

        if (effectiveExpenseKind === 'material' && vendor_id) {
          baseExpenseLine.vendor_id = vendor_id;
        }
        if (effectiveExpenseKind === 'labor' && installer_id) {
          baseExpenseLine.installer_id = installer_id;
        }

        lines.push(
          baseExpenseLine,
          {
            transaction_id: transactionId,
            account_id: cash_id,
            amount: -amt,
            job_id,
            purpose: cashPurpose,
            is_cleared: isCleared,
          }
        );
      }

      const { error: linesErr } = await supabase
        .from('transaction_lines')
        .insert(lines);

      if (linesErr) throw linesErr;

      setSuccess('Transaction saved.');
      // reset some fields but keep date & job link choice
      setAmount('');
      setDescription('');
      setVendorId('');
      setInstallerId('');
      setIsCleared(false);
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
        <p style={{ color: 'green', marginTop: '0.5rem' }}>
          {success}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ maxWidth: 520, display: 'grid', gap: '0.75rem' }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
          />
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

        {/* Expense kind ONLY when this is a job expense */}
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

        {/* Vendor only for job + material expense */}
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

        {/* Installer only for job + labor expense */}
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
          >
            <option value="">Select category…</option>
            {categoryAccounts.map((a) => (
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
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
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
