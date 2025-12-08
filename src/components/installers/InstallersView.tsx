import { useState } from 'react';
import { InstallersOverview } from './InstallersOverview';
import { InstallerManageView } from './InstallersManageView';

type InstallersTab = 'overview' | 'manage';

export function InstallersView() {
  const [tab, setTab] = useState<InstallersTab>('overview');
  const [selectedInstallerId, setSelectedInstallerId] = useState<number | null>(null);

  function handleInstallerSelect(installerId: number) {
    setSelectedInstallerId(installerId);
    setTab('manage');
  }

  function handleTabChange(newTab: InstallersTab) {
    if (newTab !== 'manage') {
      setSelectedInstallerId(null);
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
        <h2 style={{ margin: 0 }}>Installers</h2>
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
        {tab === 'overview' && <InstallersOverview onInstallerSelect={handleInstallerSelect} />}
        {tab === 'manage' && (
          <InstallerManageView 
            initialSelectedId={selectedInstallerId} 
            onSelectionUsed={() => setSelectedInstallerId(null)} 
          />
        )}
      </div>
    </div>
  );
}
