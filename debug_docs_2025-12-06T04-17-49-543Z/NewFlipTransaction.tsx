// src/components/NewFlipTransaction.tsx
// Dedicated transaction form for flip deals - handles full lifecycle
// Acquisition, Rehab, Loan Draws, Holding Costs, Interest, Sale

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/format';
import { todayLocalISO } from '../utils/date';
import {
  ACCOUNT_CODES,
  REHAB_CODES,
  isCashAccount,
  compareAccountsForSort,
} from '../utils/accounts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FlipDeal = {
  id: number;
  nickname: string;
  address: string | null;
  status: string | null;
  asset_account_id: number | null;
  loan_account_id: number | null;
  original_loan_amount: number | null;
  purchase_price: number | null;
  arv: number | null;
};

type Account = {
  id: number;
  name: string;
  code: string | null;
  account_types: { name: string } | null;
};

type RehabCategory = {
  id: number;
  code: string;
  name: string;
  category_group: string;
  sort_order: number;
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

type FlipTxType =
  | 'acquisition'    // Purchase transaction (asset + loan + closing costs)
  | 'rehab_labor'    // Rehab labor expense
  | 'rehab_material' // Rehab material expense
  | 'rehab_service'  // Rehab service expense (contractors, permits)
  | 'loan_draw'      // Draw from escrow holdback
  | 'holding'        // Utilities, insurance, taxes during rehab
  | 'interest'       // Hard money interest payment
  | 'refund'         // Refund/credit on expenses
  | 'sale';          // Property sale

type Props = {
  dealId?: number;
  onTransactionSaved?: () => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TX_TYPE_LABELS: Record<FlipTxType, string> = {
  acquisition: '🏠 Acquisition (Purchase & Closing)',
  rehab_labor: '👷 Rehab – Labor',
  rehab_material: '🧱 Rehab – Materials',
  rehab_service: '🔧 Rehab – Service/Contractor',
  loan_draw: '💰 Loan Draw (from escrow)',
  holding: '🏢 Holding Cost (utilities, insurance)',
  interest: '💵 Interest Payment',
  refund: '↩️ Refund / Credit',
  sale: '🏷️ Property Sale',
};

const REHAB_GROUP_LABELS: Record<string, string> = {
  site_prep: 'Site Prep',
  structural: 'Structural',
  mep_rough: 'MEP Rough-In',
  interior: 'Interior',
  mep_trim: 'MEP Trim-Out',
  exterior_site: 'Exterior / Site',
  final: 'Final',
  permits: 'Permits',
  transactional: 'Transactional',
  other: 'Other',
};

const REHAB_GROUP_ORDER = [
  'site_prep',
  'structural',
  'mep_rough',
  'interior',
  'mep_trim',
  'exterior_site',
  'final',
  'permits',
  'other',
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function NewFlipTransaction({ dealId: initialDealId, onTransactionSaved }: Props) {
  // Reference data
  const [deals, setDeals] = useState<FlipDeal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rehabCategories, setRehabCategories] = useState<RehabCategory[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [installers, setInstallers] = useState<Installer[]>([]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Form state
  const [dealId, setDealId] = useState<string>(initialDealId ? String(initialDealId) : '');
  const [txType, setTxType] = useState<FlipTxType>('rehab_material');
  const [date, setDate] = useState<string>(() => todayLocalISO());
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [cashAccountId, setCashAccountId] = useState('');
  const [rehabCategoryId, setRehabCategoryId] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [installerId, setInstallerId] = useState('');
  const [isCleared, setIsCleared] = useState(false);

  // Acquisition-specific fields
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [closingCostsAmount, setClosingCostsAmount] = useState('');

  // Sale-specific fields
  const [salePrice, setSalePrice] = useState('');
  const [sellingCosts, setSellingCosts] = useState('');

  // ─────────────────────────────────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────────────────────────────────

  const selectedDeal = dealId ? deals.find((d) => d.id === Number(dealId)) : null;

  const cashAccounts = accounts.filter((a) => {
    const type = a.account_types?.name;
    const isBalSheet = type === 'asset' || type === 'liability';
    return isBalSheet && isCashAccount(a.code);
  });

  const groupedRehabCategories = rehabCategories.reduce<Record<string, RehabCategory[]>>(
    (acc, cat) => {
      const group = cat.category_group || 'other';
      if (!acc[group]) acc[group] = [];
      // Exclude transactional codes from rehab dropdown (handled separately)
      if (group !== 'transactional') {
        acc[group].push(cat);
      }
      return acc;
    },
    {}
  );

  // Find specific accounts by code
  const findAccountByCode = (code: string): Account | undefined => {
    return accounts.find((a) => a.code === code);
  };

  const flipLaborAccount = findAccountByCode(ACCOUNT_CODES.FLIP_REHAB_LABOR);
  const flipMaterialsAccount = findAccountByCode(ACCOUNT_CODES.FLIP_REHAB_MATERIALS);
  const flipServicesAccount = findAccountByCode(ACCOUNT_CODES.FLIP_SERVICES);
  const flipClosingAccount = findAccountByCode(ACCOUNT_CODES.FLIP_CLOSING_COSTS);
  const flipHoldingAccount = findAccountByCode(ACCOUNT_CODES.FLIP_HOLDING_COSTS);
  const flipInterestAccount = findAccountByCode(ACCOUNT_CODES.FLIP_INTEREST);

  // Find rehab category IDs for transactional types
  const holdingCategory = rehabCategories.find((c) => c.code === REHAB_CODES.HOLD);
  const closingCategory = rehabCategories.find((c) => c.code === REHAB_CODES.CLSE);
  const creditCategory = rehabCategories.find((c) => c.code === REHAB_CODES.CRED);

  // ─────────────────────────────────────────────────────────────────────────
  // Load reference data
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // Flip deals
        const { data: dealsData, error: dealsErr } = await supabase
          .from('real_estate_deals')
          .select('id, nickname, address, status, asset_account_id, loan_account_id, original_loan_amount, purchase_price, arv')
          .eq('type', 'flip')
          .order('created_at', { ascending: false });
        if (dealsErr) throw dealsErr;
        setDeals((dealsData ?? []) as FlipDeal[]);

        // Accounts
        const { data: accountsData, error: accountsErr } = await supabase
          .from('accounts')
          .select('id, name, code, account_types(name)');
        if (accountsErr) throw accountsErr;
        const sortedAccounts = (accountsData ?? [])
          .map((a): Account => ({
            id: a.id,
            name: a.name,
            code: a.code ?? null,
            account_types: a.account_types ?? null,
          }))
          .sort(compareAccountsForSort);
        setAccounts(sortedAccounts);

        // Rehab categories
        const { data: rehabData, error: rehabErr } = await supabase
          .from('rehab_categories')
          .select('id, code, name, category_group, sort_order')
          .order('sort_order', { ascending: true });
        if (rehabErr) throw rehabErr;
        setRehabCategories((rehabData ?? []) as RehabCategory[]);

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

        // Set default deal if provided
        if (initialDealId && dealsData?.some((d) => d.id === initialDealId)) {
          setDealId(String(initialDealId));
        } else if (dealsData && dealsData.length > 0) {
          setDealId(String(dealsData[0].id));
        }
      } catch (err: unknown) {
        console.error('Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [initialDealId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  function parseNumber(val: string): number | null {
    if (!val.trim()) return null;
    const n = Number(val);
    return Number.isNaN(n) ? null : n;
  }

  function formatInstaller(i: Installer): string {
    return `${i.first_name} ${i.last_name ?? ''}`.trim();
  }

  function resetForm() {
    setDescription('');
    setAmount('');
    setRehabCategoryId('');
    setVendorId('');
    setInstallerId('');
    setIsCleared(false);
    setPurchaseAmount('');
    setLoanAmount('');
    setClosingCostsAmount('');
    setSalePrice('');
    setSellingCosts('');
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Submit handlers
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!dealId) {
      setError('Please select a deal.');
      return;
    }

    if (!selectedDeal) {
      setError('Deal not found.');
      return;
    }

    setSaving(true);

    try {
      switch (txType) {
        case 'acquisition':
          await handleAcquisition();
          break;
        case 'rehab_labor':
          await handleRehabExpense('labor');
          break;
        case 'rehab_material':
          await handleRehabExpense('material');
          break;
        case 'rehab_service':
          await handleRehabExpense('service');
          break;
        case 'loan_draw':
          await handleLoanDraw();
          break;
        case 'holding':
          await handleHoldingCost();
          break;
        case 'interest':
          await handleInterestPayment();
          break;
        case 'refund':
          await handleRefund();
          break;
        case 'sale':
          await handleSale();
          break;
        default:
          throw new Error(`Unknown transaction type: ${txType}`);
      }

      setSuccess('Transaction saved successfully.');
      resetForm();
      onTransactionSaved?.();
    } catch (err: unknown) {
      console.error('Error saving transaction:', err);
      setError(err instanceof Error ? err.message : 'Failed to save transaction');
    } finally {
      setSaving(false);
    }
  }

  async function handleAcquisition() {
    const purchase = parseNumber(purchaseAmount);
    const loan = parseNumber(loanAmount);
    const closing = parseNumber(closingCostsAmount);
    const cashId = Number(cashAccountId);

    if (!purchase || purchase <= 0) throw new Error('Purchase amount is required.');
    if (!cashAccountId) throw new Error('Cash account is required.');
    if (!selectedDeal?.asset_account_id) throw new Error('Deal has no asset account. Please edit the deal first.');

    const assetAccountId = selectedDeal.asset_account_id;
    const loanAccountId = selectedDeal.loan_account_id;

    // Calculate cash to close
    const loanToClosing = loan ?? 0;
    const cashToClose = purchase + (closing ?? 0) - loanToClosing;

    // Create transaction
    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || `Acquisition - ${selectedDeal.nickname}` })
      .select('id')
      .single();
    if (txErr) throw txErr;
    const txId = txData.id;

    const lines: Array<{
      transaction_id: number;
      account_id: number;
      amount: number;
      real_estate_deal_id: number;
      rehab_category_id: number | null;
      purpose: string;
      is_cleared: boolean;
    }> = [];

    // Asset account - debit purchase price
    lines.push({
      transaction_id: txId,
      account_id: assetAccountId,
      amount: purchase,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: null,
      purpose: 'business',
      is_cleared: isCleared,
    });

    // Closing costs - debit to closing costs expense
    if (closing && closing > 0 && flipClosingAccount) {
      lines.push({
        transaction_id: txId,
        account_id: flipClosingAccount.id,
        amount: closing,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: closingCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      });
    }

    // Loan proceeds - credit (increases liability)
    if (loan && loan > 0 && loanAccountId) {
      lines.push({
        transaction_id: txId,
        account_id: loanAccountId,
        amount: -loan,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: creditCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      });
    }

    // Cash to close - credit (decreases cash)
    if (cashToClose !== 0) {
      lines.push({
        transaction_id: txId,
        account_id: cashId,
        amount: -cashToClose,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: null,
        purpose: 'business',
        is_cleared: isCleared,
      });
    }

    // Verify double-entry balances
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    if (Math.abs(total) > 0.01) {
      throw new Error(`Transaction does not balance. Sum: ${total.toFixed(2)}`);
    }

    // Insert all lines
    const { error: linesErr } = await supabase.from('transaction_lines').insert(lines);
    if (linesErr) throw linesErr;
  }

  async function handleRehabExpense(type: 'labor' | 'material' | 'service') {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Pay from account is required.');
    if (!rehabCategoryId) throw new Error('Rehab category is required.');

    let expenseAccount: Account | undefined;
    let costTypeCode: string;

    switch (type) {
      case 'labor':
        expenseAccount = flipLaborAccount;
        costTypeCode = 'L';
        if (!installerId) throw new Error('Installer is required for labor expenses.');
        break;
      case 'material':
        expenseAccount = flipMaterialsAccount;
        costTypeCode = 'M';
        break;
      case 'service':
        expenseAccount = flipServicesAccount;
        costTypeCode = 'S';
        break;
    }

    if (!expenseAccount) throw new Error(`Could not find expense account for ${type}.`);

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || null })
      .select('id')
      .single();
    if (txErr) throw txErr;

    // Expense line (debit)
    const { error: line1Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: expenseAccount.id,
      amount: amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: Number(rehabCategoryId),
      cost_type: costTypeCode,
      vendor_id: vendorId ? Number(vendorId) : null,
      installer_id: installerId ? Number(installerId) : null,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line1Err) throw line1Err;

    // Cash line (credit)
    const { error: line2Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: Number(cashAccountId),
      amount: -amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: Number(rehabCategoryId),
      cost_type: costTypeCode,
      vendor_id: null,
      installer_id: null,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line2Err) throw line2Err;
  }

  async function handleLoanDraw() {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Deposit to account is required.');
    if (!selectedDeal?.loan_account_id) throw new Error('Deal has no loan account.');

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || `Loan Draw - ${selectedDeal.nickname}` })
      .select('id')
      .single();
    if (txErr) throw txErr;

    // Cash (debit - money in)
    const { error: line1Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: Number(cashAccountId),
      amount: amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: creditCategory?.id ?? null,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line1Err) throw line1Err;

    // Loan liability (credit - increases debt)
    const { error: line2Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: selectedDeal.loan_account_id,
      amount: -amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: creditCategory?.id ?? null,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line2Err) throw line2Err;
  }

  async function handleHoldingCost() {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Pay from account is required.');
    if (!flipHoldingAccount) throw new Error('Holding cost account not found.');

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || null })
      .select('id')
      .single();
    if (txErr) throw txErr;

    // Expense (debit)
    const { error: line1Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: flipHoldingAccount.id,
      amount: amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: holdingCategory?.id ?? null,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line1Err) throw line1Err;

    // Cash (credit)
    const { error: line2Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: Number(cashAccountId),
      amount: -amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: holdingCategory?.id ?? null,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line2Err) throw line2Err;
  }

  async function handleInterestPayment() {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Pay from account is required.');
    if (!flipInterestAccount) throw new Error('Interest account not found.');

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || `Hard Money Interest - ${selectedDeal?.nickname}` })
      .select('id')
      .single();
    if (txErr) throw txErr;

    // Interest expense (debit)
    const { error: line1Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: flipInterestAccount.id,
      amount: amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: holdingCategory?.id ?? null,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line1Err) throw line1Err;

    // Cash (credit)
    const { error: line2Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: Number(cashAccountId),
      amount: -amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: holdingCategory?.id ?? null,
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line2Err) throw line2Err;
  }

  async function handleRefund() {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Deposit to account is required.');
    if (!rehabCategoryId) throw new Error('Rehab category is required.');

    // Default to materials account for refunds
    const expenseAccount = flipMaterialsAccount;
    if (!expenseAccount) throw new Error('Could not find materials account for refund.');

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || `Refund - ${selectedDeal?.nickname}` })
      .select('id')
      .single();
    if (txErr) throw txErr;

    // Cash (debit - money in)
    const { error: line1Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: Number(cashAccountId),
      amount: amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: Number(rehabCategoryId),
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line1Err) throw line1Err;

    // Expense (credit - reduces expense)
    const { error: line2Err } = await supabase.from('transaction_lines').insert({
      transaction_id: txData.id,
      account_id: expenseAccount.id,
      amount: -amt,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: Number(rehabCategoryId),
      purpose: 'business',
      is_cleared: isCleared,
    });
    if (line2Err) throw line2Err;
  }

  async function handleSale() {
    const sale = parseNumber(salePrice);
    const costs = parseNumber(sellingCosts) ?? 0;
    if (!sale || sale <= 0) throw new Error('Sale price is required.');
    if (!cashAccountId) throw new Error('Deposit to account is required.');
    if (!selectedDeal?.asset_account_id) throw new Error('Deal has no asset account.');
    if (!selectedDeal?.loan_account_id) throw new Error('Deal has no loan account.');

    const assetAccountId = selectedDeal.asset_account_id;
    const loanAccountId = selectedDeal.loan_account_id;

    // Get current asset balance (cost basis in asset account)
    const { data: assetLines, error: assetErr } = await supabase
      .from('transaction_lines')
      .select('amount')
      .eq('account_id', assetAccountId);
    if (assetErr) throw assetErr;
    const assetBalance = (assetLines ?? []).reduce((sum, l) => sum + Number(l.amount), 0);

    // Get current loan balance
    const { data: loanLines, error: loanErr } = await supabase
      .from('transaction_lines')
      .select('amount')
      .eq('account_id', loanAccountId);
    if (loanErr) throw loanErr;
    const loanBalance = Math.abs((loanLines ?? []).reduce((sum, l) => sum + Number(l.amount), 0));

    // Net proceeds after paying off loan and selling costs
    const netProceeds = sale - costs - loanBalance;

    const { data: txData, error: txErr } = await supabase
      .from('transactions')
      .insert({ date, description: description || `Sale - ${selectedDeal.nickname}` })
      .select('id')
      .single();
    if (txErr) throw txErr;

    const lines: Array<{
      transaction_id: number;
      account_id: number;
      amount: number;
      real_estate_deal_id: number;
      rehab_category_id: number | null;
      purpose: string;
      is_cleared: boolean;
    }> = [];

    // Cash received (debit)
    lines.push({
      transaction_id: txData.id,
      account_id: Number(cashAccountId),
      amount: netProceeds,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: null,
      purpose: 'business',
      is_cleared: isCleared,
    });

    // Pay off loan (debit - decreases liability)
    if (loanBalance > 0) {
      lines.push({
        transaction_id: txData.id,
        account_id: loanAccountId,
        amount: loanBalance,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: null,
        purpose: 'business',
        is_cleared: isCleared,
      });
    }

    // Selling costs (debit expense)
    if (costs > 0 && flipClosingAccount) {
      lines.push({
        transaction_id: txData.id,
        account_id: flipClosingAccount.id,
        amount: costs,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: closingCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      });
    }

    // Remove asset (credit - decreases asset by sale price)
    lines.push({
      transaction_id: txData.id,
      account_id: assetAccountId,
      amount: -sale,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: null,
      purpose: 'business',
      is_cleared: isCleared,
    });

    // Note: The gain/loss is implicit:
    // If sale > (assetBalance + costs), there's a gain
    // This simplified version just removes the asset at sale price
    // A more complete version would record gain/loss to a separate account

    // Verify balance
    const total = lines.reduce((sum, line) => sum + line.amount, 0);
    if (Math.abs(total) > 0.01) {
      throw new Error(`Transaction does not balance. Sum: ${total.toFixed(2)}`);
    }

    const { error: linesErr } = await supabase.from('transaction_lines').insert(lines);
    if (linesErr) throw linesErr;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <p>Loading...</p>;

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: 14,
  };

  const sectionStyle: React.CSSProperties = {
    fontWeight: 600,
    fontSize: 14,
    color: '#555',
    borderBottom: '1px solid #ddd',
    paddingBottom: '0.25rem',
    marginTop: '1rem',
    marginBottom: '0.5rem',
  };

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '0.75rem 1rem',
  };

  // Determine which fields to show based on transaction type
  const showRehabCategory = ['rehab_labor', 'rehab_material', 'rehab_service', 'refund'].includes(txType);
  const showInstaller = txType === 'rehab_labor';
  const showVendor = ['rehab_material', 'rehab_service'].includes(txType);
  const showAmount = !['acquisition', 'sale'].includes(txType);
  const showAcquisitionFields = txType === 'acquisition';
  const showSaleFields = txType === 'sale';

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>New Flip Transaction</h2>

      {error && (
        <p style={{ color: '#c00', background: '#fee', padding: '0.5rem', borderRadius: 4 }}>
          {error}
        </p>
      )}
      {success && (
        <p style={{ color: '#060', background: '#efe', padding: '0.5rem', borderRadius: 4 }}>
          {success}
        </p>
      )}

      <form onSubmit={handleSubmit}>
        {/* Deal Selection */}
        <div style={gridStyle}>
          <label style={labelStyle}>
            Deal
            <select value={dealId} onChange={(e) => setDealId(e.target.value)}>
              <option value="">Select deal...</option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nickname} - {d.address}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            Transaction Type
            <select value={txType} onChange={(e) => setTxType(e.target.value as FlipTxType)}>
              {Object.entries(TX_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Deal info summary */}
        {selectedDeal && (
          <div
            style={{
              background: '#f5f5f5',
              padding: '0.5rem',
              borderRadius: 4,
              marginTop: '0.5rem',
              fontSize: 13,
            }}
          >
            <strong>{selectedDeal.nickname}</strong>
            {selectedDeal.purchase_price && (
              <span> | Purchase: {formatCurrency(selectedDeal.purchase_price)}</span>
            )}
            {selectedDeal.arv && <span> | ARV: {formatCurrency(selectedDeal.arv)}</span>}
            {selectedDeal.status && <span> | Status: {selectedDeal.status}</span>}
          </div>
        )}

        <div style={sectionStyle}>Transaction Details</div>

        <div style={gridStyle}>
          <label style={labelStyle}>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label style={labelStyle}>
            Pay From / Deposit To
            <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
              <option value="">Select account...</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} — ` : ''}
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Acquisition Fields */}
        {showAcquisitionFields && (
          <>
            <div style={sectionStyle}>Acquisition Details</div>
            <div style={gridStyle}>
              <label style={labelStyle}>
                Purchase Price (to asset account)
                <input
                  type="number"
                  step="0.01"
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(e.target.value)}
                  placeholder="e.g. 146000"
                />
              </label>

              <label style={labelStyle}>
                Loan Amount (credited from lender)
                <input
                  type="number"
                  step="0.01"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  placeholder="e.g. 128223"
                />
              </label>

              <label style={labelStyle}>
                Closing Costs
                <input
                  type="number"
                  step="0.01"
                  value={closingCostsAmount}
                  onChange={(e) => setClosingCostsAmount(e.target.value)}
                  placeholder="e.g. 18000"
                />
              </label>
            </div>

            {/* Acquisition summary */}
            {(purchaseAmount || loanAmount || closingCostsAmount) && (
              <div
                style={{
                  background: '#e3f2fd',
                  padding: '0.75rem',
                  borderRadius: 4,
                  marginTop: '0.5rem',
                  fontSize: 13,
                }}
              >
                <div>Purchase: {formatCurrency(parseNumber(purchaseAmount) ?? 0)}</div>
                <div>+ Closing: {formatCurrency(parseNumber(closingCostsAmount) ?? 0)}</div>
                <div>- Loan: {formatCurrency(parseNumber(loanAmount) ?? 0)}</div>
                <div style={{ borderTop: '1px solid #90caf9', marginTop: '0.25rem', paddingTop: '0.25rem', fontWeight: 600 }}>
                  = Cash to Close:{' '}
                  {formatCurrency(
                    (parseNumber(purchaseAmount) ?? 0) +
                      (parseNumber(closingCostsAmount) ?? 0) -
                      (parseNumber(loanAmount) ?? 0)
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {/* Sale Fields */}
        {showSaleFields && (
          <>
            <div style={sectionStyle}>Sale Details</div>
            <div style={gridStyle}>
              <label style={labelStyle}>
                Sale Price
                <input
                  type="number"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="e.g. 349900"
                />
              </label>

              <label style={labelStyle}>
                Selling Costs (commissions, closing)
                <input
                  type="number"
                  step="0.01"
                  value={sellingCosts}
                  onChange={(e) => setSellingCosts(e.target.value)}
                  placeholder="e.g. 28000"
                />
              </label>
            </div>
          </>
        )}

        {/* Amount field for non-acquisition/sale types */}
        {showAmount && (
          <div style={{ ...gridStyle, marginTop: '0.5rem' }}>
            <label style={labelStyle}>
              Amount
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
        )}

        {/* Rehab category */}
        {showRehabCategory && (
          <div style={{ marginTop: '0.5rem' }}>
            <label style={labelStyle}>
              Rehab Category
              <select value={rehabCategoryId} onChange={(e) => setRehabCategoryId(e.target.value)}>
                <option value="">Select category...</option>
                {REHAB_GROUP_ORDER.map((group) => {
                  const cats = groupedRehabCategories[group];
                  if (!cats || cats.length === 0) return null;
                  return (
                    <optgroup key={group} label={REHAB_GROUP_LABELS[group] || group}>
                      {cats.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.code} – {cat.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </label>
          </div>
        )}

        {/* Installer / Vendor */}
        {showInstaller && (
          <div style={{ marginTop: '0.5rem' }}>
            <label style={labelStyle}>
              Installer
              <select value={installerId} onChange={(e) => setInstallerId(e.target.value)}>
                <option value="">Select installer...</option>
                {installers.map((i) => (
                  <option key={i.id} value={i.id}>
                    {formatInstaller(i)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {showVendor && (
          <div style={{ marginTop: '0.5rem' }}>
            <label style={labelStyle}>
              Vendor
              <select value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
                <option value="">Select vendor...</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nick_name}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {/* Description */}
        <div style={{ marginTop: '0.5rem' }}>
          <label style={labelStyle}>
            Description
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. HD materials, Bruno framing..."
            />
          </label>
        </div>

        {/* Cleared checkbox */}
        <div style={{ marginTop: '0.75rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 14 }}>
            <input
              type="checkbox"
              checked={isCleared}
              onChange={(e) => setIsCleared(e.target.checked)}
            />
            Mark as cleared
          </label>
        </div>

        {/* Submit */}
        <div style={{ marginTop: '1rem' }}>
          <button
            type="submit"
            disabled={saving || !dealId}
            style={{ padding: '0.6rem 1.5rem', fontWeight: 500 }}
          >
            {saving ? 'Saving...' : 'Save Transaction'}
          </button>
        </div>
      </form>
    </div>
  );
}
