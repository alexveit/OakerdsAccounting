import { useEffect, useState, type KeyboardEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import type { FormEvent } from 'react';
import { todayLocalISO } from '../utils/date';
import { computeMortgageSplit } from '../utils/mortgageAmortization';
import { isCashAccount, compareAccountsForSort } from '../utils/accounts';

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
  rental_monthly_taxes: number | null;
  rental_monthly_insurance: number | null;
};

type TxType = 'income' | 'expense';
type ExpenseKind = 'material' | 'labor' | 'other';
type CostType = 'L' | 'M' | 'S' | '';

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
  const [realEstateDeals, setRealEstateDeals] = useState<RealEstateDeal[]>([]);
  const [rehabCategories, setRehabCategories] = useState<RehabCategory[]>([]);

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

  // Flip-specific fields
  const [rehabCategoryId, setRehabCategoryId] = useState<string>('');
  const [costType, setCostType] = useState<CostType>('');

  const [vendorId, setVendorId] = useState<string>('');
  const [installerId, setInstallerId] = useState<string>('');

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
        // Jobs
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
        const normalizedAccounts: Account[] = (accountsData ?? []).map((a: any) => ({
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
            first_payment_date, rental_monthly_taxes, rental_monthly_insurance
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

  const categoryAccounts = txType === 'income'
    ? incomeAccounts
    : [...expenseAccounts, ...balanceSheetNonCash];

  const [categoryTypeahead, setCategoryTypeahead] = useState('');
  const [lastCategoryTypeTime, setLastCategoryTypeTime] = useState<number>(0);

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

  function handleCategoryKeyDown(e: KeyboardEvent<HTMLSelectElement>) {
    const key = e.key;
    if (key.length !== 1 || e.altKey || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    const now = Date.now();
    let buffer = now - lastCategoryTypeTime > 800 ? key : categoryTypeahead + key;
    buffer = buffer.toLowerCase();
    setCategoryTypeahead(buffer);
    setLastCategoryTypeTime(now);
    const currentIndex = sortedCategoryAccounts.findIndex((a) => String(a.id) === categoryAccountId);
    const startIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    const ordered = [...sortedCategoryAccounts.slice(startIndex), ...sortedCategoryAccounts.slice(0, startIndex)];
    const match = ordered.find((a) => {
      const label = `${a.code ? `${a.code} — ` : ''}${a.name}`.toLowerCase();
      return label.includes(buffer);
    });
    if (match) setCategoryAccountId(String(match.id));
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

  const selectedDeal = dealId ? realEstateDeals.find((d) => d.id === Number(dealId)) : null;
  const isFlipDeal = selectedDeal?.type === 'flip';
  const effectiveExpenseKind: ExpenseKind = linkToJob && txType === 'expense' ? expenseKind : 'other';

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
    if (linkToJob && !jobId) { setError('Job is required.'); return; }
    if (linkToDeal && !dealId) { setError('Deal is required.'); return; }
    if (!cashAccountId) { setError('Pay from / deposit to account is required.'); return; }
    if (!categoryAccountId && !isMortgagePayment && !(linkToDeal && isFlipDeal && txType === 'expense')) {
      setError('Category is required.');
      return;
    }
    if (!amt || amt <= 0) { setError('Amount must be greater than 0.'); return; }

    // Flip expense validation
    if (linkToDeal && isFlipDeal && txType === 'expense' && !isMortgagePayment) {
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
    if (linkToDeal && isFlipDeal && txType === 'expense') {
      try {
        setSaving(true);
        await handleFlipExpenseSubmit(amt);
        return;
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Error saving flip transaction');
        setSaving(false);
        return;
      }
    }

    // Flip income/refund
    if (linkToDeal && isFlipDeal && txType === 'income') {
      try {
        setSaving(true);
        await handleFlipIncomeSubmit(amt);
        return;
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Error saving flip transaction');
        setSaving(false);
        return;
      }
    }

    // Standard transaction
    setSaving(true);
    try {
      const job_id = linkToJob && jobId ? Number(jobId) : null;
      const real_estate_deal_id = linkToDeal && dealId ? Number(dealId) : null;
      const vendor_id = effectiveExpenseKind === 'material' && vendorId ? Number(vendorId) : null;
      const installer_id = effectiveExpenseKind === 'labor' && installerId ? Number(installerId) : null;
      const cash_id = Number(cashAccountId);
      const category_id_normal = Number(categoryAccountId);

      const cashPurposeDefault = purposeForAccount(cash_id);
      const categoryPurposeDefaultNormal = purposeForAccount(category_id_normal);
      const txPurpose: 'business' | 'personal' =
        cashPurposeDefault === 'personal' || categoryPurposeDefaultNormal === 'personal'
          ? 'personal'
          : 'business';

      let line1: any;
      let line2: any;

      if (txType === 'income') {
        line1 = { account_id: cash_id, amount: amt, job_id, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: txPurpose, is_cleared: isCleared };
        line2 = { account_id: category_id_normal, amount: -amt, job_id, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: txPurpose, is_cleared: isCleared };
      } else {
        line1 = { account_id: category_id_normal, amount: amt, job_id, vendor_id, installer_id, real_estate_deal_id, purpose: txPurpose, is_cleared: isCleared };
        line2 = { account_id: cash_id, amount: -amt, job_id, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: txPurpose, is_cleared: isCleared };
      }

      const { error: rpcErr } = await supabase.rpc('create_transaction', {
        p_date: date,
        p_description: description || null,
        p_line1: line1,
        p_line2: line2,
        p_purpose: txPurpose,
      });
      if (rpcErr) throw rpcErr;

      setSuccess('Transaction saved.');
      resetFormFields();
      if (onTransactionSaved) onTransactionSaved();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error saving transaction');
    } finally {
      setSaving(false);
    }
  }

  async function handleFlipExpenseSubmit(amt: number) {
    const real_estate_deal_id = Number(dealId);
    const cash_id = Number(cashAccountId);
    const rehab_category_id = Number(rehabCategoryId);
    const vendor_id = vendorId ? Number(vendorId) : null;
    const installer_id = installerId ? Number(installerId) : null;

    // Determine expense account based on cost type
    const laborAccount = accounts.find(a => a.name === 'RE – Flip Rehab Labor');
    const materialsAccount = accounts.find(a => a.name === 'RE – Flip Rehab Materials');
    let expenseAccountId = costType === 'L' && laborAccount ? laborAccount.id : materialsAccount?.id;

    if (!expenseAccountId) {
      throw new Error('Could not find RE – Flip Rehab Labor or Materials accounts.');
    }

    // Create transaction
    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || null })
      .select('id')
      .single();
    if (txErr) throw txErr;
    const txId = txData.id;

    // Expense line (debit)
    const { error: line1Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txId,
      account_id: expenseAccountId,
      amount: amt,
      real_estate_deal_id,
      rehab_category_id,
      cost_type: costType || null,
      vendor_id,
      installer_id,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line1Err) throw line1Err;

    // Cash line (credit)
    const { error: line2Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txId,
      account_id: cash_id,
      amount: -amt,
      real_estate_deal_id,
      rehab_category_id,
      cost_type: costType || null,
      vendor_id,
      installer_id,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line2Err) throw line2Err;

    setSuccess('Flip expense saved.');
    resetFormFields();
    setSaving(false);
    if (onTransactionSaved) onTransactionSaved();
  }

  async function handleFlipIncomeSubmit(amt: number) {
    const real_estate_deal_id = Number(dealId);
    const cash_id = Number(cashAccountId);
    const rehab_category_id = rehabCategoryId ? Number(rehabCategoryId) : null;
    const vendor_id = vendorId ? Number(vendorId) : null;
    const installer_id = installerId ? Number(installerId) : null;

    // For income/refunds, use the selected category or materials account
    const materialsAccount = accounts.find(a => a.name === 'RE – Flip Rehab Materials');
    const expenseAccountId = categoryAccountId ? Number(categoryAccountId) : materialsAccount?.id;

    if (!expenseAccountId) {
      throw new Error('Could not find expense account for refund.');
    }

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || null })
      .select('id')
      .single();
    if (txErr) throw txErr;
    const txId = txData.id;

    // Cash line (debit - money in)
    const { error: line1Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txId,
      account_id: cash_id,
      amount: amt,
      real_estate_deal_id,
      rehab_category_id,
      cost_type: costType || null,
      vendor_id,
      installer_id,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line1Err) throw line1Err;

    // Expense credit line (negative expense = refund)
    const { error: line2Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txId,
      account_id: expenseAccountId,
      amount: -amt,
      real_estate_deal_id,
      rehab_category_id,
      cost_type: costType || null,
      vendor_id,
      installer_id,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line2Err) throw line2Err;

    setSuccess('Refund saved.');
    resetFormFields();
    setSaving(false);
    if (onTransactionSaved) onTransactionSaved();
  }

  function resetFormFields() {
    setAmount('');
    setDescription('');
    setVendorId('');
    setInstallerId('');
    setIsCleared(false);
    setRehabCategoryId('');
    setCostType('');
  }

  async function handleConfirmMortgageSplit() {
    if (!mortgagePreview) return;
    try {
      setSaving(true);
      setError(null);
      const real_estate_deal_id = linkToDeal && dealId ? Number(dealId) : null;
      if (!real_estate_deal_id) { setError('Deal required.'); setSaving(false); return; }
      const deal = realEstateDeals.find((d) => d.id === real_estate_deal_id);
      if (!deal) { setError('Deal not found.'); setSaving(false); return; }
      if (!deal.loan_account_id) { setError('Deal has no loan account.'); setSaving(false); return; }

      const interestAccount = accounts.find((a) => a.name === 'RE – Mortgage Interest');
      const escrowAccount = accounts.find((a) => a.name === 'RE – Taxes & Insurance');
      if (!interestAccount || !escrowAccount) { setError('Missing RE accounts.'); setSaving(false); return; }

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

      const lines: any[] = [];
      lines.push({ account_id: cash_id, amount: -mortgagePreview.total, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: 'business', is_cleared: isCleared });
      if (principal > 0) lines.push({ account_id: deal.loan_account_id, amount: principal, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: 'business', is_cleared: isCleared });
      if (interestPortion > 0) lines.push({ account_id: interestAccount.id, amount: interestPortion, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: 'business', is_cleared: isCleared });
      if (escrowPortion > 0) lines.push({ account_id: escrowAccount.id, amount: escrowPortion, job_id: null, vendor_id: null, installer_id: null, real_estate_deal_id, purpose: 'business', is_cleared: isCleared });

      const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
        p_date: date,
        p_description: description || `Mortgage payment — ${deal.nickname}`,
        p_purpose: 'business',
        p_lines: lines,
      });
      if (rpcErr) throw rpcErr;

      setSuccess('Mortgage payment saved.');
      resetFormFields();
      setShowMortgageModal(false);
      setMortgagePreview(null);
      setIsMortgagePayment(false);
      if (onTransactionSaved) onTransactionSaved();
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Error saving mortgage');
    } finally {
      setSaving(false);
    }
  }

  function handleCancelMortgageSplit() {
    setShowMortgageModal(false);
    setMortgagePreview(null);
  }

  if (loading) return <p>Loading form options…</p>;

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
    <div style={{ maxWidth: 480, margin: '0 auto' }}>
      <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>New Transaction</h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Job linkage */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={linkToJob} onChange={(e) => setLinkToJob(e.target.checked)} />
          Relates to a job?
        </label>

        {linkToJob && (
          <label>
            Job
            <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
              <option value="">Select job…</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.name}</option>)}
            </select>
          </label>
        )}

        {/* Deal linkage */}
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={linkToDeal} onChange={(e) => {
            setLinkToDeal(e.target.checked);
            if (!e.target.checked) { setDealId(''); setIsMortgagePayment(false); setRehabCategoryId(''); setCostType(''); }
          }} />
          Relates to a real estate deal?
        </label>

        {linkToDeal && (
          <label>
            Real estate deal
            <select value={dealId} onChange={(e) => { setDealId(e.target.value); setRehabCategoryId(''); setCostType(''); }}>
              <option value="">Select deal…</option>
              {realEstateDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nickname}{d.address ? ` — ${d.address}` : ''}{d.type ? ` (${d.type})` : ''}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Mortgage toggle (non-flip only) */}
        {linkToDeal && txType === 'expense' && !isFlipDeal && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input type="checkbox" checked={isMortgagePayment} onChange={(e) => {
              setIsMortgagePayment(e.target.checked);
              if (!e.target.checked) { setMortgageInterest(''); setMortgageEscrow(''); setUseAutoSplit(true); }
            }} disabled={!dealId} />
            This is a mortgage payment (PITI split)
          </label>
        )}

        {/* Mortgage panel */}
        {linkToDeal && txType === 'expense' && isMortgagePayment && !isFlipDeal && (
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
        {linkToDeal && isFlipDeal && txType === 'expense' && (
          <div style={{ padding: '0.75rem', border: '1px solid #ddd', borderRadius: 8, background: '#f5f5dc' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', fontSize: 14 }}>🔨 Flip Expense Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
              <label>
                Rehab Category
                <select value={rehabCategoryId} onChange={(e) => setRehabCategoryId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Select category…</option>
                  {groupOrder.map(group => {
                    const cats = groupedRehabCategories[group];
                    if (!cats || cats.length === 0) return null;
                    return (
                      <optgroup key={group} label={groupLabels[group] || group}>
                        {cats.map(cat => <option key={cat.id} value={cat.id}>{cat.code} – {cat.name}</option>)}
                      </optgroup>
                    );
                  })}
                </select>
              </label>
              <label>
                Cost Type
                <select value={costType} onChange={(e) => setCostType(e.target.value as CostType)} style={{ width: '100%' }}>
                  <option value="">Select…</option>
                  <option value="L">L – Labor</option>
                  <option value="M">M – Material</option>
                  <option value="S">S – Service</option>
                </select>
              </label>
            </div>
            {(costType === 'M' || costType === 'S') && (
              <label style={{ marginTop: '0.5rem', display: 'block' }}>
                Vendor
                <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                  <option value="">Select vendor…</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.nick_name}</option>)}
                </select>
              </label>
            )}
            {costType === 'L' && (
              <label style={{ marginTop: '0.5rem', display: 'block' }}>
                Installer
                <select value={installerId} onChange={(e) => setInstallerId(e.target.value)}>
                  <option value="">Select installer…</option>
                  {installers.map((i) => <option key={i.id} value={i.id}>{formatInstaller(i)}</option>)}
                </select>
              </label>
            )}
          </div>
        )}

        {/* Date */}
        <label>
          Date
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          {isDateFuture && <span style={{ fontSize: 12, color: '#ff9800', display: 'block' }}>⚠️ Future date</span>}
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
        {txType === 'expense' && linkToJob && !isMortgagePayment && (
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
        {txType === 'expense' && linkToJob && effectiveExpenseKind === 'material' && !isMortgagePayment && (
          <label>Vendor<select value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Select…</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.nick_name}</option>)}</select></label>
        )}
        {txType === 'expense' && linkToJob && effectiveExpenseKind === 'labor' && !isMortgagePayment && (
          <label>Installer<select value={installerId} onChange={(e) => setInstallerId(e.target.value)}><option value="">Select…</option>{installers.map((i) => <option key={i.id} value={i.id}>{formatInstaller(i)}</option>)}</select></label>
        )}

        {/* Cash account */}
        <label>
          Pay from / deposit to
          <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
            <option value="">Select account…</option>
            {cashAccounts.map((a) => {
              const isCard = a.account_types?.name === 'liability';
              return <option key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ''}{a.name}{isCard ? ' (card)' : ''}</option>;
            })}
          </select>
        </label>

        {/* Category (hide for flip expenses) */}
        {!isMortgagePayment && !(linkToDeal && isFlipDeal && txType === 'expense') && (
          <label>
            Category
            <select value={categoryAccountId} onChange={(e) => setCategoryAccountId(e.target.value)} onKeyDown={handleCategoryKeyDown}>
              <option value="">Select category…</option>
              {sortedCategoryAccounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} — ` : ''}{a.name}</option>)}
            </select>
          </label>
        )}

        {linkToDeal && isFlipDeal && txType === 'expense' && costType && (
          <div style={{ fontSize: 12, color: '#666', marginTop: '-0.5rem' }}>
            Account: {costType === 'L' ? 'RE – Flip Rehab Labor' : 'RE – Flip Rehab Materials'}
          </div>
        )}

        <label>Description<input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. HD materials, Bruno framing…" /></label>

        <label>
          Amount
          <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
          {isAmountLarge && <span style={{ fontSize: 12, color: '#ff9800', display: 'block' }}>⚠️ Large amount</span>}
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <input type="checkbox" checked={isCleared} onChange={(e) => setIsCleared(e.target.checked)} />
          Mark as cleared
        </label>

        <button type="submit" disabled={saving} style={{ marginTop: '0.5rem', padding: '0.6rem 1rem', fontWeight: 500 }}>
          {saving ? 'Saving…' : 'Save Transaction'}
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
                  Split: ${editTotal.toFixed(2)} {isBalanced ? '✓' : `(${diff > 0 ? '+' : ''}${diff.toFixed(2)})`}
                </div>
              );
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button type="button" onClick={handleCancelMortgageSplit} disabled={saving}>Cancel</button>
              <button type="button" onClick={handleConfirmMortgageSplit} disabled={saving} style={{ background: '#0066cc', color: '#fff', border: 'none', padding: '0.5rem 1rem', borderRadius: 4 }}>
                {saving ? 'Saving…' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
