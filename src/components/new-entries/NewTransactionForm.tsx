import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { FormEvent } from 'react';
import { todayLocalISO } from '../../utils/date';
import { computeMortgageSplit } from '../../utils/mortgageAmortization';
import { isCashAccount, compareAccountsForSort, ACCOUNT_CODES } from '../../utils/accounts';
import { SearchableSelect, type SelectOption } from '../shared/SearchableSelect';
import { VendorSelect } from '../shared/VendorSelect';
import { InstallerSelect } from '../shared/InstallerSelect';
import { JobSelect } from '../shared/JobSelect';

type Account = {
  id: number;
  name: string;
  code: string | null;
  account_types: { name: string } | null;
  purpose_default: 'business' | 'personal' | 'mixed' | null;
};

type RehabCategory = {
  id: number;
  code: string;
  name: string;
  category_group: string;
  sort_order: number;
};

type MortgagePreview = {
  dealNickname: string;
  total: number;
  principal: number;
  interest: number;
  escrow: number;
  escrowTaxes: number;
  escrowInsurance: number;
  isAutoCalculated: boolean;
  warnings: string[];
  paymentNumber?: number;
};

type RealEstateDeal = {
  id: number;
  nickname: string;
  address: string | null;
  type: string | null;
  status: string | null;
  loan_account_id: number | null;
  original_loan_amount: number | null;
  interest_rate: number | null;
  loan_term_months: number | null;
  close_date: string | null;
  first_payment_date: string | null;
  payment_frequency: 'monthly' | 'semimonthly' | 'biweekly' | null;
  rental_monthly_taxes: number | null;
  rental_monthly_insurance: number | null;
};

type TxType = 'income' | 'expense';
type ExpenseKind = 'material' | 'labor' | 'other';
type CostType = 'L' | 'M' | 'S' | 'I' | 'H' | '';

// Raw shape from Supabase accounts query
type RawAccountData = {
  id: number;
  name: string;
  code: string | null;
  purpose_default: string | null;
  account_types: { name: string } | null;
};

// Shape for transaction lines passed to create_transaction_multi RPC
type TransactionLineInput = {
  account_id: number;
  amount: number;
  job_id: number | null;
  vendor_id: number | null;
  installer_id: number | null;
  real_estate_deal_id: number | null;
  purpose: 'business' | 'personal';
  is_cleared: boolean;
  rehab_category_id?: number | null;
};

type NewTransactionFormProps = {
  initialJobId?: number | null;
  onTransactionSaved?: () => void;
};

export function NewTransactionForm({
  initialJobId,
  onTransactionSaved,
}: NewTransactionFormProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [realEstateDeals, setRealEstateDeals] = useState<RealEstateDeal[]>([]);
  const [rehabCategories, setRehabCategories] = useState<RehabCategory[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // form state - IDs are number | null for wrapper components
  const [jobId, setJobId] = useState<number | null>(initialJobId ?? null);
  const [dealId, setDealId] = useState<string>('');

  const [date, setDate] = useState<string>(() => todayLocalISO());

  const [txType, setTxType] = useState<TxType>('expense');
  const [expenseKind, setExpenseKind] = useState<ExpenseKind>('material');

  // Flip-specific fields
  const [rehabCategoryId, setRehabCategoryId] = useState<string>('');
  const [costType, setCostType] = useState<CostType>('');

  const [vendorId, setVendorId] = useState<number | null>(null);
  const [installerId, setInstallerId] = useState<number | null>(null);

  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [categoryAccountId, setCategoryAccountId] = useState<string>('');

  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');

  const [isCleared, setIsCleared] = useState<boolean>(false);

  // Mortgage-specific state
  const [isMortgagePayment, setIsMortgagePayment] = useState<boolean>(false);
  const [useAutoSplit, setUseAutoSplit] = useState<boolean>(true);
  const [mortgageInterest, setMortgageInterest] = useState<string>('');
  const [mortgageEscrow, setMortgageEscrow] = useState<string>('');
  const [mortgagePreview, setMortgagePreview] = useState<MortgagePreview | null>(null);
  const [showMortgageModal, setShowMortgageModal] = useState(false);
  const [editablePrincipal, setEditablePrincipal] = useState<string>('');
  const [editableInterest, setEditableInterest] = useState<string>('');
  const [editableEscrow, setEditableEscrow] = useState<string>('');

  useEffect(() => {
    async function loadOptions() {
      setLoading(true);
      setError(null);
      try {
        // Accounts
        const { data: accountsData, error: accountsErr } = await supabase
          .from('accounts')
          .select('id, name, code, purpose_default, account_types(name)');
        if (accountsErr) throw accountsErr;
        const normalizedAccounts: Account[] = ((accountsData ?? []) as unknown as RawAccountData[]).map((a) => ({
          id: a.id,
          name: a.name,
          code: a.code ?? null,
          account_types: a.account_types ?? null,
          purpose_default: (a.purpose_default ?? null) as Account['purpose_default'],
        }));
        const sortedAccounts = normalizedAccounts.sort(compareAccountsForSort);
        setAccounts(sortedAccounts);

        // Real estate deals
        const { data: dealsData, error: dealsErr } = await supabase
          .from('real_estate_deals')
          .select(`
            id, nickname, address, type, status, loan_account_id,
            original_loan_amount, interest_rate, loan_term_months, close_date,
            first_payment_date, payment_frequency, rental_monthly_taxes, rental_monthly_insurance
          `)
          .order('id', { ascending: true });
        if (dealsErr) throw dealsErr;
        setRealEstateDeals((dealsData ?? []) as RealEstateDeal[]);

        // Rehab categories
        const { data: rehabData, error: rehabErr } = await supabase
          .from('rehab_categories')
          .select('id, code, name, category_group, sort_order')
          .order('sort_order', { ascending: true });
        if (rehabErr) throw rehabErr;
        setRehabCategories((rehabData ?? []) as RehabCategory[]);

      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Error loading options');
      } finally {
        setLoading(false);
      }
    }
    void loadOptions();
  }, []);

  useEffect(() => {
    if (initialJobId != null) {
      setJobId(initialJobId);
    }
  }, [initialJobId]);

  // Cash-like accounts
  const cashAccounts = accounts.filter((a) => {
    const type = a.account_types?.name;
    const isBalSheet = type === 'asset' || type === 'liability';
    if (!isBalSheet) return false;
    return isCashAccount(a.code);
  });

  const incomeAccounts = accounts.filter((a) => a.account_types?.name === 'income');
  const expenseAccounts = accounts.filter((a) => a.account_types?.name === 'expense');

  const balanceSheetNonCash = accounts.filter((a) => {
    const type = a.account_types?.name;
    if (!type) return false;
    const isBS = type === 'asset' || type === 'liability' || type === 'equity';
    if (!isBS) return false;
    return !cashAccounts.some((c) => c.id === a.id);
  });

  // For income/refund: show both income AND expense accounts (refunds reduce expenses)
  // For expense: show expense accounts and balance sheet non-cash
  const categoryAccounts = txType === 'income'
    ? [...incomeAccounts, ...expenseAccounts]
    : [...expenseAccounts, ...balanceSheetNonCash];

  const sortedCategoryAccounts = [...categoryAccounts].sort((a, b) => {
    const purposeRank = (p: Account['purpose_default'] | null | undefined) => {
      if (p === 'business') return 0;
      if (p === 'personal') return 1;
      return 2;
    };
    const rankA = purposeRank(a.purpose_default);
    const rankB = purposeRank(b.purpose_default);
    if (rankA !== rankB) return rankA - rankB;
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  });

  // SelectOption arrays for SearchableSelect
  const cashAccountOptions: SelectOption[] = cashAccounts.map((a) => ({
    value: a.id,
    label: `${a.code ? `${a.code} - ` : ''}${a.name}${a.account_types?.name === 'liability' ? ' (card)' : ''}`,
    searchText: `${a.code ?? ''} ${a.name}`.toLowerCase(),
  }));
  const categoryAccountOptions: SelectOption[] = sortedCategoryAccounts.map((a) => ({
    value: a.id,
    label: `${a.code ? `${a.code} - ` : ''}${a.name}`,
    searchText: `${a.code ?? ''} ${a.name}`.toLowerCase(),
  }));
  const dealOptions: SelectOption[] = realEstateDeals.map((d) => ({
    value: d.id,
    label: `${d.nickname}${d.type ? ` (${d.type})` : ''}`,
  }));

  function purposeForAccount(accountId: number): 'business' | 'personal' | 'mixed' {
    const acc = accounts.find((a) => a.id === accountId);
    const def = acc?.purpose_default;
    if (def === 'personal') return 'personal';
    if (def === 'mixed') return 'mixed';
    return 'business';
  }

  const selectedDeal = dealId ? realEstateDeals.find((d) => d.id === Number(dealId)) : null;
  const isFlipDeal = selectedDeal?.type === 'flip';
  const effectiveExpenseKind: ExpenseKind = jobId && txType === 'expense' ? expenseKind : 'other';

  const isDateFuture = (() => {
    if (!date) return false;
    const selectedDate = new Date(date + 'T00:00:00');
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    return selectedDate > sevenDaysFromNow;
  })();

  const amtNum = Number(amount) || 0;
  const isAmountLarge = amtNum > 10000;
  const interestNum = Number(mortgageInterest) || 0;
  const escrowNum = Number(mortgageEscrow) || 0;
  const computedPrincipal = Math.max(amtNum - interestNum - escrowNum, 0);

  const canAutoSplit = Boolean(
    selectedDeal &&
    selectedDeal.original_loan_amount &&
    selectedDeal.original_loan_amount > 0 &&
    selectedDeal.interest_rate != null &&
    selectedDeal.interest_rate >= 0 &&
    selectedDeal.loan_term_months &&
    selectedDeal.loan_term_months > 0 &&
    (selectedDeal.first_payment_date || selectedDeal.close_date)
  );

  function computeAutoSplitPreview(deal: RealEstateDeal, totalPayment: number, paymentDate: string): MortgagePreview {
    const warnings: string[] = [];
    if (!deal.first_payment_date && deal.close_date) {
      warnings.push('Using close date as fallback.');
    }
    const split = computeMortgageSplit(
      {
        originalLoanAmount: deal.original_loan_amount!,
        annualRatePercent: deal.interest_rate!,
        termMonths: deal.loan_term_months!,
        startDate: deal.close_date!,
        firstPaymentDate: deal.first_payment_date || undefined,
        paymentFrequency: deal.payment_frequency || 'monthly',
        rentalMonthlyTaxes: deal.rental_monthly_taxes || 0,
        rentalMonthlyInsurance: deal.rental_monthly_insurance || 0,
      },
      paymentDate,
      totalPayment
    );
    const computedTotal = split.principal + split.interest + split.escrowTaxes + split.escrowInsurance;
    if (Math.abs(computedTotal - totalPayment) > 0.02) {
      warnings.push(`Computed split differs from total.`);
    }
    if (split.escrowInferred) {
      warnings.push('Escrow inferred from payment difference.');
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
      paymentNumber: split.paymentNumber,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const amt = Number(amount);

    // Validation
    if (!cashAccountId) { setError('Pay from / deposit to account is required.'); return; }
    if (!categoryAccountId && !isMortgagePayment && !(dealId && isFlipDeal && txType === 'expense')) {
      setError('Category is required.');
      return;
    }
    if (!Number.isFinite(amt) || amt <= 0) { setError('Amount must be a positive number.'); return; }

    // Flip expense validation
    if (dealId && isFlipDeal && txType === 'expense' && !isMortgagePayment) {
      if (!rehabCategoryId) { setError('Rehab category is required for flip expenses.'); return; }
      if (!costType) { setError('Cost type (L/M/S) is required for flip expenses.'); return; }
    }

    // Mortgage payment flow
    if (isMortgagePayment) {
      if (useAutoSplit && canAutoSplit && selectedDeal) {
        const preview = computeAutoSplitPreview(selectedDeal, amt, date);
        setMortgagePreview(preview);
        setEditablePrincipal(preview.principal.toFixed(2));
        setEditableInterest(preview.interest.toFixed(2));
        setEditableEscrow(preview.escrow.toFixed(2));
        setShowMortgageModal(true);
      } else {
        const preview: MortgagePreview = {
          dealNickname: selectedDeal?.nickname || 'Unknown',
          total: amt,
          principal: computedPrincipal,
          interest: interestNum,
          escrow: escrowNum,
          escrowTaxes: escrowNum / 2,
          escrowInsurance: escrowNum / 2,
          isAutoCalculated: false,
          warnings: [],
        };
        setMortgagePreview(preview);
        setEditablePrincipal(preview.principal.toFixed(2));
        setEditableInterest(preview.interest.toFixed(2));
        setEditableEscrow(preview.escrow.toFixed(2));
        setShowMortgageModal(true);
      }
      return;
    }

    // Flip expense direct insert
    if (dealId && isFlipDeal && txType === 'expense') {
      try {
        setSaving(true);
        await handleFlipExpenseSubmit(amt);
        return;
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Error saving flip transaction');
        setSaving(false);
        return;
      }
    }

    // Flip income/refund
    if (dealId && isFlipDeal && txType === 'income') {
      try {
        setSaving(true);
        await handleFlipIncomeSubmit(amt);
        return;
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Error saving flip transaction');
        setSaving(false);
        return;
      }
    }

    // Standard transaction
    setSaving(true);
    try {
      const job_id = jobId;
      const real_estate_deal_id = dealId ? Number(dealId) : null;
      // For job expenses: vendor for materials, installer for labor
      // For general expenses: use whatever is selected
      const vendor_id = jobId
        ? (effectiveExpenseKind === 'material' ? vendorId : null)
        : vendorId;
      const installer_id = jobId
        ? (effectiveExpenseKind === 'labor' ? installerId : null)
        : installerId;
      const cash_id = Number(cashAccountId);
      const category_id_normal = Number(categoryAccountId);

      const cashPurposeDefault = purposeForAccount(cash_id);
      const categoryPurposeDefaultNormal = purposeForAccount(category_id_normal);
      const txPurpose: 'business' | 'personal' =
        cashPurposeDefault === 'personal' || categoryPurposeDefaultNormal === 'personal'
          ? 'personal'
          : 'business';

      let line1: TransactionLineInput;
      let line2: TransactionLineInput;

      if (txType === 'income') {
        // Income: cash line (debit) has no job_id, category line (credit) has job_id
        line1 = { account_id: cash_id, amount: amt, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: txPurpose, is_cleared: isCleared };
        line2 = { account_id: category_id_normal, amount: -amt, job_id, vendor_id, installer_id, real_estate_deal_id, purpose: txPurpose, is_cleared: isCleared };
      } else {
        // Expense: category line (debit) has job_id, cash line (credit) has no job_id
        line1 = { account_id: category_id_normal, amount: amt, job_id, vendor_id, installer_id, real_estate_deal_id, purpose: txPurpose, is_cleared: isCleared };
        line2 = { account_id: cash_id, amount: -amt, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: txPurpose, is_cleared: isCleared };
      }

      const lines = [line1, line2];

      const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
        p_date: date,
        p_description: description || null,
        p_lines: lines,
      });
      if (rpcErr) throw rpcErr;

      setSuccess('Transaction saved.');
      resetFormFields();
      if (onTransactionSaved) onTransactionSaved();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error saving transaction');
    } finally {
      setSaving(false);
    }
  }

  async function handleFlipExpenseSubmit(amt: number) {
    const real_estate_deal_id = Number(dealId);
    const cash_id = Number(cashAccountId);
    const rehab_category_id = Number(rehabCategoryId);
    const vendor_id = vendorId;
    const installer_id = installerId;

    // Determine expense account based on cost type
    const costTypeToAccountCode: Record<string, string> = {
      'L': ACCOUNT_CODES.FLIP_REHAB_LABOR,
      'M': ACCOUNT_CODES.FLIP_REHAB_MATERIALS,
      'S': ACCOUNT_CODES.FLIP_SERVICES,
      'I': ACCOUNT_CODES.FLIP_INTEREST,
      'H': ACCOUNT_CODES.FLIP_HOLDING_COSTS,
    };
    const accountCode = costTypeToAccountCode[costType];
    const expenseAccount = accounts.find(a => a.code === accountCode);

    if (!expenseAccount) {
      throw new Error(`Could not find account for cost type ${costType}. Check account codes.`);
    }
    const expenseAccountId = expenseAccount.id;

    // Build lines for create_transaction_multi
    const lines = [
      {
        account_id: expenseAccountId,
        amount: amt,
        real_estate_deal_id,
        rehab_category_id,
        cost_type: costType || null,
        vendor_id,
        installer_id,
        purpose: 'business',
        is_cleared: isCleared,
      },
      {
        account_id: cash_id,
        amount: -amt,
        real_estate_deal_id,
        rehab_category_id,
        cost_type: costType || null,
        purpose: 'business',
        is_cleared: isCleared,
      },
    ];

    const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
      p_date: date,
      p_description: description || null,
      p_lines: lines,
    });
    if (rpcErr) throw rpcErr;

    setSuccess('Flip expense saved.');
    resetFormFields();
    setSaving(false);
    if (onTransactionSaved) onTransactionSaved();
  }

  async function handleFlipIncomeSubmit(amt: number) {
    const real_estate_deal_id = Number(dealId);
    const cash_id = Number(cashAccountId);
    const rehab_category_id = rehabCategoryId ? Number(rehabCategoryId) : null;
    const vendor_id = vendorId;
    const installer_id = installerId;

    // For income/refunds, use the selected category or materials account (by code)
    const materialsAccount = accounts.find(a => a.code === ACCOUNT_CODES.FLIP_REHAB_MATERIALS);
    const expenseAccountId = categoryAccountId ? Number(categoryAccountId) : materialsAccount?.id;

    if (!expenseAccountId) {
      throw new Error('Could not find expense account for refund.');
    }

    // Build lines for create_transaction_multi
    const lines = [
      {
        account_id: cash_id,
        amount: amt,
        real_estate_deal_id,
        rehab_category_id,
        cost_type: costType || null,
        purpose: 'business',
        is_cleared: isCleared,
      },
      {
        account_id: expenseAccountId,
        amount: -amt,
        real_estate_deal_id,
        rehab_category_id,
        cost_type: costType || null,
        vendor_id,
        installer_id,
        purpose: 'business',
        is_cleared: isCleared,
      },
    ];

    const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
      p_date: date,
      p_description: description || null,
      p_lines: lines,
    });
    if (rpcErr) throw rpcErr;

    setSuccess('Refund saved.');
    resetFormFields();
    setSaving(false);
    if (onTransactionSaved) onTransactionSaved();
  }

  function resetFormFields() {
    setAmount('');
    setDescription('');
    setVendorId(null);
    setInstallerId(null);
    setIsCleared(false);
    setRehabCategoryId('');
    setCostType('');
  }

  async function handleConfirmMortgageSplit() {
    if (!mortgagePreview) return;
    try {
      setSaving(true);
      setError(null);
      const real_estate_deal_id = dealId ? Number(dealId) : null;
      if (!real_estate_deal_id) { setError('Deal required.'); setSaving(false); return; }
      const deal = realEstateDeals.find((d) => d.id === real_estate_deal_id);
      if (!deal) { setError('Deal not found.'); setSaving(false); return; }
      if (!deal.loan_account_id) { setError('Deal has no loan account.'); setSaving(false); return; }

      // Determine purpose and accounts based on deal type
      const isPersonal = deal.type === 'personal';
      const purpose = isPersonal ? 'personal' : 'business';
      
      const interestCode = isPersonal ? ACCOUNT_CODES.PERSONAL_MORTGAGE_INTEREST : ACCOUNT_CODES.RENTAL_MORTGAGE_INTEREST;
      const escrowCode = isPersonal ? ACCOUNT_CODES.PERSONAL_TAXES_INSURANCE : ACCOUNT_CODES.RENTAL_TAXES_INSURANCE;
      
      const interestAccount = accounts.find((a) => a.code === interestCode);
      const escrowAccount = accounts.find((a) => a.code === escrowCode);
      if (!interestAccount || !escrowAccount) { 
        setError(`Missing ${isPersonal ? 'personal' : 'rental'} mortgage accounts (${interestCode}, ${escrowCode}).`); 
        setSaving(false); 
        return; 
      }

      const cash_id = Number(cashAccountId);
      const principal = Number(editablePrincipal) || 0;
      const interestPortion = Number(editableInterest) || 0;
      const escrowPortion = Number(editableEscrow) || 0;
      const splitTotal = principal + interestPortion + escrowPortion;

      if (Math.abs(splitTotal - mortgagePreview.total) > 0.02) {
        setError(`Split (${splitTotal.toFixed(2)}) doesn't match total (${mortgagePreview.total.toFixed(2)}).`);
        setSaving(false);
        return;
      }

      const lines: TransactionLineInput[] = [];
      lines.push({ account_id: cash_id, amount: -mortgagePreview.total, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose, is_cleared: isCleared });
      if (principal > 0) lines.push({ account_id: deal.loan_account_id!, amount: principal, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose, is_cleared: isCleared });
      if (interestPortion > 0) lines.push({ account_id: interestAccount.id, amount: interestPortion, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose, is_cleared: isCleared });
      if (escrowPortion > 0) lines.push({ account_id: escrowAccount.id, amount: escrowPortion, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose, is_cleared: isCleared });

      const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
        p_date: date,
        p_description: description || `Mortgage payment - ${deal.nickname}`,
        p_purpose: purpose,
        p_lines: lines,
      });
      if (rpcErr) throw rpcErr;

      setSuccess('Mortgage payment saved.');
      resetFormFields();
      setShowMortgageModal(false);
      setMortgagePreview(null);
      setIsMortgagePayment(false);
      if (onTransactionSaved) onTransactionSaved();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error saving mortgage');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelMortgageSplit() {
    setShowMortgageModal(false);
    setMortgagePreview(null);
  }

  if (loading) return <p>Loading form options...</p>;

  // Group rehab categories
  const groupedRehabCategories = rehabCategories.reduce((acc, cat) => {
    const group = cat.category_group || 'other';
    if (!acc[group]) acc[group] = [];
    acc[group].push(cat);
    return acc;
  }, {} as Record<string, RehabCategory[]>);

  const groupOrder = ['site_prep', 'structural', 'mep_rough', 'interior', 'mep_trim', 'exterior_site', 'final', 'permits', 'other', 'transactional'];
  const groupLabels: Record<string, string> = {
    site_prep: 'Site Prep', structural: 'Structural', mep_rough: 'MEP Rough', interior: 'Interior',
    mep_trim: 'MEP Trim', exterior_site: 'Exterior/Site', final: 'Final', permits: 'Permits',
    other: 'Other', transactional: 'Transactional',
  };

  return (
    <div>
      <h3 style={{ margin: 0, marginBottom: '0.75rem' }}>New Transaction</h3>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Job - always visible, optional */}
        <label>
          Job <span style={{ color: '#999', fontWeight: 'normal', fontSize: 12 }}>(optional)</span>
          <JobSelect
            value={jobId}
            onChange={setJobId}
          />
        </label>

        {/* Real Estate Deal - always visible, optional */}
        <label>
          Real Estate Deal <span style={{ color: '#999', fontWeight: 'normal', fontSize: 12 }}>(optional)</span>
          <SearchableSelect
            options={dealOptions}
            value={dealId ? Number(dealId) : null}
            onChange={(val) => { 
              setDealId(val ? String(val) : ''); 
              if (!val) { setIsMortgagePayment(false); setRehabCategoryId(''); setCostType(''); }
            }}
            placeholder="Type to search deals..."
            emptyLabel="None"
          />
        </label>

        {/* Mortgage toggle (rental deals only) */}
        {dealId && txType === 'expense' && !isFlipDeal && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={isMortgagePayment} onChange={(e) => {
              setIsMortgagePayment(e.target.checked);
              if (!e.target.checked) { setMortgageInterest(''); setMortgageEscrow(''); setUseAutoSplit(true); }
            }} />
            This is a mortgage payment (PITI split)
          </label>
        )}

        {/* Mortgage panel */}
        {dealId && txType === 'expense' && isMortgagePayment && !isFlipDeal && (
          <div style={{ padding: '0.75rem', border: '1px solid #ddd', borderRadius: 8, background: '#fafafa' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 500 }}>
              <input type="checkbox" checked={useAutoSplit} onChange={(e) => { setUseAutoSplit(e.target.checked); if (e.target.checked) { setMortgageInterest(''); setMortgageEscrow(''); } }} disabled={!canAutoSplit} />
              Auto-calculate split
            </label>
            {!useAutoSplit && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                <label>Interest <input type="number" step="0.01" min="0" value={mortgageInterest} onChange={(e) => setMortgageInterest(e.target.value)} /></label>
                <label>Escrow <input type="number" step="0.01" min="0" value={mortgageEscrow} onChange={(e) => setMortgageEscrow(e.target.value)} /></label>
              </div>
            )}
          </div>
        )}

        {/* FLIP EXPENSE FIELDS */}
        {dealId && isFlipDeal && txType === 'expense' && (
          <div style={{ padding: '0.75rem', border: '1px solid #ddd', borderRadius: 8, background: '#f5f5dc' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: 14 }}>Flip Expense Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
              <label>
                Rehab Category
                <select value={rehabCategoryId} onChange={(e) => setRehabCategoryId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Select category...</option>
                  {groupOrder.map(group => {
                    const cats = groupedRehabCategories[group];
                    if (!cats || cats.length === 0) return null;
                    return (
                      <optgroup key={group} label={groupLabels[group] || group}>
                        {cats.map(cat => <option key={cat.id} value={cat.id}>{cat.code} - {cat.name}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              <label>
                Cost Type
                <select value={costType} onChange={(e) => setCostType(e.target.value as CostType)} style={{ width: '100%' }}>
                  <option value="">Select...</option>
                  <option value="L">L - Labor</option>
                  <option value="M">M - Material</option>
                  <option value="S">S - Service</option>
                  <option value="I">I - Interest</option>
                  <option value="H">H - Holding Cost</option>
                </select>
              </label>
            </div>
            {(costType === 'M' || costType === 'S' || costType === 'H') && (
              <label style={{ marginTop: '0.5rem', display: 'block' }}>
                Vendor
                <VendorSelect
                  value={vendorId}
                  onChange={setVendorId}
                  emptyLabel="Select vendor..."
                />
              </label>
            )}
            {costType === 'L' && (
              <label style={{ marginTop: '0.5rem', display: 'block' }}>
                Installer
                <InstallerSelect
                  value={installerId}
                  onChange={setInstallerId}
                  emptyLabel="Select installer..."
                />
              </label>
            )}
          </div>
        )}

        {/* Date */}
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {isDateFuture && <span style={{ fontSize: 12, color: '#ff9800', display: 'block' }}>[!] Future date</span>}
        </label>

        {/* Type */}
        <label>
          Type
          <select value={txType} onChange={(e) => { setTxType(e.target.value as TxType); if (e.target.value === 'income') { setIsMortgagePayment(false); } }}>
            <option value="expense">Expense</option>
            <option value="income">Income / Refund</option>
          </select>
        </label>

        {/* Job expense kind */}
        {txType === 'expense' && jobId && !isMortgagePayment && (
          <label>
            Expense kind
            <select value={expenseKind} onChange={(e) => setExpenseKind(e.target.value as ExpenseKind)}>
              <option value="material">Material</option>
              <option value="labor">Labor</option>
              <option value="other">Other</option>
            </select>
          </label>
        )}

        {/* Job vendor/installer */}
        {txType === 'expense' && jobId && effectiveExpenseKind === 'material' && !isMortgagePayment && (
          <label>
            Vendor
            <VendorSelect
              value={vendorId}
              onChange={setVendorId}
              emptyLabel="Select..."
            />
          </label>
        )}
        {txType === 'expense' && jobId && effectiveExpenseKind === 'labor' && !isMortgagePayment && (
          <label>
            Installer
            <InstallerSelect
              value={installerId}
              onChange={setInstallerId}
              emptyLabel="Select..."
            />
          </label>
        )}

        {/* Cash account */}
        <label>
          Pay from / deposit to
          <SearchableSelect
            options={cashAccountOptions}
            value={cashAccountId ? Number(cashAccountId) : null}
            onChange={(val) => setCashAccountId(val ? String(val) : '')}
            placeholder="Type to search accounts..."
            emptyLabel="Select account..."
          />
        </label>

        {/* Category (hide for flip expenses) */}
        {!isMortgagePayment && !(dealId && isFlipDeal && txType === 'expense') && (
          <label>
            Category
            <SearchableSelect
              options={categoryAccountOptions}
              value={categoryAccountId ? Number(categoryAccountId) : null}
              onChange={(val) => setCategoryAccountId(val ? String(val) : '')}
              placeholder="Type to search categories..."
              emptyLabel="Select category..."
            />
          </label>
        )}

        {dealId && isFlipDeal && txType === 'expense' && costType && (
          <div style={{ fontSize: 12, color: '#666', marginTop: '-0.5rem' }}>
            Account: {
              { L: 'RE - Flip Rehab Labor', M: 'RE - Flip Rehab Materials', S: 'RE - Flip Services', I: 'RE - Flip Interest', H: 'RE - Flip Holding Costs' }[costType]
            }
          </div>
        )}

        {/* Vendor/Installer for general transactions (not job, not flip) */}
        {!jobId && !(dealId && isFlipDeal) && !isMortgagePayment && (
          <>
            <label>
              Vendor <span style={{ color: '#999', fontWeight: 'normal', fontSize: 12 }}>(optional)</span>
              <VendorSelect
                value={vendorId}
                onChange={setVendorId}
              />
            </label>
            <label>
              Installer <span style={{ color: '#999', fontWeight: 'normal', fontSize: 12 }}>(optional)</span>
              <InstallerSelect
                value={installerId}
                onChange={setInstallerId}
              />
            </label>
          </>
        )}

        <label>Description<input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. HD materials, Bruno framing..." /></label>

        <label>
          Amount
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          {isAmountLarge && <span style={{ fontSize: 12, color: '#ff9800', display: 'block' }}>[!] Large amount</span>}
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={isCleared} onChange={(e) => setIsCleared(e.target.checked)} />
          Mark as cleared
        </label>

        <button type="submit" disabled={saving} style={{ marginTop: '0.5rem', padding: '0.6rem 1rem', fontWeight: 500 }}>
          {saving ? 'Saving...' : 'Save Transaction'}
        </button>
      </form>

      {/* Mortgage Modal */}
      {showMortgageModal && mortgagePreview && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: 'white', padding: '1.5rem', borderRadius: '0.5rem', maxWidth: '520px', width: '100%', boxShadow: '0 10px 30px rgba(0,0,0,0.25)' }}>
            <h2 style={{ marginTop: 0 }}>Mortgage Payment Split</h2>
            <p><strong>Deal:</strong> {mortgagePreview.dealNickname}</p>
            <p><strong>Total:</strong> ${mortgagePreview.total.toFixed(2)}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '0.75rem' }}>
              <label>Principal<input type="number" step="0.01" value={editablePrincipal} onChange={(e) => setEditablePrincipal(e.target.value)} style={{ width: '100%' }} /></label>
              <label>Interest<input type="number" step="0.01" value={editableInterest} onChange={(e) => setEditableInterest(e.target.value)} style={{ width: '100%' }} /></label>
              <label>Escrow<input type="number" step="0.01" value={editableEscrow} onChange={(e) => setEditableEscrow(e.target.value)} style={{ width: '100%' }} /></label>
            </div>

            {(() => {
              const editTotal = (Number(editablePrincipal) || 0) + (Number(editableInterest) || 0) + (Number(editableEscrow) || 0);
              const diff = editTotal - mortgagePreview.total;
              const isBalanced = Math.abs(diff) < 0.02;
              return (
                <div style={{ padding: '0.5rem', borderRadius: 6, marginBottom: '0.75rem', backgroundColor: isBalanced ? '#d4edda' : '#f8d7da', fontSize: 13 }}>
                  Split: ${editTotal.toFixed(2)} {isBalanced ? 'OK' : `(${diff > 0 ? '+' : ''}${diff.toFixed(2)})`}
                </div>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={handleCancelMortgageSplit} disabled={saving}>Cancel</button>
              <button type="button" onClick={handleConfirmMortgageSplit} disabled={saving} style={{ background: '#0066cc', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: 4 }}>
                {saving ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}