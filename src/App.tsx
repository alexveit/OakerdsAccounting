import { useState } from 'react';
import { NewTransactionForm } from './components/NewTransactionForm';
import { NewJobForm } from './components/NewJobForm';
import { JobDetailView } from './components/JobDetailView';
import { DashboardOverview } from './components/DashboardOverview';
import { InstallersOverview } from './components/InstallersOverview';
import { LedgerView } from './components/LedgerView';
import { ProfitSummary } from './components/ProfitSummary';
import { ExpenseCategoriesView } from './components/ExpensesView';

type View =
  | 'dashboard'
  | 'installers'
  | 'expenses'        // wrapper with tabs
  | 'newTx'
  | 'newJob'
  | 'jobDetail'
  | 'ledger'
  | 'profitSummary';

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: 'dashboard', label: 'Dashboard' },
  { view: 'installers', label: 'Installers' },
  { view: 'expenses', label: 'Expenses by Category' }, // tabs (Summary / Details)
  { view: 'profitSummary', label: 'Profit Summary' },
  { view: 'newTx', label: 'New Transaction' },
  { view: 'newJob', label: 'New Job' },
  { view: 'jobDetail', label: 'Job Detail' },
  { view: 'ledger', label: 'Ledger' },
];

const VIEW_COMPONENTS: Record<View, React.ComponentType> = {
  dashboard: DashboardOverview,
  installers: InstallersOverview,
  expenses: ExpenseCategoriesView,
  newTx: NewTransactionForm,
  newJob: NewJobForm,
  jobDetail: JobDetailView,
  ledger: LedgerView,
  profitSummary: ProfitSummary,
};

function App() {
  const [view, setView] = useState<View>('dashboard');
  const ViewComponent = VIEW_COMPONENTS[view];

  return (
    <div className="app-shell">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          marginBottom: '1rem',
        }}
      >
        <img
          src="/OakerdsLogo.svg"
          alt="Oakerds Logo"
          style={{ width: '80px', height: '80px' }}
        />
        <h1 style={{ margin: 20 }}>Oakerds Accounting</h1>
      </div>

      <div className="pill-nav">
        {NAV_ITEMS.map(({ view: navView, label }) => (
          <button
            key={navView}
            onClick={() => setView(navView)}
            className={`pill-button ${
              view === navView ? 'pill-button--active' : ''
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ViewComponent />
    </div>
  );
}

export default App;
