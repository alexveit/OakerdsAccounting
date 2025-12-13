// src/components/real-estate/DealsOverview.tsx

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatMoney } from '../../utils/format';

type DealType = 'rental' | 'flip' | 'wholesale' | 'personal';
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
  personal: 'Personal',
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
    personal: deals.filter((d) => d.type === 'personal' && d.status !== 'failed').length,
    archived: deals.filter((d) => d.status === 'failed').length,
  };

  if (loading) {
    return <p>Loading deals...</p>;
  }

  if (error) {
    return <p className="text-danger">{error}</p>;
  }

  return (
    <div>
      {/* Summary cards */}
      <div className="deals-summary-grid">
        <div className="card deals-summary-card">
          <div className="deals-summary-card__count">{summary.rental}</div>
          <div className="deals-summary-card__label">Rentals</div>
        </div>
        <div className="card deals-summary-card">
          <div className="deals-summary-card__count">{summary.flip}</div>
          <div className="deals-summary-card__label">Flips</div>
        </div>
        <div className="card deals-summary-card">
          <div className="deals-summary-card__count">{summary.wholesale}</div>
          <div className="deals-summary-card__label">Wholesales</div>
        </div>
        <div className="card deals-summary-card">
          <div className="deals-summary-card__count">{summary.personal}</div>
          <div className="deals-summary-card__label">Personal</div>
        </div>
      </div>

      {/* Filters */}
      <div className="deals-filters">
        <label className="deals-filter-label">
          Type:
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as DealType | 'all')}
          >
            <option value="all">All Types</option>
            <option value="rental">Rentals</option>
            <option value="flip">Flips</option>
            <option value="wholesale">Wholesales</option>
            <option value="personal">Personal</option>
          </select>
        </label>

        <label className="deals-filter-label">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Show archived
        </label>

        <div className="deals-count">
          {filteredDeals.length} deal{filteredDeals.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Deals table */}
      {filteredDeals.length === 0 ? (
        <p className="deals-empty">No deals found.</p>
      ) : (
        <div className="deals-table-wrap">
          <table className="deals-table">
            <thead>
              <tr>
                <th>Nickname</th>
                <th>Address</th>
                <th>Type</th>
                <th>Status</th>
                <th className="right">Purchase</th>
                <th className="right">
                  {filterType === 'personal' ? 'Market Value' : 'ARV'}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredDeals.map((deal) => (
                <tr
                  key={deal.id}
                  onClick={() => onDealSelect?.(deal.id)}
                  className={deal.status === 'failed' ? 'archived' : ''}
                >
                  <td className="nickname">{deal.nickname}</td>
                  <td className="address">{deal.address || '-'}</td>
                  <td>
                    <span
                      className={`deal-type-badge ${deal.type === 'personal' ? 'deal-type-badge--personal' : ''}`}
                    >
                      {TYPE_LABELS[deal.type]}
                    </span>
                  </td>
                  <td>
                    <span className={`deal-status-badge deal-status-badge--${deal.status}`}>
                      {STATUS_LABELS[deal.status]}
                    </span>
                  </td>
                  <td className="right">
                    {deal.purchase_price ? formatMoney(deal.purchase_price) : '-'}
                  </td>
                  <td className="right">
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
