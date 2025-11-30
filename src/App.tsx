import { useState, useEffect } from 'react';
import { JobDetailView } from './components/JobDetailView';
import { DashboardOverview } from './components/DashboardOverview';
import { InstallersView } from './components/InstallersView';
import { VendorsView } from './components/VendorsView';
import { LeadSourcesView } from './components/LeadSourcesView';
import { LedgerView } from './components/LedgerView';
import { ProfitSummary } from './components/ProfitSummary';
import { ExpenseCategoriesView } from './components/ExpensesView';
import { NewEntryView } from './components/NewEntryView';
import { TaxExportView } from './components/TaxExportView';
import { REIView } from './components/REIView';

type View =
  | 'dashboard'
  | 'installers'
  | 'vendors'
  | 'leadSources'
  | 'expenses'
  | 'entry'
  | 'jobDetail'
  | 'ledger'
  | 'profitSummary'
  | 'taxExport'
  | 'rei';

const NAV_ITEMS: { view: View; label: string }[] = [
  { view: 'dashboard', label: 'Dashboard' },
  { view: 'installers', label: 'Installers' },
  { view: 'vendors', label: 'Vendors' },
  { view: 'leadSources', label: 'Lead Sources' },
  { view: 'expenses', label: 'Exp by Category' },
  { view: 'profitSummary', label: 'Profit Summary' },
  { view: 'rei', label: 'REI' },                // <â”€â”€ ADDED
  { view: 'taxExport', label: 'Tax Exports' },
  { view: 'entry', label: 'New Entry' },
  { view: 'jobDetail', label: 'Job Detail' },
  { view: 'ledger', label: 'Ledger' },
];

const VIEW_COMPONENTS: Record<View, React.ComponentType> = {
  dashboard: DashboardOverview,
  installers: InstallersView,
  vendors: VendorsView,
  leadSources: LeadSourcesView,
  expenses: ExpenseCategoriesView,
  entry: NewEntryView,
  jobDetail: JobDetailView,
  ledger: LedgerView,
  profitSummary: ProfitSummary,
  taxExport: TaxExportView,
  rei: REIView,                                 // <â”€â”€ ADDED
};

function App() {
  const [view, setView] = useState<View>('dashboard');
  const [initialJobIdForEntry, setInitialJobIdForEntry] = useState<number | null>(null);

  // Add shadow to header when scrolled
  useEffect(() => {
    const header = document.querySelector('.app-header-shell');
    const handleScroll = () => {
      header?.classList.toggle('scrolled', window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const isWideView = view === 'jobDetail' || view === 'expenses';

  const renderView = () => {
    if (view === 'jobDetail') {
      return (
        <JobDetailView
          onAddJobTransaction={(jobId) => {
            setInitialJobIdForEntry(jobId);
            setView('entry');
          }}
        />
      );
    }

    if (view === 'entry') {
      return <NewEntryView initialJobId={initialJobIdForEntry} />;
    }

    const ViewComponent = VIEW_COMPONENTS[view];
    return <ViewComponent />;
  };

  return (
    <div>
      {/* Header */}
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
          <div>
            <h1 className="app-title">Oakerds Accounting</h1>
            <div className="app-subtitle">Internal Financial Console</div>
          </div>
        </div>

        {/* Nav */}
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

      {/* Main Content */}
      <div
        className={
          isWideView ? 'app-main-shell app-main-shell--wide' : 'app-main-shell'
        }
      >
        {renderView()}
      </div>
    </div>
  );
}

export default App;