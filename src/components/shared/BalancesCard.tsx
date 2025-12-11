import type { CSSProperties } from 'react';
import { formatCurrency } from '../../utils/format';
import {
  isBankCode,
  isBusinessCardCode,
  isPersonalCardCode,
  isPersonalDebtCode,
  isHelocCode,
} from '../../utils/accounts';

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

export type AccountBalance = {
  account_id: number;
  account_name: string;
  account_code: string | null;
  account_type: string;
  balance: number;
};

export type BalancesCardProps = {
  accounts: AccountBalance[];
  loading?: boolean;
  error?: string | null;
  /** Show Liquid Net, RE Equity, Net Worth at bottom */
  showNetWorth?: boolean;
  /** RE Equity value (only used if showNetWorth is true) */
  reEquity?: number;
  /** Minimum width for the card */
  minWidth?: number;
};

// ------------------------------------------------------------
// STYLES
// ------------------------------------------------------------

const green = '#0a7a3c';
const red = '#b00020';

const rowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
  fontSize: 14,
};

const sectionLabelStyle: CSSProperties = {
  ...rowStyle,
  fontWeight: 600,
  fontSize: 12,
  color: '#888',
  marginTop: '4px',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const subtotalStyle: CSSProperties = {
  ...rowStyle,
  fontWeight: 600,
  color: '#555',
};

const totalStyle: CSSProperties = {
  ...rowStyle,
  fontWeight: 700,
  fontSize: 15,
};

const dividerStyle: CSSProperties = {
  borderTop: '1px solid #e0e0e0',
  margin: '6px 0',
};

const thickDividerStyle: CSSProperties = {
  borderTop: '2px solid #ccc',
  margin: '8px 0',
};

// ------------------------------------------------------------
// HELPER
// ------------------------------------------------------------

function sortAccounts(accounts: AccountBalance[]): AccountBalance[] {
  return [...accounts].sort((a, b) => {
    const codeA = a.account_code ?? '';
    const codeB = b.account_code ?? '';
    return codeA.localeCompare(codeB) || a.account_name.localeCompare(b.account_name);
  });
}

// ------------------------------------------------------------
// COMPONENT
// ------------------------------------------------------------

export function BalancesCard({
  accounts,
  loading = false,
  error = null,
  showNetWorth = false,
  reEquity = 0,
  minWidth = 280,
}: BalancesCardProps) {
  // Filter and sort accounts by type
  const cashAccounts = sortAccounts(accounts.filter((a) => isBankCode(a.account_code)));
  const bizCardAccounts = sortAccounts(accounts.filter((a) => isBusinessCardCode(a.account_code)));
  const personalCardAccounts = sortAccounts(accounts.filter((a) => isPersonalCardCode(a.account_code)));
  const personalDebtAccounts = sortAccounts(accounts.filter((a) => isPersonalDebtCode(a.account_code)));
  const helocAccounts = sortAccounts(accounts.filter((a) => isHelocCode(a.account_code)));

  // Calculate totals
  const totalCash = cashAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalBizCards = bizCardAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalPersonalCards = personalCardAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalPersonalDebt = personalDebtAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalHELOC = helocAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalAllCards = totalBizCards + totalPersonalCards;
  const totalAllLiabilities = totalAllCards + totalHELOC + totalPersonalDebt;

  // Net calculations
  const liquidNet = totalCash - totalAllLiabilities;
  const netWorth = liquidNet + reEquity;

  const currency = (val: number, decimals = 0) => formatCurrency(val, decimals);

  // Loading / error states
  if (loading) {
    return (
      <div className="card" style={{ minWidth }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Balances</h3>
        <p style={{ fontSize: 13, color: '#777' }}>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card" style={{ minWidth }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Balances</h3>
        <p style={{ color: 'red', fontSize: 13 }}>Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ minWidth }}>
      <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Balances</h3>

      {/* Cash & Banks */}
      <div style={sectionLabelStyle}><span>Assets</span></div>
      {cashAccounts.map((acc) => (
        <div key={acc.account_id} style={rowStyle}>
          <span style={{ color: '#555' }}>{acc.account_name}</span>
          <span style={{ color: acc.balance >= 0 ? green : red }}>
            {currency(acc.balance, 2)}
          </span>
        </div>
      ))}
      <div style={subtotalStyle}>
        <span>Cash Total</span>
        <span style={{ color: totalCash >= 0 ? green : red }}>
          {currency(totalCash)}
        </span>
      </div>

      <div style={dividerStyle} />

      {/* Business Cards */}
      <div style={sectionLabelStyle}><span>Business Cards</span></div>
      {bizCardAccounts.map((acc) => (
        <div key={acc.account_id} style={rowStyle}>
          <span style={{ color: '#555' }}>{acc.account_name}</span>
          <span style={{ color: red }}>{currency(acc.balance, 2)}</span>
        </div>
      ))}

      <div style={dividerStyle} />

      {/* Personal Cards */}
      {personalCardAccounts.length > 0 && (
        <>
          <div style={sectionLabelStyle}><span>Personal Cards</span></div>
          {personalCardAccounts.map((acc) => (
            <div key={acc.account_id} style={rowStyle}>
              <span style={{ color: '#555' }}>{acc.account_name}</span>
              <span style={{ color: red }}>{currency(acc.balance, 2)}</span>
            </div>
          ))}
        </>
      )}

      <div style={subtotalStyle}>
        <span>Cards Total</span>
        <span style={{ color: red }}>{currency(totalAllCards)}</span>
      </div>

      {/* HELOC */}
      {helocAccounts.length > 0 && (
        <>
          <div style={dividerStyle} />
          <div style={sectionLabelStyle}><span>Lines of Credit</span></div>
          {helocAccounts.map((acc) => (
            <div key={acc.account_id} style={rowStyle}>
              <span style={{ color: '#555' }}>{acc.account_name}</span>
              <span style={{ color: red }}>{currency(acc.balance, 2)}</span>
            </div>
          ))}
        </>
      )}

      {/* Personal Debt */}
      {personalDebtAccounts.length > 0 && (
        <>
          <div style={dividerStyle} />
          <div style={sectionLabelStyle}><span>Personal Debt</span></div>
          {personalDebtAccounts.map((acc) => (
            <div key={acc.account_id} style={rowStyle}>
              <span style={{ color: '#555' }}>{acc.account_name}</span>
              <span style={{ color: red }}>{currency(acc.balance, 2)}</span>
            </div>
          ))}
        </>
      )}

      {/* Net Worth section (optional) */}
      {showNetWorth && (
        <>
          <div style={thickDividerStyle} />

          <div style={subtotalStyle}>
            <span>Liabilities Total</span>
            <span style={{ color: red }}>{currency(totalAllLiabilities)}</span>
          </div>

          <div style={totalStyle}>
            <span>Liquid Net</span>
            <span style={{ color: liquidNet >= 0 ? green : red }}>
              {currency(Math.abs(liquidNet))}
            </span>
          </div>

          <div style={rowStyle}>
            <span>RE Equity</span>
            <span style={{ color: reEquity >= 0 ? green : red }}>
              {currency(reEquity)}
            </span>
          </div>

          <div style={dividerStyle} />

          <div style={{ ...totalStyle, fontSize: 16 }}>
            <span>Net Worth</span>
            <span style={{ color: netWorth >= 0 ? green : red }}>
              {currency(netWorth)}
            </span>
          </div>
        </>
      )}

      {/* Simple liabilities total (when not showing net worth) */}
      {!showNetWorth && (
        <>
          <div style={thickDividerStyle} />
          <div style={subtotalStyle}>
            <span>Liabilities Total</span>
            <span style={{ color: red }}>{currency(totalAllLiabilities)}</span>
          </div>
        </>
      )}
    </div>
  );
}
