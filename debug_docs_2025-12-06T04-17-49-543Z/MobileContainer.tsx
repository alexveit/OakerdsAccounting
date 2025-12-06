import { useState } from 'react';
import { JobsTab } from './JobsTab';
import { PricesTab } from './PricesTab';
import { mobileStyles as styles } from './mobileStyles';

// ============================================================
// TYPES
// ============================================================

type Tab = 'jobs' | 'prices';

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
      </div>

      {/* Tab Content */}
      {activeTab === 'jobs' && <JobsTab />}
      {activeTab === 'prices' && <PricesTab />}

      {/* Footer */}
      <div style={styles.footer}>
        Oakerds Accounting • Mobile
      </div>
    </div>
  );
}

export default MobileContainer;
