import { useState } from 'react';
import { JobsTab } from './JobsTab';
import { PricesTab } from './PricesTab';
import { MobileFloorCalc } from './MobileFloorCalc';
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
      <div style={styles.footer}>
        Oakerds Accounting â€¢ Mobile
      </div>
    </div>
  );
}

export default MobileContainer;
