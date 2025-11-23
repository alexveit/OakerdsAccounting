import { useState } from 'react';
import { CategoriesSummaryView } from './ExpensesSummary';
import { ExpenseByCategory } from './ExpensesDetail';

type Tab = 'summary' | 'details';

export function ExpenseCategoriesView() {
  const [tab, setTab] = useState<Tab>('summary');

  return (
    <div>
      {/* Browser-style tab strip */}
      <div className="tab-strip">
        <button
          type="button"
          className={`tab ${tab === 'summary' ? 'tab--active' : ''}`}
          onClick={() => setTab('summary')}
        >
          Summary
        </button>
        <button
          type="button"
          className={`tab ${tab === 'details' ? 'tab--active' : ''}`}
          onClick={() => setTab('details')}
        >
          Details
        </button>
      </div>

      {/* Content */}
      <div style={{ marginTop: '0.75rem' }}>
        {tab === 'summary' ? (
          // Summary: use full wide shell (same as Job Detail)
          <CategoriesSummaryView />
        ) : (
          // Details: constrain to a narrower centered column
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <ExpenseByCategory />
          </div>
        )}
      </div>
    </div>
  );
}
