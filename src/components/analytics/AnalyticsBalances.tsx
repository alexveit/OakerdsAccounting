import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { isBankCode } from '../../utils/accounts';
import { formatCurrency } from '../../utils/format';
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
} from 'recharts';

type AccountBalance = {
  account_id: number;
  account_name: string;
  account_code: string | null;
  account_type: string;
  balance: number;
};

type RawAccountBalance = {
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

type RawTransactionLineQuery = {
  id: number;
  account_id: number;
  amount: number;
  transactions: { date: string } | null;
};

type CandlestickData = {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
};

export function AnalyticsBalances() {
  const [accountBalances, setAccountBalances] = useState<AccountBalance[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<number | 'all'>('all');
  const [chartData, setChartData] = useState<CandlestickData[]>([]);
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily');
  const [dateRange, setDateRange] = useState<'90d' | 'ytd' | 'max' | 'custom'>('90d');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
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

      const rawAccounts = (data ?? []) as unknown as RawAccountBalance[];
      const bankAccounts = rawAccounts
        .filter((acc) => isBankCode(acc.account_code))
        .sort((a, b) => {
          const codeA = a.account_code || a.account_name;
          const codeB = b.account_code || b.account_name;
          return codeA.localeCompare(codeB);
        });

      setAccountBalances(bankAccounts);
    }

    loadAccounts();
  }, []);

  // Load and process transaction data
  useEffect(() => {
    async function loadChartData() {
      if (accountBalances.length === 0) return;

      setLoading(true);
      setError(null);

      try {
        let startDateStr: string;
        let endDateStr: string;

        if (dateRange === 'custom') {
          if (!customStartDate || !customEndDate) {
            setLoading(false);
            return;
          }
          startDateStr = customStartDate;
          endDateStr = customEndDate;
        } else {
          const endDate = new Date();
          const startDate = new Date();

          if (dateRange === '90d') {
            startDate.setDate(startDate.getDate() - 90);
          } else if (dateRange === 'ytd') {
            startDate.setMonth(0, 1);
          } else if (dateRange === 'max') {
            startDate.setFullYear(2000, 0, 1);
          }

          startDateStr = startDate.toISOString().split('T')[0];
          endDateStr = endDate.toISOString().split('T')[0];
        }

        const accountIds =
          selectedAccountId === 'all'
            ? accountBalances.map((acc) => acc.account_id)
            : [selectedAccountId];

        const { data: transactions, error: txErr } = await supabase
          .from('transaction_lines')
          .select(`
            id,
            account_id,
            amount,
            transactions!inner (date)
          `)
          .in('account_id', accountIds)
          .gte('transactions.date', startDateStr)
          .lte('transactions.date', endDateStr);

        if (txErr) throw txErr;

        const rawTxLines = (transactions ?? []) as unknown as RawTransactionLineQuery[];
        const txLines: TransactionLine[] = rawTxLines
          .filter((tx) => tx && tx.transactions && tx.transactions.date)
          .map((tx) => ({
            id: tx.id,
            account_id: tx.account_id,
            amount: Number(tx.amount),
            transaction_date: tx.transactions!.date,
          }));

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
  }, [accountBalances, selectedAccountId, period, dateRange, customStartDate, customEndDate]);

  function calculateBalancesByPeriod(
    transactions: TransactionLine[],
    accounts: AccountBalance[],
    accountIds: number[],
    periodType: 'daily' | 'weekly' | 'monthly',
    startDateStr: string,
    endDateStr: string
  ): CandlestickData[] {
    const currentBalances = new Map<number, number>();
    accounts.forEach((acc) => {
      if (accountIds.includes(acc.account_id)) {
        currentBalances.set(acc.account_id, Number(acc.balance));
      }
    });

    const balanceAtStart = new Map<number, number>();
    accountIds.forEach((accId) => {
      const currentBalance = currentBalances.get(accId) ?? 0;
      const totalTransactions = transactions
        .filter((tx) => tx.account_id === accId)
        .reduce((sum, tx) => sum + tx.amount, 0);
      balanceAtStart.set(accId, currentBalance - totalTransactions);
    });

    const periodMap = new Map<string, TransactionLine[]>();
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

    transactions.forEach((tx) => {
      const txDate = new Date(tx.transaction_date);
      const periodKey = getPeriodKey(txDate, periodType);
      if (!periodMap.has(periodKey)) {
        periodMap.set(periodKey, []);
      }
      periodMap.get(periodKey)!.push(tx);
    });

    const candlesticks: CandlestickData[] = [];
    const runningBalance = new Map(balanceAtStart);
    const sortedPeriods = Array.from(periodMap.keys()).sort();

    sortedPeriods.forEach((periodKey, index) => {
      const periodTxs = periodMap.get(periodKey) ?? [];

      const openBalance =
        index === 0
          ? Array.from(runningBalance.values()).reduce((sum, bal) => sum + bal, 0)
          : candlesticks[index - 1].close;

      let high = openBalance;
      let low = openBalance;

      periodTxs
        .sort((a, b) =>
          new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime()
        )
        .forEach((tx) => {
          const accBalance = runningBalance.get(tx.account_id) ?? 0;
          runningBalance.set(tx.account_id, accBalance + tx.amount);

          const newBalance = Array.from(runningBalance.values()).reduce(
            (sum, bal) => sum + bal,
            0
          );

          high = Math.max(high, newBalance);
          low = Math.min(low, newBalance);
        });

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

  function getPeriodKey(date: Date, periodType: 'daily' | 'weekly' | 'monthly'): string {
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

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: CandlestickData }> }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <p className="chart-tooltip__title">{data.date}</p>
          <p className="chart-tooltip__row chart-tooltip__row--open">
            <strong>Open:</strong> {formatCurrency(data.open, 2)}
          </p>
          <p className="chart-tooltip__row chart-tooltip__row--high">
            <strong>High:</strong> {formatCurrency(data.high, 2)}
          </p>
          <p className="chart-tooltip__row chart-tooltip__row--low">
            <strong>Low:</strong> {formatCurrency(data.low, 2)}
          </p>
          <p className="chart-tooltip__row chart-tooltip__row--close">
            <strong>Close:</strong> {formatCurrency(data.close, 2)}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading && accountBalances.length === 0) return <p>Loading accounts...</p>;
  if (error) return <p className="text-danger">Error: {error}</p>;

  const selectedAccountName =
    selectedAccountId === 'all'
      ? 'All Bank Accounts'
      : accountBalances.find((acc) => acc.account_id === selectedAccountId)?.account_name ?? 'Unknown';

  return (
    <>
      <div className="card mb-2 p-2">
        <div className="filter-row mb-2">
          {/* Account selector */}
          <div className="filter-group">
            <label htmlFor="account-select">Account:</label>
            <select
              id="account-select"
              value={selectedAccountId}
              onChange={(e) =>
                setSelectedAccountId(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
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
          <div className="filter-group">
            <label htmlFor="period-select">Period:</label>
            <select
              id="period-select"
              value={period}
              onChange={(e) => setPeriod(e.target.value as 'daily' | 'weekly' | 'monthly')}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Date range selector */}
          <div className="filter-group">
            <label htmlFor="range-select">Time Range:</label>
            <select
              id="range-select"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as '90d' | 'ytd' | 'max' | 'custom')}
            >
              <option value="90d">Last 90 Days</option>
              <option value="ytd">Year to Date</option>
              <option value="max">All Time</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom date inputs */}
          {dateRange === 'custom' && (
            <>
              <div className="filter-group">
                <label htmlFor="start-date">Start Date:</label>
                <input
                  id="start-date"
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
              </div>
              <div className="filter-group">
                <label htmlFor="end-date">End Date:</label>
                <input
                  id="end-date"
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <p className="text-muted text-sm m-0">
          Showing {dateRange === '90d' ? 'last 90 days' : dateRange === 'ytd' ? 'year to date' : dateRange === 'max' ? 'all time' : `${customStartDate} to ${customEndDate}`} balance history for: <strong>{selectedAccountName}</strong>
        </p>
      </div>

      <div className="card chart-card">
        <h3 className="chart-card__title">
          Balance Candlestick Chart
        </h3>

        {loading ? (
          <p>Loading chart data...</p>
        ) : chartData.length === 0 ? (
          <p className="text-muted">
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
                    const maxHigh = Math.max(...chartData.map((d) => d.high));
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
                shape={(props: unknown) => {
                  const { x, y, width, height, payload } = props as {
                    x: number;
                    y: number;
                    width: number;
                    height: number;
                    payload: CandlestickData;
                  };
                  if (!payload || height <= 0) return <></>;

                  const { open, close, high, low } = payload;
                  if (high === undefined || low === undefined) return <></>;

                  const isPositive = close >= open;
                  const color = isPositive ? '#0a7a3c' : '#b00020';

                  if (high === 0) return <></>;

                  const pixelsPerUnit = height / high;

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

        <div className="chart-legend">
          <p className="chart-legend__title">
            <strong>How to read this chart:</strong>
          </p>
          <ul className="chart-legend__list">
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
  );
}