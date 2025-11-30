import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  isBankCode,
  isMarketingExpenseCode,
  isRealEstateExpenseCode,
  type Purpose
} from '../utils/accounts';
import { formatCurrency } from '../utils/format';
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  BarChart,
  Line,
  Legend,
  ReferenceLine,
} from 'recharts';

type AccountBalance = {
  account_id: number;
  account_name: string;
  account_code: string | null;
  account_type: string;
  balance: number;
};

type TransactionLine = {
  id: number;
  account_id: number;
  amount: number;
  transaction_date: string;
};

type CandlestickData = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
};

type ExpenseChartData = {
  name: string;
  fullName: string;
  amount: number;
};

type ExpenseData = {
  job: ExpenseChartData[];
  marketing: ExpenseChartData[];
  overhead: ExpenseChartData[];
  realEstate: ExpenseChartData[];
  personal: ExpenseChartData[];
};

type CashFlowData = {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  net: number;
};

// Truncate label for display, keep full name for tooltip
function truncateLabel(name: string, maxLen = 12): string {
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name;
}

export function Analytics() {
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | 'all'>(
    'all'
  );
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dateRange, setDateRange] = useState<'90d' | 'ytd' | 'max'>('90d');
  const [activeTab, setActiveTab] = useState<'balances' | 'expenses' | 'cashflow'>('balances');
  const [expenseData, setExpenseData] = useState<ExpenseData>({
    job: [],
    marketing: [],
    overhead: [],
    realEstate: [],
    personal: [],
  });
  const [cashFlowData, setCashFlowData] = useState<CashFlowData[]>([]);
  const [cashFlowRange, setCashFlowRange] = useState<'ytd' | '12m' | 'all'>('ytd');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load account balances
  useEffect(() => {
    async function loadAccounts() {
      const { data, error: err } = await supabase
        .from('account_balances_v')
        .select('*');

      if (err) {
        console.error(err);
        setError('Failed to load accounts');
        return;
      }

      const bankAccounts = (data ?? [])
        .filter((acc: any) => isBankCode(acc.account_code))
        .sort((a: any, b: any) => {
          const codeA = a.account_code || a.account_name;
          const codeB = b.account_code || b.account_name;
          return codeA.localeCompare(codeB);
        });

      setAccountBalances(bankAccounts as AccountBalance[]);
    }

    loadAccounts();
  }, []);

  // Load expense data for expense charts
  useEffect(() => {
    async function loadExpenseData() {
      try {
        // Get YTD date range
        const currentYear = new Date().getFullYear();
        const startDate = `${currentYear}-01-01`;
        const endDate = `${currentYear}-12-31`;

        // Fetch YTD expense transactions with related data
        const { data: expenseLines, error: expErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            account_id,
            amount,
            purpose,
            job_id,
            accounts (
              name,
              code,
              account_types (name)
            ),
            transactions!inner (date)
          `)
          .eq('is_cleared', true)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        if (expErr) throw expErr;

        // Categorize expenses by type and aggregate by account (matching ExpensesSummary logic)
        const jobExpenses = new Map<number, { name: string; amount: number }>();
        const marketingExpenses = new Map<number, { name: string; amount: number }>();
        const overheadExpenses = new Map<number, { name: string; amount: number }>();
        const realEstateExpenses = new Map<number, { name: string; amount: number }>();
        const personalExpenses = new Map<number, { name: string; amount: number }>();

        for (const line of (expenseLines ?? []) as any[]) {
          const accType = line.accounts?.account_types?.name;
          if (accType !== 'expense') continue;

          const amount = Math.abs(Number(line.amount) || 0);
          const purpose: Purpose = line.purpose ?? 'business';
          const code = line.accounts?.code ?? '';

          const isBusiness = purpose === 'business' || purpose === 'mixed';
          const isPersonal = purpose === 'personal';

          const accountId = line.account_id;
          const accountName = line.accounts?.name ?? 'Unknown';

          // Categorize and aggregate by account (same logic as ExpensesSummary)
          let targetMap: Map<number, { name: string; amount: number }> | null = null;

          if (isPersonal) {
            targetMap = personalExpenses;
          } else if (isBusiness && isRealEstateExpenseCode(code)) {
            targetMap = realEstateExpenses;
          } else if (isBusiness && line.job_id !== null) {
            targetMap = jobExpenses;
          } else if (isBusiness && isMarketingExpenseCode(code)) {
            targetMap = marketingExpenses;
          } else if (isBusiness) {
            targetMap = overheadExpenses;
          }

          if (targetMap) {
            const existing = targetMap.get(accountId);
            if (existing) {
              existing.amount += amount;
            } else {
              targetMap.set(accountId, { name: accountName, amount });
            }
          }
        }

        // Convert maps to arrays, sort by amount, and add truncated labels
        const sortAndLimit = (map: Map<number, { name: string; amount: number }>, limit = 15): ExpenseChartData[] => {
          return Array.from(map.values())
            .sort((a, b) => b.amount - a.amount)
            .slice(0, limit)
            .map(item => ({
              name: truncateLabel(item.name),
              fullName: item.name,
              amount: item.amount,
            }));
        };

        setExpenseData({
          job: sortAndLimit(jobExpenses),
          marketing: sortAndLimit(marketingExpenses),
          overhead: sortAndLimit(overheadExpenses),
          realEstate: sortAndLimit(realEstateExpenses),
          personal: sortAndLimit(personalExpenses),
        });
      } catch (err) {
        console.error('Error loading expense data:', err);
      }
    }

    loadExpenseData();
  }, []);

  // Load cash flow data
  useEffect(() => {
    async function loadCashFlowData() {
      try {
        // Determine date range
        const now = new Date();
        let startDate: string;
        
        if (cashFlowRange === 'ytd') {
          startDate = `${now.getFullYear()}-01-01`;
        } else if (cashFlowRange === '12m') {
          const twelveMonthsAgo = new Date(now);
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
          startDate = twelveMonthsAgo.toISOString().split('T')[0];
        } else {
          startDate = '2000-01-01';
        }
        
        const endDate = now.toISOString().split('T')[0];

        // Fetch all transaction lines with account type info
        const { data: lines, error: linesErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            amount,
            accounts (
              account_types (name)
            ),
            transactions!inner (date)
          `)
          .eq('is_cleared', true)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        if (linesErr) throw linesErr;

        // Group by month and calculate income/expenses
        const monthlyData = new Map<string, { income: number; expenses: number }>();

        for (const line of (lines ?? []) as any[]) {
          const date = line.transactions?.date;
          if (!date) continue;

          const monthKey = date.substring(0, 7); // "YYYY-MM"
          const accType = line.accounts?.account_types?.name;
          const amount = Number(line.amount) || 0;

          if (!monthlyData.has(monthKey)) {
            monthlyData.set(monthKey, { income: 0, expenses: 0 });
          }

          const monthData = monthlyData.get(monthKey)!;

          // Income accounts have positive amounts for revenue
          // Expense accounts have negative amounts (money out)
          if (accType === 'income') {
            // Income is typically positive in double-entry (credit to income)
            monthData.income += Math.abs(amount);
          } else if (accType === 'expense') {
            // Expenses are typically negative (debit to expense)
            monthData.expenses += Math.abs(amount);
          }
        }

        // Convert to array and sort by month
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        
        const chartData: CashFlowData[] = Array.from(monthlyData.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([month, data]) => {
            const [year, monthNum] = month.split('-');
            const monthLabel = `${monthNames[parseInt(monthNum, 10) - 1]} ${year.slice(2)}`;
            return {
              month,
              monthLabel,
              income: data.income,
              expenses: data.expenses,
              net: data.income - data.expenses,
            };
          });

        setCashFlowData(chartData);
      } catch (err) {
        console.error('Error loading cash flow data:', err);
      }
    }

    loadCashFlowData();
  }, [cashFlowRange]);

  // Load and process transaction data
  useEffect(() => {
    async function loadChartData() {
      if (accountBalances.length === 0) return;

      setLoading(true);
      setError(null);

      try {
        // Get date range based on selection
        const endDate = new Date();
        const startDate = new Date();

        if (dateRange === '90d') {
          startDate.setDate(startDate.getDate() - 90);
        } else if (dateRange === 'ytd') {
          startDate.setMonth(0, 1); // January 1st of current year
        } else if (dateRange === 'max') {
          startDate.setFullYear(2000, 0, 1); // Go back to 2000 or earliest data
        }

        const startDateStr = startDate.toISOString().split('T')[0];
        const endDateStr = endDate.toISOString().split('T')[0];

        // Determine which account IDs to query
        const accountIds =
          selectedAccountId === 'all'
            ? accountBalances.map((acc) => acc.account_id)
            : [selectedAccountId];

        // Fetch all transactions for the selected account(s)
        const { data: transactions, error: txErr } = await supabase
          .from('transaction_lines')
          .select(
            `
            id,
            account_id,
            amount,
            transactions!inner (
              date
            )
          `
          )
          .in('account_id', accountIds)
          .gte('transactions.date', startDateStr)
          .lte('transactions.date', endDateStr);

        if (txErr) {
          console.error('Transaction query error:', txErr);
          throw txErr;
        }

        // Transform nested structure
        const txLines: TransactionLine[] = (transactions ?? [])
          .filter((tx: any) => tx && tx.transactions && tx.transactions.date)
          .map((tx: any) => ({
            id: tx.id,
            account_id: tx.account_id,
            amount: Number(tx.amount),
            transaction_date: tx.transactions.date,
          }));

        // Calculate running balances and aggregate by period
        const balancesByDate = calculateBalancesByPeriod(
          txLines,
          accountBalances,
          accountIds,
          period,
          startDateStr,
          endDateStr
        );

        setChartData(balancesByDate);
        setLoading(false);
      } catch (err: unknown) {
        console.error('Chart data error:', err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
        setError(`Failed to load chart data: ${errorMessage}`);
        setLoading(false);
      }
    }

    loadChartData();
  }, [accountBalances, selectedAccountId, period, dateRange]);

  // Calculate balances for candlestick chart
  function calculateBalancesByPeriod(
    transactions: TransactionLine[],
    accounts: AccountBalance[],
    accountIds: number[],
    periodType: 'daily' | 'weekly' | 'monthly',
    startDateStr: string,
    endDateStr: string
  ): CandlestickData[] {
    // Get current balances for selected accounts
    const currentBalances = new Map<number, number>();
    accounts.forEach((acc) => {
      if (accountIds.includes(acc.account_id)) {
        currentBalances.set(acc.account_id, Number(acc.balance));
      }
    });

    // Work backwards: calculate balance at start date by subtracting all transactions
    const balanceAtStart = new Map<number, number>();
    accountIds.forEach((accId) => {
      const currentBalance = currentBalances.get(accId) ?? 0;
      const totalTransactions = transactions
        .filter((tx) => tx.account_id === accId)
        .reduce((sum, tx) => sum + tx.amount, 0);
      balanceAtStart.set(accId, currentBalance - totalTransactions);
    });

    // Group transactions by period
    const periodMap = new Map<string, TransactionLine[]>();

    // Initialize periods with empty arrays
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const msPerDay = 24 * 60 * 60 * 1000;
    const dayCount = Math.ceil((end.getTime() - start.getTime()) / msPerDay) + 1;

    for (let i = 0; i < dayCount; i++) {
      const currentDate = new Date(start.getTime() + i * msPerDay);
      const periodKey = getPeriodKey(currentDate, periodType);
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, []);
      }
    }

    // Add transactions to their respective periods
    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      const periodKey = getPeriodKey(txDate, periodType);
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, []);
      }
      periodMap.get(periodKey)!.push(tx);
    });

    // Calculate candlestick data for each period
    const candlesticks: CandlestickData[] = [];
    const runningBalance = new Map(balanceAtStart);

    const sortedPeriods = Array.from(periodMap.keys()).sort();

    sortedPeriods.forEach((periodKey, index) => {
      const periodTxs = periodMap.get(periodKey) ?? [];

      // Opening balance = closing balance of previous period (for continuity)
      // For first period, use the calculated starting balance
      const openBalance =
        index === 0
          ? Array.from(runningBalance.values()).reduce((sum, bal) => sum + bal, 0)
          : candlesticks[index - 1].close;

      let high = openBalance;
      let low = openBalance;

      // Process each transaction in chronological order within the period
      periodTxs
        .sort(
          (a, b) =>
            new Date(a.transaction_date).getTime() -
            new Date(b.transaction_date).getTime()
        )
        .forEach((tx) => {
          // Update running balance for this account
          const accBalance = runningBalance.get(tx.account_id) ?? 0;
          runningBalance.set(tx.account_id, accBalance + tx.amount);

          // Recalculate total balance across all accounts
          const newBalance = Array.from(runningBalance.values()).reduce(
            (sum, bal) => sum + bal,
            0
          );

          high = Math.max(high, newBalance);
          low = Math.min(low, newBalance);
        });

      // Closing balance = final balance after all transactions in this period
      const closeBalance = Array.from(runningBalance.values()).reduce(
        (sum, bal) => sum + bal,
        0
      );

      candlesticks.push({
        date: periodKey,
        open: openBalance,
        close: closeBalance,
        high,
        low,
      });
    });

    return candlesticks;
  }

  function getPeriodKey(
    date: Date,
    periodType: 'daily' | 'weekly' | 'monthly'
  ): string {
    if (periodType === 'monthly') {
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    } else if (periodType === 'weekly') {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      return startOfWeek.toISOString().split('T')[0];
    } else {
      return date.toISOString().split('T')[0];
    }
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          style={{
            backgroundColor: 'white',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>{data.date}</p>
          <p style={{ margin: '4px 0', color: '#0a7a3c' }}>
            <strong>Open:</strong> {formatCurrency(data.open, 2)}
          </p>
          <p style={{ margin: '4px 0', color: '#1565c0' }}>
            <strong>High:</strong> {formatCurrency(data.high, 2)}
          </p>
          <p style={{ margin: '4px 0', color: '#e65100' }}>
            <strong>Low:</strong> {formatCurrency(data.low, 2)}
          </p>
          <p style={{ margin: '4px 0', color: '#b00020' }}>
            <strong>Close:</strong> {formatCurrency(data.close, 2)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for expense charts to show full name
  const ExpenseTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          style={{
            backgroundColor: 'white',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>{data.fullName}</p>
          <p style={{ margin: 0, color: '#333' }}>
            {formatCurrency(data.amount, 2)}
          </p>
        </div>
      );
    }
    return null;
  };

  // Custom tooltip for cash flow chart
  const CashFlowTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div
          style={{
            backgroundColor: 'white',
            padding: '10px',
            border: '1px solid #ccc',
            borderRadius: '4px',
          }}
        >
          <p style={{ margin: '0 0 8px 0', fontWeight: 600 }}>{label}</p>
          <p style={{ margin: '4px 0', color: '#0a7a3c' }}>
            <strong>Income:</strong> {formatCurrency(data.income, 2)}
          </p>
          <p style={{ margin: '4px 0', color: '#b00020' }}>
            <strong>Expenses:</strong> {formatCurrency(data.expenses, 2)}
          </p>
          <p style={{ margin: '4px 0', color: data.net >= 0 ? '#0a7a3c' : '#b00020', fontWeight: 600 }}>
            <strong>Net:</strong> {formatCurrency(data.net, 2)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading && accountBalances.length === 0) return <p>Loading accounts...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  const selectedAccountName =
    selectedAccountId === 'all'
      ? 'All Bank Accounts'
      : accountBalances.find((acc) => acc.account_id === selectedAccountId)
          ?.account_name ?? 'Unknown';

  // Calculate cash flow summary
  const cashFlowSummary = cashFlowData.reduce(
    (acc, month) => ({
      totalIncome: acc.totalIncome + month.income,
      totalExpenses: acc.totalExpenses + month.expenses,
      totalNet: acc.totalNet + month.net,
    }),
    { totalIncome: 0, totalExpenses: 0, totalNet: 0 }
  );

  // Reusable bar chart component
  const ExpenseBarChart = ({ 
    data, 
    color, 
    title 
  }: { 
    data: ExpenseChartData[]; 
    color: string; 
    title: string;
  }) => (
    <div className="card" style={{ padding: '1rem' }}>
      <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>{title}</h3>
      {data.length === 0 ? (
        <p style={{ color: '#555', margin: 0 }}>No {title.toLowerCase()} for this period</p>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={data} margin={{ top: 10, right: 10, bottom: 60, left: 45 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="name"
              angle={-45}
              textAnchor="end"
              height={70}
              tick={{ fontSize: 10 }}
              interval={0}
            />
            <YAxis
              tickFormatter={(value) => formatCurrency(value, 0)}
              tick={{ fontSize: 10 }}
              width={45}
              domain={[0, (dataMax: number) => Math.ceil(dataMax * 1.1 / 1000) * 1000]}
            />
            <Tooltip content={<ExpenseTooltip />} />
            <Bar dataKey="amount" fill={color} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  return (
    <div>
      <h2 style={{ marginTop: 0, marginBottom: '1rem' }}>Analytics</h2>

      {/* Tab Navigation */}
      <div className="tab-strip">
        <button
          type="button"
          className={`tab ${activeTab === 'balances' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('balances')}
        >
          Balance History
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'expenses' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('expenses')}
        >
          Expense Categories
        </button>
        <button
          type="button"
          className={`tab ${activeTab === 'cashflow' ? 'tab--active' : ''}`}
          onClick={() => setActiveTab('cashflow')}
        >
          Cash Flow
        </button>
      </div>

      {/* Balance History Tab Content */}
      {activeTab === 'balances' && (
        <>
          <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
            <div
              style={{
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
                marginBottom: '1rem',
              }}
            >
              {/* Account selector */}
              <div>
                <label
                  htmlFor="account-select"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}
                >
                  Account:
                </label>
                <select
                  id="account-select"
                  value={selectedAccountId}
                  onChange={(e) =>
                    setSelectedAccountId(
                      e.target.value === 'all' ? 'all' : Number(e.target.value)
                    )
                  }
                  style={{
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                  }}
                >
                  <option value="all">All Bank Accounts (Aggregated)</option>
                  {accountBalances.map((acc) => (
                    <option key={acc.account_id} value={acc.account_id}>
                      {acc.account_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Period selector */}
              <div>
                <label
                  htmlFor="period-select"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}
                >
                  Period:
                </label>
                <select
                  id="period-select"
                  value={period}
                  onChange={(e) =>
                    setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')
                  }
                  style={{
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                  }}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {/* Date range selector */}
              <div>
                <label
                  htmlFor="range-select"
                  style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}
                >
                  Time Range:
                </label>
                <select
                  id="range-select"
                  value={dateRange}
                  onChange={(e) =>
                    setDateRange(e.target.value as '90d' | 'ytd' | 'max')
                  }
                  style={{
                    padding: '0.5rem',
                    borderRadius: '4px',
                    border: '1px solid #ccc',
                  }}
                >
                  <option value="90d">Last 90 Days</option>
                  <option value="ytd">Year to Date</option>
                  <option value="max">All Time</option>
                </select>
              </div>
            </div>

            <p style={{ color: '#555', fontSize: '14px', margin: 0 }}>
              Showing {dateRange === '90d' ? 'last 90 days' : dateRange === 'ytd' ? 'year to date' : 'all time'} balance history for: <strong>{selectedAccountName}</strong>
            </p>
          </div>

          <div className="card" style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Balance Candlestick Chart
            </h3>

            {loading ? (
              <p>Loading chart data...</p>
            ) : chartData.length === 0 ? (
              <p style={{ color: '#555' }}>
                No transaction data available for the selected period.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={450}>
                <ComposedChart data={chartData} margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tickFormatter={(value) => formatCurrency(value, 0)}
                    tick={{ fontSize: 12 }}
                    domain={[
                      0,
                      () => {
                        // Find the highest value from all candlestick highs
                        const maxHigh = Math.max(...chartData.map((d) => d.high));
                        // Round up to nearest 5000
                        return Math.ceil(maxHigh / 5000) * 5000;
                      }
                    ]}
                  />
                  <Tooltip content={<CustomTooltip />} />

                  {/* Render candlesticks using Bar with custom shape */}
                  <Bar
                    dataKey="high"
                    fill="transparent"
                    isAnimationActive={false}
                    shape={(props: any) => {
                      const { x, y, width, height, payload } = props;
                      if (!payload || height <= 0) return <></>;

                      const { open, close, high, low } = payload;
                      if (high === undefined || low === undefined) return <></>;

                      const isPositive = close >= open;
                      const color = isPositive ? '#0a7a3c' : '#b00020';

                      // Guard against division by zero
                      if (high === 0) return <></>;

                      // Calculate scale: height represents pixels from 'high' to chart baseline
                      // We need to find pixels per unit of data value
                      const pixelsPerUnit = height / high;

                      // Calculate Y positions (y is at 'high', increasing downward)
                      const highY = y;
                      const lowY = y + ((high - low) * pixelsPerUnit);
                      const openY = y + ((high - open) * pixelsPerUnit);
                      const closeY = y + ((high - close) * pixelsPerUnit);

                      const bodyTop = Math.min(openY, closeY);
                      const bodyHeight = Math.max(Math.abs(closeY - openY), 2);
                      const candleWidth = Math.min(width * 0.6, 20);
                      const candleX = x + (width - candleWidth) / 2;
                      const centerX = x + width / 2;

                      return (
                        <g>
                          {/* Wick (high-low line) */}
                          <line
                            x1={centerX}
                            y1={highY}
                            x2={centerX}
                            y2={lowY}
                            stroke={color}
                            strokeWidth={2}
                          />
                          {/* Body (open-close rectangle) */}
                          <rect
                            x={candleX}
                            y={bodyTop}
                            width={candleWidth}
                            height={bodyHeight}
                            fill={color}
                            stroke={color}
                          />
                        </g>
                      );
                    }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            <div style={{ marginTop: '1rem', fontSize: '14px', color: '#555' }}>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>How to read this chart:</strong>
              </p>
              <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem', marginBottom: 0 }}>
                <li>
                  <strong>Green candles:</strong> Balance increased during the period
                  (close &gt; open)
                </li>
                <li>
                  <strong>Red candles:</strong> Balance decreased during the period
                  (close &lt; open)
                </li>
                <li>
                  <strong>Wicks:</strong> Show the highest and lowest balances reached
                </li>
                <li>
                  <strong>Body:</strong> Shows opening and closing balance for the period
                </li>
              </ul>
            </div>
          </div>
        </>
      )}

      {/* Expense Categories Tab Content */}
      {activeTab === 'expenses' && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))', 
          gap: '1rem',
          alignItems: 'start'
        }}>
          <ExpenseBarChart data={expenseData.job} color="#1565c0" title="Direct Job Expenses" />
          <ExpenseBarChart data={expenseData.marketing} color="#e65100" title="Marketing Expenses" />
          <ExpenseBarChart data={expenseData.overhead} color="#7b1fa2" title="Overhead Expenses" />
          <ExpenseBarChart data={expenseData.realEstate} color="#0a7a3c" title="Real Estate Expenses" />
          <ExpenseBarChart data={expenseData.personal} color="#b00020" title="Personal/Other Expenses" />
        </div>
      )}

      {/* Cash Flow Tab Content */}
      {activeTab === 'cashflow' && (
        <>
          {/* Summary Cards */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
            gap: '1rem',
            marginBottom: '1rem'
          }}>
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <p style={{ margin: '0 0 0.5rem 0', color: '#555', fontSize: '14px' }}>Total Income</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#0a7a3c' }}>
                {formatCurrency(cashFlowSummary.totalIncome, 0)}
              </p>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <p style={{ margin: '0 0 0.5rem 0', color: '#555', fontSize: '14px' }}>Total Expenses</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#b00020' }}>
                {formatCurrency(cashFlowSummary.totalExpenses, 0)}
              </p>
            </div>
            <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
              <p style={{ margin: '0 0 0.5rem 0', color: '#555', fontSize: '14px' }}>Net Cash Flow</p>
              <p style={{ 
                margin: 0, 
                fontSize: '1.5rem', 
                fontWeight: 600, 
                color: cashFlowSummary.totalNet >= 0 ? '#0a7a3c' : '#b00020' 
              }}>
                {formatCurrency(cashFlowSummary.totalNet, 0)}
              </p>
            </div>
          </div>

          {/* Controls */}
          <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <label htmlFor="cashflow-range" style={{ fontWeight: 600 }}>
                Time Range:
              </label>
              <select
                id="cashflow-range"
                value={cashFlowRange}
                onChange={(e) => setCashFlowRange(e.target.value as 'ytd' | '12m' | 'all')}
                style={{
                  padding: '0.5rem',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                }}
              >
                <option value="ytd">Year to Date</option>
                <option value="12m">Last 12 Months</option>
                <option value="all">All Time</option>
              </select>
            </div>
          </div>

          {/* Chart */}
          <div className="card" style={{ padding: '1rem' }}>
            <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
              Monthly Income vs Expenses
            </h3>

            {cashFlowData.length === 0 ? (
              <p style={{ color: '#555' }}>No cash flow data available for the selected period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={400}>
                <ComposedChart data={cashFlowData} margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="monthLabel"
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    interval={0}
                  />
                  <YAxis
                    tickFormatter={(value) => formatCurrency(value, 0)}
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip content={<CashFlowTooltip />} />
                  <Legend verticalAlign="top" height={36} />
                  <ReferenceLine y={0} stroke="#666" strokeDasharray="3 3" />
                  <Bar dataKey="income" name="Income" fill="#0a7a3c" />
                  <Bar dataKey="expenses" name="Expenses" fill="#b00020" />
                  <Line 
                    type="monotone" 
                    dataKey="net" 
                    name="Net" 
                    stroke="#1565c0" 
                    strokeWidth={2}
                    dot={{ fill: '#1565c0', strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}

            <div style={{ marginTop: '1rem', fontSize: '14px', color: '#555' }}>
              <p style={{ marginBottom: '0.5rem' }}>
                <strong>How to read this chart:</strong>
              </p>
              <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem', marginBottom: 0 }}>
                <li>
                  <strong>Green bars:</strong> Total income for the month
                </li>
                <li>
                  <strong>Red bars:</strong> Total expenses for the month
                </li>
                <li>
                  <strong>Blue line:</strong> Net cash flow (income minus expenses)
                </li>
                <li>
                  When the blue line is above zero, you're cash flow positive for that month
                </li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
