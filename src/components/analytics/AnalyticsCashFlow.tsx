import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';
import { classifyLine, type ClassifiableLineInput } from '../../utils/accounts';
import {
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  Line,
  Legend,
  ReferenceLine,
} from 'recharts';

type CashFlowData = {
  month: string;
  monthLabel: string;
  income: number;
  expenses: number;
  net: number;
};

export function AnalyticsCashFlow() {
  const [cashFlowData, setCashFlowData] = useState<CashFlowData[]>([]);
  const [cashFlowRange, setCashFlowRange] = useState<'ytd' | '12m' | 'all'>('ytd');
  const [scope, setScope] = useState<'business' | 'rentals' | 'flips' | 'all'>('business');

  useEffect(() => {
    async function loadCashFlowData() {
      try {
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

        // For rentals scope, get rental deal IDs first (to match REI Dashboard)
        let rentalDealIds: number[] = [];
        if (scope === 'rentals') {
          const { data: rentalDeals, error: dealsErr } = await supabase
            .from('real_estate_deals')
            .select('id')
            .eq('type', 'rental');
          
          if (dealsErr) throw dealsErr;
          rentalDealIds = (rentalDeals ?? []).map(d => d.id);
          
          if (rentalDealIds.length === 0) {
            setCashFlowData([]);
            return;
          }
        }

        // Build query based on scope
        let query = supabase
          .from('transaction_lines')
          .select(`
            id,
            amount,
            purpose,
            job_id,
            real_estate_deal_id,
            accounts!inner (
              code,
              account_types!inner (name)
            ),
            transactions!inner (date)
          `)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        // Rentals uses deal-based filter + cleared only (matches REI Dashboard)
        if (scope === 'rentals') {
          query = query
            .in('real_estate_deal_id', rentalDealIds)
            .eq('is_cleared', true);
        }

        const { data: lines, error: linesErr } = await query;

        if (linesErr) throw linesErr;

        const monthlyData = new Map<string, { income: number; expenses: number }>();

        for (const line of (lines ?? []) as ClassifiableLineInput[]) {
          const date = (line as { transactions?: { date?: string } }).transactions?.date;
          if (!date) continue;

          const classification = classifyLine(line);
          const accountType = line.accounts?.account_types?.name ?? '';

          // Filter by scope
          let includeIncome = false;
          let includeExpense = false;

          switch (scope) {
            case 'business':
              // Job income + job/marketing/overhead expenses (Schedule C)
              includeIncome = classification.incomeCategory === 'job';
              includeExpense = 
                classification.expenseCategory === 'job' ||
                classification.expenseCategory === 'marketing' ||
                classification.expenseCategory === 'overhead';
              break;
            case 'rentals':
              // Deal-linked income/expense (already filtered by query)
              includeIncome = accountType === 'income';
              includeExpense = accountType === 'expense';
              break;
            case 'flips':
              // Flip expenses only (capitalized costs - no income until sale)
              includeIncome = false;
              includeExpense = classification.expenseCategory === 'flip';
              break;
            case 'all':
              // Everything
              includeIncome = classification.incomeCategory !== null;
              includeExpense = classification.expenseCategory !== null;
              break;
          }

          const monthKey = date.substring(0, 7);
          const amount = Number(line.amount) || 0;

          if (!includeIncome && !includeExpense) continue;

          if (!monthlyData.has(monthKey)) {
            monthlyData.set(monthKey, { income: 0, expenses: 0 });
          }

          const monthData = monthlyData.get(monthKey)!;

          if (includeIncome) {
            monthData.income += Math.abs(amount);
          } else if (includeExpense) {
            monthData.expenses += amount;  // Raw amount to allow refunds to subtract
          }
        }

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
  }, [cashFlowRange, scope]);

  const CashFlowTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ payload: CashFlowData }>; label?: string }) => {
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
          <p
            style={{
              margin: '4px 0',
              color: data.net >= 0 ? '#0a7a3c' : '#b00020',
              fontWeight: 600,
            }}
          >
            <strong>Net:</strong> {formatCurrency(data.net, 2)}
          </p>
        </div>
      );
    }
    return null;
  };

  const cashFlowSummary = cashFlowData.reduce(
    (acc, month) => ({
      totalIncome: acc.totalIncome + month.income,
      totalExpenses: acc.totalExpenses + month.expenses,
      totalNet: acc.totalNet + month.net,
    }),
    { totalIncome: 0, totalExpenses: 0, totalNet: 0 }
  );

  const scopeLabels = {
    business: { income: 'Job Income', expenses: 'Job + Overhead', net: 'Job Net', chart: 'Business' },
    rentals: { income: 'Rental Income', expenses: 'Rental Expenses', net: 'Rental NOI', chart: 'Rentals' },
    flips: { income: 'Flip Income', expenses: 'Flip Costs', net: 'Flip Net', chart: 'Flips' },
    all: { income: 'Total Income', expenses: 'Total Expenses', net: 'Net Cash Flow', chart: 'All' },
  };

  const labels = scopeLabels[scope];

  return (
    <>
      {/* Summary Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.5rem 0', color: '#555', fontSize: '14px' }}>
            {labels.income}
          </p>
          <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#0a7a3c' }}>
            {formatCurrency(cashFlowSummary.totalIncome, 0)}
          </p>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.5rem 0', color: '#555', fontSize: '14px' }}>
            {labels.expenses}
          </p>
          <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#b00020' }}>
            {formatCurrency(cashFlowSummary.totalExpenses, 0)}
          </p>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <p style={{ margin: '0 0 0.5rem 0', color: '#555', fontSize: '14px' }}>
            {labels.net}
          </p>
          <p
            style={{
              margin: 0,
              fontSize: '1.5rem',
              fontWeight: 600,
              color: cashFlowSummary.totalNet >= 0 ? '#0a7a3c' : '#b00020',
            }}
          >
            {formatCurrency(Math.abs(cashFlowSummary.totalNet), 0)}
          </p>
        </div>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '1rem', padding: '1rem' }}>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label htmlFor="cashflow-scope" style={{ fontWeight: 600 }}>
              Scope:
            </label>
            <select
              id="cashflow-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value as 'business' | 'rentals' | 'flips' | 'all')}
              style={{
                padding: '0.5rem',
                borderRadius: '4px',
                border: '1px solid #ccc',
              }}
            >
              <option value="business">Business (Schedule C)</option>
              <option value="rentals">Rentals (Schedule E)</option>
              <option value="flips">Flips (Capitalized)</option>
              <option value="all">All (incl. Personal)</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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
      </div>

      {/* Chart */}
      <div className="card" style={{ padding: '1rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>
          Monthly Income vs Expenses ({labels.chart})
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
              <YAxis tickFormatter={(value) => formatCurrency(value, 0)} tick={{ fontSize: 11 }} />
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
              <strong>Green bars:</strong> {labels.income} for the month
            </li>
            <li>
              <strong>Red bars:</strong> {labels.expenses} for the month
            </li>
            <li>
              <strong>Blue line:</strong> Net cash flow (income minus expenses)
            </li>
            <li>When the blue line is above zero, you're cash flow positive for that month</li>
          </ul>
          <p style={{ marginTop: '0.5rem', fontStyle: 'italic', fontSize: '13px' }}>
            {scope === 'business' && 'Shows flooring business only: job income, direct job costs, marketing, and overhead.'}
            {scope === 'rentals' && 'Shows rental properties only: transactions linked to rental deals (cleared only).'}
            {scope === 'flips' && 'Shows flip projects only: capitalized rehab costs (no income until sale).'}
            {scope === 'all' && 'Shows everything including personal income and expenses.'}
          </p>
        </div>
      </div>
    </>
  );
}
