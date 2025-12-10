// src/components/real-estate/DealsOverview.tsx

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatMoney } from '../../utils/format';

type DealType = 'rental' | 'flip' | 'wholesale';
type DealStatus = 'active' | 'in_contract' | 'rehab' | 'stabilized' | 'sold' | 'failed';

type DealSummary = {
  id: number;
  nickname: string;
  address: string;
  type: DealType;
  status: DealStatus;
  purchase_price: number | null;
  arv: number | null;
  created_at: string;
};

type DealsOverviewProps = {
  onDealSelect?: (dealId: number) => void;
};

const STATUS_LABELS: Record<DealStatus, string> = {
  active: 'Active',
  in_contract: 'In Contract',
  rehab: 'Rehab',
  stabilized: 'Stabilized',
  sold: 'Sold',
  failed: 'Archived',
};

const TYPE_LABELS: Record<DealType, string> = {
  rental: 'Rental',
  flip: 'Flip',
  wholesale: 'Wholesale',
};

export function DealsOverview({ onDealSelect }: DealsOverviewProps) {
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<DealType | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    async function loadDeals() {
      setLoading(true);
      setError(null);

      const { data, error: err } = await supabase
        .from('real_estate_deals')
        .select('id, nickname, address, type, status, purchase_price, arv, created_at')
        .order('created_at', { ascending: false });

      if (err) {
        console.error('Error loading deals:', err);
        setError('Failed to load deals');
      } else {
        setDeals((data || []) as DealSummary[]);
      }
      setLoading(false);
    }

    loadDeals();
  }, []);

  // Filter deals
  const filteredDeals = deals.filter((d) => {
    if (filterType !== 'all' && d.type !== filterType) return false;
    if (!showArchived && d.status === 'failed') return false;
    return true;
  });

  // Group by type for summary
  const summary = {
    rental: deals.filter((d) => d.type === 'rental' && d.status !== 'failed').length,
    flip: deals.filter((d) => d.type === 'flip' && d.status !== 'failed').length,
    wholesale: deals.filter((d) => d.type === 'wholesale' && d.status !== 'failed').length,
    archived: deals.filter((d) => d.status === 'failed').length,
  };

  if (loading) {
    return <p>Loading deals...</p>;
  }

  if (error) {
    return <p style={{ color: 'red' }}>{error}</p>;
  }

  return (
    <div>
      {/* Summary cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.rental}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Rentals</div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.flip}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Flips</div>
        </div>
        <div className="card" style={{ padding: '1rem', textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{summary.wholesale}</div>
          <div style={{ fontSize: 12, color: '#666' }}>Wholesales</div>
        </div>
      </div>

      {/* Filters */}
      <div
        style={{
          display: 'flex',
          gap: '1rem',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 14 }}>
          Type:
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as DealType | 'all')}
            style={{ padding: '0.25rem 0.5rem' }}
          >
            <option value="all">All Types</option>
            <option value="rental">Rentals</option>
            <option value="flip">Flips</option>
            <option value="wholesale">Wholesales</option>
          </select>
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: 14 }}>
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>

        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#666' }}>
          {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Deals table */}
      {filteredDeals.length === 0 ? (
        <p style={{ color: '#666', fontStyle: 'italic' }}>No deals found.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd', textAlign: 'left' }}>
                <th style={{ padding: '0.5rem' }}>Nickname</th>
                <th style={{ padding: '0.5rem' }}>Address</th>
                <th style={{ padding: '0.5rem' }}>Type</th>
                <th style={{ padding: '0.5rem' }}>Status</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>Purchase</th>
                <th style={{ padding: '0.5rem', textAlign: 'right' }}>ARV</th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => (
                <tr
                  key={deal.id}
                  onClick={() => onDealSelect?.(deal.id)}
                  style={{
                    borderBottom: '1px solid #eee',
                    cursor: onDealSelect ? 'pointer' : 'default',
                    backgroundColor: deal.status === 'failed' ? '#f9f9f9' : undefined,
                  }}
                  onMouseOver={(e) => {
                    if (onDealSelect) e.currentTarget.style.backgroundColor = '#f5f5f5';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.backgroundColor =
                      deal.status === 'failed' ? '#f9f9f9' : '';
                  }}
                >
                  <td style={{ padding: '0.5rem', fontWeight: 500 }}>{deal.nickname}</td>
                  <td style={{ padding: '0.5rem', color: '#666' }}>{deal.address || '-'}</td>
                  <td style={{ padding: '0.5rem' }}>{TYPE_LABELS[deal.type]}</td>
                  <td style={{ padding: '0.5rem' }}>
                    <span
                      style={{
                        padding: '0.15rem 0.5rem',
                        borderRadius: 4,
                        fontSize: 12,
                        backgroundColor:
                          deal.status === 'sold'
                            ? '#e8f5e9'
                            : deal.status === 'failed'
                              ? '#ffebee'
                              : deal.status === 'rehab'
                                ? '#fff3e0'
                                : '#e3f2fd',
                        color:
                          deal.status === 'sold'
                            ? '#2e7d32'
                            : deal.status === 'failed'
                              ? '#c62828'
                              : deal.status === 'rehab'
                                ? '#e65100'
                                : '#1565c0',
                      }}
                    >
                      {STATUS_LABELS[deal.status]}
                    </span>
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    {deal.purchase_price ? formatMoney(deal.purchase_price) : '-'}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                    {deal.arv ? formatMoney(deal.arv) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
