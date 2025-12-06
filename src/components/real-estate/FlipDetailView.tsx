// src/components/FlipDetailView.tsx
// Wrapper component that combines FlipSummary with transaction entry
// This is a lightweight coordinator - heavy lifting is in child components

import { useState } from 'react';
import { FlipSummary } from './FlipSummary';
import { NewFlipTransaction } from './NewFlipTransaction';

type TabType = 'summary' | 'add';

type Props = {
  initialDealId?: number;
};

export function FlipDetailView({ initialDealId }: Props) {
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [selectedDealId, setSelectedDealId] = useState<number | null>(initialDealId ?? null);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleDealChange(dealId: number | null) {
    setSelectedDealId(dealId);
  }

  function handleTransactionSaved() {
    // Increment key to force FlipSummary to refresh
    setRefreshKey((k) => k + 1);
    // Switch back to summary to see updated numbers
    setActiveTab('summary');
  }

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    padding: '0.75rem 1.5rem',
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: isActive ? 600 : 400,
    color: isActive ? '#1976d2' : '#666',
    borderBottom: isActive ? '2px solid #1976d2' : '2px solid transparent',
    marginBottom: -2,
  });

  return (
    <div>
      {/* Tab bar */}
      <div style={{ borderBottom: '2px solid #e0e0e0', marginBottom: '1rem' }}>
        <button style={tabStyle(activeTab === 'summary')} onClick={() => setActiveTab('summary')}>
          📊 Summary
        </button>
        <button style={tabStyle(activeTab === 'add')} onClick={() => setActiveTab('add')}>
          ➕ Add Transaction
        </button>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <FlipSummary
          key={refreshKey}
          initialDealId={selectedDealId ?? undefined}
          onDealChange={handleDealChange}
        />
      )}

      {/* Add Transaction Tab */}
      {activeTab === 'add' && (
        <NewFlipTransaction
          dealId={selectedDealId ?? undefined}
          onTransactionSaved={handleTransactionSaved}
        />
      )}
    </div>
  );
}
