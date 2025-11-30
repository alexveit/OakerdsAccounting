import { useState } from 'react';
import { LeadSourcesOverview } from './LeadSourcesOverview';
import { LeadSourceManageView } from './LeadSourceManageView';

type LeadSourcesTab = 'overview' | 'manage';

export function LeadSourcesView() {
  const [tab, setTab] = useState<LeadSourcesTab>('overview');

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
        {tab === 'overview' && <LeadSourcesOverview />}
        {tab === 'manage' && <LeadSourceManageView />}
      </div>
    </div>
  );
}
