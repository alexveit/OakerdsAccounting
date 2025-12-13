import { useState, useEffect, type FormEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { NewRealEstateDealForm } from './NewRealEstateDealForm';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DealType = 'rental' | 'flip' | 'wholesale' | 'personal';
type DealStatus = 'active' | 'in_contract' | 'rehab' | 'stabilized' | 'sold' | 'failed';
type PaymentFrequency = 'monthly' | 'semimonthly' | 'biweekly';

type RealEstateDeal = {
  id: number;
  type: DealType;
  nickname: string;
  address: string;
  status: DealStatus;
  purchase_price: number | null;
  arv: number | null;
  rehab_budget: number | null;
  rehab_spent: number | null;
  closing_costs_estimate: number | null;
  sale_price: number | null;
  expected_assignment_fee: number | null;
  actual_assignment_fee: number | null;
  rental_monthly_rent: number | null;
  rental_monthly_mortgage: number | null;
  rental_monthly_taxes: number | null;
  rental_monthly_insurance: number | null;
  rental_monthly_hoa: number | null;
  offer_strategy_json: Record<string, unknown> | null;
  notes: string | null;
  start_date: string | null;
  close_date: string | null;
  sell_date: string | null;
  job_id: number | null;
  asset_account_id: number | null;
  loan_account_id: number | null;
  interest_rate: number | null;
  loan_term_months: number | null;
  original_loan_amount: number | null;
  first_payment_date: string | null;
  payment_frequency: PaymentFrequency | null;
  created_at: string;
  updated_at: string;
};

type DealSummary = {
  id: number;
  nickname: string;
  address: string;
  type: DealType;
  status: DealStatus;
};

type Account = {
  id: number;
  name: string;
  code: string;
};

type Job = {
  id: number;
  name: string;
};

type DealsManageViewProps = {
  initialSelectedId?: number | null;
  onSelectionUsed?: () => void;
};

const TYPE_LABELS: Record<DealType, string> = {
  rental: 'Rental',
  flip: 'Flip',
  wholesale: 'Wholesale',
  personal: 'Personal',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function DealsManageView({ initialSelectedId, onSelectionUsed }: DealsManageViewProps) {
  // Mode: create vs edit
  const [isCreating, setIsCreating] = useState(false);

  // Deal selection
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [loadingDeals, setLoadingDeals] = useState(true);

  // Related data for dropdowns
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  // Form state (mirrors real_estate_deals columns)
  const [type, setType] = useState<DealType>('rental');
  const [status, setStatus] = useState<DealStatus>('active');
  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');
  const [startDate, setStartDate] = useState('');
  const [closeDate, setCloseDate] = useState('');
  const [sellDate, setSellDate] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [arv, setArv] = useState('');
  const [rehabBudget, setRehabBudget] = useState('');
  const [rehabSpent, setRehabSpent] = useState('');
  const [closingCostsEstimate, setClosingCostsEstimate] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [expectedAssignmentFee, setExpectedAssignmentFee] = useState('');
  const [actualAssignmentFee, setActualAssignmentFee] = useState('');
  const [rentalMonthlyRent, setRentalMonthlyRent] = useState('');
  const [rentalMonthlyMortgage, setRentalMonthlyMortgage] = useState('');
  const [rentalMonthlyTaxes, setRentalMonthlyTaxes] = useState('');
  const [rentalMonthlyInsurance, setRentalMonthlyInsurance] = useState('');
  const [rentalMonthlyHoa, setRentalMonthlyHoa] = useState('');
  const [originalLoanAmount, setOriginalLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [loanTermMonths, setLoanTermMonths] = useState('');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');
  const [paymentFrequency, setPaymentFrequency] = useState<PaymentFrequency>('monthly');
  const [assetAccountId, setAssetAccountId] = useState<number | null>(null);
  const [loanAccountId, setLoanAccountId] = useState<number | null>(null);
  const [jobId, setJobId] = useState<number | null>(null);
  const [notes, setNotes] = useState('');

  // UI state
  const [loadingDeal, setLoadingDeal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────────
  // Data Loading
  // ─────────────────────────────────────────────────────────────────────────────

  // Load deal list on mount
  useEffect(() => {
    async function loadDeals() {
      setLoadingDeals(true);
      const { data, error } = await supabase
        .from('real_estate_deals')
        .select('id, nickname, address, type, status')
        .order('nickname', { ascending: true });

      if (error) {
        console.error('Error loading deals:', error);
      } else {
        setDeals(data || []);
      }
      setLoadingDeals(false);
    }

    async function loadAccounts() {
      const { data } = await supabase
        .from('accounts')
        .select('id, name, code')
        .order('code', { ascending: true });
      setAccounts(data || []);
    }

    async function loadJobs() {
      const { data } = await supabase
        .from('jobs')
        .select('id, name')
        .order('name', { ascending: true });
      setJobs(data || []);
    }

    loadDeals();
    loadAccounts();
    loadJobs();
  }, []);

  // Handle initialSelectedId from parent (e.g., click from Overview)
  useEffect(() => {
    if (initialSelectedId != null && deals.length > 0) {
      setSelectedDealId(initialSelectedId);
      setIsCreating(false);
      onSelectionUsed?.();
    }
  }, [initialSelectedId, deals.length, onSelectionUsed]);

  // Load selected deal details
  useEffect(() => {
    if (!selectedDealId) {
      resetForm();
      return;
    }

    async function loadDeal() {
      setLoadingDeal(true);
      setError(null);
      setSuccess(null);

      const { data, error } = await supabase
        .from('real_estate_deals')
        .select('*')
        .eq('id', selectedDealId)
        .single();

      if (error) {
        console.error('Error loading deal:', error);
        setError('Failed to load deal details.');
        setLoadingDeal(false);
        return;
      }

      const deal = data as RealEstateDeal;
      populateForm(deal);
      setLoadingDeal(false);
    }

    loadDeal();
  }, [selectedDealId]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Form Helpers
  // ─────────────────────────────────────────────────────────────────────────────

  function parseNumber(val: string): number | null {
    if (!val.trim()) return null;
    const n = Number(val);
    return Number.isNaN(n) ? null : n;
  }

  function numToStr(val: number | null | undefined): string {
    if (val === null || val === undefined) return '';
    return String(val);
  }

  function resetForm() {
    setType('rental');
    setStatus('active');
    setNickname('');
    setAddress('');
    setStartDate('');
    setCloseDate('');
    setSellDate('');
    setPurchasePrice('');
    setArv('');
    setRehabBudget('');
    setRehabSpent('');
    setClosingCostsEstimate('');
    setSalePrice('');
    setExpectedAssignmentFee('');
    setActualAssignmentFee('');
    setRentalMonthlyRent('');
    setRentalMonthlyMortgage('');
    setRentalMonthlyTaxes('');
    setRentalMonthlyInsurance('');
    setRentalMonthlyHoa('');
    setOriginalLoanAmount('');
    setInterestRate('');
    setLoanTermMonths('');
    setFirstPaymentDate('');
    setPaymentFrequency('monthly');
    setAssetAccountId(null);
    setLoanAccountId(null);
    setJobId(null);
    setNotes('');
  }

  function populateForm(deal: RealEstateDeal) {
    setType(deal.type);
    setStatus(deal.status);
    setNickname(deal.nickname);
    setAddress(deal.address);
    setStartDate(deal.start_date || '');
    setCloseDate(deal.close_date || '');
    setSellDate(deal.sell_date || '');
    setPurchasePrice(numToStr(deal.purchase_price));
    setArv(numToStr(deal.arv));
    setRehabBudget(numToStr(deal.rehab_budget));
    setRehabSpent(numToStr(deal.rehab_spent));
    setClosingCostsEstimate(numToStr(deal.closing_costs_estimate));
    setSalePrice(numToStr(deal.sale_price));
    setExpectedAssignmentFee(numToStr(deal.expected_assignment_fee));
    setActualAssignmentFee(numToStr(deal.actual_assignment_fee));
    setRentalMonthlyRent(numToStr(deal.rental_monthly_rent));
    setRentalMonthlyMortgage(numToStr(deal.rental_monthly_mortgage));
    setRentalMonthlyTaxes(numToStr(deal.rental_monthly_taxes));
    setRentalMonthlyInsurance(numToStr(deal.rental_monthly_insurance));
    setRentalMonthlyHoa(numToStr(deal.rental_monthly_hoa));
    setOriginalLoanAmount(numToStr(deal.original_loan_amount));
    setInterestRate(numToStr(deal.interest_rate));
    setLoanTermMonths(numToStr(deal.loan_term_months));
    setFirstPaymentDate(deal.first_payment_date || '');
    setPaymentFrequency(deal.payment_frequency || 'monthly');
    setAssetAccountId(deal.asset_account_id);
    setLoanAccountId(deal.loan_account_id);
    setJobId(deal.job_id);
    setNotes(deal.notes || '');
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Submit / Archive
  // ─────────────────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedDealId) return;

    setError(null);
    setSuccess(null);

    // Basic validation
    if (!nickname.trim()) {
      setError('Nickname is required.');
      return;
    }
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }

    setSaving(true);

    const payload = {
      type,
      status,
      nickname: nickname.trim(),
      address: address.trim(),
      start_date: startDate || null,
      close_date: closeDate || null,
      sell_date: sellDate || null,
      purchase_price: parseNumber(purchasePrice),
      arv: parseNumber(arv),
      rehab_budget: parseNumber(rehabBudget),
      rehab_spent: parseNumber(rehabSpent),
      closing_costs_estimate: parseNumber(closingCostsEstimate),
      sale_price: parseNumber(salePrice),
      expected_assignment_fee: parseNumber(expectedAssignmentFee),
      actual_assignment_fee: parseNumber(actualAssignmentFee),
      rental_monthly_rent: parseNumber(rentalMonthlyRent),
      rental_monthly_mortgage: parseNumber(rentalMonthlyMortgage),
      rental_monthly_taxes: parseNumber(rentalMonthlyTaxes),
      rental_monthly_insurance: parseNumber(rentalMonthlyInsurance),
      rental_monthly_hoa: parseNumber(rentalMonthlyHoa),
      original_loan_amount: parseNumber(originalLoanAmount),
      interest_rate: parseNumber(interestRate),
      loan_term_months: parseNumber(loanTermMonths),
      first_payment_date: firstPaymentDate || null,
      payment_frequency: paymentFrequency,
      asset_account_id: assetAccountId,
      loan_account_id: loanAccountId,
      job_id: jobId,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from('real_estate_deals')
      .update(payload)
      .eq('id', selectedDealId);

    setSaving(false);

    if (updateError) {
      console.error('Error updating deal:', updateError);
      setError(`Failed to save: ${updateError.message}`);
      return;
    }

    setSuccess('Deal updated successfully.');

    // Update the deals list with new nickname/status if changed
    setDeals((prev) =>
      prev.map((d) =>
        d.id === selectedDealId
          ? { ...d, nickname: nickname.trim(), type, status, address: address.trim() }
          : d
      )
    );
  }

  async function handleArchive() {
    if (!selectedDealId) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    const { error: archiveError } = await supabase
      .from('real_estate_deals')
      .update({
        status: 'failed' as DealStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selectedDealId);

    setSaving(false);
    setShowArchiveConfirm(false);

    if (archiveError) {
      console.error('Error archiving deal:', archiveError);
      setError(`Failed to archive: ${archiveError.message}`);
      return;
    }

    setStatus('failed');
    setSuccess('Deal archived (status set to "failed").');

    // Update deals list
    setDeals((prev) =>
      prev.map((d) =>
        d.id === selectedDealId ? { ...d, status: 'failed' } : d
      )
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────

  const isFinanced = !!(originalLoanAmount || assetAccountId || loanAccountId);
  const selectedDeal = deals.find((d) => d.id === selectedDealId);

  // Handler for when a new deal is created
  function handleDealCreated() {
    setIsCreating(false);
    // Reload deals list
    async function reload() {
      const { data } = await supabase
        .from('real_estate_deals')
        .select('id, nickname, address, type, status')
        .order('nickname', { ascending: true });
      setDeals((data || []) as DealSummary[]);
    }
    reload();
  }

  return (
    <div className="deal-edit">
      {/* Mode toggle buttons */}
      <div className="deal-edit__toggle">
        <button
          type="button"
          onClick={() => {
            setIsCreating(false);
            setSelectedDealId(null);
          }}
          className={`deal-edit__toggle-btn ${isCreating ? 'deal-edit__toggle-btn--inactive' : 'deal-edit__toggle-btn--active'}`}
        >
          Edit Existing
        </button>
        <button
          type="button"
          onClick={() => {
            setIsCreating(true);
            setSelectedDealId(null);
            setError(null);
            setSuccess(null);
          }}
          className={`deal-edit__toggle-btn ${isCreating ? 'deal-edit__toggle-btn--active' : 'deal-edit__toggle-btn--inactive'}`}
        >
          + Create New
        </button>
      </div>

      {/* Create New Deal Form */}
      {isCreating && (
        <div className="card">
          <NewRealEstateDealForm onCreated={handleDealCreated} />
        </div>
      )}

      {/* Edit Existing Deal */}
      {!isCreating && (
        <>
          {/* Deal Selector */}
          <div className="deal-edit__selector">
            <label className="deal-edit__selector-label">
              <span>Select a deal to edit:</span>
              <select
                value={selectedDealId ?? ''}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedDealId(val ? Number(val) : null);
                  setError(null);
                  setSuccess(null);
                  setShowArchiveConfirm(false);
                }}
              >
                <option value="">-- Choose a deal --</option>
                {deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nickname} ({TYPE_LABELS[d.type]}) -- {d.status}
                  </option>
                ))}
              </select>
            </label>
            {loadingDeals && (
              <div className="deal-edit__loading">
                Loading deals...
              </div>
            )}
          </div>

          {/* No deal selected */}
          {!selectedDealId && !loadingDeals && (
            <div className="deal-edit__empty">
          Select a deal above to view and edit its details.
        </div>
      )}

      {/* Loading deal */}
      {selectedDealId && loadingDeal && (
        <div className="deal-edit__empty">
          Loading deal details...
        </div>
      )}

      {/* Edit Form */}
      {selectedDealId && !loadingDeal && (
        <form onSubmit={handleSubmit}>
          {/* Messages */}
          {error && (
            <div className="alert alert--danger mb-2">
              {error}
            </div>
          )}
          {success && (
            <div className="alert alert--success mb-2">
              {success}
            </div>
          )}

          {/* ─────────────── CORE INFO ─────────────── */}
          <div className="card deal-edit__section-card">
            <h4>Core Info</h4>
            <div className="deal-edit__form-grid">
              <label className="deal-edit__label">
                Nickname *
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  required
                />
              </label>

              <label className="deal-edit__label">
                Type
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as DealType)}
                >
                  <option value="rental">Rental</option>
                  <option value="flip">Flip</option>
                  <option value="wholesale">Wholesale</option>
                  <option value="personal">Personal Residence</option>
                </select>
              </label>

              <label className="deal-edit__label deal-edit__label--full">
                Address *
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  required
                />
              </label>

              <label className="deal-edit__label">
                Status
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DealStatus)}
                >
                  <option value="active">Active</option>
                  <option value="in_contract">In Contract</option>
                  <option value="rehab">Rehab</option>
                  <option value="stabilized">Stabilized</option>
                  {type !== 'personal' && <option value="sold">Sold</option>}
                  <option value="failed">Failed / Archived</option>
                </select>
              </label>

              {type !== 'personal' && (
                <label className="deal-edit__label">
                  Linked Job
                  <select
                    value={jobId ?? ''}
                    onChange={(e) =>
                      setJobId(e.target.value ? Number(e.target.value) : null)
                    }
                  >
                    <option value="">— None —</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={j.id}>
                        {j.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </div>

          {/* ─────────────── DATES ─────────────── */}
          <div className="card deal-edit__section-card">
            <h4>Dates</h4>
            <div className="deal-edit__form-grid">
              <label className="deal-edit__label">
                {type === 'personal' ? 'Purchase Date' : 'Start Date'}
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </label>

              <label className="deal-edit__label">
                Close Date
                <input
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                />
              </label>

              {type !== 'personal' && (
                <label className="deal-edit__label">
                  Sell Date
                  <input
                    type="date"
                    value={sellDate}
                    onChange={(e) => setSellDate(e.target.value)}
                  />
                </label>
              )}
            </div>
          </div>

          {/* ─────────────── ECONOMICS ─────────────── */}
          <div className="card deal-edit__section-card">
            <h4>{type === 'personal' ? 'Property Value' : 'Economics'}</h4>
            <div className="deal-edit__form-grid">
              <label className="deal-edit__label">
                Purchase Price
                <input
                  type="number"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                />
              </label>

              <label className="deal-edit__label">
                {type === 'personal' ? 'Current Market Value' : 'ARV'}
                <input
                  type="number"
                  step="0.01"
                  value={arv}
                  onChange={(e) => setArv(e.target.value)}
                />
                {type === 'personal' && (
                  <span className="deal-edit__hint">
                    Used for equity calculation
                  </span>
                )}
              </label>

              {type !== 'personal' && (
                <>
                  <label className="deal-edit__label">
                    Rehab Budget
                    <input
                      type="number"
                      step="0.01"
                      value={rehabBudget}
                      onChange={(e) => setRehabBudget(e.target.value)}
                    />
                  </label>

                  <label className="deal-edit__label">
                    Rehab Spent
                    <input
                      type="number"
                      step="0.01"
                      value={rehabSpent}
                      onChange={(e) => setRehabSpent(e.target.value)}
                    />
                  </label>

                  <label className="deal-edit__label">
                    Closing Costs Estimate
                    <input
                      type="number"
                      step="0.01"
                      value={closingCostsEstimate}
                      onChange={(e) => setClosingCostsEstimate(e.target.value)}
                    />
                  </label>

                  <label className="deal-edit__label">
                    Sale Price
                    <input
                      type="number"
                      step="0.01"
                      value={salePrice}
                      onChange={(e) => setSalePrice(e.target.value)}
                    />
                  </label>
                </>
              )}
            </div>
          </div>

          {/* ─────────────── WHOLESALE / ASSIGNMENT ─────────────── */}
          {type === 'wholesale' && (
            <div className="card deal-edit__section-card">
              <h4>Assignment Fees</h4>
              <div className="deal-edit__form-grid">
                <label className="deal-edit__label">
                  Expected Assignment Fee
                  <input
                    type="number"
                    step="0.01"
                    value={expectedAssignmentFee}
                    onChange={(e) => setExpectedAssignmentFee(e.target.value)}
                  />
                </label>

                <label className="deal-edit__label">
                  Actual Assignment Fee
                  <input
                    type="number"
                    step="0.01"
                    value={actualAssignmentFee}
                    onChange={(e) => setActualAssignmentFee(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          {/* ─────────────── FINANCING ─────────────── */}
          <div className="card deal-edit__section-card">
            <h4>{type === 'personal' ? 'Mortgage' : 'Financing'}</h4>
            <div className="deal-edit__form-grid">
              <label className="deal-edit__label">
                {type === 'personal' ? 'Current Loan Balance' : 'Original Loan Amount'}
                <input
                  type="number"
                  step="0.01"
                  value={originalLoanAmount}
                  onChange={(e) => setOriginalLoanAmount(e.target.value)}
                />
              </label>

              <label className="deal-edit__label">
                Interest Rate (%)
                <input
                  type="number"
                  step="0.125"
                  min="0"
                  max="30"
                  value={interestRate}
                  onChange={(e) => setInterestRate(e.target.value)}
                />
              </label>

              <label className="deal-edit__label">
                Loan Term (months)
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={loanTermMonths}
                  onChange={(e) => setLoanTermMonths(e.target.value)}
                />
              </label>

              <label className="deal-edit__label">
                First Payment Date
                <input
                  type="date"
                  value={firstPaymentDate}
                  onChange={(e) => setFirstPaymentDate(e.target.value)}
                />
              </label>

              <label className="deal-edit__label">
                Payment Frequency
                <select
                  value={paymentFrequency}
                  onChange={(e) => setPaymentFrequency(e.target.value as PaymentFrequency)}
                >
                  <option value="monthly">Monthly (12/year)</option>
                  <option value="semimonthly">Semi-monthly (24/year)</option>
                  <option value="biweekly">Bi-weekly (26/year)</option>
                </select>
              </label>

              <label className="deal-edit__label">
                Asset Account
                <select
                  value={assetAccountId ?? ''}
                  onChange={(e) =>
                    setAssetAccountId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">— None —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="deal-edit__label">
                Loan Account
                <select
                  value={loanAccountId ?? ''}
                  onChange={(e) =>
                    setLoanAccountId(e.target.value ? Number(e.target.value) : null)
                  }
                >
                  <option value="">— None —</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* ─────────────── RENTAL/PERSONAL OPERATIONS ─────────────── */}
          {(type === 'rental' || type === 'personal') && (
            <div className="card deal-edit__section-card">
              <h4>{type === 'personal' ? 'Monthly Costs (Reference)' : 'Rental Operations'}</h4>
              <div className="deal-edit__form-grid">
                {type === 'rental' && (
                  <label className="deal-edit__label">
                    Monthly Rent
                    <input
                      type="number"
                      step="0.01"
                      value={rentalMonthlyRent}
                      onChange={(e) => setRentalMonthlyRent(e.target.value)}
                    />
                  </label>
                )}

                <label className="deal-edit__label">
                  Monthly Mortgage Payment
                  <input
                    type="number"
                    step="0.01"
                    value={rentalMonthlyMortgage}
                    onChange={(e) => setRentalMonthlyMortgage(e.target.value)}
                  />
                </label>

                <label className="deal-edit__label">
                  Monthly Taxes
                  <input
                    type="number"
                    step="0.01"
                    value={rentalMonthlyTaxes}
                    onChange={(e) => setRentalMonthlyTaxes(e.target.value)}
                  />
                </label>

                <label className="deal-edit__label">
                  Monthly Insurance
                  <input
                    type="number"
                    step="0.01"
                    value={rentalMonthlyInsurance}
                    onChange={(e) => setRentalMonthlyInsurance(e.target.value)}
                  />
                </label>

                <label className="deal-edit__label">
                  Monthly HOA
                  <input
                    type="number"
                    step="0.01"
                    value={rentalMonthlyHoa}
                    onChange={(e) => setRentalMonthlyHoa(e.target.value)}
                  />
                </label>
              </div>
            </div>
          )}

          {/* ─────────────── NOTES ─────────────── */}
          <div className="card deal-edit__section-card">
            <h4>Notes</h4>
            <label className="deal-edit__label">
              <textarea
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any additional notes about this deal…"
              />
            </label>
          </div>

          {/* ─────────────── ACTIONS ─────────────── */}
          <div className="deal-edit__actions">
            {/* Archive / Danger Zone */}
            <div>
              {status !== 'failed' && !showArchiveConfirm && (
                <button
                  type="button"
                  onClick={() => setShowArchiveConfirm(true)}
                  className="btn-danger-outline"
                >
                  Archive Deal
                </button>
              )}
              {showArchiveConfirm && (
                <div className="deal-edit__archive-confirm">
                  <span>Are you sure?</span>
                  <button
                    type="button"
                    onClick={handleArchive}
                    disabled={saving}
                    className="btn-danger"
                  >
                    Yes, Archive
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowArchiveConfirm(false)}
                    className="btn-cancel"
                  >
                    Cancel
                  </button>
                </div>
              )}
              {status === 'failed' && (
                <span className="deal-edit__archived-note">
                  This deal is archived.
                </span>
              )}
            </div>

            {/* Save */}
            <button
              type="submit"
              disabled={saving}
              className="btn"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      )}

      {/* Metadata footer */}
      {selectedDeal && !loadingDeal && (
        <div className="deal-edit__footer">
          Deal ID: {selectedDealId}
        </div>
      )}
        </>
      )}
    </div>
  );
}

// Backward compatibility alias
export { DealsManageView as DealEditView };
