import { useState } from 'react';
import { InstallersOverview } from './InstallersOverview';
import { InstallerManageView } from './InstallerManageView';

type InstallersTab = 'overview' | 'manage';

export function InstallersView() {
  const [tab, setTab] = useState<InstallersTab>('overview');

  return (
    <div>
      {/* 
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Installers</h2>
      </div>
      */}
      
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
        {tab === 'overview' && <InstallersOverview />}
        {tab === 'manage' && <InstallerManageView />}
      </div>
    </div>
  );
}
