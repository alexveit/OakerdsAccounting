// src/components/NewFlipTransaction.tsx
// Dedicated transaction form for flip deals - handles full lifecycle
// Acquisition, Rehab, Loan Draws, Holding Costs, Interest, Sale

import { useEffect, useState, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';
import { todayLocalISO } from '../../utils/date';
import {
  ACCOUNT_CODES,
  REHAB_CODES,
  isCashAccount,
  compareAccountsForSort,
} from '../../utils/accounts';

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

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

type RawAccountRow = {
  id: number;
  name: string;
  code: string | null;
  account_types: { name: string }[] | { name: string } | null;
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

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const TX_TYPE_LABELS: Record<FlipTxType, string> = {
  acquisition: '[House] Acquisition (Purchase & Closing)',
  rehab_labor: '[Worker] Rehab - Labor',
  rehab_material: '[Brick] Rehab - Materials',
  rehab_service: '[Wrench] Rehab - Service/Contractor',
  loan_draw: '[Money] Loan Draw (from escrow)',
  holding: '[Building] Holding Cost (utilities, insurance)',
  interest: '[Cash] Interest Payment',
  refund: '[Return] Refund / Credit',
  sale: '[Tag] Property Sale',
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

// -----------------------------------------------------------------------------
// Component
// -----------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Load reference data
  // -------------------------------------------------------------------------

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
        const rawAccounts = (accountsData ?? []) as unknown as RawAccountRow[];
        const sortedAccounts = rawAccounts
          .map((a): Account => ({
            id: a.id,
            name: a.name,
            code: a.code ?? null,
            account_types: Array.isArray(a.account_types)
              ? a.account_types[0] ?? null
              : a.account_types ?? null,
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

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

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

  // -------------------------------------------------------------------------
  // Submit handlers
  // -------------------------------------------------------------------------

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

    // Build lines for create_transaction_multi
    const lines: Array<{
      account_id: number;
      amount: number;
      real_estate_deal_id: number;
      rehab_category_id: number | null;
      purpose: string;
      is_cleared: boolean;
    }> = [];

    // Asset account - debit purchase price
    lines.push({
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
        account_id: cashId,
        amount: -cashToClose,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: null,
        purpose: 'business',
        is_cleared: isCleared,
      });
    }

    // RPC handles balance validation
    const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
      p_date: date,
      p_description: description || `Acquisition - ${selectedDeal.nickname}`,
      p_lines: lines,
    });
    if (rpcErr) throw rpcErr;
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

    const lines = [
      {
        account_id: expenseAccount.id,
        amount: amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: Number(rehabCategoryId),
        cost_type: costTypeCode,
        vendor_id: vendorId ? Number(vendorId) : null,
        installer_id: installerId ? Number(installerId) : null,
        purpose: 'business',
        is_cleared: isCleared,
      },
      {
        account_id: Number(cashAccountId),
        amount: -amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: Number(rehabCategoryId),
        cost_type: costTypeCode,
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
  }

  async function handleLoanDraw() {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Deposit to account is required.');
    if (!selectedDeal?.loan_account_id) throw new Error('Deal has no loan account.');

    const lines = [
      {
        account_id: Number(cashAccountId),
        amount: amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: creditCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      },
      {
        account_id: selectedDeal.loan_account_id,
        amount: -amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: creditCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      },
    ];

    const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
      p_date: date,
      p_description: description || `Loan Draw - ${selectedDeal.nickname}`,
      p_lines: lines,
    });
    if (rpcErr) throw rpcErr;
  }

  async function handleHoldingCost() {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Pay from account is required.');
    if (!flipHoldingAccount) throw new Error('Holding cost account not found.');

    const lines = [
      {
        account_id: flipHoldingAccount.id,
        amount: amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: holdingCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      },
      {
        account_id: Number(cashAccountId),
        amount: -amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: holdingCategory?.id ?? null,
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
  }

  async function handleInterestPayment() {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Pay from account is required.');
    if (!flipInterestAccount) throw new Error('Interest account not found.');

    const lines = [
      {
        account_id: flipInterestAccount.id,
        amount: amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: holdingCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      },
      {
        account_id: Number(cashAccountId),
        amount: -amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: holdingCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      },
    ];

    const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
      p_date: date,
      p_description: description || `Hard Money Interest - ${selectedDeal?.nickname}`,
      p_lines: lines,
    });
    if (rpcErr) throw rpcErr;
  }

  async function handleRefund() {
    const amt = parseNumber(amount);
    if (!amt || amt <= 0) throw new Error('Amount is required.');
    if (!cashAccountId) throw new Error('Deposit to account is required.');
    if (!rehabCategoryId) throw new Error('Rehab category is required.');

    // Default to materials account for refunds
    const expenseAccount = flipMaterialsAccount;
    if (!expenseAccount) throw new Error('Could not find materials account for refund.');

    const lines = [
      {
        account_id: Number(cashAccountId),
        amount: amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: Number(rehabCategoryId),
        purpose: 'business',
        is_cleared: isCleared,
      },
      {
        account_id: expenseAccount.id,
        amount: -amt,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: Number(rehabCategoryId),
        purpose: 'business',
        is_cleared: isCleared,
      },
    ];

    const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
      p_date: date,
      p_description: description || `Refund - ${selectedDeal?.nickname}`,
      p_lines: lines,
    });
    if (rpcErr) throw rpcErr;
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

    const lines: Array<{
      account_id: number;
      amount: number;
      real_estate_deal_id: number;
      rehab_category_id: number | null;
      purpose: string;
      is_cleared: boolean;
    }> = [];

    // Cash received (debit)
    lines.push({
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
        account_id: loanAccountId,
        amount: loanBalance,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: null,
        purpose: 'business',
        is_cleared: isCleared,
      });
    }

    // Selling costs (debit to expense)
    if (costs > 0 && flipClosingAccount) {
      lines.push({
        account_id: flipClosingAccount.id,
        amount: costs,
        real_estate_deal_id: Number(dealId),
        rehab_category_id: closingCategory?.id ?? null,
        purpose: 'business',
        is_cleared: isCleared,
      });
    }

    // Remove asset (credit - clears the property from books)
    lines.push({
      account_id: assetAccountId,
      amount: -assetBalance,
      real_estate_deal_id: Number(dealId),
      rehab_category_id: null,
      purpose: 'business',
      is_cleared: isCleared,
    });

    // The difference (gain/loss) is implicit in the transaction balance
    // A more complete version would record gain/loss to a separate account

    // RPC handles balance validation
    const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
      p_date: date,
      p_description: description || `Sale - ${selectedDeal.nickname}`,
      p_lines: lines,
    });
    if (rpcErr) throw rpcErr;
  }


  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  if (loading) return <p>Loading...</p>;

  // Determine which fields to show based on transaction type
  const showRehabCategory = ['rehab_labor', 'rehab_material', 'rehab_service', 'refund'].includes(txType);
  const showInstaller = txType === 'rehab_labor';
  const showVendor = ['rehab_material', 'rehab_service'].includes(txType);
  const showAmount = !['acquisition', 'sale'].includes(txType);
  const showAcquisitionFields = txType === 'acquisition';
  const showSaleFields = txType === 'sale';

  return (
    <div className="card">
      <h2 className="flip-tx__title">New Flip Transaction</h2>

      {error && (
        <p className="flip-tx__error">
          {error}
        </p>
      )}
      {success && (
        <p className="flip-tx__success">
          {success}
        </p>
      )}

      <form onSubmit={handleSubmit}>
        {/* Deal Selection */}
        <div className="flip-tx__grid">
          <label className="flip-tx__label">
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

          <label className="flip-tx__label">
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
          <div className="flip-tx__deal-info">
            <strong>{selectedDeal.nickname}</strong>
            {selectedDeal.purchase_price && (
              <span> | Purchase: {formatCurrency(selectedDeal.purchase_price)}</span>
            )}
            {selectedDeal.arv && <span> | ARV: {formatCurrency(selectedDeal.arv)}</span>}
            {selectedDeal.status && <span> | Status: {selectedDeal.status}</span>}
          </div>
        )}

        <div className="flip-tx__section">Transaction Details</div>

        <div className="flip-tx__grid">
          <label className="flip-tx__label">
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>

          <label className="flip-tx__label">
            Pay From / Deposit To
            <select value={cashAccountId} onChange={(e) => setCashAccountId(e.target.value)}>
              <option value="">Select account...</option>
              {cashAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code ? `${a.code} - ` : ''}
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Acquisition Fields */}
        {showAcquisitionFields && (
          <>
            <div className="flip-tx__section">Acquisition Details</div>
            <div className="flip-tx__grid">
              <label className="flip-tx__label">
                Purchase Price (to asset account)
                <input
                  type="number"
                  step="0.01"
                  value={purchaseAmount}
                  onChange={(e) => setPurchaseAmount(e.target.value)}
                  placeholder="e.g. 146000"
                />
              </label>

              <label className="flip-tx__label">
                Loan Amount (credited from lender)
                <input
                  type="number"
                  step="0.01"
                  value={loanAmount}
                  onChange={(e) => setLoanAmount(e.target.value)}
                  placeholder="e.g. 128223"
                />
              </label>

              <label className="flip-tx__label">
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
              <div className="flip-tx__summary">
                <div>Purchase: {formatCurrency(parseNumber(purchaseAmount) ?? 0)}</div>
                <div>+ Closing: {formatCurrency(parseNumber(closingCostsAmount) ?? 0)}</div>
                <div>- Loan: {formatCurrency(parseNumber(loanAmount) ?? 0)}</div>
                <div className="flip-tx__summary-total">
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
            <div className="flip-tx__section">Sale Details</div>
            <div className="flip-tx__grid">
              <label className="flip-tx__label">
                Sale Price
                <input
                  type="number"
                  step="0.01"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="e.g. 349900"
                />
              </label>

              <label className="flip-tx__label">
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
          <div className="flip-tx__grid flip-tx__grid--mt">
            <label className="flip-tx__label">
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
          <div className="flip-tx__field">
            <label className="flip-tx__label">
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
                          {cat.code} - {cat.name}
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
          <div className="flip-tx__field">
            <label className="flip-tx__label">
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
          <div className="flip-tx__field">
            <label className="flip-tx__label">
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
        <div className="flip-tx__field">
          <label className="flip-tx__label">
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
        <div className="flip-tx__field--lg">
          <label className="flip-tx__checkbox-label">
            <input
              type="checkbox"
              checked={isCleared}
              onChange={(e) => setIsCleared(e.target.checked)}
            />
            Mark as cleared
          </label>
        </div>

        {/* Submit */}
        <div className="flip-tx__field--xl">
          <button
            type="submit"
            disabled={saving || !dealId}
            className="flip-tx__submit-btn"
          >
            {saving ? 'Saving...' : 'Save Transaction'}
          </button>
        </div>
      </form>
    </div>
  );
}
