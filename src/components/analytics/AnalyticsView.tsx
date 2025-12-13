import { useState } from 'react';
import { AnalyticsBalances } from './AnalyticsBalances';
import { AnalyticsExpenses } from './AnalyticsExpenses';
import { AnalyticsCashFlow } from './AnalyticsCashFlow';

type Tab = 'balances' | 'expenses' | 'cashflow';

export function Analytics() {
  const [tab, setTab] = useState<Tab>('balances');

  return (
    <div>
      <h2 className="mt-0 mb-2">Analytics</h2>

      {/* Tab Navigation */}
      <div className="tab-strip">
        <button
          type="button"
          className={`tab ${tab === 'balances' ? 'tab--active' : ''}`}
          onClick={() => setTab('balances')}
        >
          Balance History
        </button>
        <button
          type="button"
          className={`tab ${tab === 'expenses' ? 'tab--active' : ''}`}
          onClick={() => setTab('expenses')}
        >
          Expense Categories
        </button>
        <button
          type="button"
          className={`tab ${tab === 'cashflow' ? 'tab--active' : ''}`}
          onClick={() => setTab('cashflow')}
        >
          Cash Flow
        </button>
      </div>

      {/* Content */}
      <div className="mt-1h">
        {tab === 'balances' && <AnalyticsBalances />}
        {tab === 'expenses' && <AnalyticsExpenses />}
        {tab === 'cashflow' && <AnalyticsCashFlow />}
      </div>
    </div>
  );
}
