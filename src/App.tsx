import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import type { Session } from '@supabase/supabase-js';
import { Login } from './components/Login';
import { JobDetailView } from './components/JobDetailView';
import { DashboardOverview } from './components/DashboardOverview';
import { InstallersView } from './components/InstallersView';
import { VendorsView } from './components/VendorsView';
import { LeadSourcesView } from './components/LeadSourcesView';
import { LedgerView } from './components/LedgerViewOLD';
//import { LedgerView } from './components/ledger';
import { ProfitSummary } from './components/ProfitSummary';
import { ExpenseCategoriesView } from './components/ExpensesView';
import { NewEntryView } from './components/NewEntryView';
import { TaxExportView } from './components/TaxExportView';
import { REIView } from './components/REIView';
import { Analytics } from './components/AnalyticsView';
import { PriceListView } from './components/PriceListView';
import { MobileContainer } from './components/mobile';

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
  | 'rei'
  | 'analytics'
  | 'priceList';

type NavSection = {
  title: string | null;
  items: { view: View; label: string; icon: string }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: '📊' },
      { view: 'analytics', label: 'Analytics', icon: '📈' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { view: 'jobDetail', label: 'Jobs', icon: '🔧' },
      { view: 'installers', label: 'Installers', icon: '👷' },
      { view: 'vendors', label: 'Vendors', icon: '🪙' },
      { view: 'leadSources', label: 'Lead Sources', icon: '📣' },
      { view: 'priceList', label: 'Price List', icon: '💲' },
    ],
  },
  {
    title: 'Financials',
    items: [
      { view: 'ledger', label: 'Ledger', icon: '📒' },
      { view: 'expenses', label: 'Expenses by Category', icon: '📋' },
      { view: 'profitSummary', label: 'Profit Summary', icon: '💰' },
      { view: 'taxExport', label: 'Tax Exports', icon: '📄' },
    ],
  },
  {
    title: 'Real Estate',
    items: [{ view: 'rei', label: 'REI Dashboard', icon: '🏠' }],
  },
];

const VIEW_COMPONENTS: Record<View, React.ComponentType<any>> = {
  dashboard: DashboardOverview,
  analytics: Analytics,
  installers: InstallersView,
  vendors: VendorsView,
  leadSources: LeadSourcesView,
  expenses: ExpenseCategoriesView,
  entry: NewEntryView,
  jobDetail: JobDetailView,
  ledger: LedgerView,
  profitSummary: ProfitSummary,
  taxExport: TaxExportView,
  rei: REIView,
  priceList: PriceListView,
};

function shouldShowMobileView(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('m') === '1' || params.get('mobile') === '1';
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isMobileView] = useState(shouldShowMobileView);

  // Check for existing session on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show loading while checking auth
  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <p>Loading...</p>
      </div>
    );
  }

  // Show login if not authenticated
  if (!session) {
    return <Login onLogin={() => {}} />;
  }

  // Mobile view (authenticated)
  if (isMobileView) {
    return <MobileContainer />;
  }

  // Main app (authenticated)
  return <AuthenticatedApp onLogout={() => supabase.auth.signOut()} />;
}

// Separate component for the authenticated app to avoid hooks issues
function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<View>('dashboard');
  const [initialJobIdForEntry, setInitialJobIdForEntry] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [view]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const handleNavClick = (navView: View) => {
    setView(navView);
    if (navView !== 'entry') {
      setInitialJobIdForEntry(null);
    }
  };

  return (
    <div className="app-layout">
      {/* Mobile Header */}
      <div className="mobile-header">
        <button
          className="mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Toggle menu"
        >
          {mobileMenuOpen ? '✕' : '☰'}
        </button>
        <div className="mobile-header-title">
          <img
            src="/OakerdsLogo.svg"
            alt="Oakerds Logo"
            style={{ width: '32px', height: '32px' }}
          />
          <span>Oakerds Accounting</span>
        </div>
        <button
          className="mobile-new-entry-btn"
          onClick={() => setView('entry')}
          aria-label="New Entry"
        >
          +
        </button>
      </div>

      {/* Sidebar Overlay for Mobile */}
      {mobileMenuOpen && (
        <div className="sidebar-overlay" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`sidebar ${sidebarCollapsed ? 'sidebar--collapsed' : ''} ${mobileMenuOpen ? 'sidebar--mobile-open' : ''}`}
      >
        {/* Logo Section */}
        <div className="sidebar-header">
          <img src="/OakerdsLogo.svg" alt="Oakerds Logo" className="sidebar-logo" />
          {!sidebarCollapsed && (
            <div className="sidebar-brand">
              <div className="sidebar-title">Oakerds</div>
              <div className="sidebar-subtitle">Accounting</div>
            </div>
          )}
        </div>

        {/* Collapse/Expand Button */}
        <button
          className="sidebar-collapse-btn"
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {sidebarCollapsed ? '▶' : '◀'}
        </button>

        {/* New Entry Button */}
        <button
          className={`sidebar-new-entry ${view === 'entry' ? 'sidebar-new-entry--active' : ''}`}
          onClick={() => handleNavClick('entry')}
        >
          <span className="sidebar-icon">➕</span>
          {!sidebarCollapsed && <span>New Entry</span>}
        </button>

        {/* Navigation Sections */}
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section, sectionIndex) => (
            <div key={sectionIndex} className="sidebar-section">
              {section.title && !sidebarCollapsed && (
                <div className="sidebar-section-title">{section.title}</div>
              )}
              {section.items.map(({ view: navView, label, icon }) => (
                <button
                  key={navView}
                  className={`sidebar-nav-item ${view === navView ? 'sidebar-nav-item--active' : ''}`}
                  onClick={() => handleNavClick(navView)}
                  title={sidebarCollapsed ? label : undefined}
                >
                  <span className="sidebar-icon">{icon}</span>
                  {!sidebarCollapsed && <span className="sidebar-label">{label}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>

        {/* Logout Button */}
        <button
          className="sidebar-nav-item"
          onClick={onLogout}
          style={{ marginTop: 'auto', marginBottom: '1rem' }}
          title={sidebarCollapsed ? 'Logout' : undefined}
        >
          <span className="sidebar-icon">🚪</span>
          {!sidebarCollapsed && <span className="sidebar-label">Logout</span>}
        </button>
      </aside>

      {/* Main Content */}
      <main className="main-content">{renderView()}</main>
    </div>
  );
}

export default App;
