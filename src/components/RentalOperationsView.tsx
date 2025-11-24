import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDate } from '../utils/date';

type PropertyData = {
  address: string;
  ytdIncome: number;
  ytdMortgage: number;
  ytdRepairs: number;
  ytdOtherExpenses: number;
  ytdNetProfit: number;
  monthlyRent: number;
  monthlyMortgage: number;
  monthlyNet: number;
  transactions: PropertyTransaction[];
};

type PropertyTransaction = {
  date: string;
  description: string;
  accountName: string;
  amount: number;
};

type RawLine = {
  id: number;
  account_id: number;
  amount: number;
  accounts: { name: string; account_types: { name: string } | null } | null;
  transactions: { date: string; description: string | null } | null;
};

export function RentalOperationsView() {
  const [properties, setProperties] = useState<Record<string, PropertyData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProperties, setExpandedProperties] = useState<Record<string, boolean>>({});

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    loadRentalData();
  }, []);

  async function loadRentalData() {
    setLoading(true);
    setError(null);

    try {
      const startDate = `${currentYear}-01-01`;
      const endDate = `${currentYear}-12-31`;

      // Load all cleared rental-related transaction lines for current year
      const { data: linesData, error: linesErr } = await supabase
        .from('transaction_lines')
        .select(`
          id,
          account_id,
          amount,
          purpose,
          accounts!inner (
            name,
            account_type_id,
            account_types (name)
          ),
          transactions!inner (date, description)
        `)
        .eq('is_cleared', true)
        .eq('purpose', 'business')
        .like('accounts.name', '%Rental%')
        .gte('transactions.date', startDate)
        .lte('transactions.date', endDate);

      if (linesErr) throw linesErr;

      const lines = (linesData ?? []) as any[] as RawLine[];

      // DEBUG: Log what we're actually getting
      console.log('=== RENTAL DATA DEBUG ===');
      console.log('Total lines fetched:', lines.length);
      console.log('First 3 lines:', lines.slice(0, 3));
      console.log('Sample line structure:', JSON.stringify(lines[0], null, 2));

      // Filter for rental accounts only
      const rentalLines = lines.filter(
        (line) => line.accounts?.name?.includes('Rental')
      );

      console.log('Rental lines after filter:', rentalLines.length);
      console.log('First rental line:', rentalLines[0]);

      // Group by property (extract address from account name)
      const propertyMap = new Map<string, PropertyData>();

      for (const line of rentalLines) {
        const accountName = line.accounts?.name ?? '';
        const accType = line.accounts?.account_types?.name;

        console.log('Processing line:', {
          accountName,
          accType,
          amount: line.amount
        });

        // Extract property address - just take everything after the last " - "
        const parts = accountName.split(' - ');
        const address = parts[parts.length - 1].trim();
        
        console.log('Extracted address:', address);
        
        if (!address || address.length === 0) {
          console.warn('Could not extract address from:', accountName);
          continue;
        }

        // Initialize property if not exists
        if (!propertyMap.has(address)) {
          propertyMap.set(address, {
            address,
            ytdIncome: 0,
            ytdMortgage: 0,
            ytdRepairs: 0,
            ytdOtherExpenses: 0,
            ytdNetProfit: 0,
            monthlyRent: 0,
            monthlyMortgage: 0,
            monthlyNet: 0,
            transactions: [],
          });
        }

        const property = propertyMap.get(address)!;
        const amount = Number(line.amount) || 0;
        const absAmount = Math.abs(amount);

        // Categorize transactions
        if (accType === 'income') {
          property.ytdIncome += absAmount;
          property.transactions.push({
            date: line.transactions?.date ?? '',
            description: line.transactions?.description ?? '',
            accountName: 'Rent Income',
            amount: absAmount,
          });
        } else if (accType === 'expense') {
          if (accountName.includes('Mortgage')) {
            property.ytdMortgage += absAmount;
            property.transactions.push({
              date: line.transactions?.date ?? '',
              description: line.transactions?.description ?? '',
              accountName: 'Mortgage',
              amount: -absAmount,
            });
          } else if (accountName.includes('Repairs') || accountName.includes('Maintenance')) {
            property.ytdRepairs += absAmount;
            property.transactions.push({
              date: line.transactions?.date ?? '',
              description: line.transactions?.description ?? '',
              accountName: 'Repairs',
              amount: -absAmount,
            });
          } else {
            property.ytdOtherExpenses += absAmount;
            property.transactions.push({
              date: line.transactions?.date ?? '',
              description: line.transactions?.description ?? '',
              accountName: accountName.replace(/^Expense - Rental - /, '').replace(/ - .+$/, ''),
              amount: -absAmount,
            });
          }
        }
      }

      // Calculate derived metrics for each property
      for (const property of propertyMap.values()) {
        property.ytdNetProfit =
          property.ytdIncome -
          property.ytdMortgage -
          property.ytdRepairs -
          property.ytdOtherExpenses;

        // Calculate monthly averages (divide by months elapsed)
        const today = new Date();
        const monthsElapsed = today.getMonth() + 1;

        if (monthsElapsed > 0) {
          property.monthlyRent = property.ytdIncome / monthsElapsed;
          property.monthlyMortgage = property.ytdMortgage / monthsElapsed;
          property.monthlyNet = property.ytdNetProfit / monthsElapsed;
        }

        // Sort transactions by date descending
        property.transactions.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );
      }

      // Convert map to object
      const propertiesObj: Record<string, PropertyData> = {};
      for (const [address, data] of propertyMap.entries()) {
        propertiesObj[address] = data;
      }

      setProperties(propertiesObj);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load rental data');
      setLoading(false);
    }
  }

  function handleToggleProperty(address: string) {
    setExpandedProperties((prev) => ({
      ...prev,
      [address]: !prev[address],
    }));
  }

  const currency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  if (loading) return <p>Loading rental data…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  const propertyList = Object.values(properties);
  const propertyCount = propertyList.length;

  // Portfolio totals
  const portfolioMonthlyRent = propertyList.reduce((sum, p) => sum + p.monthlyRent, 0);
  const portfolioMonthlyExpenses = propertyList.reduce(
    (sum, p) => sum + p.monthlyMortgage + (p.ytdRepairs + p.ytdOtherExpenses) / 11,
    0
  );
  const portfolioMonthlyNet = propertyList.reduce((sum, p) => sum + p.monthlyNet, 0);

  return (
    <div>
      <h2>Rental Operations</h2>

      {propertyCount === 0 && (
        <div className="card">
          <p style={{ fontSize: 14, color: '#777' }}>
            No rental properties found. Create rental accounts with "Rental" in the name to track properties here.
          </p>
        </div>
      )}

      {propertyCount > 0 && (
        <>
          {/* Portfolio Summary */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem',
            }}
          >
            <SummaryCard label="Properties" value={propertyCount} isCount />
            <SummaryCard label="Avg Monthly Rent" value={portfolioMonthlyRent} />
            <SummaryCard label="Avg Monthly Expenses" value={portfolioMonthlyExpenses} />
            <SummaryCard
              label="Avg Monthly Cash Flow"
              value={portfolioMonthlyNet}
              highlight={portfolioMonthlyNet >= 0 ? 'positive' : 'negative'}
            />
          </div>

          {/* Property Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {propertyList.map((property) => {
              const isExpanded = expandedProperties[property.address] ?? false;
              const marginPct =
                property.ytdIncome > 0
                  ? (property.ytdNetProfit / property.ytdIncome) * 100
                  : 0;

              return (
                <div
                  key={property.address}
                  onClick={() => handleToggleProperty(property.address)}
                  style={{
                    borderRadius: 12,
                    border: '1px solid #eee',
                    padding: '1rem 1.25rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    background: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  {/* Property Header */}
                  <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>
                    {property.address}
                  </h3>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1rem',
                      fontSize: 13,
                      color: '#555',
                      marginBottom: '0.75rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <strong>Avg Rent:</strong> {currency(property.monthlyRent)}/mo
                    </span>
                    <span>
                      <strong>Avg Mortgage:</strong> {currency(property.monthlyMortgage)}/mo
                    </span>
                    <span
                      style={{
                        color: property.monthlyNet >= 0 ? '#0a7a3c' : '#b00020',
                        fontWeight: 600,
                      }}
                    >
                      <strong>Avg Net:</strong> {currency(property.monthlyNet)}/mo
                    </span>
                  </div>

                  {/* YTD Stats */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: '0.75rem',
                      fontSize: 14,
                      marginBottom: '0.75rem',
                    }}
                  >
                    <Stat label="YTD Income" value={property.ytdIncome} money />
                    <Stat label="YTD Mortgage" value={property.ytdMortgage} money />
                    <Stat label="YTD Repairs" value={property.ytdRepairs} money />
                    <Stat label="YTD Other Exp" value={property.ytdOtherExpenses} money />
                    <Stat
                      label="YTD Net Profit"
                      value={property.ytdNetProfit}
                      money
                      highlight={property.ytdNetProfit >= 0 ? 'positive' : 'negative'}
                    />
                    <Stat label="Margin" value={marginPct} suffix="%" />
                  </div>

                  {/* Transactions */}
                  <h4
                    style={{
                      marginTop: '1rem',
                      borderTop: '1px solid #eee',
                      paddingTop: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      fontSize: 15,
                    }}
                  >
                    <span>{isExpanded ? '▾' : '▸'}</span>
                    <span>Transactions ({property.transactions.length})</span>
                  </h4>

                  {isExpanded && (
                    <>
                      {property.transactions.length === 0 && (
                        <p style={{ fontSize: 13 }}>No transactions found.</p>
                      )}

                      {property.transactions.length > 0 && (
                        <table
                          style={{
                            borderCollapse: 'collapse',
                            width: '100%',
                            fontSize: 13,
                            marginTop: '0.5rem',
                          }}
                        >
                          <thead>
                            <tr>
                              <Th>Date</Th>
                              <Th>Description</Th>
                              <Th>Category</Th>
                              <Th align="right">Amount</Th>
                            </tr>
                          </thead>
                          <tbody>
                            {property.transactions.map((tx, idx) => (
                              <tr key={idx}>
                                <Td>{formatLocalDate(tx.date)}</Td>
                                <Td>{tx.description}</Td>
                                <Td>{tx.accountName}</Td>
                                <Td align="right">
                                  <span
                                    style={{
                                      color: tx.amount >= 0 ? '#0a7a3c' : '#b00020',
                                    }}
                                  >
                                    {currency(tx.amount)}
                                  </span>
                                </Td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
  isCount,
}: {
  label: string;
  value: number;
  highlight?: 'positive' | 'negative';
  isCount?: boolean;
}) {
  let color = '#111';
  if (highlight === 'positive') color = '#0a7a3c';
  if (highlight === 'negative') color = '#b00020';

  const text = isCount
    ? value.toString()
    : value.toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
      });

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid #eee',
        padding: '0.6rem 0.9rem',
        background: '#fff',
      }}
    >
      <div style={{ fontSize: 16, color: '#777', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 600, fontSize: 22, color }}>{text}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  money,
  suffix,
  highlight,
}: {
  label: string;
  value: number;
  money?: boolean;
  suffix?: string;
  highlight?: 'positive' | 'negative';
}) {
  let color = '#111';
  if (highlight === 'positive') color = '#0a7a3c';
  if (highlight === 'negative') color = '#b00020';

  const display = money
    ? `$${value.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : `${value.toFixed(1)}${suffix ?? ''}`;

  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#777' }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 600, color }}>{display}</div>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      style={{
        borderBottom: '1px solid #ccc',
        textAlign: align,
        padding: '4px 6px',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      style={{
        padding: '3px 6px',
        textAlign: align,
        borderBottom: '1px solid #f2f2f2',
      }}
    >
      {children}
    </td>
  );
}