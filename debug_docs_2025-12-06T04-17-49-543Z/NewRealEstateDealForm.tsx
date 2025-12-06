import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ACCOUNT_CODE_RANGES, ACCOUNT_TYPE_IDS } from '../utils/accounts';

type DealType = 'rental' | 'flip' | 'wholesale';
type DealStatus = 'active' | 'in_contract' | 'rehab' | 'listed' | 'under_contract' | 'stabilized' | 'sold' | 'failed';
type LoanType = 'hard_money' | 'conventional' | 'heloc' | 'private' | 'other';

type Props = {
  onCreated?: () => void;
};

export function NewRealEstateDealForm({ onCreated }: Props) {
  // Core deal info
  const [type, setType] = useState<DealType>('flip');
  const [status, setStatus] = useState<DealStatus>('rehab');
  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');

  // Dates
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [closeDate, setCloseDate] = useState('');
  const [sellDate, setSellDate] = useState('');

  // Economics - Acquisition
  const [purchasePrice, setPurchasePrice] = useState('');
  const [assignmentFeePaid, setAssignmentFeePaid] = useState(''); // NEW: Fee paid TO wholesaler
  const [arv, setArv] = useState('');
  const [rehabBudget, setRehabBudget] = useState('');
  const [closingCostsEstimate, setClosingCostsEstimate] = useState('');
  const [holdingCostsEstimate, setHoldingCostsEstimate] = useState('');

  // Financing (conditionally shown)
  const [isFinanced, setIsFinanced] = useState(false);
  const [loanType, setLoanType] = useState<LoanType>('hard_money');
  const [lenderName, setLenderName] = useState(''); // NEW: Who is the lender
  const [originalLoanAmount, setOriginalLoanAmount] = useState('');
  const [rehabHoldback, setRehabHoldback] = useState(''); // NEW: Amount held in escrow for draws
  const [interestRate, setInterestRate] = useState('');
  const [loanTermMonths, setLoanTermMonths] = useState('');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');
  const [isInterestOnly, setIsInterestOnly] = useState(true); // Most hard money is interest-only

  // Rental operations
  const [rentalMonthlyRent, setRentalMonthlyRent] = useState('');
  const [rentalMonthlyMortgage, setRentalMonthlyMortgage] = useState('');
  const [rentalMonthlyTaxes, setRentalMonthlyTaxes] = useState('');
  const [rentalMonthlyInsurance, setRentalMonthlyInsurance] = useState('');
  const [rentalMonthlyHoa, setRentalMonthlyHoa] = useState('');

  // Wholesale / assignment (when YOU are the wholesaler)
  const [expectedAssignmentFee, setExpectedAssignmentFee] = useState('');
  const [actualAssignmentFee, setActualAssignmentFee] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────
  // Computed values for display
  // ─────────────────────────────────────────────────────────────────

  const purchasePriceNum = parseNumber(purchasePrice) ?? 0;
  const assignmentFeeNum = parseNumber(assignmentFeePaid) ?? 0;
  const totalAcquisitionCost = purchasePriceNum + assignmentFeeNum;

  const loanAmountNum = parseNumber(originalLoanAmount) ?? 0;
  const rehabHoldbackNum = parseNumber(rehabHoldback) ?? 0;
  const loanToClosingTable = loanAmountNum - rehabHoldbackNum;

  const arvNum = parseNumber(arv) ?? 0;
  const rehabBudgetNum = parseNumber(rehabBudget) ?? 0;
  const closingCostsNum = parseNumber(closingCostsEstimate) ?? 0;
  const holdingCostsNum = parseNumber(holdingCostsEstimate) ?? 0;

  // Estimated total cost basis
  const estimatedCostBasis = totalAcquisitionCost + rehabBudgetNum + closingCostsNum + holdingCostsNum;
  
  // Estimated selling costs (default 8% = 6% commission + 2% closing)
  const estimatedSellingCosts = arvNum * 0.08;
  
  // Estimated profit
  const estimatedProfit = arvNum - estimatedCostBasis - estimatedSellingCosts;
  const estimatedMargin = arvNum > 0 ? (estimatedProfit / arvNum) * 100 : 0;

  // Cash to close estimate
  const estimatedCashToClose = totalAcquisitionCost + closingCostsNum - loanToClosingTable;

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  function parseNumber(val: string): number | null {
    if (!val.trim()) return null;
    const n = Number(val);
    return Number.isNaN(n) ? null : n;
  }

  function formatCurrency(val: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(val);
  }

  /**
   * Get the next available account code in a given range.
   */
  async function getNextCodeInRange(min: number, max: number): Promise<string> {
    const { data, error } = await supabase
      .from('accounts')
      .select('code')
      .gte('code', String(min))
      .lt('code', String(max + 1))
      .order('code', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      return String(min + 1);
    }

    const maxCode = parseInt(data[0].code, 10);
    const nextCode = maxCode + 1;

    if (nextCode > max) {
      throw new Error(`Account code range ${min}-${max} is exhausted`);
    }

    return String(nextCode);
  }

  async function getNextAssetCode(): Promise<string> {
    return getNextCodeInRange(
      ACCOUNT_CODE_RANGES.RE_ASSET_MIN,
      ACCOUNT_CODE_RANGES.RE_ASSET_MAX
    );
  }

  async function getNextLoanCode(): Promise<string> {
    return getNextCodeInRange(
      ACCOUNT_CODE_RANGES.RE_MORTGAGE_MIN,
      ACCOUNT_CODE_RANGES.RE_MORTGAGE_MAX
    );
  }

  async function createDealAccounts(dealNickname: string): Promise<{
    assetAccountId: number;
    loanAccountId: number;
  }> {
    const assetCode = await getNextAssetCode();
    const loanCode = await getNextLoanCode();

    // Determine loan account name based on loan type
    const loanTypeLabels: Record<LoanType, string> = {
      hard_money: 'Hard Money',
      conventional: 'Mortgage',
      heloc: 'HELOC',
      private: 'Private Loan',
      other: 'Loan',
    };
    const loanLabel = loanTypeLabels[loanType];

    // Create asset account (63xxx range)
    const { data: assetData, error: assetError } = await supabase
      .from('accounts')
      .insert({
        name: `RE – Asset ${dealNickname}`,
        code: assetCode,
        account_type_id: ACCOUNT_TYPE_IDS.ASSET,
        is_active: true,
        purpose_default: 'business',
      })
      .select('id')
      .single();

    if (assetError) throw assetError;

    // Create loan/mortgage liability account (64xxx range)
    const { data: loanData, error: loanError } = await supabase
      .from('accounts')
      .insert({
        name: `RE – ${loanLabel} ${dealNickname}`,
        code: loanCode,
        account_type_id: ACCOUNT_TYPE_IDS.LIABILITY,
        is_active: true,
        purpose_default: 'business',
      })
      .select('id')
      .single();

    if (loanError) throw loanError;

    return {
      assetAccountId: assetData.id,
      loanAccountId: loanData.id,
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────────────────────────

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    if (!nickname.trim()) {
      setError('Nickname is required.');
      return;
    }
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }

    // If financed, validate loan fields
    if (isFinanced) {
      const loanAmt = parseNumber(originalLoanAmount);
      const rate = parseNumber(interestRate);
      const term = parseNumber(loanTermMonths);

      if (!loanAmt || loanAmt <= 0) {
        setError('Original loan amount is required when financed.');
        return;
      }
      if (rate === null || rate < 0) {
        setError('Interest rate is required when financed.');
        return;
      }
      if (!term || term <= 0) {
        setError('Loan term (months) is required when financed.');
        return;
      }
      if (!closeDate) {
        setError('Close date is required for financed deals (used as loan start date).');
        return;
      }
    }

    setSaving(true);

    try {
      let assetAccountId: number | null = null;
      let loanAccountId: number | null = null;

      // Create accounts if financed
      if (isFinanced) {
        const accounts = await createDealAccounts(nickname.trim());
        assetAccountId = accounts.assetAccountId;
        loanAccountId = accounts.loanAccountId;
      }

      // Build notes with structured info
      let fullNotes = notes.trim();
      if (isFinanced && lenderName.trim()) {
        const lenderInfo = `Lender: ${lenderName.trim()}`;
        fullNotes = fullNotes ? `${lenderInfo}. ${fullNotes}` : lenderInfo;
      }

      // Build payload
      const payload: Record<string, any> = {
        type,
        status,
        nickname: nickname.trim(),
        address: address.trim(),
        purchase_price: parseNumber(purchasePrice),
        arv: parseNumber(arv),
        rehab_budget: parseNumber(rehabBudget),
        closing_costs_estimate: parseNumber(closingCostsEstimate),
        holding_costs_estimate: parseNumber(holdingCostsEstimate),
        rental_monthly_rent: parseNumber(rentalMonthlyRent),
        rental_monthly_mortgage: parseNumber(rentalMonthlyMortgage),
        rental_monthly_taxes: parseNumber(rentalMonthlyTaxes),
        rental_monthly_insurance: parseNumber(rentalMonthlyInsurance),
        rental_monthly_hoa: parseNumber(rentalMonthlyHoa),
        expected_assignment_fee: parseNumber(expectedAssignmentFee),
        actual_assignment_fee: parseNumber(actualAssignmentFee),
        start_date: startDate || null,
        close_date: closeDate || null,
        sell_date: sellDate || null,
        notes: fullNotes || null,
        // Financing fields
        original_loan_amount: isFinanced ? parseNumber(originalLoanAmount) : null,
        interest_rate: isFinanced ? parseNumber(interestRate) : null,
        loan_term_months: isFinanced ? parseNumber(loanTermMonths) : null,
        first_payment_date: isFinanced && firstPaymentDate ? firstPaymentDate : null,
        asset_account_id: assetAccountId,
        loan_account_id: loanAccountId,
      };

      const { data, error } = await supabase
        .from('real_estate_deals')
        .insert([payload])
        .select('id')
        .single();

      if (error) throw error;

      console.log('Created real estate deal', data);
      setSuccess(`Deal "${nickname}" saved successfully! Asset and loan accounts created.`);

      // Reset form
      setNickname('');
      setAddress('');
      setPurchasePrice('');
      setAssignmentFeePaid('');
      setArv('');
      setRehabBudget('');
      setClosingCostsEstimate('');
      setHoldingCostsEstimate('');
      setOriginalLoanAmount('');
      setRehabHoldback('');
      setInterestRate('');
      setLoanTermMonths('');
      setFirstPaymentDate('');
      setLenderName('');
      setCloseDate('');
      setSellDate('');
      setRentalMonthlyRent('');
      setRentalMonthlyMortgage('');
      setRentalMonthlyTaxes('');
      setRentalMonthlyInsurance('');
      setRentalMonthlyHoa('');
      setExpectedAssignmentFee('');
      setActualAssignmentFee('');
      setNotes('');
      setIsFinanced(false);

      onCreated?.();
    } catch (err: unknown) {
      console.error('Error saving deal:', err);
      setError(err instanceof Error ? err.message : 'Failed to save deal.');
    } finally {
      setSaving(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────

  const labelStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: 14,
  };

  const sectionStyle: React.CSSProperties = {
    gridColumn: '1 / span 2',
    fontWeight: 600,
    fontSize: 14,
    color: '#555',
    borderBottom: '1px solid #ddd',
    paddingBottom: '0.25rem',
    marginTop: '0.75rem',
  };

  const summaryCardStyle: React.CSSProperties = {
    gridColumn: '1 / span 2',
    background: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: 8,
    padding: '1rem',
    marginTop: '0.5rem',
  };

  const summaryRowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: 13,
    padding: '0.25rem 0',
  };

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>New Real Estate Deal</h2>

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

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem 1rem',
        }}
      >
        {/* ───────────── CORE INFO ───────────── */}
        <label style={labelStyle}>
          Deal type
          <select value={type} onChange={(e) => setType(e.target.value as DealType)}>
            <option value="flip">Flip</option>
            <option value="rental">Rental</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </label>

        <label style={labelStyle}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as DealStatus)}>
            <option value="active">Active (Underwriting)</option>
            <option value="in_contract">In Contract</option>
            <option value="rehab">Rehab</option>
            <option value="listed">Listed</option>
            <option value="under_contract">Under Contract (Sale)</option>
            <option value="stabilized">Stabilized</option>
            <option value="sold">Sold</option>
            <option value="failed">Failed / Dead</option>
          </select>
        </label>

        <label style={labelStyle}>
          Nickname
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="e.g. 1437 Stoneleigh"
          />
        </label>

        <label style={labelStyle}>
          Address
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, City, State ZIP"
          />
        </label>

        {/* ───────────── DATES ───────────── */}
        <div style={sectionStyle}>Dates</div>

        <label style={labelStyle}>
          Start date (underwriting)
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Close date (acquisition)
          <input
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </label>

        {type === 'flip' && (
          <label style={labelStyle}>
            Sell date (if sold)
            <input
              type="date"
              value={sellDate}
              onChange={(e) => setSellDate(e.target.value)}
            />
          </label>
        )}

        {/* ───────────── ACQUISITION COSTS ───────────── */}
        <div style={sectionStyle}>Acquisition</div>

        <label style={labelStyle}>
          Purchase price (to seller)
          <input
            type="number"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            placeholder="e.g. 146000"
          />
        </label>

        {type === 'flip' && (
          <label style={labelStyle}>
            Assignment fee paid (to wholesaler)
            <input
              type="number"
              step="0.01"
              value={assignmentFeePaid}
              onChange={(e) => setAssignmentFeePaid(e.target.value)}
              placeholder="e.g. 16000"
            />
            <span style={{ fontSize: 11, color: '#888' }}>
              If buying from wholesaler, enter their fee here
            </span>
          </label>
        )}

        <label style={labelStyle}>
          ARV (After Repair Value)
          <input
            type="number"
            step="0.01"
            value={arv}
            onChange={(e) => setArv(e.target.value)}
            placeholder="e.g. 350000"
          />
        </label>

        {(type === 'flip' || type === 'rental') && (
          <>
            <label style={labelStyle}>
              Rehab budget
              <input
                type="number"
                step="0.01"
                value={rehabBudget}
                onChange={(e) => setRehabBudget(e.target.value)}
                placeholder="e.g. 88200"
              />
            </label>

            <label style={labelStyle}>
              Closing costs estimate
              <input
                type="number"
                step="0.01"
                value={closingCostsEstimate}
                onChange={(e) => setClosingCostsEstimate(e.target.value)}
                placeholder="e.g. 20000"
              />
            </label>

            <label style={labelStyle}>
              Holding costs estimate (monthly × months)
              <input
                type="number"
                step="0.01"
                value={holdingCostsEstimate}
                onChange={(e) => setHoldingCostsEstimate(e.target.value)}
                placeholder="e.g. 25000"
              />
            </label>
          </>
        )}

        {/* ───────────── FINANCING ───────────── */}
        <div style={sectionStyle}>Financing</div>

        <label
          style={{
            ...labelStyle,
            gridColumn: '1 / span 2',
            flexDirection: 'row',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <input
            type="checkbox"
            checked={isFinanced}
            onChange={(e) => setIsFinanced(e.target.checked)}
          />
          This deal is financed (mortgage / hard money / HELOC)
        </label>

        {isFinanced && (
          <>
            <label style={labelStyle}>
              Loan type
              <select value={loanType} onChange={(e) => setLoanType(e.target.value as LoanType)}>
                <option value="hard_money">Hard Money</option>
                <option value="conventional">Conventional Mortgage</option>
                <option value="heloc">HELOC</option>
                <option value="private">Private Lender</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label style={labelStyle}>
              Lender name
              <input
                type="text"
                value={lenderName}
                onChange={(e) => setLenderName(e.target.value)}
                placeholder="e.g. Silliman Private Lending LLC"
              />
            </label>

            <label style={labelStyle}>
              Total loan amount
              <input
                type="number"
                step="0.01"
                value={originalLoanAmount}
                onChange={(e) => setOriginalLoanAmount(e.target.value)}
                placeholder="e.g. 216423"
              />
            </label>

            {(loanType === 'hard_money' || loanType === 'private') && (
              <label style={labelStyle}>
                Rehab holdback (in escrow)
                <input
                  type="number"
                  step="0.01"
                  value={rehabHoldback}
                  onChange={(e) => setRehabHoldback(e.target.value)}
                  placeholder="e.g. 88200"
                />
                <span style={{ fontSize: 11, color: '#888' }}>
                  Amount held by lender for rehab draws
                </span>
              </label>
            )}

            <label style={labelStyle}>
              Interest rate (%)
              <input
                type="number"
                step="0.125"
                min="0"
                max="30"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="e.g. 11.0"
              />
            </label>

            <label style={labelStyle}>
              Loan term (months)
              <input
                type="number"
                step="1"
                min="1"
                value={loanTermMonths}
                onChange={(e) => setLoanTermMonths(e.target.value)}
                placeholder="e.g. 12"
              />
            </label>

            <label style={labelStyle}>
              First payment date
              <input
                type="date"
                value={firstPaymentDate}
                onChange={(e) => setFirstPaymentDate(e.target.value)}
              />
            </label>

            <label
              style={{
                ...labelStyle,
                flexDirection: 'row',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <input
                type="checkbox"
                checked={isInterestOnly}
                onChange={(e) => setIsInterestOnly(e.target.checked)}
              />
              Interest-only payments
            </label>

            {/* Loan summary */}
            {loanAmountNum > 0 && (
              <div style={{ ...summaryCardStyle, background: '#e3f2fd', borderColor: '#90caf9' }}>
                <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1565c0' }}>
                  Loan Breakdown
                </div>
                <div style={summaryRowStyle}>
                  <span>Total Loan Amount:</span>
                  <span>{formatCurrency(loanAmountNum)}</span>
                </div>
                {rehabHoldbackNum > 0 && (
                  <>
                    <div style={summaryRowStyle}>
                      <span>Less: Rehab Holdback:</span>
                      <span>({formatCurrency(rehabHoldbackNum)})</span>
                    </div>
                    <div style={{ ...summaryRowStyle, fontWeight: 600, borderTop: '1px solid #90caf9', paddingTop: '0.5rem' }}>
                      <span>Loan to Closing Table:</span>
                      <span>{formatCurrency(loanToClosingTable)}</span>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ───────────── RENTAL OPERATIONS ───────────── */}
        {type === 'rental' && (
          <>
            <div style={sectionStyle}>Rental Operations</div>

            <label style={labelStyle}>
              Monthly rent (target/actual)
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyRent}
                onChange={(e) => setRentalMonthlyRent(e.target.value)}
              />
            </label>

            <label style={labelStyle}>
              Monthly mortgage payment
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyMortgage}
                onChange={(e) => setRentalMonthlyMortgage(e.target.value)}
              />
            </label>

            <label style={labelStyle}>
              Monthly taxes
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyTaxes}
                onChange={(e) => setRentalMonthlyTaxes(e.target.value)}
              />
            </label>

            <label style={labelStyle}>
              Monthly insurance
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyInsurance}
                onChange={(e) => setRentalMonthlyInsurance(e.target.value)}
              />
            </label>

            <label style={labelStyle}>
              Monthly HOA (optional)
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyHoa}
                onChange={(e) => setRentalMonthlyHoa(e.target.value)}
              />
            </label>
          </>
        )}

        {/* ───────────── WHOLESALE (when YOU are wholesaling) ───────────── */}
        {type === 'wholesale' && (
          <>
            <div style={sectionStyle}>Assignment Fee (Your Fee)</div>

            <label style={labelStyle}>
              Expected assignment fee
              <input
                type="number"
                step="0.01"
                value={expectedAssignmentFee}
                onChange={(e) => setExpectedAssignmentFee(e.target.value)}
              />
            </label>

            <label style={labelStyle}>
              Actual assignment fee
              <input
                type="number"
                step="0.01"
                value={actualAssignmentFee}
                onChange={(e) => setActualAssignmentFee(e.target.value)}
              />
            </label>
          </>
        )}

        {/* ───────────── DEAL SUMMARY (Flip) ───────────── */}
        {type === 'flip' && (purchasePriceNum > 0 || arvNum > 0) && (
          <div style={{
            ...summaryCardStyle,
            background: estimatedProfit >= 0 ? '#e8f5e9' : '#ffebee',
            borderColor: estimatedProfit >= 0 ? '#a5d6a7' : '#ef9a9a',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: estimatedProfit >= 0 ? '#2e7d32' : '#c62828' }}>
              Deal Analysis (Estimated)
            </div>
            
            <div style={summaryRowStyle}>
              <span>Purchase Price:</span>
              <span>{formatCurrency(purchasePriceNum)}</span>
            </div>
            {assignmentFeeNum > 0 && (
              <div style={summaryRowStyle}>
                <span>+ Assignment Fee:</span>
                <span>{formatCurrency(assignmentFeeNum)}</span>
              </div>
            )}
            <div style={{ ...summaryRowStyle, fontWeight: 500 }}>
              <span>= Total Acquisition:</span>
              <span>{formatCurrency(totalAcquisitionCost)}</span>
            </div>
            
            <div style={{ borderTop: '1px solid #ccc', margin: '0.5rem 0' }} />
            
            <div style={summaryRowStyle}>
              <span>+ Rehab Budget:</span>
              <span>{formatCurrency(rehabBudgetNum)}</span>
            </div>
            <div style={summaryRowStyle}>
              <span>+ Closing Costs:</span>
              <span>{formatCurrency(closingCostsNum)}</span>
            </div>
            <div style={summaryRowStyle}>
              <span>+ Holding Costs:</span>
              <span>{formatCurrency(holdingCostsNum)}</span>
            </div>
            <div style={{ ...summaryRowStyle, fontWeight: 600 }}>
              <span>= Est. Cost Basis:</span>
              <span>{formatCurrency(estimatedCostBasis)}</span>
            </div>
            
            <div style={{ borderTop: '1px solid #ccc', margin: '0.5rem 0' }} />
            
            <div style={summaryRowStyle}>
              <span>ARV:</span>
              <span>{formatCurrency(arvNum)}</span>
            </div>
            <div style={summaryRowStyle}>
              <span>- Cost Basis:</span>
              <span>({formatCurrency(estimatedCostBasis)})</span>
            </div>
            <div style={summaryRowStyle}>
              <span>- Selling Costs (~8%):</span>
              <span>({formatCurrency(estimatedSellingCosts)})</span>
            </div>
            <div style={{ 
              ...summaryRowStyle, 
              fontWeight: 700, 
              fontSize: 15,
              color: estimatedProfit >= 0 ? '#2e7d32' : '#c62828',
              borderTop: '1px solid #ccc',
              paddingTop: '0.5rem',
            }}>
              <span>= Est. Profit:</span>
              <span>{formatCurrency(estimatedProfit)} ({estimatedMargin.toFixed(1)}%)</span>
            </div>

            {isFinanced && estimatedCashToClose > 0 && (
              <div style={{ ...summaryRowStyle, marginTop: '0.5rem', color: '#555' }}>
                <span>Est. Cash to Close:</span>
                <span>{formatCurrency(estimatedCashToClose)}</span>
              </div>
            )}
          </div>
        )}

        {/* ───────────── NOTES ───────────── */}
        <label style={{ ...labelStyle, gridColumn: '1 / span 2' }}>
          Notes
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Additional details, maturity date, special terms, etc."
          />
        </label>

        {/* ───────────── SUBMIT ───────────── */}
        <div
          style={{
            gridColumn: '1 / span 2',
            textAlign: 'right',
            marginTop: '0.5rem',
          }}
        >
          <button type="submit" disabled={saving} style={{ padding: '0.5rem 1.5rem' }}>
            {saving ? 'Saving…' : 'Save Deal'}
          </button>
        </div>
      </form>
    </div>
  );
}
