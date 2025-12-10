// src/components/real-estate/DealsView.tsx

import { useState } from 'react';
import { DealsOverview } from './DealsOverview';
import { DealsManageView } from './DealEditView';

type DealsTab = 'overview' | 'manage';

export function DealsView() {
  const [tab, setTab] = useState<DealsTab>('overview');
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);

  function handleDealSelect(dealId: number) {
    setSelectedDealId(dealId);
    setTab('manage');
  }

  function handleTabChange(newTab: DealsTab) {
    if (newTab !== 'manage') {
      setSelectedDealId(null);
    }
    setTab(newTab);
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Manage Deals</h2>
      </div>

      {/* Tabs */}
      <div className="tab-strip">
        <button
          type="button"
          className={`tab ${tab === 'overview' ? 'tab--active' : ''}`}
          onClick={() => handleTabChange('overview')}
        >
          Overview
        </button>

        <button
          type="button"
          className={`tab ${tab === 'manage' ? 'tab--active' : ''}`}
          onClick={() => handleTabChange('manage')}
        >
          Manage
        </button>
      </div>

      {/* Content */}
      <div style={{ marginTop: '0.75rem' }}>
        {tab === 'overview' && <DealsOverview onDealSelect={handleDealSelect} />}
        {tab === 'manage' && (
          <DealsManageView
            initialSelectedId={selectedDealId}
            onSelectionUsed={() => setSelectedDealId(null)}
          />
        )}
      </div>
    </div>
  );
}
