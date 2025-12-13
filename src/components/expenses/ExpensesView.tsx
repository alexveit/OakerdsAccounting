import { useState } from 'react';
import { CategoriesSummaryView } from './ExpensesSummary';
import { ExpenseByCategory } from './ExpensesDetail';

type Tab = 'summary' | 'details';

export function ExpenseCategoriesView() {
  const [tab, setTab] = useState<Tab>('summary');

  return (
    <div>
      <div className="page-header">
        <h2 className="page-header__title">Expenses by Category</h2>
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
      <div className="page-content">
        {tab === 'summary' ? (
          <CategoriesSummaryView />
        ) : (
          <div className="page-content--wide">
            <ExpenseByCategory />
          </div>
        )}
      </div>
    </div>
  );
}
