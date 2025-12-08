import { useState } from 'react';
import { VendorsOverview } from './VendorsOverview';
import { VendorManageView } from './VendorsManageView';

type VendorsTab = 'overview' | 'manage';

export function VendorsView() {
  const [tab, setTab] = useState<VendorsTab>('overview');
  const [selectedVendorId, setSelectedVendorId] = useState<number | null>(null);

  function handleVendorSelect(vendorId: number) {
    setSelectedVendorId(vendorId);
    setTab('manage');
  }

  // Clear selection when switching away from manage tab
  function handleTabChange(newTab: VendorsTab) {
    if (newTab !== 'manage') {
      setSelectedVendorId(null);
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
        <h2 style={{ margin: 0 }}>Vendors</h2>
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
        {tab === 'overview' && <VendorsOverview onVendorSelect={handleVendorSelect} />}
        {tab === 'manage' && (
          <VendorManageView 
            initialSelectedId={selectedVendorId} 
            onSelectionUsed={() => setSelectedVendorId(null)} 
          />
        )}
      </div>
    </div>
  );
}
