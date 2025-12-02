import { useState } from 'react';
import { CategoriesSummaryView } from './ExpensesSummary';
import { ExpenseByCategory } from './ExpensesDetail';

type Tab = 'summary' | 'details';

export function ExpenseCategoriesView() {
  const [tab, setTab] = useState<Tab>('summary');

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
        <h2 style={{ margin: 0 }}>Expenses by Category</h2>
      </div>

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
          <CategoriesSummaryView />
        ) : (
          <div style={{ maxWidth: '1100px', margin: '0 auto' }}>
            <ExpenseByCategory />
          </div>
        )}
      </div>
    </div>
  );
}
