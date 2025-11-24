import { useState } from 'react';
import { JobDetailView } from './components/JobDetailView';
import { DashboardOverview } from './components/DashboardOverview';
import { InstallersOverview } from './components/InstallersOverview';
import { LedgerView } from './components/LedgerView';
import { ProfitSummary } from './components/ProfitSummary';
import { ExpenseCategoriesView } from './components/ExpensesView';
import { NewEntryView } from './components/NewEntryView';
import { TaxExportView } from './components/TaxExportView';
import { RentalOperationsView } from './components/RentalOperationsView';


type View =
  | 'dashboard'
  | 'installers'
  | 'expenses'        // wrapper with tabs
  | 'entry'           // combined New Transaction + New Job
  | 'jobDetail'
  | 'ledger'
  | 'profitSummary'
  | 'taxExport'
  | 'rentalOps';

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: 'dashboard', label: 'Dashboard' },
  { view: 'installers', label: 'Installers' },
  { view: 'expenses', label: 'Exp by Category' }, // tabs (Summary / Details)
  { view: 'profitSummary', label: 'Profit Summary' },
  { view: 'rentalOps', label: 'Rental Ops' },
  { view: 'taxExport', label: 'Tax Exports' },
  { view: 'entry', label: 'New Entry' },          // tabbed New Tx / New Job
  { view: 'jobDetail', label: 'Job Detail' },
  { view: 'ledger', label: 'Ledger' },
  
];

const VIEW_COMPONENTS: Record<View, React.ComponentType> = {
  dashboard: DashboardOverview,
  installers: InstallersOverview,
  expenses: ExpenseCategoriesView,
  entry: NewEntryView,
  jobDetail: JobDetailView,
  ledger: LedgerView,
  profitSummary: ProfitSummary,
  taxExport: TaxExportView,
  rentalOps: RentalOperationsView,
};

function App() {
  const [view, setView] = useState<View>('dashboard');
  const ViewComponent = VIEW_COMPONENTS[view];

  const isWideView = view === 'jobDetail' || view === 'expenses';

  return (
    <div>
      {/* Header + nav: always same width */}
      <div className="app-header-shell">
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
      </div>

      {/* Main content: width can vary by view */}
      <div
        className={
          isWideView ? 'app-main-shell app-main-shell--wide' : 'app-main-shell'
        }
      >
        <ViewComponent />
      </div>
    </div>
  );
}

export default App;