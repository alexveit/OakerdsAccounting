import { useState } from 'react';
import { JobsTab } from './JobsTab';
import { PricesTab } from './PricesTab';
import { MobileFloorCalc } from './MobileFloorCalc';
import { VersionTag } from '../shared/VersionTag';
import { mobileStyles as styles } from './mobileStyles';

// ============================================================
// TYPES
// ============================================================

type Tab = 'jobs' | 'prices' | 'calc';

// ============================================================
// COMPONENT
// ============================================================

export function MobileContainer() {
  const [activeTab, setActiveTab] = useState<Tab>('jobs');

  return (
    <div style={styles.container}>
      {/* Tab Bar */}
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'jobs' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('jobs')}
        >
          Jobs
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'prices' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('prices')}
        >
          Prices
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'calc' ? styles.tabActive : {}),
          }}
          onClick={() => setActiveTab('calc')}
        >
          Calc
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'jobs' && <JobsTab />}
      {activeTab === 'prices' && <PricesTab />}
      {activeTab === 'calc' && <MobileFloorCalc />}

      {/* Footer */}
      <div style={{ ...styles.footer, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <span>Oakerds Accounting</span>
        <span style={{ margin: '0 8px', color: '#4b5563' }}>|</span>
        <VersionTag />
      </div>
    </div>
  );
}

export default MobileContainer;
