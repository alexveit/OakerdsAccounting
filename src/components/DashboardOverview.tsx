import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/format';
import {
  isBankCode,
  isCreditCardCode,
  isRentalIncomeCode,
  isMarketingExpenseCode,
  isRealEstateExpenseCode,
  type Purpose,
} from '../utils/accounts';

type AccountBalance = {
  account_id: number;
  account_name: string;
  account_code: string | null;
  account_type: string;
  balance: number;
};

type RealEstateDeal = {
  id: number;
  nickname: string;
  type: string;
  status: string;
  purchase_price: number | null;
  arv: number | null;
  original_loan_amount: number | null;
  asset_account_id: number | null;
  loan_account_id: number | null;
};

export function DashboardOverview() {
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [realEstateDeals, setRealEstateDeals] = useState<RealEstateDeal[]>([]);

  // Income totals computed directly from transaction_lines
  const [jobIncomeYtd, setJobIncomeYtd] = useState(0);
  const [rentalIncomeYtd, setRentalIncomeYtd] = useState(0);

  // Expense totals computed directly from transaction_lines (matching ExpensesSummary)
  const [jobExpenseYtd, setJobExpenseYtd] = useState(0);
  const [marketingExpenseYtd, setMarketingExpenseYtd] = useState(0);
  const [overheadExpenseYtd, setOverheadExpenseYtd] = useState(0);
  const [rentalExpenseYtd, setRentalExpenseYtd] = useState(0);
  const [personalExpenseYtd, setPersonalExpenseYtd] = useState(0);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboardData() {
    setLoading(true);
    setError(null);

    try {
      const currentYear = new Date().getFullYear();
      const startDate = `${currentYear}-01-01`;
      const endDate = `${currentYear}-12-31`;

      // Account balances
      const { data: balancesData, error: balancesErr } = await supabase
        .from('account_balances_v')
        .select('*');

      if (balancesErr) throw balancesErr;
      setAccountBalances((balancesData ?? []) as AccountBalance[]);

      // YTD transactions - query ALL cleared lines for the year (income + expense)
      const { data: allLines, error: linesErr } = await supabase
        .from('transaction_lines')
        .select(`
          id,
          account_id,
          amount,
          purpose,
          job_id,
          accounts!inner (
            code,
            account_types!inner ( name )
          ),
          transactions!inner ( date )
        `)
        .eq('is_cleared', true)
        .gte('transactions.date', startDate)
        .lte('transactions.date', endDate);

      if (linesErr) throw linesErr;

      // Categorize income and expenses
      let jobInc = 0;
      let rentalInc = 0;
      let jobExp = 0;
      let marketingExp = 0;
      let overheadExp = 0;
      let rentalExp = 0;
      let personalExp = 0;

      for (const line of (allLines ?? []) as any[]) {
        const amount = Math.abs(Number(line.amount) || 0);
        const purpose: Purpose = line.purpose ?? 'business';
        const accType = line.accounts?.account_types?.name;
        const code = line.accounts?.code ?? '';

        const isBusiness = purpose === 'business' || purpose === 'mixed';
        const isPersonal = purpose === 'personal';

        // INCOME categorization (matching TaxExportView)
        if (accType === 'income') {
          if (isBusiness) {
            if (isRentalIncomeCode(code)) {
              rentalInc += amount;
            } else {
              jobInc += amount;
            }
          }
        }

        // EXPENSE categorization (matching ExpensesSummary)
        else if (accType === 'expense') {
          if (isPersonal) {
            personalExp += amount;
          } else if (isBusiness && isRealEstateExpenseCode(code)) {
            rentalExp += amount;
          } else if (isBusiness && line.job_id !== null) {
            jobExp += amount;
          } else if (isBusiness && isMarketingExpenseCode(code)) {
            marketingExp += amount;
          } else if (isBusiness) {
            overheadExp += amount;
          }
        }
      }

      setJobIncomeYtd(jobInc);
      setRentalIncomeYtd(rentalInc);
      setJobExpenseYtd(jobExp);
      setMarketingExpenseYtd(marketingExp);
      setOverheadExpenseYtd(overheadExp);
      setRentalExpenseYtd(rentalExp);
      setPersonalExpenseYtd(personalExp);

      // Real estate deals
      const { data: dealsData, error: dealsErr } = await supabase
        .from('real_estate_deals')
        .select('id, nickname, type, status, purchase_price, arv, original_loan_amount, asset_account_id, loan_account_id')
        .in('status', ['active', 'stabilized', 'rehab']);

      if (dealsErr) throw dealsErr;
      setRealEstateDeals((dealsData ?? []) as RealEstateDeal[]);

      setLoading(false);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboardData();
  }, []);

  if (loading) return <p>Loading...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  // Sort accounts
  const sortAccounts = (accounts: AccountBalance[]) => {
    return [...accounts].sort((a, b) => {
      if (a.account_id === 1) return -1;
      if (b.account_id === 1) return 1;
      const codeA = a.account_code || a.account_name;
      const codeB = b.account_code || b.account_name;
      return codeA.localeCompare(codeB);
    });
  };

  const cashAccounts = sortAccounts(accountBalances.filter((acc) => isBankCode(acc.account_code)));
  const cardAccounts = sortAccounts(accountBalances.filter((acc) => isCreditCardCode(acc.account_code)));

  const totalCash = cashAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalCards = cardAccounts.reduce((sum, a) => sum + Number(a.balance), 0);

  // RE equity: use ARV if available, otherwise fall back to purchase_price
  const rePortfolio = realEstateDeals.map((deal) => {
    const loanAccount = accountBalances.find((a) => a.account_id === deal.loan_account_id);
    const mortgageAccountBalance = loanAccount ? Number(loanAccount.balance) : 0;
    const propertyValue = deal.arv ?? deal.purchase_price ?? 0;
    const originalLoan = deal.original_loan_amount ?? 0;
    const equity = propertyValue - originalLoan - mortgageAccountBalance;
    return { id: deal.id, nickname: deal.nickname, equity };
  });

  const totalEquity = rePortfolio.reduce((sum, p) => sum + p.equity, 0);
  const liquidNet = totalCash - totalCards;
  const totalNetWorth = liquidNet + totalEquity;

  // YTD totals
  const totalIncomeYtd = jobIncomeYtd + rentalIncomeYtd;
  const totalExpenseYtd = jobExpenseYtd + marketingExpenseYtd + overheadExpenseYtd + rentalExpenseYtd + personalExpenseYtd;
  const netYtd = totalIncomeYtd - totalExpenseYtd;

  const currency = (val: number, decimals = 0) => formatCurrency(val, decimals);

  const rowStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: 14,
  };

  const dividerStyle = {
    borderTop: '1px solid #e0e0e0',
    margin: '6px 0',
  };

  const thickDividerStyle = {
    borderTop: '2px solid #ccc',
    margin: '8px 0',
  };

  const subtotalStyle = {
    ...rowStyle,
    fontWeight: 600,
    color: '#555',
  };

  const totalStyle = {
    ...rowStyle,
    fontWeight: 700,
    fontSize: 15,
  };

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Dashboard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', alignItems: 'start' }}>
      {/* YTD Snapshot Card */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>YTD Snapshot</h3>
        
        <div style={rowStyle}>
          <span>Job Income</span>
          <span style={{ color: '#0a7a3c' }}>{currency(jobIncomeYtd)}</span>
        </div>
        <div style={rowStyle}>
          <span>Rental Income</span>
          <span style={{ color: '#0a7a3c' }}>{currency(rentalIncomeYtd)}</span>
        </div>
        
        <div style={dividerStyle} />
        
        <div style={rowStyle}>
          <span>Job Expenses</span>
          <span style={{ color: '#b00020' }}>-{currency(jobExpenseYtd)}</span>
        </div>
        <div style={rowStyle}>
          <span>Marketing</span>
          <span style={{ color: '#b00020' }}>-{currency(marketingExpenseYtd)}</span>
        </div>
        <div style={rowStyle}>
          <span>Overhead</span>
          <span style={{ color: '#b00020' }}>-{currency(overheadExpenseYtd)}</span>
        </div>
        <div style={rowStyle}>
          <span>Real Estate</span>
          <span style={{ color: '#b00020' }}>-{currency(rentalExpenseYtd)}</span>
        </div>
        <div style={rowStyle}>
          <span>Personal</span>
          <span style={{ color: '#b00020' }}>-{currency(personalExpenseYtd)}</span>
        </div>
        
        <div style={thickDividerStyle} />
        
        <div style={totalStyle}>
          <span>Net</span>
          <span style={{ color: netYtd >= 0 ? '#0a7a3c' : '#b00020' }}>
            {netYtd >= 0 ? '' : '-'}{currency(Math.abs(netYtd))}
          </span>
        </div>
      </div>

      {/* Balances Card */}
      <div className="card">
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Balances</h3>
        
        {/* Cash accounts */}
        {cashAccounts.map((acc) => (
          <div key={acc.account_id} style={rowStyle}>
            <span style={{ color: '#555' }}>{acc.account_name}</span>
            <span>{currency(Number(acc.balance), 2)}</span>
          </div>
        ))}
        
        <div style={dividerStyle} />
        
        <div style={subtotalStyle}>
          <span>Cash Total</span>
          <span>{currency(totalCash)}</span>
        </div>
        
        <div style={dividerStyle} />
        
        {/* Credit cards */}
        {cardAccounts.map((acc) => (
          <div key={acc.account_id} style={rowStyle}>
            <span style={{ color: '#555' }}>{acc.account_name}</span>
            <span style={{ color: Number(acc.balance) < 0 ? '#b00020' : undefined }}>
              {currency(Number(acc.balance), 2)}
            </span>
          </div>
        ))}
        
        <div style={dividerStyle} />
        
        <div style={subtotalStyle}>
          <span>Cards Total</span>
          <span style={{ color: totalCards < 0 ? '#b00020' : undefined }}>{currency(totalCards)}</span>
        </div>
        
        <div style={thickDividerStyle} />
        
        <div style={totalStyle}>
          <span>Liquid Net</span>
          <span style={{ color: liquidNet >= 0 ? '#0a7a3c' : '#b00020' }}>{currency(liquidNet)}</span>
        </div>
        
        <div style={rowStyle}>
          <span>RE Equity</span>
          <span style={{ color: totalEquity >= 0 ? '#0a7a3c' : '#b00020' }}>{currency(totalEquity)}</span>
        </div>
        
        <div style={dividerStyle} />
        
        <div style={{ ...totalStyle, fontSize: 16 }}>
          <span>Net Worth</span>
          <span style={{ color: totalNetWorth >= 0 ? '#0a7a3c' : '#b00020' }}>{currency(totalNetWorth)}</span>
        </div>
      </div>

      {/* RE Portfolio Card */}
      {rePortfolio.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Real Estate</h3>
          
          {rePortfolio.map((p) => (
            <div key={p.id} style={rowStyle}>
              <span style={{ color: '#555' }}>{p.nickname}</span>
              <span style={{ color: p.equity >= 0 ? '#0a7a3c' : '#b00020' }}>{currency(p.equity)}</span>
            </div>
          ))}
          
          {rePortfolio.length > 1 && (
            <>
              <div style={dividerStyle} />
              <div style={subtotalStyle}>
                <span>Total Equity</span>
                <span style={{ color: totalEquity >= 0 ? '#0a7a3c' : '#b00020' }}>{currency(totalEquity)}</span>
              </div>
            </>
          )}
        </div>
      )}
      </div>
    </div>
  );
}