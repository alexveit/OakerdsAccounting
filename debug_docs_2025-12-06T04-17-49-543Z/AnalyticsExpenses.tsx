import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  isMarketingExpenseCode,
  isRentalExpenseCode,
  isFlipExpenseCode,
  type Purpose,
} from '../utils/accounts';
import { formatCurrency } from '../utils/format';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';

type ExpenseChartData = {
  id: number;
  name: string;
  fullName: string;
  amount: number;
};

type ExpenseData = {
  job: ExpenseChartData[];
  marketing: ExpenseChartData[];
  overhead: ExpenseChartData[];
  rental: ExpenseChartData[];
  flip: ExpenseChartData[];
  personal: ExpenseChartData[];
};

function truncateLabel(name: string, maxLen = 12): string {
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name;
}

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
        <p style={{ margin: 0, color: '#333' }}>{formatCurrency(data.amount, 2)}</p>
      </div>
    );
  }
  return null;
};

const ExpenseBarChart = ({
  data,
  color,
  title,
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
            dataKey="fullName"
            angle={-45}
            textAnchor="end"
            height={70}
            tick={{ fontSize: 10 }}
            interval={0}
            tickFormatter={(value) => truncateLabel(value)}
          />
          <YAxis
            tickFormatter={(value) => formatCurrency(value, 0)}
            tick={{ fontSize: 10 }}
            width={45}
            domain={[0, (dataMax: number) => Math.ceil((dataMax * 1.1) / 1000) * 1000]}
          />
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const item = payload[0].payload;
                return (
                  <div
                    style={{
                      backgroundColor: 'white',
                      padding: '10px',
                      border: '1px solid #ccc',
                      borderRadius: '4px',
                    }}
                  >
                    <p style={{ margin: '0 0 4px 0', fontWeight: 600 }}>{item.fullName}</p>
                    <p style={{ margin: 0, color: '#333' }}>{formatCurrency(item.amount, 2)}</p>
                  </div>
                );
              }
              return null;
            }}
          />
          <Bar dataKey="amount" fill={color} />
        </BarChart>
      </ResponsiveContainer>
    )}
  </div>
);

export function AnalyticsExpenses() {
  const [expenseData, setExpenseData] = useState<ExpenseData>({
    job: [],
    marketing: [],
    overhead: [],
    rental: [],
    flip: [],
    personal: [],
  });

  useEffect(() => {
    async function loadExpenseData() {
      try {
        const currentYear = new Date().getFullYear();
        const startDate = `${currentYear}-01-01`;
        const endDate = `${currentYear}-12-31`;

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

        const jobExpenses = new Map<number, { name: string; amount: number }>();
        const marketingExpenses = new Map<number, { name: string; amount: number }>();
        const overheadExpenses = new Map<number, { name: string; amount: number }>();
        const rentalExpenses = new Map<number, { name: string; amount: number }>();
        const flipExpenses = new Map<number, { name: string; amount: number }>();
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

          let targetMap: Map<number, { name: string; amount: number }> | null = null;

          if (isPersonal) {
            targetMap = personalExpenses;
          } else if (isBusiness && isFlipExpenseCode(code)) {
            targetMap = flipExpenses;
          } else if (isBusiness && isRentalExpenseCode(code)) {
            targetMap = rentalExpenses;
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

        const sortAndLimit = (
          map: Map<number, { name: string; amount: number }>,
          limit = 15
        ): ExpenseChartData[] => {
          return Array.from(map.entries())
            .sort((a, b) => b[1].amount - a[1].amount)
            .slice(0, limit)
            .map(([accountId, item]) => ({
              id: accountId,
              name: truncateLabel(item.name),
              fullName: item.name,
              amount: item.amount,
            }));
        };

        setExpenseData({
          job: sortAndLimit(jobExpenses),
          marketing: sortAndLimit(marketingExpenses),
          overhead: sortAndLimit(overheadExpenses),
          rental: sortAndLimit(rentalExpenses),
          flip: sortAndLimit(flipExpenses),
          personal: sortAndLimit(personalExpenses),
        });
      } catch (err) {
        console.error('Error loading expense data:', err);
      }
    }

    loadExpenseData();
  }, []);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(480px, 1fr))',
        gap: '1rem',
        alignItems: 'start',
      }}
    >
      <ExpenseBarChart data={expenseData.job} color="#1565c0" title="Direct Job Expenses" />
      <ExpenseBarChart data={expenseData.marketing} color="#e65100" title="Marketing Expenses" />
      <ExpenseBarChart data={expenseData.overhead} color="#7b1fa2" title="Overhead Expenses" />
      <ExpenseBarChart data={expenseData.rental} color="#0a7a3c" title="Rental Expenses" />
      <ExpenseBarChart data={expenseData.flip} color="#d4a017" title="Flip Expenses (Capitalized)" />
      <ExpenseBarChart data={expenseData.personal} color="#b00020" title="Personal/Other Expenses" />
    </div>
  );
}
