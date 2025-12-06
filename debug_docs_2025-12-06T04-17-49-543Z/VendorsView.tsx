import { useState } from 'react';
import { VendorsOverview } from './VendorsOverview';
import { VendorManageView } from './VendorManageView';

type VendorsTab = 'overview' | 'manage';

export function VendorsView() {
  const [tab, setTab] = useState<VendorsTab>('overview');

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
        <h2 style={{ margin: 0 }}>Vendors</h2>
      </div>

      {/* Tabs */}
      <div className="tab-strip">
        <button
          type="button"
          className={`tab ${tab === 'overview' ? 'tab--active' : ''}`}
          onClick={() => setTab('overview')}
        >
          Overview
        </button>

        <button
          type="button"
          className={`tab ${tab === 'manage' ? 'tab--active' : ''}`}
          onClick={() => setTab('manage')}
        >
          Manage
        </button>
      </div>

      {/* Content */}
      <div style={{ marginTop: '0.75rem' }}>
        {tab === 'overview' && <VendorsOverview />}
        {tab === 'manage' && <VendorManageView />}
      </div>
    </div>
  );
}
