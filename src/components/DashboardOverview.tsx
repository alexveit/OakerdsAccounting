import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/format';
import { classifyLine, type ClassifiableLineInput } from '../utils/accounts';
import { BalancesCard, type AccountBalance } from './shared/BalancesCard';

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

/** Returns appropriate color class based on value sign */
function amountColorClass(value: number, forceNegative = false): string {
  if (forceNegative) return 'text-danger';
  return value >= 0 ? 'text-success' : 'text-danger';
}

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
        // NOTE: Intentionally including all transactions (cleared + pending) for complete financial picture
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
  if (error) return <p className="text-danger">Error: {error}</p>;

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

  return (
    <div>
      <h2 className="mt-0 mb-2">Dashboard</h2>
      <div className="dashboard-grid">
        
        {/* YTD Snapshot Card */}
        <div className="card">
          <h3 className="mt-0 mb-1h">YTD Snapshot</h3>
          
          {/* Job Section */}
          <div className="balance-section-label">Jobs</div>
          <div className="balance-row">
            <span>Income</span>
            <span className="text-success">{currency(jobIncomeYtd)}</span>
          </div>
          <div className="balance-row">
            <span>Job Expenses</span>
            <span className="text-danger">{currency(jobExpenseYtd)}</span>
          </div>
          <div className="balance-row">
            <span>Marketing</span>
            <span className="text-danger">{currency(marketingExpenseYtd)}</span>
          </div>
          <div className="balance-row">
            <span>Overhead</span>
            <span className="text-danger">{currency(overheadExpenseYtd)}</span>
          </div>
          <div className="balance-row balance-row--subtotal">
            <span>Job Profit</span>
            <span className={amountColorClass(jobProfit)}>{currency(jobProfit)}</span>
          </div>
          <div className="balance-metrics">
            Margin: {pct(jobMargin)} | Avg: {currency(avgJobSize)} | Count: {jobCount}
          </div>
          
          <div className="balance-divider" />
          
          {/* Rental Section */}
          <div className="balance-section-label">Rentals</div>
          <div className="balance-row">
            <span>Income</span>
            <span className="text-success">{currency(rentalIncomeYtd)}</span>
          </div>
          <div className="balance-row">
            <span>Expenses</span>
            <span className="text-danger">{currency(rentalExpenseYtd)}</span>
          </div>
          <div className="balance-row balance-row--subtotal">
            <span>Rental NOI</span>
            <span className={amountColorClass(rentalNoi)}>{currency(rentalNoi)}</span>
          </div>
          
          <div className="balance-divider" />
          
          {/* Other Expenses */}
          <div className="balance-section-label">Other</div>
          <div className="balance-row">
            <span>Personal</span>
            <span className="text-danger">{currency(personalExpenseYtd)}</span>
          </div>
          
          <div className="balance-divider--thick" />
          
          <div className="balance-row balance-row--total">
            <span>Net</span>
            <span className={amountColorClass(netYtd)}>
              {currency(Math.abs(netYtd))}
            </span>
          </div>
        </div>

        {/* Balances Card */}
        <BalancesCard
          accounts={accountBalances}
          loading={loading}
          showNetWorth={true}
          reEquity={totalEquity}
        />

        {/* Real Estate Card */}
        <div className="card">
          <h3 className="mt-0 mb-1h">Real Estate</h3>
          
          {rePortfolio.map((p) => (
            <div key={p.id} className="balance-row">
              <span className="balance-account-name">{p.nickname}</span>
              <span className={amountColorClass(p.equity)}>{currency(p.equity)}</span>
            </div>
          ))}
          
          {rePortfolio.length > 1 && (
            <>
              <div className="balance-divider" />
              <div className="balance-row balance-row--subtotal">
                <span>Total Equity</span>
                <span className={amountColorClass(totalEquity)}>{currency(totalEquity)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
