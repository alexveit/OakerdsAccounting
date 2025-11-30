import { useMemo, useState } from 'react';

type FlipStatus = 'analyzing' | 'acquiring' | 'rehab' | 'listed' | 'sold';

type FlipDeal = {
  id: number;
  nickname: string;
  address: string;
  status: FlipStatus;
  purchasePrice: number | null;
  arv: number | null;
  rehabBudget: number | null;
  rehabSpent: number | null;
  closingCostsEstimate: number | null;
  salePrice: number | null;
  projectedProfit: number | null;
  actualProfit: number | null;
  daysInDeal: number | null;
};

const mockFlips: FlipDeal[] = [
  {
    id: 1,
    nickname: 'Lithonia Ranch',
    address: '123 Example Dr, Lithonia, GA',
    status: 'rehab',
    purchasePrice: 210_000,
    arv: 340_000,
    rehabBudget: 65_000,
    rehabSpent: 32_500,
    closingCostsEstimate: 12_000,
    salePrice: null,
    projectedProfit: 340_000 - 210_000 - 65_000 - 12_000,
    actualProfit: null,
    daysInDeal: 45,
  },
  {
    id: 2,
    nickname: 'Medlock Park Brick',
    address: '1068 Willivee Dr, Decatur, GA',
    status: 'analyzing',
    purchasePrice: 365_000,
    arv: 525_000,
    rehabBudget: 90_000,
    rehabSpent: null,
    closingCostsEstimate: 16_000,
    salePrice: null,
    projectedProfit: 525_000 - 365_000 - 90_000 - 16_000,
    actualProfit: null,
    daysInDeal: null,
  },
  {
    id: 3,
    nickname: 'Old Project (Sold)',
    address: '789 Sample Ln, Atlanta, GA',
    status: 'sold',
    purchasePrice: 180_000,
    arv: 260_000,
    rehabBudget: 50_000,
    rehabSpent: 48_000,
    closingCostsEstimate: 10_000,
    salePrice: 262_500,
    projectedProfit: 260_000 - 180_000 - 50_000 - 10_000,
    actualProfit: 262_500 - 180_000 - 48_000 - 10_000,
    daysInDeal: 120,
  },
];

export function FlipOperationsView() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const portfolioStats = useMemo(() => {
    const active = mockFlips.filter((d) => d.status !== 'sold');
    const sold = mockFlips.filter((d) => d.status === 'sold');

    const activeCount = active.length;
    const soldCount = sold.length;

    const totalProjected = active.reduce(
      (sum, d) => sum + (d.projectedProfit ?? 0),
      0
    );
    const totalRealized = sold.reduce(
      (sum, d) => sum + (d.actualProfit ?? 0),
      0
    );

    const avgDaysInDeal =
      sold.length > 0
        ? sold.reduce((sum, d) => sum + (d.daysInDeal ?? 0), 0) /
          sold.length
        : 0;

    return {
      activeCount,
      soldCount,
      totalProjected,
      totalRealized,
      avgDaysInDeal,
    };
  }, []);

  const currency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  const number = (value: number, digits = 1) =>
    value.toFixed(digits).replace(/\.0+$/, '');

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Flip Pipeline</h3>

      {/* Portfolio summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <SummaryCard label="Active Flips" value={portfolioStats.activeCount} isCount />
        <SummaryCard label="Sold Flips" value={portfolioStats.soldCount} isCount />
        <SummaryCard
          label="Projected Profit (Active)"
          value={portfolioStats.totalProjected}
        />
        <SummaryCard
          label="Realized Profit (Sold)"
          value={portfolioStats.totalRealized}
          highlight={portfolioStats.totalRealized >= 0 ? 'positive' : 'negative'}
        />
        <SummaryCard
          label="Avg Days in Deal (Sold)"
          value={portfolioStats.avgDaysInDeal}
          isDays
        />
      </div>

      {/* Deal cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {mockFlips.map((deal) => {
          const isExpanded = expandedId === deal.id;

          const totalCost =
            (deal.purchasePrice ?? 0) +
            (deal.rehabSpent ?? deal.rehabBudget ?? 0) +
            (deal.closingCostsEstimate ?? 0);

          const marginPct =
            deal.arv && totalCost > 0
              ? ((deal.arv - totalCost) / deal.arv) * 100
              : 0;

          return (
            <div
              key={deal.id}
              onClick={() =>
                setExpandedId((prev) => (prev === deal.id ? null : deal.id))
              }
              style={{
                borderRadius: 12,
                border: '1px solid #eee',
                padding: '1rem 1.25rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                background: '#fff',
                cursor: 'pointer',
              }}
            >
              {/* Header */}
              <h4 style={{ marginTop: 0, marginBottom: '0.25rem' }}>
                {deal.nickname}
              </h4>
              <div
                style={{
                  fontSize: 13,
                  color: '#555',
                  marginBottom: '0.5rem',
                }}
              >
                {deal.address}
              </div>

              {/* Status row */}
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                  fontSize: 12,
                  color: '#555',
                  marginBottom: '0.75rem',
                }}
              >
                <span>
                  <strong>Status:</strong> {deal.status}
                </span>
                {deal.daysInDeal != null && (
                  <span>
                    <strong>Days in deal:</strong> {deal.daysInDeal}
                  </span>
                )}
                {deal.arv != null && (
                  <span>
                    <strong>ARV:</strong> {currency(deal.arv)}
                  </span>
                )}
              </div>

              {/* Stats grid */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '0.75rem',
                  fontSize: 14,
                  marginBottom: '0.75rem',
                }}
              >
                <Stat
                  label="Purchase"
                  value={deal.purchasePrice ?? 0}
                  money
                />
                <Stat
                  label="Rehab Budget"
                  value={deal.rehabBudget ?? 0}
                  money
                />
                <Stat
                  label="Rehab Spent"
                  value={deal.rehabSpent ?? 0}
                  money
                />
                <Stat
                  label="Closing Costs Est."
                  value={deal.closingCostsEstimate ?? 0}
                  money
                />
                <Stat
                  label="Projected Profit"
                  value={deal.projectedProfit ?? 0}
                  money
                  highlight={
                    (deal.projectedProfit ?? 0) >= 0 ? 'positive' : 'negative'
                  }
                />
                <Stat
                  label="Actual Profit"
                  value={deal.actualProfit ?? 0}
                  money
                  highlight={
                    (deal.actualProfit ?? 0) >= 0 ? 'positive' : 'negative'
                  }
                />
                <Stat label="Margin" value={marginPct} suffix="%" />
              </div>

              {/* Expand toggle label */}
              <div
                style={{
                  borderTop: '1px solid #eee',
                  paddingTop: '0.5rem',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                }}
              >
                <span>{isExpanded ? '▾' : '▸'}</span>
                <span>Details</span>
              </div>

              {isExpanded && (
                <div style={{ marginTop: '0.5rem', fontSize: 13, color: '#555' }}>
                  <p style={{ margin: 0 }}>
                    <strong>Notes:</strong> This section can later show
                    line-item rehab breakdown, timeline milestones, lender info,
                    and links to the underlying accounting transactions.
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight,
  isCount,
  isDays,
}: {
  label: string;
  value: number;
  highlight?: 'positive' | 'negative';
  isCount?: boolean;
  isDays?: boolean;
}) {
  let color = '#111';
  if (highlight === 'positive') color = '#0a7a3c';
  if (highlight === 'negative') color = '#b00020';

  let text: string;
  if (isCount) {
    text = value.toString();
  } else if (isDays) {
    text = value.toFixed(1).replace(/\.0+$/, '') + ' days';
  } else {
    text = value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });
  }

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
