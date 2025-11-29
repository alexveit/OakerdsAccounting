// src/components/MortgageInput.tsx
import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react';
import { supabase } from '../lib/supabaseClient';
import { todayLocalISO } from '../utils/date';

type Account = {
  id: number;
  name: string;
  code: string | null;
  account_type_id: number;
  account_types: {
    name: string;
    normal_side: string;
  } | null;
  purpose_default: 'business' | 'personal' | 'mixed';
};

type RealEstateDeal = {
  id: number;
  nickname: string;
  address: string | null;
  type: string | null;
  status: string | null;
  loan_account_id: number | null;
};

type MortgagePreview = {
  dealNickname: string;
  total: number;
  principal: number;
  interest: number;
  escrow: number;
};

type MortgageInputProps = {
  onTransactionSaved?: () => void;
};

export function MortgageInput({ onTransactionSaved }: MortgageInputProps) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [realEstateDeals, setRealEstateDeals] = useState<RealEstateDeal[]>([]);

  const [date, setDate] = useState<string>(todayLocalISO());
  const [description, setDescription] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [cashAccountId, setCashAccountId] = useState<string>('');
  const [dealId, setDealId] = useState<string>('');

  const [mortgageInterest, setMortgageInterest] = useState<string>('');
  const [mortgageEscrow, setMortgageEscrow] = useState<string>('');
  const [isCleared, setIsCleared] = useState<boolean>(true);

  const [mortgagePreview, setMortgagePreview] = useState<MortgagePreview | null>(null);
  const [showMortgageModal, setShowMortgageModal] = useState(false);

  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // ---------- Helpers ----------

  function parseMoney(value: string): number {
    const trimmed = value.replace(/,/g, '').trim();
    if (!trimmed) return 0;
    const n = Number(trimmed);
    if (Number.isNaN(n)) return 0;
    return n;
  }

  function formatMoneyInput(value: string): string {
    const numeric = value.replace(/[^\d.]/g, '');
    if (!numeric) return '';
    const [intPart, decimalPart] = numeric.split('.');
    const safeInt = intPart.replace(/^0+(?=\d)/, '') || '0';

    let formatted = safeInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

    if (decimalPart !== undefined) {
      formatted += '.' + decimalPart.slice(0, 2);
    }

    return formatted;
  }

  function handleKeyDownPreventEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
    }
  }

  function purposeForAccount(accountId: number): 'business' | 'personal' | 'mixed' {
    const acc = accounts.find((a) => a.id === accountId);
    if (!acc) return 'business';
    return acc.purpose_default;
  }

  // ---------- Load accounts + deals ----------

  useEffect(() => {
    async function loadOptions() {
      try {
        setLoading(true);
        setError(null);

        const { data: accountsData, error: accountsError } = await supabase
          .from('accounts')
          .select(
            `
            id,
            name,
            code,
            account_type_id,
            purpose_default,
            account_types (
              name,
              normal_side
            )
          `
          )
          .order('code', { ascending: true })
          .order('name', { ascending: true });

        if (accountsError) throw accountsError;

        const normalizedAccounts: Account[] =
          accountsData?.map((a: any) => ({
            id: a.id,
            name: a.name,
            code: a.code,
            account_type_id: a.account_type_id,
            purpose_default: a.purpose_default ?? 'business',
            account_types: a.account_types
              ? {
                  name: a.account_types.name,
                  normal_side: a.account_types.normal_side,
                }
              : null,
          })) ?? [];

        setAccounts(normalizedAccounts);

        const { data: dealsData, error: dealsError } = await supabase
          .from('real_estate_deals')
          .select(
            `
            id,
            nickname,
            address,
            type,
            status,
            loan_account_id
          `
          )
          .order('status', { ascending: true }) // open before closed
          .order('id', { ascending: false }); // newest first

        if (dealsError) throw dealsError;

        const normalizedDeals: RealEstateDeal[] =
          dealsData?.map((d: any) => ({
            id: d.id,
            nickname: d.nickname,
            address: d.address,
            type: d.type,
            status: d.status,
            loan_account_id: d.loan_account_id,
          })) ?? [];

        setRealEstateDeals(normalizedDeals);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load options.');
      } finally {
        setLoading(false);
      }
    }

    void loadOptions();
  }, []);

  // ---------- Derived ----------

  const cashAccounts = accounts.filter((a) => {
    if (!a.account_types) return false;
    const t = a.account_types.name.toLowerCase();
    return (
      t.includes('cash') ||
      t.includes('bank') ||
      t.includes('checking') ||
      t.includes('savings') ||
      t.includes('credit card') ||
      t.includes('card')
    );
  });

  const totalPayment = parseMoney(amount);
  const interestNum = parseMoney(mortgageInterest);
  const escrowNum = parseMoney(mortgageEscrow);
  const computedPrincipal = Math.max(totalPayment - interestNum - escrowNum, 0);

  // ---------- Handlers ----------

  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatMoneyInput(e.target.value);
    setAmount(formatted);
  }

  function handleInterestChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatMoneyInput(e.target.value);
    setMortgageInterest(formatted);
  }

  function handleEscrowChange(e: React.ChangeEvent<HTMLInputElement>) {
    const formatted = formatMoneyInput(e.target.value);
    setMortgageEscrow(formatted);
  }

  async function handleBuildPreview(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!amount) {
      setError('Total mortgage payment amount is required.');
      return;
    }

    const numericAmount = parseMoney(amount);
    if (numericAmount <= 0) {
      setError('Amount must be greater than zero.');
      return;
    }

    if (!cashAccountId) {
      setError('Cash / bank account is required.');
      return;
    }

    if (!dealId) {
      setError('Real estate deal is required.');
      return;
    }

    const selectedDeal = realEstateDeals.find((d) => d.id === Number(dealId));
    if (!selectedDeal) {
      setError('Selected real estate deal not found.');
      return;
    }

    if (!selectedDeal.loan_account_id) {
      setError(
        'This real estate deal does not have a loan account linked (loan_account_id is null).'
      );
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
      return;
    }

    if (interestNum + escrowNum > numericAmount) {
      setError(
        'Interest + Escrow cannot be greater than the total mortgage payment.'
      );
      return;
    }

    setMortgagePreview({
      dealNickname: selectedDeal.nickname,
      total: numericAmount,
      principal: computedPrincipal,
      interest: interestNum,
      escrow: escrowNum,
    });

    setShowMortgageModal(true);
  }

  async function handleConfirmMortgageSplit() {
    if (!mortgagePreview) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const real_estate_deal_id = Number(dealId);
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
        setError('Cash / bank account is required.');
        setSaving(false);
        return;
      }

      const cashPurposeDefault = purposeForAccount(cash_id);
      // For mortgage splits, purpose comes from the cash account default
      let txPurpose: 'business' | 'personal' =
        cashPurposeDefault === 'personal' ? 'personal' : 'business';
      const cashPurpose = txPurpose;

      const {
        principal,
        interest: interestPortion,
        escrow: escrowPortion,
      } = mortgagePreview;

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

      // 3) Principal transaction: DR loan liability, CR cash
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
      setMortgageInterest('');
      setMortgageEscrow('');
      // keep deal + cash accounts selected so you can enter several months in a row

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
  }

  // ---------- Render ----------

  if (loading) {
    return <p>Loading mortgage options…</p>;
  }

  return (
    <div>
      <h2>Mortgage Payment</h2>

      {error && <p style={{ color: 'red' }}>{error}</p>}
      {success && <p style={{ color: 'green' }}>{success}</p>}

      <form onSubmit={handleBuildPreview}>
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <label>
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>

          <label>
            Total payment
            <input
              type="text"
              value={amount}
              onChange={handleAmountChange}
              onKeyDown={handleKeyDownPreventEnter}
              placeholder="0.00"
              required
            />
          </label>

          <label>
            Cash / bank / card
            <select
              value={cashAccountId}
              onChange={(e) => setCashAccountId(e.target.value)}
              required
            >
              <option value="">Select account</option>
              {cashAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.code ? `${acc.code} – ${acc.name}` : acc.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Cleared?
            <input
              type="checkbox"
              checked={isCleared}
              onChange={(e) => setIsCleared(e.target.checked)}
            />
          </label>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Description (optional)
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            style={{ width: '100%' }}
            placeholder="If blank, defaults to Mortgage interest/escrow/principal – deal name"
          />
        </div>

        <div
          style={{
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap',
            marginTop: '1rem',
          }}
        >
          <label>
            Real estate deal
            <select
              value={dealId}
              onChange={(e) => setDealId(e.target.value)}
              required
            >
              <option value="">Select deal</option>
              {realEstateDeals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.nickname}
                  {d.address ? ` – ${d.address}` : ''}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontWeight: 'bold' }}>
            Split details (per your amortization / statement)
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <label>
              Interest portion
              <input
                type="text"
                value={mortgageInterest}
                onChange={handleInterestChange}
                onKeyDown={handleKeyDownPreventEnter}
                placeholder="0.00"
              />
            </label>
            <label>
              Escrow (taxes + insurance)
              <input
                type="text"
                value={mortgageEscrow}
                onChange={handleEscrowChange}
                onKeyDown={handleKeyDownPreventEnter}
                placeholder="0.00"
              />
            </label>
            <div style={{ alignSelf: 'flex-end' }}>
              <strong>
                Principal (auto): ${computedPrincipal.toFixed(2)}
              </strong>
            </div>
          </div>
        </div>

        <div style={{ marginTop: '1.5rem' }}>
          <button type="submit" disabled={saving}>
            {saving ? 'Building preview…' : 'Preview Split'}
          </button>
        </div>
      </form>

      {/* Mortgage review modal */}
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
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            }}
          >
            <h2 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Mortgage Payment Split
            </h2>
            <p style={{ margin: 0, marginBottom: '0.5rem' }}>
              <strong>Deal:</strong> {mortgagePreview.dealNickname}
            </p>
            <p style={{ margin: 0, marginBottom: '0.5rem' }}>
              <strong>Total payment:</strong> $
              {mortgagePreview.total.toFixed(2)}
            </p>

            <table
              style={{
                width: '100%',
                marginTop: '0.75rem',
                marginBottom: '0.75rem',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      paddingBottom: '0.25rem',
                    }}
                  >
                    Component
                  </th>
                  <th
                    style={{
                      textAlign: 'right',
                      paddingBottom: '0.25rem',
                    }}
                  >
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Interest</td>
                  <td style={{ textAlign: 'right' }}>
                    ${mortgagePreview.interest.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td>Escrow (taxes + insurance)</td>
                  <td style={{ textAlign: 'right' }}>
                    ${mortgagePreview.escrow.toFixed(2)}
                  </td>
                </tr>
                <tr>
                  <td>Principal</td>
                  <td style={{ textAlign: 'right' }}>
                    ${mortgagePreview.principal.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>

            <p style={{ fontSize: '0.85rem', marginBottom: '0.75rem' }}>
              This will create three separate double-entry transactions:
              interest expense, escrow asset, and loan principal, all paid
              from the selected cash account.
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
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMortgageSplit}
                disabled={saving}
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
