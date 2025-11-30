import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

type DealType = 'rental' | 'flip' | 'wholesale';
type DealStatus = 'active' | 'in_contract' | 'rehab' | 'stabilized' | 'sold' | 'failed';

type Props = {
  onCreated?: () => void;
};

export function NewRealEstateDealForm({ onCreated }: Props) {
  // Core deal info
  const [type, setType] = useState<DealType>('rental');
  const [status, setStatus] = useState<DealStatus>('active');
  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');

  // Dates
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [closeDate, setCloseDate] = useState('');
  const [sellDate, setSellDate] = useState('');

  // Economics
  const [purchasePrice, setPurchasePrice] = useState('');
  const [arv, setArv] = useState('');
  const [rehabBudget, setRehabBudget] = useState('');
  const [closingCostsEstimate, setClosingCostsEstimate] = useState('');

  // Financing (conditionally shown)
  const [isFinanced, setIsFinanced] = useState(false);
  const [originalLoanAmount, setOriginalLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [loanTermMonths, setLoanTermMonths] = useState('');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');

  // Rental operations
  const [rentalMonthlyRent, setRentalMonthlyRent] = useState('');
  const [rentalMonthlyMortgage, setRentalMonthlyMortgage] = useState('');
  const [rentalMonthlyTaxes, setRentalMonthlyTaxes] = useState('');
  const [rentalMonthlyInsurance, setRentalMonthlyInsurance] = useState('');
  const [rentalMonthlyHoa, setRentalMonthlyHoa] = useState('');

  // Wholesale / assignment
  const [expectedAssignmentFee, setExpectedAssignmentFee] = useState('');
  const [actualAssignmentFee, setActualAssignmentFee] = useState('');

  // Notes
  const [notes, setNotes] = useState('');

  // UI state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  function parseNumber(val: string): number | null {
    if (!val.trim()) return null;
    const n = Number(val);
    return Number.isNaN(n) ? null : n;
  }

  /**
   * Queries the accounts table for the highest code in the 63xxx range,
   * then returns the next available code as a string.
   */
  async function getNextAccountCode(): Promise<string> {
    const { data, error } = await supabase
      .from('accounts')
      .select('code')
      .gte('code', '63000')
      .lt('code', '64000')
      .order('code', { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!data || data.length === 0) {
      // No accounts in range yet, start at 63001
      return '63001';
    }

    const maxCode = parseInt(data[0].code, 10);
    return String(maxCode + 1);
  }

  /**
   * Creates the RE asset and loan accounts for this deal.
   * Returns { assetAccountId, loanAccountId }.
   */
  async function createDealAccounts(dealNickname: string): Promise<{
    assetAccountId: number;
    loanAccountId: number;
  }> {
    const nextCode = await getNextAccountCode();
    const assetCode = nextCode;
    const loanCode = String(parseInt(nextCode, 10) + 1);

    // Create asset account
    const { data: assetData, error: assetError } = await supabase
      .from('accounts')
      .insert({
        name: `RE – Asset ${dealNickname}`,
        code: assetCode,
        account_type_id: 1, // asset
        is_active: true,
        purpose_default: 'business',
      })
      .select('id')
      .single();

    if (assetError) throw assetError;

    // Create loan/mortgage liability account
    const { data: loanData, error: loanError } = await supabase
      .from('accounts')
      .insert({
        name: `RE – Mortgage ${dealNickname}`,
        code: loanCode,
        account_type_id: 2, // liability
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
        notes: notes.trim() || null,
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
      setSuccess('Deal saved.');

      // Reset form (keep type & status)
      setNickname('');
      setAddress('');
      setPurchasePrice('');
      setArv('');
      setRehabBudget('');
      setClosingCostsEstimate('');
      setRentalMonthlyRent('');
      setRentalMonthlyMortgage('');
      setRentalMonthlyTaxes('');
      setRentalMonthlyInsurance('');
      setRentalMonthlyHoa('');
      setExpectedAssignmentFee('');
      setActualAssignmentFee('');
      setCloseDate('');
      setSellDate('');
      setNotes('');
      setIsFinanced(false);
      setOriginalLoanAmount('');
      setInterestRate('');
      setLoanTermMonths('');
      setFirstPaymentDate('');

      if (onCreated) onCreated();
    } catch (err: any) {
      console.error('Error creating real estate deal', err);
      setError(err.message ?? 'Failed to create real estate deal.');
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
    fontSize: 13,
  };

  const sectionStyle: React.CSSProperties = {
    gridColumn: '1 / span 2',
    fontSize: 12,
    fontWeight: 600,
    color: '#666',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginTop: '0.75rem',
    marginBottom: '-0.25rem',
    borderBottom: '1px solid #e0e0e0',
    paddingBottom: '0.25rem',
  };

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
        New Property Purchase / Deal
      </h3>

      {error && (
        <p style={{ color: 'red', fontSize: 13, marginTop: 0 }}>{error}</p>
      )}
      {success && (
        <p style={{ color: 'green', fontSize: 13, marginTop: 0 }}>{success}</p>
      )}

      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
        }}
      >
        {/* ───────────── BASICS ───────────── */}
        <label style={labelStyle}>
          Deal type
          <select value={type} onChange={(e) => setType(e.target.value as DealType)}>
            <option value="rental">Rental</option>
            <option value="flip">Flip</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </label>

        <label style={labelStyle}>
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value as DealStatus)}>
            <option value="active">Active</option>
            <option value="in_contract">In Contract</option>
            <option value="rehab">Rehab</option>
            <option value="stabilized">Stabilized</option>
            <option value="sold">Sold</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        <label style={{ ...labelStyle, gridColumn: '1 / span 2' }}>
          Nickname
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="3441 Antioch Rental, Lithonia Flip, etc."
          />
        </label>

        <label style={{ ...labelStyle, gridColumn: '1 / span 2' }}>
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
          Close date
          <input
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Sell date (for flips)
          <input
            type="date"
            value={sellDate}
            onChange={(e) => setSellDate(e.target.value)}
          />
        </label>

        {/* ───────────── ECONOMICS ───────────── */}
        <div style={sectionStyle}>Economics</div>

        <label style={labelStyle}>
          Purchase price
          <input
            type="number"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          ARV (optional)
          <input
            type="number"
            step="0.01"
            value={arv}
            onChange={(e) => setArv(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Rehab budget (optional)
          <input
            type="number"
            step="0.01"
            value={rehabBudget}
            onChange={(e) => setRehabBudget(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Closing costs estimate (optional)
          <input
            type="number"
            step="0.01"
            value={closingCostsEstimate}
            onChange={(e) => setClosingCostsEstimate(e.target.value)}
          />
        </label>

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
          This deal is financed (mortgage / hard money)
        </label>

        {isFinanced && (
          <>
            <label style={labelStyle}>
              Original loan amount
              <input
                type="number"
                step="0.01"
                value={originalLoanAmount}
                onChange={(e) => setOriginalLoanAmount(e.target.value)}
                placeholder="e.g. 180000"
              />
            </label>

            <label style={labelStyle}>
              Interest rate (%)
              <input
                type="number"
                step="0.125"
                min="0"
                max="30"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                placeholder="e.g. 7.5"
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
                placeholder="e.g. 360"
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

            <p style={{ fontSize: 12, color: '#888', margin: 0, gridColumn: '1 / span 2' }}>
              Asset and loan accounts will be auto-created on save. First payment date is used for accurate mortgage amortization calculations.
            </p>
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

        {/* ───────────── ASSIGNMENT FEES ───────────── */}
        <div style={sectionStyle}>Assignment / Sale</div>

        <label style={labelStyle}>
          Expected assignment fee (optional)
          <input
            type="number"
            step="0.01"
            value={expectedAssignmentFee}
            onChange={(e) => setExpectedAssignmentFee(e.target.value)}
          />
        </label>

        <label style={labelStyle}>
          Actual assignment fee (optional)
          <input
            type="number"
            step="0.01"
            value={actualAssignmentFee}
            onChange={(e) => setActualAssignmentFee(e.target.value)}
          />
        </label>

        {/* ───────────── NOTES ───────────── */}
        <label style={{ ...labelStyle, gridColumn: '1 / span 2' }}>
          Notes
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
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
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save Deal'}
          </button>
        </div>
      </form>
    </div>
  );
}