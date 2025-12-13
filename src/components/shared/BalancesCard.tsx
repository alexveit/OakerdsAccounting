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
// HELPER
// ------------------------------------------------------------

function sortAccounts(accounts: AccountBalance[]): AccountBalance[] {
  return [...accounts].sort((a, b) => {
    const codeA = a.account_code ?? '';
    const codeB = b.account_code ?? '';
    return codeA.localeCompare(codeB) || a.account_name.localeCompare(b.account_name);
  });
}

/** Returns appropriate color class based on value sign */
function amountColorClass(value: number, forceNegative = false): string {
  if (forceNegative) return 'text-danger';
  return value >= 0 ? 'text-success' : 'text-danger';
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
  // NOTE: Liability balances from account_balances_v are POSITIVE when money is owed
  // (the view handles the sign flip for credit-normal accounts)
  const totalCash = cashAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalBizCards = bizCardAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalPersonalCards = personalCardAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalPersonalDebt = personalDebtAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalHELOC = helocAccounts.reduce((sum, a) => sum + a.balance, 0);
  const totalAllCards = totalBizCards + totalPersonalCards;
  const totalAllLiabilities = totalAllCards + totalHELOC + totalPersonalDebt;

  // Net calculations (liabilities are positive, so we subtract them)
  const liquidNet = totalCash - totalAllLiabilities;
  const netWorth = liquidNet + reEquity;

  const currency = (val: number, decimals = 0) => formatCurrency(val, decimals);

  // Loading state
  if (loading) {
    return (
      <div className="card" style={{ minWidth }}>
        <h3 className="mt-0 mb-1h">Balances</h3>
        <p className="text-base text-muted">Loading...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="card" style={{ minWidth }}>
        <h3 className="mt-0 mb-1h">Balances</h3>
        <p className="text-base text-danger">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="card" style={{ minWidth }}>
      <h3 className="mt-0 mb-1h">Balances</h3>

      {/* Cash & Banks */}
      <div className="balance-section-label">Assets</div>
      {cashAccounts.map((acc) => (
        <div key={acc.account_id} className="balance-row">
          <span className="balance-account-name">{acc.account_name}</span>
          <span className={amountColorClass(acc.balance)}>
            {currency(acc.balance, 2)}
          </span>
        </div>
      ))}
      <div className="balance-row balance-row--subtotal">
        <span>Cash Total</span>
        <span className={amountColorClass(totalCash)}>
          {currency(totalCash)}
        </span>
      </div>

      <div className="balance-divider" />

      {/* Business Cards */}
      <div className="balance-section-label">Business Cards</div>
      {bizCardAccounts.map((acc) => (
        <div key={acc.account_id} className="balance-row">
          <span className="balance-account-name">{acc.account_name}</span>
          <span className="text-danger">{currency(acc.balance, 2)}</span>
        </div>
      ))}

      <div className="balance-divider" />

      {/* Personal Cards */}
      {personalCardAccounts.length > 0 && (
        <>
          <div className="balance-section-label">Personal Cards</div>
          {personalCardAccounts.map((acc) => (
            <div key={acc.account_id} className="balance-row">
              <span className="balance-account-name">{acc.account_name}</span>
              <span className="text-danger">{currency(acc.balance, 2)}</span>
            </div>
          ))}
        </>
      )}

      <div className="balance-row balance-row--subtotal">
        <span>Cards Total</span>
        <span className="text-danger">{currency(totalAllCards)}</span>
      </div>

      {/* HELOC */}
      {helocAccounts.length > 0 && (
        <>
          <div className="balance-divider" />
          <div className="balance-section-label">Lines of Credit</div>
          {helocAccounts.map((acc) => (
            <div key={acc.account_id} className="balance-row">
              <span className="balance-account-name">{acc.account_name}</span>
              <span className="text-danger">{currency(acc.balance, 2)}</span>
            </div>
          ))}
        </>
      )}

      {/* Personal Debt */}
      {personalDebtAccounts.length > 0 && (
        <>
          <div className="balance-divider" />
          <div className="balance-section-label">Personal Debt</div>
          {personalDebtAccounts.map((acc) => (
            <div key={acc.account_id} className="balance-row">
              <span className="balance-account-name">{acc.account_name}</span>
              <span className="text-danger">{currency(acc.balance, 2)}</span>
            </div>
          ))}
        </>
      )}

      {/* Net Worth section (optional) */}
      {showNetWorth && (
        <>
          <div className="balance-divider--thick" />

          <div className="balance-row balance-row--subtotal">
            <span>Liabilities Total</span>
            <span className="text-danger">{currency(totalAllLiabilities)}</span>
          </div>

          <div className="balance-row balance-row--total">
            <span>Liquid Net</span>
            <span className={amountColorClass(liquidNet)}>
              {currency(Math.abs(liquidNet))}
            </span>
          </div>

          <div className="balance-row">
            <span>RE Equity</span>
            <span className={amountColorClass(reEquity)}>
              {currency(reEquity)}
            </span>
          </div>

          <div className="balance-divider" />

          <div className="balance-row balance-row--grand">
            <span>Net Worth</span>
            <span className={amountColorClass(netWorth)}>
              {currency(netWorth)}
            </span>
          </div>
        </>
      )}

      {/* Simple liabilities total (when not showing net worth) */}
      {!showNetWorth && (
        <>
          <div className="balance-divider--thick" />
          <div className="balance-row balance-row--subtotal">
            <span>Liabilities Total</span>
            <span className="text-danger">{currency(totalAllLiabilities)}</span>
          </div>
        </>
      )}
    </div>
  );
}
