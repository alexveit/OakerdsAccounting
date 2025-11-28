import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabaseClient';

type DealType = 'rental' | 'flip' | 'wholesale';
type DealStatus = 'active' | 'in_contract' | 'rehab' | 'stabilized' | 'sold' | 'failed';

type Props = {
  onCreated?: () => void;
};

export function NewRealEstateDealForm({ onCreated }: Props) {
  const [type, setType] = useState<DealType>('rental');
  const [status, setStatus] = useState<DealStatus>('active');

  const [nickname, setNickname] = useState('');
  const [address, setAddress] = useState('');

  const [purchasePrice, setPurchasePrice] = useState('');
  const [arv, setArv] = useState('');
  const [rehabBudget, setRehabBudget] = useState('');
  const [closingCostsEstimate, setClosingCostsEstimate] = useState('');

  const [rentalMonthlyRent, setRentalMonthlyRent] = useState('');
  const [rentalMonthlyMortgage, setRentalMonthlyMortgage] = useState('');
  const [rentalMonthlyTaxes, setRentalMonthlyTaxes] = useState('');
  const [rentalMonthlyInsurance, setRentalMonthlyInsurance] = useState('');
  const [rentalMonthlyHoa, setRentalMonthlyHoa] = useState('');

  const [expectedAssignmentFee, setExpectedAssignmentFee] = useState('');
  const [actualAssignmentFee, setActualAssignmentFee] = useState('');

  const [startDate, setStartDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [closeDate, setCloseDate] = useState('');
  const [sellDate, setSellDate] = useState('');

  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function parseNumber(val: string): number | null {
    if (!val.trim()) return null;
    const n = Number(val);
    return Number.isNaN(n) ? null : n;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!nickname.trim()) {
      setError('Nickname is required.');
      return;
    }
    if (!address.trim()) {
      setError('Address is required.');
      return;
    }

    setSaving(true);
    try {
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
      };

      const { data, error } = await supabase
        .from('real_estate_deals')
        .insert([payload])
        .select('id')
        .single();

      if (error) throw error;

      console.log('Created real estate deal', data);
      setSuccess('Deal saved.');

      // reset most fields, keep type & status
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

      if (onCreated) onCreated();
    } catch (err: any) {
      console.error('Error creating real estate deal', err);
      setError(err.message ?? 'Failed to create real estate deal.');
    } finally {
      setSaving(false);
    }
  }

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
        {/* Type + status */}
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          Deal type
          <select
            value={type}
            onChange={(e) => setType(e.target.value as DealType)}
          >
            <option value="rental">Rental</option>
            <option value="flip">Flip</option>
            <option value="wholesale">Wholesale</option>
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as DealStatus)}
          >
            <option value="active">Active</option>
            <option value="in_contract">In Contract</option>
            <option value="rehab">Rehab</option>
            <option value="stabilized">Stabilized</option>
            <option value="sold">Sold</option>
            <option value="failed">Failed</option>
          </select>
        </label>

        {/* Nickname + address */}
        <label
          style={{
            gridColumn: '1 / span 2',
            display: 'flex',
            flexDirection: 'column',
            fontSize: 13,
          }}
        >
          Nickname
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="3441 Antioch Rental, Lithonia Flip, etc."
          />
        </label>

        <label
          style={{
            gridColumn: '1 / span 2',
            display: 'flex',
            flexDirection: 'column',
            fontSize: 13,
          }}
        >
          Address
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Street, City, State ZIP"
          />
        </label>

        {/* Dates */}
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          Start date (underwriting)
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          Close date
          <input
            type="date"
            value={closeDate}
            onChange={(e) => setCloseDate(e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          Sell date (for flips)
          <input
            type="date"
            value={sellDate}
            onChange={(e) => setSellDate(e.target.value)}
          />
        </label>

        {/* Economics */}
        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          Purchase price
          <input
            type="number"
            step="0.01"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          ARV (optional)
          <input
            type="number"
            step="0.01"
            value={arv}
            onChange={(e) => setArv(e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          Rehab budget (optional)
          <input
            type="number"
            step="0.01"
            value={rehabBudget}
            onChange={(e) => setRehabBudget(e.target.value)}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
          Closing costs estimate (optional)
          <input
            type="number"
            step="0.01"
            value={closingCostsEstimate}
            onChange={(e) => setClosingCostsEstimate(e.target.value)}
          />
        </label>

        {/* Rental fields – only show if rental */}
        {type === 'rental' && (
          <>
            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 13,
              }}
            >
              Monthly rent (target/actual)
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyRent}
                onChange={(e) => setRentalMonthlyRent(e.target.value)}
              />
            </label>

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 13,
              }}
            >
              Monthly mortgage payment
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyMortgage}
                onChange={(e) => setRentalMonthlyMortgage(e.target.value)}
              />
            </label>

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 13,
              }}
            >
              Monthly taxes
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyTaxes}
                onChange={(e) => setRentalMonthlyTaxes(e.target.value)}
              />
            </label>

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 13,
              }}
            >
              Monthly insurance
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyInsurance}
                onChange={(e) => setRentalMonthlyInsurance(e.target.value)}
              />
            </label>

            <label
              style={{
                display: 'flex',
                flexDirection: 'column',
                fontSize: 13,
              }}
            >
              Monthly HOA
              <input
                type="number"
                step="0.01"
                value={rentalMonthlyHoa}
                onChange={(e) => setRentalMonthlyHoa(e.target.value)}
              />
            </label>
          </>
        )}

        {/* Wholesale-specific (and sometimes flip) fields */}
        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 13,
          }}
        >
          Expected assignment fee (optional)
          <input
            type="number"
            step="0.01"
            value={expectedAssignmentFee}
            onChange={(e) => setExpectedAssignmentFee(e.target.value)}
          />
        </label>

        <label
          style={{
            display: 'flex',
            flexDirection: 'column',
            fontSize: 13,
          }}
        >
          Actual assignment fee (optional)
          <input
            type="number"
            step="0.01"
            value={actualAssignmentFee}
            onChange={(e) => setActualAssignmentFee(e.target.value)}
          />
        </label>

        {/* Notes */}
        <label
          style={{
            gridColumn: '1 / span 2',
            display: 'flex',
            flexDirection: 'column',
            fontSize: 13,
          }}
        >
          Notes
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

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
