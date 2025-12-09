import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/format';
import {
  isBankCode,
  isBusinessCardCode,
  isPersonalCardCode,
  isPersonalDebtCode,
  isHelocCode,
  classifyLine,
  type ClassifiableLineInput,
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
  rental_monthly_rent: number | null;
};

type Job = {
  id: number;
  status: string;
};

// -----------------------------------------------------------------------------------------------
// Account code helpers based on new structure:
//   1000-1099  Business Bank
//   1100-1199  Personal Bank
//   2000-2099  Business Cards
//   2100-2199  Personal Cards
//   2200-2299  Personal Debt
//   2300-2399  Lines of Credit (HELOC)
//   62005-62012 Rental expenses
//   62100-62199 Flip expenses
//   64xxx      RE Mortgages (not shown in liquid balances)
// -----------------------------------------------------------------------------------------------

export function DashboardOverview() {
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [realEstateDeals, setRealEstateDeals] = useState<RealEstateDeal[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);

  // Income totals
  const [jobIncomeYtd, setJobIncomeYtd] = useState(0);
  const [rentalIncomeYtd, setRentalIncomeYtd] = useState(0);

  // Expense totals
  const [jobExpenseYtd, setJobExpenseYtd] = useState(0);
  const [marketingExpenseYtd, setMarketingExpenseYtd] = useState(0);
  const [overheadExpenseYtd, setOverheadExpenseYtd] = useState(0);
  const [personalExpenseYtd, setPersonalExpenseYtd] = useState(0);
  const [rentalExpenseYtd, setRentalExpenseYtd] = useState(0);

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

      // Jobs for metrics (just count)
      const { data: jobsData, error: jobsErr } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('status', 'closed');
      
      if (jobsErr) throw jobsErr;
      setJobs((jobsData ?? []) as Job[]);

      // YTD transactions
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
        //.eq('is_cleared', true)
        .gte('transactions.date', startDate)
        .lte('transactions.date', endDate);

      if (linesErr) throw linesErr;

      // Categorize income and expenses
      let jobInc = 0;
      let rentalInc = 0;
      let jobExp = 0;
      let marketingExp = 0;
      let overheadExp = 0;
      let personalExp = 0;
      let rentalExp = 0;

      for (const line of (allLines ?? []) as ClassifiableLineInput[]) {
        const amount = Number(line.amount) || 0;
        const absAmount = Math.abs(amount);
        const classification = classifyLine(line);

        // INCOME (stored as negative/credits, so use absolute value)
        if (classification.incomeCategory) {
          if (classification.isBusiness) {
            if (classification.incomeCategory === 'rental') {
              rentalInc += absAmount;
            } else {
              jobInc += absAmount;
            }
          }
        }

        // EXPENSES (stored as positive/debits, use raw amount to allow refunds to subtract)
        if (classification.expenseCategory) {
          switch (classification.expenseCategory) {
            case 'personal':
              personalExp += amount;
              break;
            case 'rental':
              rentalExp += amount;
              break;
            case 'flip':
              // Flip expenses tracked separately, not shown in dashboard YTD
              // (they'll appear in ExpensesSummary view)
              break;
            case 'job':
              jobExp += amount;
              break;
            case 'marketing':
              marketingExp += amount;
              break;
            case 'overhead':
              overheadExp += amount;
              break;
          }
        }
      }

      setJobIncomeYtd(jobInc);
      setRentalIncomeYtd(rentalInc);
      setJobExpenseYtd(jobExp);
      setMarketingExpenseYtd(marketingExp);
      setOverheadExpenseYtd(overheadExp);
      setPersonalExpenseYtd(personalExp);
      setRentalExpenseYtd(rentalExp);

      // Real estate deals
      const { data: dealsData, error: dealsErr } = await supabase
        .from('real_estate_deals')
        .select('id, nickname, type, status, purchase_price, arv, original_loan_amount, asset_account_id, loan_account_id, rental_monthly_rent')
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

  // Sort accounts by code
  const sortAccounts = (accounts: AccountBalance[]) => {
    return [...accounts].sort((a, b) => {
      const codeA = a.account_code || '99999';
      const codeB = b.account_code || '99999';
      return codeA.localeCompare(codeB);
    });
  };

  // Categorize accounts using new code structure
  const cashAccounts = sortAccounts(accountBalances.filter((acc) => isBankCode(acc.account_code)));
  const bizCardAccounts = sortAccounts(accountBalances.filter((acc) => isBusinessCardCode(acc.account_code)));
  const personalCardAccounts = sortAccounts(accountBalances.filter((acc) => isPersonalCardCode(acc.account_code)));
  const personalDebtAccounts = sortAccounts(accountBalances.filter((acc) => isPersonalDebtCode(acc.account_code)));
  const helocAccounts = sortAccounts(accountBalances.filter((acc) => isHelocCode(acc.account_code)));

  const totalCash = cashAccounts.reduce((sum, a) => sum + Number(a.balance), 0);
  const totalBizCards = bizCardAccounts.reduce((sum, a) => sum + Math.abs(Number(a.balance)), 0);
  const totalPersonalCards = personalCardAccounts.reduce((sum, a) => sum + Math.abs(Number(a.balance)), 0);
  const totalPersonalDebt = personalDebtAccounts.reduce((sum, a) => sum + Math.abs(Number(a.balance)), 0);
  const totalHeloc = helocAccounts.reduce((sum, a) => sum + Math.abs(Number(a.balance)), 0);
  const totalAllCards = totalBizCards + totalPersonalCards;

  // RE portfolio calculations
  // Loan balances are NEGATIVE (amount owed)
  const rePortfolio = realEstateDeals.map((deal) => {
    const loanAccount = accountBalances.find((a) => a.account_id === deal.loan_account_id);
    const amountOwed = loanAccount ? Math.abs(Number(loanAccount.balance)) : 0;
    const propertyValue = deal.arv ?? deal.purchase_price ?? 0;
    const equity = propertyValue - amountOwed;
    return { 
      id: deal.id, 
      nickname: deal.nickname, 
      equity
    };
  });

  const totalEquity = rePortfolio.reduce((sum, p) => sum + p.equity, 0);

  // Liquid position
  const totalLiabilities = totalAllCards + totalPersonalDebt + totalHeloc;
  const liquidNet = totalCash - totalLiabilities;
  const totalNetWorth = liquidNet + totalEquity;

  // Job metrics - just count closed jobs
  const jobCount = jobs.length;
  
  // YTD calculations
  const jobProfit = jobIncomeYtd - jobExpenseYtd - marketingExpenseYtd - overheadExpenseYtd;
  const jobMargin = jobIncomeYtd > 0 ? (jobProfit / jobIncomeYtd) * 100 : 0;
  const avgJobSize = jobCount > 0 ? jobIncomeYtd / jobCount : 0;
  const rentalNoi = rentalIncomeYtd - rentalExpenseYtd;
  
  const totalExpenseYtd = jobExpenseYtd + marketingExpenseYtd + overheadExpenseYtd + 
                          rentalExpenseYtd + personalExpenseYtd;
  const netYtd = jobIncomeYtd + rentalIncomeYtd - totalExpenseYtd;

  const currency = (val: number, decimals = 0) => formatCurrency(val, decimals);
  const pct = (val: number) => `${val.toFixed(1)}%`;

  // Styles
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '4px 0',
    fontSize: 14,
  };

  const dividerStyle: React.CSSProperties = {
    borderTop: '1px solid #e0e0e0',
    margin: '6px 0',
  };

  const thickDividerStyle: React.CSSProperties = {
    borderTop: '2px solid #ccc',
    margin: '8px 0',
  };

  const subtotalStyle: React.CSSProperties = {
    ...rowStyle,
    fontWeight: 600,
    color: '#555',
  };

  const totalStyle: React.CSSProperties = {
    ...rowStyle,
    fontWeight: 700,
    fontSize: 15,
  };

  const sectionLabelStyle: React.CSSProperties = {
    ...rowStyle,
    fontWeight: 600,
    fontSize: 12,
    color: '#888',
    marginTop: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  };

  const metricsStyle: React.CSSProperties = {
    fontSize: 12,
    color: '#888',
    padding: '2px 0',
  };

  const green = '#0a7a3c';
  const red = '#b00020';

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Dashboard</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', alignItems: 'start' }}>
        
        {/* YTD Snapshot Card */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>YTD Snapshot</h3>
          
          {/* Job Section */}
          <div style={sectionLabelStyle}><span>Jobs</span></div>
          <div style={rowStyle}>
            <span>Income</span>
            <span style={{ color: green }}>{currency(jobIncomeYtd)}</span>
          </div>
          <div style={rowStyle}>
            <span>Job Expenses</span>
            <span style={{ color: red }}>{currency(jobExpenseYtd)}</span>
          </div>
          <div style={rowStyle}>
            <span>Marketing</span>
            <span style={{ color: red }}>{currency(marketingExpenseYtd)}</span>
          </div>
          <div style={rowStyle}>
            <span>Overhead</span>
            <span style={{ color: red }}>{currency(overheadExpenseYtd)}</span>
          </div>
          <div style={subtotalStyle}>
            <span>Job Profit</span>
            <span style={{ color: jobProfit >= 0 ? green : red }}>{currency(jobProfit)}</span>
          </div>
          <div style={metricsStyle}>
            Margin: {pct(jobMargin)} | Avg: {currency(avgJobSize)} | Count: {jobCount}
          </div>
          
          <div style={dividerStyle} />
          
          {/* Rental Section */}
          <div style={sectionLabelStyle}><span>Rentals</span></div>
          <div style={rowStyle}>
            <span>Income</span>
            <span style={{ color: green }}>{currency(rentalIncomeYtd)}</span>
          </div>
          <div style={rowStyle}>
            <span>Expenses</span>
            <span style={{ color: red }}>{currency(rentalExpenseYtd)}</span>
          </div>
          <div style={subtotalStyle}>
            <span>Rental NOI</span>
            <span style={{ color: rentalNoi >= 0 ? green : red }}>{currency(rentalNoi)}</span>
          </div>
          
          <div style={dividerStyle} />
          
          {/* Other Expenses */}
          <div style={sectionLabelStyle}><span>Other</span></div>
          <div style={rowStyle}>
            <span>Personal</span>
            <span style={{ color: red }}>{currency(personalExpenseYtd)}</span>
          </div>
          
          <div style={thickDividerStyle} />
          
          <div style={totalStyle}>
            <span>Net</span>
            <span style={{ color: netYtd >= 0 ? green : red }}>
              {currency(Math.abs(netYtd))}
            </span>
          </div>
        </div>

        {/* Balances Card */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Balances</h3>
          
          {/* Assets */}
          <div style={sectionLabelStyle}><span>Assets</span></div>
          {cashAccounts.map((acc) => (
            <div key={acc.account_id} style={rowStyle}>
              <span style={{ color: '#555' }}>{acc.account_name}</span>
              <span style={{ color: Number(acc.balance) >= 0 ? green : red }}>{currency(Number(acc.balance), 2)}</span>
            </div>
          ))}
          <div style={subtotalStyle}>
            <span>Cash Total</span>
            <span style={{ color: totalCash >= 0 ? green : red }}>{currency(totalCash)}</span>
          </div>
          
          <div style={dividerStyle} />
          
          {/* Business Cards */}
          <div style={sectionLabelStyle}><span>Business Cards</span></div>
          {bizCardAccounts.map((acc) => (
            <div key={acc.account_id} style={rowStyle}>
              <span style={{ color: '#555' }}>{acc.account_name}</span>
              <span style={{ color: red }}>{currency(Number(acc.balance), 2)}</span>
            </div>
          ))}
          
          <div style={dividerStyle} />
          
          {/* Personal Cards */}
          <div style={sectionLabelStyle}><span>Personal Cards</span></div>
          {personalCardAccounts.map((acc) => (
            <div key={acc.account_id} style={rowStyle}>
              <span style={{ color: '#555' }}>{acc.account_name}</span>
              <span style={{ color: red }}>{currency(Number(acc.balance), 2)}</span>
            </div>
          ))}
          
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
                  <span style={{ color: red }}>{currency(Number(acc.balance), 2)}</span>
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
                  <span style={{ color: red }}>{currency(Number(acc.balance), 2)}</span>
                </div>
              ))}
            </>
          )}
          
          <div style={thickDividerStyle} />
          
          <div style={totalStyle}>
            <span>Liquid Net</span>
            <span style={{ color: liquidNet >= 0 ? green : red }}>{currency(Math.abs(liquidNet))}</span>
          </div>
          
          <div style={rowStyle}>
            <span>RE Equity</span>
            <span style={{ color: totalEquity >= 0 ? green : red }}>{currency(totalEquity)}</span>
          </div>
          
          <div style={dividerStyle} />
          
          <div style={{ ...totalStyle, fontSize: 16 }}>
            <span>Net Worth</span>
            <span style={{ color: totalNetWorth >= 0 ? green : red }}>{currency(totalNetWorth)}</span>
          </div>
        </div>

        {/* Real Estate Card */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Real Estate</h3>
          
          {rePortfolio.map((p) => (
            <div key={p.id} style={rowStyle}>
              <span style={{ color: '#555' }}>{p.nickname}</span>
              <span style={{ color: p.equity >= 0 ? green : red }}>{currency(p.equity)}</span>
            </div>
          ))}
          
          {rePortfolio.length > 1 && (
            <>
              <div style={dividerStyle} />
              <div style={subtotalStyle}>
                <span>Total Equity</span>
                <span style={{ color: totalEquity >= 0 ? green : red }}>{currency(totalEquity)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
