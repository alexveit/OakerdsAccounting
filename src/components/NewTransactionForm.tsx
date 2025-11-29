import { useEffect, useState, type KeyboardEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { FormEvent } from 'react';
import { todayLocalISO } from '../utils/date';
import { computeMortgageSplit } from '../utils/mortgageAmortization';

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

type MortgagePreview = {
  dealNickname: string;
  total: number;
  principal: number;
  interest: number;
  escrow: number;
  // Escrow breakdown for transparency
  escrowTaxes: number;
  escrowInsurance: number;
  // Whether this was auto-calculated or manual
  isAutoCalculated: boolean;
  // Warnings/notes
  warnings: string[];
};


type RealEstateDeal = {
  id: number;
  nickname: string;
  address: string | null;
  type: string | null;
  status: string | null;
  loan_account_id: number | null;
  // Loan terms for auto-split calculation
  original_loan_amount: number | null;
  interest_rate: number | null;
  loan_term_months: number | null;
  close_date: string | null;
  rental_monthly_taxes: number | null;
  rental_monthly_insurance: number | null;
};

type TxType = 'income' | 'expense';
type ExpenseKind = 'material' | 'labor' | 'other';

type NewTransactionFormProps = {
  initialJobId?: number | null;
  onTransactionSaved?: () => void;
};

// ----------------- CHART-OF-ACCOUNTS HELPERS -----------------

// Convert account.code (string like "1000" or "61000") to a number
function codeToNumber(code: string | null): number | null {
  if (!code) return null;
  const n = Number(code.replace(/\D/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Define which code ranges represent *cash-like* accounts
//   1000–1999 → bank / checking / savings
//   2000–2200 → corp & personal credit cards + Mom Debt (once recoded to 2200)
const CASH_CODE_RANGES: Array<[number, number]> = [
  [1000, 1999],
  [2000, 2200],
];

function isCodeInRanges(code: string | null, ranges: Array<[number, number]>): boolean {
  const n = codeToNumber(code);
  if (n == null) return false;
  return ranges.some(([min, max]) => n >= min && n <= max);
}

// -------------------------------------------------------------

export function NewTransactionForm({
  initialJobId,
  onTransactionSaved,
}: NewTransactionFormProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [realEstateDeals, setRealEstateDeals] = useState<RealEstateDeal[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // form state
  const [linkToJob, setLinkToJob] = useState<boolean>(!!initialJobId);
  const [jobId, setJobId] = useState<string>(initialJobId != null ? String(initialJobId) : '');
  const [linkToDeal, setLinkToDeal] = useState<boolean>(false);
  const [dealId, setDealId] = useState<string>('');

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

  // Mortgage-specific state
  const [isMortgagePayment, setIsMortgagePayment] = useState<boolean>(false);
  const [useAutoSplit, setUseAutoSplit] = useState<boolean>(true); // Default to auto when possible
  // Manual entry fields (only used when useAutoSplit is false)
  const [mortgageInterest, setMortgageInterest] = useState<string>('');
  const [mortgageEscrow, setMortgageEscrow] = useState<string>('');
  // Preview modal state
  const [mortgagePreview, setMortgagePreview] = useState<MortgagePreview | null>(null);
  const [showMortgageModal, setShowMortgageModal] = useState(false);
  // Editable preview values (user can adjust before committing)
  const [editablePrincipal, setEditablePrincipal] = useState<string>('');
  const [editableInterest, setEditableInterest] = useState<string>('');
  const [editableEscrow, setEditableEscrow] = useState<string>('');


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

        // Real estate deals (include loan terms for auto-split calculation)
        const { data: dealsData, error: dealsErr } = await supabase
          .from('real_estate_deals')
          .select(`
            id, nickname, address, type, status, loan_account_id,
            original_loan_amount, interest_rate, loan_term_months, close_date,
            rental_monthly_taxes, rental_monthly_insurance
          `)
          .order('id', { ascending: true });

        if (dealsErr) throw dealsErr;

        setRealEstateDeals((dealsData ?? []) as RealEstateDeal[]);
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

  // ---------- CASH & CATEGORY SELECTION USING CODE RANGES ----------

  // 1) Cash-like accounts: only those in CASH_CODE_RANGES and of type asset/liability
  const cashAccounts = accounts.filter((a) => {
    const type = a.account_types?.name;
    const isBalSheet = type === 'asset' || type === 'liability';
    if (!isBalSheet) return false;
    return isCodeInRanges(a.code, CASH_CODE_RANGES);
  });

  // 2) Basic P&L sets
  const incomeAccounts = accounts.filter(
    (a) => a.account_types?.name === 'income'
  );
  const expenseAccounts = accounts.filter(
    (a) => a.account_types?.name === 'expense'
  );

  // 3) Non-cash balance sheet accounts (asset / liability / equity, but *not* in cashAccounts)
  const balanceSheetNonCash = accounts.filter((a) => {
    const type = a.account_types?.name;
    if (!type) return false;

    const isBS =
      type === 'asset' || type === 'liability' || type === 'equity';

    if (!isBS) return false;

    const isCash = cashAccounts.some((c) => c.id === a.id);
    return !isCash;
  });

  // 4) Final category set:
  //    - For Income transactions: only income accounts
  //    - For Expense transactions: expenses + non-cash balance sheet accounts
  const categoryAccounts =
    txType === 'income'
      ? incomeAccounts
      : [...expenseAccounts, ...balanceSheetNonCash];

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

  // -----------------------------------------------------------------

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
  const amtNum = Number(amount) || 0;
  const isAmountLarge = amtNum > 10000;

  // Mortgage principal preview (for manual mode)
  const interestNum = Number(mortgageInterest) || 0;
  const escrowNum = Number(mortgageEscrow) || 0;
  const computedPrincipal = Math.max(amtNum - interestNum - escrowNum, 0);

  // Check if selected deal has sufficient loan data for auto-split
  const selectedDeal = dealId
    ? realEstateDeals.find((d) => d.id === Number(dealId))
    : null;

  const canAutoSplit = Boolean(
    selectedDeal &&
    selectedDeal.original_loan_amount &&
    selectedDeal.original_loan_amount > 0 &&
    selectedDeal.interest_rate != null &&
    selectedDeal.interest_rate >= 0 &&
    selectedDeal.loan_term_months &&
    selectedDeal.loan_term_months > 0 &&
    selectedDeal.close_date
  );

  // Helper to compute auto-split preview
  function computeAutoSplitPreview(deal: RealEstateDeal, totalPayment: number, paymentDate: string): MortgagePreview {
    const warnings: string[] = [];

    // Use the utility function
    const split = computeMortgageSplit(
      {
        originalLoanAmount: deal.original_loan_amount!,
        annualRatePercent: deal.interest_rate!,
        termMonths: deal.loan_term_months!,
        startDate: deal.close_date!,
        rentalMonthlyTaxes: deal.rental_monthly_taxes || 0,
        rentalMonthlyInsurance: deal.rental_monthly_insurance || 0,
      },
      paymentDate,
      totalPayment
    );

    // Sanity checks
    const computedTotal = split.principal + split.interest + split.escrowTaxes + split.escrowInsurance;
    if (Math.abs(computedTotal - totalPayment) > 0.02) {
      warnings.push(`Computed split (${computedTotal.toFixed(2)}) differs from total (${totalPayment.toFixed(2)})`);
    }

    if (split.escrowInferred) {
      warnings.push('Escrow inferred from payment difference (total − calculated P&I). Verify this is correct.');
    }

    return {
      dealNickname: deal.nickname,
      total: totalPayment,
      principal: split.principal,
      interest: split.interest,
      escrow: split.escrowTaxes + split.escrowInsurance,
      escrowTaxes: split.escrowTaxes,
      escrowInsurance: split.escrowInsurance,
      isAutoCalculated: true,
      warnings,
    };
  }

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
    if (linkToDeal && !dealId) {
      setError('Deal is required when linking this transaction to a real estate deal.');
      return;
    }
    if (!cashAccountId) {
      setError('Pay from / deposit to account is required.');
      return;
    }
    if (!amount || !amt || amt <= 0) {
      setError('Amount must be greater than 0.');
      return;
    }

    // Only enforce vendor/installer when needed
    if (txType === 'expense' && linkToJob && !isMortgagePayment) {
      if (effectiveExpenseKind === 'material' && !vendorId) {
        setError('Vendor is required for material job expense.');
        return;
      }
      if (effectiveExpenseKind === 'labor' && !installerId) {
        setError('Installer is required for labor job expense.');
        return;
      }
    }

    // === MORTGAGE-SPECIFIC VALIDATION ===
    const mortgageMode = isMortgagePayment && linkToDeal && !!dealId && txType === 'expense';

    if (mortgageMode && !useAutoSplit) {
      // Manual mode validation
      if (!mortgageInterest && !mortgageEscrow) {
        setError('For a manual mortgage payment, enter at least interest or escrow.');
        return;
      }
      if (computedPrincipal < 0) {
        setError(
          'Interest + escrow is greater than the total amount. Principal would be negative.'
        );
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

    // Warning 3: Check for potential duplicate transactions (only for normal expenses)
    if (!mortgageMode && txType === 'expense' && vendorId && description) {
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
      const real_estate_deal_id =
        linkToDeal && dealId ? Number(dealId) : null;

      const cash_id = Number(cashAccountId);

      // --- derive a single transaction-level purpose ---
      const cashPurposeDefault = purposeForAccount(cash_id);
      // For normal (non-mortgage) path we still need category account id early:
      const category_id = categoryAccountId ? Number(categoryAccountId) : null;
      const categoryPurposeDefault = category_id
        ? purposeForAccount(category_id)
        : 'business';

      let txPurpose: 'business' | 'personal' =
        cashPurposeDefault === 'personal' ||
        categoryPurposeDefault === 'personal'
          ? 'personal'
          : 'business';

      const cashPurpose = txPurpose;
      const categoryPurpose = txPurpose;
      // ---------------------------------------------------

      // ---------- MORTGAGE PAYMENT FLOW ----------
      if (mortgageMode) {
        const mortgageDeal = realEstateDeals.find(
          (d) => d.id === Number(dealId)
        );
        if (!mortgageDeal) {
          setError('Selected real estate deal not found.');
          setSaving(false);
          return;
        }

        if (!mortgageDeal.loan_account_id) {
          setError(
            'This real estate deal does not have a loan account linked (loan_account_id is null).'
          );
          setSaving(false);
          return;
        }

        const interestAccount = accounts.find(
          (a) => a.name === 'RE – Mortgage Interest'
        );
        const escrowAccount = accounts.find(
          (a) => a.name === 'RE – Taxes & Insurance'
        );

        if (!interestAccount || !escrowAccount) {
          setError(
            'Could not find RE – Mortgage Interest and/or RE – Taxes & Insurance accounts.'
          );
          setSaving(false);
          return;
        }

        const totalPayment = Number(amount) || 0;

        if (totalPayment <= 0) {
          setError('Total mortgage payment must be greater than zero.');
          setSaving(false);
          return;
        }

        let preview: MortgagePreview;

        if (useAutoSplit && canAutoSplit) {
          // Auto-split mode: compute using amortization schedule
          preview = computeAutoSplitPreview(mortgageDeal, totalPayment, date);
        } else {
          // Manual mode: use user-entered values
          preview = {
            dealNickname: mortgageDeal.nickname,
            total: totalPayment,
            principal: computedPrincipal,
            interest: interestNum,
            escrow: escrowNum,
            escrowTaxes: 0,
            escrowInsurance: 0,
            isAutoCalculated: false,
            warnings: [],
          };
        }

        setMortgagePreview(preview);
        // Initialize editable fields with computed values
        setEditablePrincipal(preview.principal.toFixed(2));
        setEditableInterest(preview.interest.toFixed(2));
        setEditableEscrow(preview.escrow.toFixed(2));
        setShowMortgageModal(true);
        setSaving(false);
        return;
      }


      // ---------- NORMAL (NON-MORTGAGE) FLOW ----------
      if (!categoryAccountId) {
        setError('Category account is required.');
        setSaving(false);
        return;
      }

      const category_id_normal = Number(categoryAccountId);

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

      // Recompute purpose with the actual category used
      const categoryPurposeDefaultNormal = purposeForAccount(category_id_normal);

      txPurpose =
        cashPurposeDefault === 'personal' ||
        categoryPurposeDefaultNormal === 'personal'
          ? 'personal'
          : 'business';

      const cashPurposeNormal = txPurpose;
      const categoryPurposeNormal = txPurpose;

      let line1: any;
      let line2: any;

      if (txType === 'income') {
        line1 = {
          account_id: cash_id,
          amount: amt,
          job_id,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: cashPurposeNormal,
          is_cleared: isCleared,
        };

        line2 = {
          account_id: category_id_normal,
          amount: -amt,
          job_id,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: categoryPurposeNormal,
          is_cleared: isCleared,
        };
      } else {
        // expense
        line1 = {
          account_id: category_id_normal,
          amount: amt,
          job_id,
          vendor_id,
          installer_id,
          real_estate_deal_id,
          purpose: categoryPurposeNormal,
          is_cleared: isCleared,
        };

        line2 = {
          account_id: cash_id,
          amount: -amt,
          job_id,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: cashPurposeNormal,
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
      // keep job/deal linkage as-is so you can input multiple related lines quickly

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

  async function handleConfirmMortgageSplit() {
    if (!mortgagePreview) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const real_estate_deal_id =
        linkToDeal && dealId ? Number(dealId) : null;

      if (!real_estate_deal_id) {
        setError('Real estate deal is required for mortgage payments.');
        setSaving(false);
        return;
      }

      const selectedDeal = realEstateDeals.find(
        (d) => d.id === real_estate_deal_id
      );

      if (!selectedDeal) {
        setError('Selected real estate deal not found.');
        setSaving(false);
        return;
      }

      if (!selectedDeal.loan_account_id) {
        setError(
          'This real estate deal does not have a loan account linked (loan_account_id is null).'
        );
        setSaving(false);
        return;
      }

      const interestAccount = accounts.find(
        (a) => a.name === 'RE – Mortgage Interest'
      );
      const escrowAccount = accounts.find(
        (a) => a.name === 'RE – Taxes & Insurance'
      );

      if (!interestAccount || !escrowAccount) {
        setError(
          'Could not find RE – Mortgage Interest and/or RE – Taxes & Insurance accounts.'
        );
        setSaving(false);
        return;
      }

      const cash_id = Number(cashAccountId);
      if (!cash_id) {
        setError('Cash/bank account is required.');
        setSaving(false);
        return;
      }

      // Mortgage payments are for real estate deals (business use).
      // Purpose = what is this payment "for" → business.
      const txPurpose: 'business' | 'personal' = 'business';
      // Cash side can still reflect whether the paying account is personal/business,
      // but that does NOT change the transaction's purpose.
      const cashPurposeDefault = purposeForAccount(cash_id);
      const cashPurpose: 'business' | 'personal' =
        cashPurposeDefault === 'personal' ? 'personal' : 'business';

      // Use the editable values (user may have adjusted them)
      const principal = Number(editablePrincipal) || 0;
      const interestPortion = Number(editableInterest) || 0;
      const escrowPortion = Number(editableEscrow) || 0;

      // Validate that the split adds up to the total
      const splitTotal = principal + interestPortion + escrowPortion;
      if (Math.abs(splitTotal - mortgagePreview.total) > 0.02) {
        setError(
          `Split amounts (${splitTotal.toFixed(2)}) don't match total payment (${mortgagePreview.total.toFixed(2)}). Please adjust.`
        );
        setSaving(false);
        return;
      }

      // 1) Interest transaction: DR interest expense, CR cash
      if (interestPortion > 0) {
        const line1 = {
          account_id: interestAccount.id,
          amount: interestPortion,
          job_id: null,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: txPurpose,
          is_cleared: isCleared,
        };

        const line2 = {
          account_id: cash_id,
          amount: -interestPortion,
          job_id: null,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: cashPurpose,
          is_cleared: isCleared,
        };

        const { error: rpcErr1 } = await supabase.rpc('create_transaction', {
          p_date: date,
          p_description:
            description || `Mortgage interest – ${selectedDeal.nickname}`,
          p_line1: line1,
          p_line2: line2,
          p_purpose: txPurpose,
        });

        if (rpcErr1) throw rpcErr1;
      }

      // 2) Escrow transaction: DR escrow asset, CR cash
      if (escrowPortion > 0) {
        const line1 = {
          account_id: escrowAccount.id,
          amount: escrowPortion,
          job_id: null,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: txPurpose,
          is_cleared: isCleared,
        };

        const line2 = {
          account_id: cash_id,
          amount: -escrowPortion,
          job_id: null,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: cashPurpose,
          is_cleared: isCleared,
        };

        const { error: rpcErr2 } = await supabase.rpc('create_transaction', {
          p_date: date,
          p_description:
            description || `Mortgage escrow – ${selectedDeal.nickname}`,
          p_line1: line1,
          p_line2: line2,
          p_purpose: txPurpose,
        });

        if (rpcErr2) throw rpcErr2;
      }

      // 3) Principal transaction: DR loan liability (reduces it), CR cash
      if (principal > 0) {
        const line1 = {
          account_id: selectedDeal.loan_account_id,
          amount: principal,
          job_id: null,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: txPurpose,
          is_cleared: isCleared,
        };

        const line2 = {
          account_id: cash_id,
          amount: -principal,
          job_id: null,
          vendor_id: null,
          installer_id: null,
          real_estate_deal_id,
          purpose: cashPurpose,
          is_cleared: isCleared,
        };

        const { error: rpcErr3 } = await supabase.rpc('create_transaction', {
          p_date: date,
          p_description:
            description || `Mortgage principal – ${selectedDeal.nickname}`,
          p_line1: line1,
          p_line2: line2,
          p_purpose: txPurpose,
        });

        if (rpcErr3) throw rpcErr3;
      }

      setSuccess('Mortgage payment split saved.');
      setAmount('');
      setDescription('');
      setMortgageInterest('');
      setMortgageEscrow('');
      setEditablePrincipal('');
      setEditableInterest('');
      setEditableEscrow('');
      // keep job/deal linkage & isMortgagePayment so you can enter multiple similar payments quickly

      if (onTransactionSaved) {
        onTransactionSaved();
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to save mortgage payment.');
    } finally {
      setSaving(false);
      setShowMortgageModal(false);
      setMortgagePreview(null);
    }
  }

function handleCancelMortgageSplit() {
  setShowMortgageModal(false);
  setMortgagePreview(null);
  setEditablePrincipal('');
  setEditableInterest('');
  setEditableEscrow('');
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
        {/* Job linkage */}
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

        {/* Real estate deal linkage */}
        <label
          style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
        >
          <input
            type="checkbox"
            checked={linkToDeal}
            onChange={(e) => {
              const checked = e.target.checked;
              setLinkToDeal(checked);
              if (!checked) {
                setDealId('');
                setIsMortgagePayment(false);
                setMortgageInterest('');
                setMortgageEscrow('');
              }
            }}
          />
          Relates to a real estate deal?
        </label>

        {linkToDeal && (
          <label>
            Real estate deal
            <select
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
            >
              <option value="">Select deal…</option>
              {realEstateDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nickname}
                  {d.address ? ` – ${d.address}` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Mortgage payment toggle & panel (only when linked to a deal and expense) */}
        {linkToDeal && txType === 'expense' && (
          <label
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <input
              type="checkbox"
              checked={isMortgagePayment}
              onChange={(e) => {
                const checked = e.target.checked;
                setIsMortgagePayment(checked);
                if (!checked) {
                  setMortgageInterest('');
                  setMortgageEscrow('');
                  setUseAutoSplit(true);
                }
              }}
              disabled={!dealId}
            />
            This is a mortgage payment (PITI split)
          </label>
        )}

        {linkToDeal && txType === 'expense' && isMortgagePayment && (
          <div
            className="card"
            style={{
              padding: '0.75rem',
              border: '1px solid #ddd',
              borderRadius: 8,
              background: '#fafafa',
            }}
          >
            {/* Auto-split toggle */}
            <div style={{ marginBottom: '0.75rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  fontWeight: 500,
                }}
              >
                <input
                  type="checkbox"
                  checked={useAutoSplit}
                  onChange={(e) => {
                    setUseAutoSplit(e.target.checked);
                    if (e.target.checked) {
                      // Clear manual inputs when switching to auto
                      setMortgageInterest('');
                      setMortgageEscrow('');
                    }
                  }}
                  disabled={!canAutoSplit}
                />
                Auto-calculate split from loan terms
              </label>

              {!canAutoSplit && selectedDeal && (
                <div
                  style={{
                    fontSize: 12,
                    color: '#b26a00',
                    marginTop: 4,
                    marginLeft: 24,
                  }}
                >
                  ⚠️ This deal is missing loan data (rate, term, original amount, or close date).
                  Enter values manually or update the deal.
                </div>
              )}

              {canAutoSplit && useAutoSplit && (
                <div
                  style={{
                    fontSize: 12,
                    color: '#666',
                    marginTop: 4,
                    marginLeft: 24,
                  }}
                >
                  Using {selectedDeal?.interest_rate}% rate, {selectedDeal?.loan_term_months}-month term,
                  ${selectedDeal?.original_loan_amount?.toLocaleString()} loan, started {selectedDeal?.close_date}.
                  {selectedDeal?.rental_monthly_taxes || selectedDeal?.rental_monthly_insurance
                    ? ` Escrow: $${((selectedDeal?.rental_monthly_taxes || 0) + (selectedDeal?.rental_monthly_insurance || 0)).toFixed(2)}/mo.`
                    : ' Escrow will be inferred from payment.'}
                </div>
              )}
            </div>

            {/* Manual input fields (only shown when not using auto-split) */}
            {!useAutoSplit && (
              <>
                <div style={{ fontSize: 13, marginBottom: '0.5rem' }}>
                  Enter the interest and escrow amounts from your mortgage
                  statement. Principal will be calculated as:
                  <br />
                  <code>principal = total amount − interest − escrow</code>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                    gap: '0.5rem',
                  }}
                >
                  <label>
                    Interest portion
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={mortgageInterest}
                      onChange={(e) => setMortgageInterest(e.target.value)}
                    />
                  </label>
                  <label>
                    Escrow
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={mortgageEscrow}
                      onChange={(e) => setMortgageEscrow(e.target.value)}
                    />
                  </label>
                  <label>
                    Principal (computed)
                    <input
                      type="text"
                      readOnly
                      value={
                        computedPrincipal > 0
                          ? computedPrincipal.toFixed(2)
                          : '0.00'
                      }
                      style={{ background: '#eee' }}
                    />
                  </label>
                </div>
              </>
            )}

            {/* Auto-split mode: just show a message */}
            {useAutoSplit && canAutoSplit && (
              <div style={{ fontSize: 13, color: '#444' }}>
                Enter the total mortgage payment amount below and click "Save Transaction"
                to see the calculated split for your approval.
              </div>
            )}
          </div>
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
            onChange={(e) => {
              const val = e.target.value as TxType;
              setTxType(val);
              // Turning into income should disable mortgage mode
              if (val === 'income') {
                setIsMortgagePayment(false);
                setMortgageInterest('');
                setMortgageEscrow('');
              }
            }}
          >
            <option value="expense">Expense</option>
            <option value="income">Income</option>
          </select>
        </label>

        {txType === 'expense' && linkToJob && !isMortgagePayment && (
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
          effectiveExpenseKind === 'material' &&
          !isMortgagePayment && (
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
          effectiveExpenseKind === 'labor' &&
          !isMortgagePayment && (
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

        {/* Category only matters for non-mortgage flow; for mortgage we split ourselves */}
        {!isMortgagePayment && (
          <label>
            Category ({txType === 'income' ? 'income account' : 'expense/BS account'})
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
        )}

        <label>
          Description
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. HD materials, Mortgage PITI, GL Insurance…"
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
      {showMortgageModal && mortgagePreview && (
      <div
        className="modal-backdrop"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}
      >
        <div
          className="modal"
          style={{
            backgroundColor: 'white',
            padding: '1.5rem',
            borderRadius: '0.5rem',
            maxWidth: '520px',
            width: '100%',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
          }}
        >
          <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
            {mortgagePreview.isAutoCalculated ? '🧮 ' : ''}Mortgage Payment Split
          </h2>
          <p style={{ margin: 0, marginBottom: '0.5rem' }}>
            <strong>Deal:</strong> {mortgagePreview.dealNickname}
          </p>
          <p style={{ margin: 0, marginBottom: '0.5rem' }}>
            <strong>Payment Date:</strong> {date}
          </p>
          <p style={{ margin: 0, marginBottom: '0.75rem' }}>
            <strong>Total payment:</strong> ${mortgagePreview.total.toFixed(2)}
          </p>

          {mortgagePreview.isAutoCalculated && (
            <div
              style={{
                backgroundColor: '#e8f4fd',
                border: '1px solid #b3d9f7',
                borderRadius: 6,
                padding: '0.5rem 0.75rem',
                marginBottom: '0.75rem',
                fontSize: 13,
              }}
            >
              <strong>Auto-calculated</strong> from amortization schedule.
              Adjust values below if needed.
            </div>
          )}

          {mortgagePreview.warnings.length > 0 && (
            <div
              style={{
                backgroundColor: '#fff3cd',
                border: '1px solid #ffc107',
                borderRadius: 6,
                padding: '0.5rem 0.75rem',
                marginBottom: '0.75rem',
                fontSize: 13,
              }}
            >
              {mortgagePreview.warnings.map((w, i) => (
                <div key={i}>⚠️ {w}</div>
              ))}
            </div>
          )}

          {/* Editable split fields */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.75rem',
              marginBottom: '0.75rem',
            }}
          >
            <label style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 500 }}>Principal</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editablePrincipal}
                onChange={(e) => setEditablePrincipal(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginTop: 4,
                  borderRadius: 4,
                  border: '1px solid #ccc',
                }}
              />
              <span style={{ fontSize: 11, color: '#666' }}>
                Reduces loan balance
              </span>
            </label>

            <label style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 500 }}>Interest</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editableInterest}
                onChange={(e) => setEditableInterest(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginTop: 4,
                  borderRadius: 4,
                  border: '1px solid #ccc',
                }}
              />
              <span style={{ fontSize: 11, color: '#666' }}>
                Interest expense
              </span>
            </label>

            <label style={{ fontSize: 14 }}>
              <span style={{ fontWeight: 500 }}>Escrow</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editableEscrow}
                onChange={(e) => setEditableEscrow(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  marginTop: 4,
                  borderRadius: 4,
                  border: '1px solid #ccc',
                }}
              />
              <span style={{ fontSize: 11, color: '#666' }}>
                Taxes & insurance
              </span>
            </label>
          </div>

          {/* Running total check */}
          {(() => {
            const editTotal =
              (Number(editablePrincipal) || 0) +
              (Number(editableInterest) || 0) +
              (Number(editableEscrow) || 0);
            const diff = editTotal - mortgagePreview.total;
            const isBalanced = Math.abs(diff) < 0.02;

            return (
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  borderRadius: 6,
                  marginBottom: '0.75rem',
                  backgroundColor: isBalanced ? '#d4edda' : '#f8d7da',
                  border: `1px solid ${isBalanced ? '#28a745' : '#dc3545'}`,
                  fontSize: 13,
                }}
              >
                <strong>Split total:</strong> ${editTotal.toFixed(2)}
                {isBalanced ? (
                  <span style={{ color: '#155724' }}> ✓ Matches payment</span>
                ) : (
                  <span style={{ color: '#721c24' }}>
                    {' '}
                    ({diff > 0 ? '+' : ''}
                    {diff.toFixed(2)} difference)
                  </span>
                )}
              </div>
            );
          })()}

          {/* Escrow breakdown (if auto-calculated with escrow) */}
          {mortgagePreview.isAutoCalculated &&
            (mortgagePreview.escrowTaxes > 0 || mortgagePreview.escrowInsurance > 0) && (
              <div style={{ fontSize: 12, color: '#666', marginBottom: '0.75rem' }}>
                <em>
                  Escrow breakdown: Taxes ${mortgagePreview.escrowTaxes.toFixed(2)} +
                  Insurance ${mortgagePreview.escrowInsurance.toFixed(2)}
                </em>
              </div>
            )}

          <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem', color: '#555' }}>
            This will create three separate double-entry transactions:
            principal (reduces loan), interest (expense), and escrow (asset),
            all paid from your selected bank/card account.
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '0.5rem',
              marginTop: '0.5rem',
            }}
          >
            <button
              type="button"
              onClick={handleCancelMortgageSplit}
              disabled={saving}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 4,
                border: '1px solid #ccc',
                background: '#fff',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmMortgageSplit}
              disabled={saving}
              style={{
                padding: '0.5rem 1rem',
                borderRadius: 4,
                border: 'none',
                background: '#0066cc',
                color: '#fff',
                fontWeight: 500,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Confirm & Save'}
            </button>
          </div>
        </div>
      </div>
    )}

    </div>
  );
}