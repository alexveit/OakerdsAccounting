import React, { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatLocalDate } from '../../utils/date';

type PropertyData = {
  dealId: number;
  nickname: string;
  address: string;
  status: string;
  totalIncome: number;
  totalMortgageInterest: number;
  totalMortgagePrincipal: number;
  totalTaxesInsurance: number;
  totalRepairs: number;
  totalOtherExpenses: number;
  totalNetProfit: number;
  avgMonthlyRent: number;
  avgMonthlyExpenses: number;
  avgMonthlyNet: number;
  transactions: PropertyTransaction[];
  // Loan & equity
  loanBalance: number;
  propertyValue: number;
  propertyValueSource: 'ARV' | 'Purchase';
  equity: number;
};

type MortgageDetail = {
  accountName: string;
  amount: number;
};

type PropertyTransaction = {
  date: string;
  description: string;
  accountName: string;
  amount: number;
  // For aggregated mortgage payments
  isMortgageAggregate?: boolean;
  mortgageDetails?: MortgageDetail[];
};

type RawLine = {
  id: number;
  account_id: number;
  amount: number;
  real_estate_deal_id: number | null;
  accounts: { name: string; code: string | null; account_types: { name: string } | null } | null;
  transactions: { date: string; description: string | null } | null;
};

type Props = {
  selectedYear: string; // 'all' or '2024', '2025', etc.
};

/**
 * Calculate how many months are in the selected period for averaging.
 * For 'all' years, calculate from the earliest transaction to now.
 */
function getMonthsInPeriod(selectedYear: string, earliestDate?: string): number {
  if (selectedYear === 'all') {
    if (!earliestDate) return 1; // Fallback if no transactions
    
    const earliest = new Date(earliestDate + 'T00:00:00');
    const now = new Date();
    
    const yearDiff = now.getFullYear() - earliest.getFullYear();
    const monthDiff = now.getMonth() - earliest.getMonth();
    
    const totalMonths = yearDiff * 12 + monthDiff + 1; // +1 to include current month
    return Math.max(totalMonths, 1);
  }

  const year = parseInt(selectedYear, 10);
  const now = new Date();
  const currentYear = now.getFullYear();

  if (year < currentYear) {
    // Past year: full 12 months
    return 12;
  } else if (year === currentYear) {
    // Current year: months elapsed so far
    return now.getMonth() + 1;
  } else {
    // Future year: no data yet
    return 1;
  }
}

/**
 * Simplify account name for display (strip common prefixes)
 */
function simplifyAccountName(name: string): string {
  return name
    .replace(/^RE - /, '')
    .replace(/^Expense - /, '')
    .replace(/^Income - /, '');
}

/**
 * Aggregate mortgage-related transactions (Principal, Interest, Taxes & Insurance)
 * that occur on the same date into a single row with expandable details.
 */
function aggregateMortgagePayments(transactions: PropertyTransaction[]): PropertyTransaction[] {
  const mortgageCategories = ['Mortgage Principal', 'Mortgage Interest', 'Taxes & Insurance'];
  
  // Group transactions by date
  const byDate = new Map<string, PropertyTransaction[]>();
  const nonMortgage: PropertyTransaction[] = [];
  
  for (const tx of transactions) {
    if (mortgageCategories.includes(tx.accountName)) {
      const existing = byDate.get(tx.date) || [];
      existing.push(tx);
      byDate.set(tx.date, existing);
    } else {
      nonMortgage.push(tx);
    }
  }
  
  // Create aggregated mortgage rows
  const aggregated: PropertyTransaction[] = [];
  
  for (const [date, txs] of byDate.entries()) {
    if (txs.length === 1) {
      // Single mortgage component, keep as-is
      aggregated.push(txs[0]);
    } else {
      // Multiple components on same date, aggregate
      const totalAmount = txs.reduce((sum, t) => sum + t.amount, 0);
      const description = txs[0].description || 'Mortgage Payment';
      
      // Build details array sorted by type
      const details: MortgageDetail[] = txs
        .map((t) => ({ accountName: t.accountName, amount: t.amount }))
        .sort((a, b) => {
          // Sort order: Principal, Interest, Escrow
          const order = ['Mortgage Principal', 'Mortgage Interest', 'Taxes & Insurance'];
          return order.indexOf(a.accountName) - order.indexOf(b.accountName);
        });
      
      aggregated.push({
        date,
        description,
        accountName: 'Mortgage Payment',
        amount: totalAmount,
        isMortgageAggregate: true,
        mortgageDetails: details,
      });
    }
  }
  
  // Combine and sort by date descending
  const result = [...nonMortgage, ...aggregated];
  result.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  return result;
}

export function RentalOperationsView({ selectedYear }: Props) {
  const [properties, setProperties] = useState<Record<number, PropertyData>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProperties, setExpandedProperties] = useState<Record<number, boolean>>({});
  const [expandedMortgages, setExpandedMortgages] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadRentalData();
  }, [selectedYear]);

  async function loadRentalData() {
    setLoading(true);
    setError(null);

    try {
      // First, load all rental deals
      const { data: dealsData, error: dealsErr } = await supabase
        .from('real_estate_deals')
        .select('id, nickname, address, type, status, loan_account_id, arv, purchase_price, original_loan_amount')
        .eq('type', 'rental');

      if (dealsErr) throw dealsErr;

      const rentalDeals = (dealsData ?? []) as Array<{
        id: number;
        nickname: string;
        address: string;
        type: string;
        status: string;
        loan_account_id: number | null;
        arv: number | null;
        purchase_price: number | null;
        original_loan_amount: number | null;
      }>;

      if (rentalDeals.length === 0) {
        setProperties({});
        setLoading(false);
        return;
      }

      const dealIds = rentalDeals.map((d) => d.id);

      // Build date filter
      let startDate: string | null = null;
      let endDate: string | null = null;

      if (selectedYear !== 'all') {
        startDate = `${selectedYear}-01-01`;
        endDate = `${selectedYear}-12-31`;
      }

      // Load all transaction lines linked to rental deals
      let query = supabase
        .from('transaction_lines')
        .select(`
          id,
          account_id,
          amount,
          real_estate_deal_id,
          accounts (
            name,
            code,
            account_types (name)
          ),
          transactions!inner (date, description)
        `)
        .eq('is_cleared', true)
        .in('real_estate_deal_id', dealIds);

      if (startDate && endDate) {
        query = query.gte('transactions.date', startDate).lte('transactions.date', endDate);
      }

      const { data: linesData, error: linesErr } = await query;

      if (linesErr) throw linesErr;

      const lines = (linesData ?? []) as unknown as RawLine[];

      // Fetch loan account balances for equity calculations
      const loanAccountIds = rentalDeals
        .map((d) => d.loan_account_id)
        .filter((id): id is number => id !== null);

      let loanBalances = new Map<number, number>();
      if (loanAccountIds.length > 0) {
        const { data: balancesData, error: balancesErr } = await supabase
          .from('account_balances_v')
          .select('account_id, balance')
          .in('account_id', loanAccountIds);

        if (balancesErr) throw balancesErr;

        for (const row of balancesData ?? []) {
          loanBalances.set(row.account_id, Number(row.balance) || 0);
        }
      }

      // Initialize property map from deals
      const propertyMap = new Map<number, PropertyData>();

      for (const deal of rentalDeals) {
        // Loan balance is negative (amount owed), so take absolute value
        const rawLoanBalance = deal.loan_account_id ? (loanBalances.get(deal.loan_account_id) ?? 0) : 0;
        const loanBalance = Math.abs(rawLoanBalance);
        const propertyValue = deal.arv ?? deal.purchase_price ?? 0;
        const propertyValueSource: 'ARV' | 'Purchase' = deal.arv ? 'ARV' : 'Purchase';
        const equity = propertyValue - loanBalance;

        propertyMap.set(deal.id, {
          dealId: deal.id,
          nickname: deal.nickname,
          address: deal.address,
          status: deal.status,
          propertyValue,
          propertyValueSource,
          totalIncome: 0,
          totalMortgageInterest: 0,
          totalMortgagePrincipal: 0,
          totalTaxesInsurance: 0,
          totalRepairs: 0,
          totalOtherExpenses: 0,
          totalNetProfit: 0,
          avgMonthlyRent: 0,
          avgMonthlyExpenses: 0,
          avgMonthlyNet: 0,
          transactions: [],
          loanBalance,
          equity,
        });
      }

      // Process transaction lines
      for (const line of lines) {
        const dealId = line.real_estate_deal_id;
        if (!dealId || !propertyMap.has(dealId)) continue;

        const property = propertyMap.get(dealId)!;
        const accountName = line.accounts?.name ?? '';
        const accountCode = line.accounts?.code ?? '';
        const accType = line.accounts?.account_types?.name;
        const amount = Number(line.amount) || 0;
        const absAmount = Math.abs(amount);

        // Categorize by account
        if (accType === 'income') {
          property.totalIncome += absAmount;
          property.transactions.push({
            date: line.transactions?.date ?? '',
            description: line.transactions?.description ?? '',
            accountName: 'Rent Income',
            amount: absAmount,
          });
        } else if (accType === 'expense') {
          // Categorize expense type by account name or code
          if (accountName.includes('Mortgage Interest') || accountCode === '62012') {
            property.totalMortgageInterest += absAmount;
            property.transactions.push({
              date: line.transactions?.date ?? '',
              description: line.transactions?.description ?? '',
              accountName: 'Mortgage Interest',
              amount: -absAmount,
            });
          } else if (accountName.includes('Taxes') || accountName.includes('Insurance') || accountCode === '62011') {
            property.totalTaxesInsurance += absAmount;
            property.transactions.push({
              date: line.transactions?.date ?? '',
              description: line.transactions?.description ?? '',
              accountName: 'Taxes & Insurance',
              amount: -absAmount,
            });
          } else if (accountName.includes('Repairs') || accountName.includes('Maintenance') || accountCode === '62005') {
            property.totalRepairs += absAmount;
            property.transactions.push({
              date: line.transactions?.date ?? '',
              description: line.transactions?.description ?? '',
              accountName: 'Repairs',
              amount: -absAmount,
            });
          } else {
            property.totalOtherExpenses += absAmount;
            property.transactions.push({
              date: line.transactions?.date ?? '',
              description: line.transactions?.description ?? '',
              accountName: simplifyAccountName(accountName),
              amount: -absAmount,
            });
          }
        } else if (accType === 'liability') {
          // Principal payments (debit to loan liability = positive amount reducing the loan)
          if (accountName.includes('Mortgage') || accountCode?.startsWith('63')) {
            property.totalMortgagePrincipal += absAmount;
            property.transactions.push({
              date: line.transactions?.date ?? '',
              description: line.transactions?.description ?? '',
              accountName: 'Mortgage Principal',
              amount: -absAmount,
            });
          }
        }
      }

      // Calculate derived metrics
      for (const property of propertyMap.values()) {
        const totalExpenses =
          property.totalMortgageInterest +
          property.totalMortgagePrincipal +
          property.totalTaxesInsurance +
          property.totalRepairs +
          property.totalOtherExpenses;

        property.totalNetProfit = property.totalIncome - totalExpenses;

        // Find earliest transaction date for this property
        const transactionDates = property.transactions
          .map((t) => t.date)
          .filter((d) => d)
          .sort();
        const earliestDate = transactionDates.length > 0 ? transactionDates[0] : undefined;

        const monthsInPeriod = getMonthsInPeriod(selectedYear, earliestDate);

        if (monthsInPeriod > 0) {
          property.avgMonthlyRent = property.totalIncome / monthsInPeriod;
          property.avgMonthlyExpenses = totalExpenses / monthsInPeriod;
          property.avgMonthlyNet = property.totalNetProfit / monthsInPeriod;
        }

        // Sort transactions by date descending
        property.transactions.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        // Aggregate mortgage payments by date
        property.transactions = aggregateMortgagePayments(property.transactions);
      }

      // Convert map to object keyed by deal ID
      const propertiesObj: Record<number, PropertyData> = {};
      for (const [dealId, data] of propertyMap.entries()) {
        propertiesObj[dealId] = data;
      }

      setProperties(propertiesObj);
      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load rental data');
      setLoading(false);
    }
  }

  function handleToggleProperty(dealId: number) {
    setExpandedProperties((prev) => ({
      ...prev,
      [dealId]: !prev[dealId],
    }));
  }

  function handleToggleMortgage(key: string, e: React.MouseEvent) {
    e.stopPropagation(); // Don't toggle the property card
    setExpandedMortgages((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  const currency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  if (loading) return <p>Loading rental data...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  const propertyList = Object.values(properties);
  const propertyCount = propertyList.length;

  // Portfolio totals
  const portfolioTotalIncome = propertyList.reduce((sum, p) => sum + p.totalIncome, 0);
  const portfolioDeductibleExpenses = propertyList.reduce(
    (sum, p) =>
      sum +
      p.totalMortgageInterest +
      p.totalTaxesInsurance +
      p.totalRepairs +
      p.totalOtherExpenses,
    0
  );
  const portfolioPrincipalPaydown = propertyList.reduce((sum, p) => sum + p.totalMortgagePrincipal, 0);
  const portfolioTotalCashOut = portfolioDeductibleExpenses + portfolioPrincipalPaydown;
  const portfolioTaxableNOI = portfolioTotalIncome - portfolioDeductibleExpenses;
  const portfolioTrueCashFlow = portfolioTotalIncome - portfolioTotalCashOut;
  const portfolioTotalLoanBalance = propertyList.reduce((sum, p) => sum + p.loanBalance, 0);
  const portfolioTotalEquity = propertyList.reduce((sum, p) => sum + p.equity, 0);

  // Monthly average (based on period)
  const earliestDate = propertyList
    .flatMap((p) => p.transactions.map((t) => t.date))
    .filter(Boolean)
    .sort()[0];
  const monthsInPeriod = getMonthsInPeriod(selectedYear, earliestDate);
  const portfolioAvgMonthlyNet = portfolioTrueCashFlow / monthsInPeriod;

  const periodLabel = selectedYear === 'all' ? 'Total' : selectedYear;

  return (
    <div>
      {propertyCount === 0 && (
        <div className="card">
          <p style={{ fontSize: 14, color: '#777' }}>
            No rental properties found. Create a real estate deal with type "rental" to track properties here.
          </p>
        </div>
      )}

      {propertyCount > 0 && (
        <>
          {/* Portfolio Summary - Two Cards */}
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {/* Card 1: Operations */}
            <div
              className="card"
              style={{
                padding: '0.6rem 1rem',
                display: 'flex',
                gap: '1.25rem',
                alignItems: 'center',
                fontSize: 15,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <span style={{ color: '#777' }}>Props </span>
                <span style={{ fontWeight: 700 }}>{propertyCount}</span>
              </div>
              <div>
                <span style={{ color: '#777' }}>Income </span>
                <span style={{ fontWeight: 700, color: '#0a7a3c' }}>{currency(portfolioTotalIncome)}</span>
              </div>
              <div>
                <span style={{ color: '#777' }}>Deduct </span>
                <span style={{ fontWeight: 700, color: '#b00020' }}>-{currency(portfolioDeductibleExpenses)}</span>
              </div>
              <div>
                <span style={{ color: '#777' }}>Tax NOI </span>
                <span style={{ fontWeight: 700, color: portfolioTaxableNOI >= 0 ? '#0a7a3c' : '#b00020' }}>
                  {currency(portfolioTaxableNOI)}
                </span>
              </div>
              <div>
                <span style={{ color: '#777' }}>Principal </span>
                <span style={{ fontWeight: 700, color: '#1565c0' }}>{currency(portfolioPrincipalPaydown)}</span>
              </div>
              <div>
                <span style={{ color: '#777' }}>Cash Flow </span>
                <span style={{ fontWeight: 700, color: portfolioTrueCashFlow >= 0 ? '#0a7a3c' : '#b00020' }}>
                  {currency(portfolioTrueCashFlow)}
                </span>
              </div>
              <div>
                <span style={{ color: '#777' }}>Mo Avg </span>
                <span style={{ fontWeight: 700, color: portfolioAvgMonthlyNet >= 0 ? '#0a7a3c' : '#b00020' }}>
                  {currency(portfolioAvgMonthlyNet)}
                </span>
              </div>
            </div>

            {/* Card 2: Balance Sheet */}
            <div
              className="card"
              style={{
                padding: '0.6rem 1rem',
                display: 'flex',
                gap: '1.25rem',
                alignItems: 'center',
                fontSize: 15,
              }}
            >
              <div>
                <span style={{ color: '#777' }}>Loans </span>
                <span style={{ fontWeight: 700, color: '#b00020' }}>{currency(portfolioTotalLoanBalance)}</span>
              </div>
              <div>
                <span style={{ color: '#777' }}>Equity </span>
                <span style={{ fontWeight: 700, color: '#0a7a3c' }}>{currency(portfolioTotalEquity)}</span>
              </div>
            </div>
          </div>

          {/* Property Cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {propertyList.map((property) => {
              const isExpanded = expandedProperties[property.dealId] ?? false;
              const marginPct =
                property.totalIncome > 0
                  ? (property.totalNetProfit / property.totalIncome) * 100
                  : 0;

              const totalMortgage = property.totalMortgageInterest + property.totalMortgagePrincipal;

              return (
                <div
                  key={property.dealId}
                  onClick={() => handleToggleProperty(property.dealId)}
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
                    {property.nickname}
                    <span style={{ fontSize: 13, fontWeight: 400, color: '#666', marginLeft: '0.5rem' }}>
                      {property.address}
                    </span>
                  </h3>

                  {/* Loan Balance, ARV & Equity */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '1.5rem',
                      fontSize: 13,
                      color: '#555',
                      marginBottom: '0.5rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span>
                      <strong>Loan Balance:</strong>{' '}
                      <span style={{ color: '#b00020' }}>{currency(property.loanBalance)}</span>
                    </span>
                    <span>
                      <strong>{property.propertyValueSource}:</strong>{' '}
                      <span>{currency(property.propertyValue)}</span>
                    </span>
                    <span>
                      <strong>Equity:</strong>{' '}
                      <span style={{ color: property.equity >= 0 ? '#0a7a3c' : '#b00020' }}>
                        {currency(property.equity)}
                      </span>
                    </span>
                  </div>

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
                      <strong>Avg Rent:</strong> {currency(property.avgMonthlyRent)}/mo
                    </span>
                    <span>
                      <strong>Avg Expenses:</strong> {currency(property.avgMonthlyExpenses)}/mo
                    </span>
                    <span
                      style={{
                        color: property.avgMonthlyNet >= 0 ? '#0a7a3c' : '#b00020',
                        fontWeight: 600,
                      }}
                    >
                      <strong>Avg Net:</strong> {currency(property.avgMonthlyNet)}/mo
                    </span>
                  </div>

                  {/* Period Stats */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                      gap: '0.75rem',
                      fontSize: 14,
                      marginBottom: '0.75rem',
                    }}
                  >
                    <Stat label={`${periodLabel} Income`} value={property.totalIncome} money />
                    <Stat label="Mortgage (P+I)" value={totalMortgage} money />
                    <Stat label="Taxes & Ins" value={property.totalTaxesInsurance} money />
                    <Stat label="Repairs" value={property.totalRepairs} money />
                    <Stat label="Other Exp" value={property.totalOtherExpenses} money />
                    <Stat
                      label="Net Profit"
                      value={property.totalNetProfit}
                      money
                      highlight={property.totalNetProfit >= 0 ? 'positive' : 'negative'}
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
                        <p style={{ fontSize: 13 }}>No transactions found for this period.</p>
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
                            {property.transactions.map((tx, idx) => {
                              const mortgageKey = `${property.dealId}-${tx.date}`;
                              const isMortgageExpanded = expandedMortgages[mortgageKey] ?? false;
                              
                              if (tx.isMortgageAggregate && tx.mortgageDetails) {
                                // Aggregated mortgage row with expandable details
                                return (
                                  <React.Fragment key={idx}>
                                    <tr
                                      onClick={(e) => handleToggleMortgage(mortgageKey, e)}
                                      style={{ cursor: 'pointer', backgroundColor: isMortgageExpanded ? '#f8f9fa' : undefined }}
                                    >
                                      <Td>{formatLocalDate(tx.date)}</Td>
                                      <Td>
                                        <span style={{ marginRight: '0.4rem' }}>
                                          {isMortgageExpanded ? '▾' : '▸'}
                                        </span>
                                        {tx.description}
                                      </Td>
                                      <Td>{tx.accountName}</Td>
                                      <Td align="right">
                                        <span style={{ color: '#b00020', fontWeight: 500 }}>
                                          {currency(tx.amount)}
                                        </span>
                                      </Td>
                                    </tr>
                                    {isMortgageExpanded && tx.mortgageDetails.map((detail, detailIdx) => (
                                      <tr
                                        key={`${idx}-detail-${detailIdx}`}
                                        style={{ backgroundColor: '#f8f9fa' }}
                                      >
                                        <Td>&nbsp;</Td>
                                        <Td>
                                          <span style={{ paddingLeft: '1.5rem', color: '#666', fontSize: 12 }}>
                                            └ {detail.accountName}
                                          </span>
                                        </Td>
                                        <Td>&nbsp;</Td>
                                        <Td align="right">
                                          <span style={{ color: '#666', fontSize: 12 }}>
                                            {currency(detail.amount)}
                                          </span>
                                        </Td>
                                      </tr>
                                    ))}
                                  </React.Fragment>
                                );
                              }
                              
                              // Regular transaction row
                              return (
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
                              );
                            })}
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

// ------------------------------------------------------------------
// Helper Components
// ------------------------------------------------------------------

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
      <div style={{ fontSize: 16, fontWeight: 600, color }}>{display}</div>
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