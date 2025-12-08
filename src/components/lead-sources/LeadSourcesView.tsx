import { useState } from 'react';
import { LeadSourcesOverview } from './LeadSourcesOverview';
import { LeadSourceManageView } from './LeadSourcesManageView';

type LeadSourcesTab = 'overview' | 'manage';

export function LeadSourcesView() {
  const [tab, setTab] = useState<LeadSourcesTab>('overview');
  const [selectedLeadSourceId, setSelectedLeadSourceId] = useState<number | null>(null);

  function handleLeadSourceSelect(leadSourceId: number) {
    setSelectedLeadSourceId(leadSourceId);
    setTab('manage');
  }

  function handleTabChange(newTab: LeadSourcesTab) {
    if (newTab !== 'manage') {
      setSelectedLeadSourceId(null);
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
        <h2 style={{ margin: 0 }}>Lead Sources</h2>
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
        {tab === 'overview' && <LeadSourcesOverview onLeadSourceSelect={handleLeadSourceSelect} />}
        {tab === 'manage' && (
          <LeadSourceManageView 
            initialSelectedId={selectedLeadSourceId} 
            onSelectionUsed={() => setSelectedLeadSourceId(null)} 
          />
        )}
      </div>
    </div>
  );
}
