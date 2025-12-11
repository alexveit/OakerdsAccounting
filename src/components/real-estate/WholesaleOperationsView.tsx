import { useMemo, useState } from 'react';

type WholesaleStatus = 'lead' | 'under_contract' | 'marketing' | 'assigned' | 'dead';

type WholesaleDeal = {
  id: number;
  nickname: string;
  address: string;
  status: WholesaleStatus;
  contractPrice: number | null;
  assignmentPrice: number | null;
  earnestMoney: number | null;
  marketingChannel: string | null;
  buyerName: string | null;
  closeDate: string | null;
  daysInPipeline: number | null;
};

const mockWholesales: WholesaleDeal[] = [
  {
    id: 1,
    nickname: 'Burned House 30035',
    address: '123 Fire Damaged St, Decatur, GA',
    status: 'under_contract',
    contractPrice: 50_000,
    assignmentPrice: 65_000,
    earnestMoney: 5_000,
    marketingChannel: 'Driving for Dollars',
    buyerName: null,
    closeDate: null,
    daysInPipeline: 7,
  },
  {
    id: 2,
    nickname: 'Anna Triplex',
    address: '123 Main St, Anna, IL',
    status: 'marketing',
    contractPrice: 55_000,
    assignmentPrice: 75_000,
    earnestMoney: 3_000,
    marketingChannel: 'JV / Buyers List',
    buyerName: null,
    closeDate: null,
    daysInPipeline: 18,
  },
  {
    id: 3,
    nickname: 'Old Assignment (Closed)',
    address: '456 Example Ave, Atlanta, GA',
    status: 'assigned',
    contractPrice: 80_000,
    assignmentPrice: 100_000,
    earnestMoney: 5_000,
    marketingChannel: 'Agent Referral',
    buyerName: 'ABC Properties LLC',
    closeDate: '2025-03-15',
    daysInPipeline: 21,
  },
];

export function WholesaleOperationsView() {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const stats = useMemo(() => {
    const active = mockWholesales.filter(
      (d) => d.status !== 'assigned' && d.status !== 'dead'
    );
    const closed = mockWholesales.filter((d) => d.status === 'assigned');

    const activeCount = active.length;
    const closedCount = closed.length;

    const pipelineSpread = mockWholesales.reduce(
      (acc, d) => {
        acc[d.status] = (acc[d.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<WholesaleStatus, number>
    );

    const totalAssignments = closed.reduce(
      (sum, d) => sum + ((d.assignmentPrice ?? 0) - (d.contractPrice ?? 0)),
      0
    );

    const avgAssignment =
      closedCount > 0 ? totalAssignments / closedCount : 0;

    return {
      activeCount,
      closedCount,
      pipelineSpread,
      totalAssignments,
      avgAssignment,
    };
  }, []);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Wholesale Pipeline</h3>

      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <SummaryCard label="Active Deals" value={stats.activeCount} isCount />
        <SummaryCard label="Closed Assignments" value={stats.closedCount} isCount />
        <SummaryCard
          label="Total Assignment Fees"
          value={stats.totalAssignments}
        />
        <SummaryCard
          label="Avg Assignment Fee"
          value={stats.avgAssignment}
        />
      </div>

      {/* Deal cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {mockWholesales.map((deal) => {
          const isExpanded = expandedId === deal.id;

          const assignmentFee =
            (deal.assignmentPrice ?? 0) - (deal.contractPrice ?? 0);

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
                {deal.daysInPipeline != null && (
                  <span>
                    <strong>Days in pipeline:</strong> {deal.daysInPipeline}
                  </span>
                )}
                {deal.marketingChannel && (
                  <span>
                    <strong>Channel:</strong> {deal.marketingChannel}
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
                <Stat label="Contract Price" value={deal.contractPrice ?? 0} money />
                <Stat label="Assignment Price" value={deal.assignmentPrice ?? 0} money />
                <Stat label="Earnest Money" value={deal.earnestMoney ?? 0} money />
                <Stat
                  label="Assignment Fee"
                  value={assignmentFee}
                  money
                  highlight={assignmentFee >= 0 ? 'positive' : 'negative'}
                />
              </div>

              {/* Expand toggle */}
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
                  {deal.buyerName && (
                    <p style={{ margin: 0 }}>
                      <strong>Buyer:</strong> {deal.buyerName}
                    </p>
                  )}
                  {deal.closeDate && (
                    <p style={{ margin: 0 }}>
                      <strong>Close date:</strong> {deal.closeDate}
                    </p>
                  )}
                  {!deal.buyerName && !deal.closeDate && (
                    <p style={{ margin: 0 }}>
                      This section can later show seller/buyer contact info,
                      notes, and a link to the underlying accounting entries.
                    </p>
                  )}
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
}: {
  label: string;
  value: number;
  highlight?: 'positive' | 'negative';
  isCount?: boolean;
}) {
  let color = '#111';
  if (highlight === 'positive') color = '#0a7a3c';
  if (highlight === 'negative') color = '#b00020';

  let text: string;
  if (isCount) {
    text = value.toString();
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
