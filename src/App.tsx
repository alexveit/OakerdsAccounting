import { useState, useEffect } from 'react';
import { supabase } from './lib/supabaseClient';
import { Login } from './components/Login';
import { JobDetailView } from './components/JobDetailView';
import { DashboardOverview } from './components/DashboardOverview';
import { InstallersView } from './components/installers/InstallersView';
import { VendorsView } from './components/vendors/VendorsView';
import { LeadSourcesView } from './components/lead-sources/LeadSourcesView';
import { LedgerView } from './components/ledger';
import { ProfitSummary } from './components/reports/ProfitSummary';
import { ExpenseCategoriesView } from './components/expenses/ExpensesView';
import { NewEntryView } from './components/new-entries/NewEntryView';
import { TaxExportView } from './components/reports/TaxExportView';
import { RentalsView } from './components/real-estate/RentalsView';
import { FlipsView } from './components/real-estate/FlipsView';
import { DealsView } from './components/real-estate/DealsView';
import { Analytics } from './components/analytics/AnalyticsView';
import { PriceListView } from './components/PriceListView';
import { MobileContainer } from './components/mobile';
//import { FlipDetailView } from './components/real-estate/FlipDetailView';
//import { BankImportView } from './components/bank-import/BankImportView';
import { BankImportView } from './components/bank-import/BankImportView_Legacy';
import { FloorCalculator } from './components/FloorCalculator';
import { VersionTag } from './components/shared/VersionTag';
import { PlaidLinkView } from './components/bank-import/PlaidLinkView';
import PrivacyPolicy from './components/PrivacyPolicy';
import { PeriodCloseView } from './components/settings/PeriodCloseView';

type View =
  | 'dashboard'
  | 'installers'
  | 'vendors'
  | 'leadSources'
  | 'expenses'
  | 'entry'
  | 'jobDetail'
  | 'ledger'
  | 'bankImport'
  | 'plaid'
  | 'profitSummary'
  | 'taxExport'
  | 'rentals'
  | 'flips'
  | 'deals'
  | 'analytics'
  | 'priceList'
  | 'floorCalc'
  | 'privacy'
  | 'periodClose';

type NavSection = {
  title: string | null;
  items: { view: View; label: string; icon: string }[];
};

const NAV_SECTIONS: NavSection[] = [
  {
    title: null,
    items: [
      { view: 'dashboard', label: 'Dashboard', icon: '📊' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { view: 'jobDetail', label: 'Jobs', icon: '🔧' },
      { view: 'installers', label: 'Installers', icon: '👷' },
      { view: 'vendors', label: 'Vendors', icon: '🏪' },
      { view: 'leadSources', label: 'Lead Sources', icon: '📣' },
      { view: 'priceList', label: 'Price List', icon: '💲' },
      { view: 'floorCalc', label: 'Floor Calculator', icon: '🧮' },
    ],
  },
  {
    title: 'Financials',
    items: [
      { view: 'analytics', label: 'Analytics', icon: '📈' },
      { view: 'plaid', label: 'Bank Sync', icon: '🔗' },
      { view: 'bankImport', label: 'Bank Import', icon: '🏦' },
      { view: 'ledger', label: 'Ledger', icon: '📒' },
      { view: 'expenses', label: 'Expenses by Category', icon: '📋' },
      { view: 'profitSummary', label: 'Profit Summary', icon: '💰' },
      { view: 'taxExport', label: 'Tax Exports', icon: '📄' },
      { view: 'periodClose', label: 'Period Close', icon: '🔒' },
    ],
  },
  {
    title: 'Real Estate',
    items: [
      { view: 'rentals', label: 'Rentals', icon: '🏠' },
      { view: 'flips', label: 'Flips', icon: '🔨' },
      { view: 'deals', label: 'Manage Deals', icon: '📋' },
    ],
  },
];

const VIEW_COMPONENTS: Record<View, React.ComponentType<any>> = {
  dashboard: DashboardOverview,
  analytics: Analytics,
  plaid: PlaidLinkView,
  bankImport: BankImportView,
  installers: InstallersView,
  vendors: VendorsView,
  leadSources: LeadSourcesView,
  expenses: ExpenseCategoriesView,
  entry: NewEntryView,
  jobDetail: JobDetailView,
  ledger: LedgerView,
  profitSummary: ProfitSummary,
  taxExport: TaxExportView,
  rentals: RentalsView,
  flips: FlipsView,
  deals: DealsView,
  priceList: PriceListView,
  floorCalc: FloorCalculator,
  privacy: PrivacyPolicy,
  periodClose: PeriodCloseView,
};

function shouldShowMobileView(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get('m') === '1' || params.get('mobile') === '1';
}

// ============================================================================
// MAIN APP COMPONENT - WITH MFA/AAL CHECKING
// ============================================================================

type AuthState = 'loading' | 'unauthenticated' | 'needs-mfa' | 'authenticated';

function App() {
  // Public routes (no auth required)
  if (window.location.pathname === '/privacy') {
    return <PrivacyPolicy />;
  }

  const [authState, setAuthState] = useState<AuthState>('loading');
  const [isMobileView] = useState(shouldShowMobileView);

  // Check auth and MFA status
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setAuthState('unauthenticated');
        return;
      }

      // Session exists - check MFA status
      const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      const { data: factors } = await supabase.auth.mfa.listFactors();
      
      const hasVerifiedFactors = (factors?.totp?.length ?? 0) > 0;
      const isAAL2 = aalData?.currentLevel === 'aal2';

      // If user has MFA enrolled but hasn't verified this session
      if (hasVerifiedFactors && !isAAL2) {
        setAuthState('needs-mfa');
        return;
      }

      // If user has no MFA enrolled, they need to enroll
      if (!hasVerifiedFactors) {
        setAuthState('needs-mfa');
        return;
      }

      // Fully authenticated (has factors AND is AAL2)
      setAuthState('authenticated');
    }

    checkAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setAuthState('unauthenticated');
        return;
      }

      // For MFA_CHALLENGE_VERIFIED, we're fully authenticated
      if (_event === 'MFA_CHALLENGE_VERIFIED') {
        setAuthState('authenticated');
        return;
      }

      // For other events (SIGNED_IN, TOKEN_REFRESHED), re-run full check
      // Use setTimeout to avoid blocking the auth state change callback
      setTimeout(() => checkAuth(), 0);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Show loading while checking auth
  if (authState === 'loading') {
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

  // Show login if not authenticated OR if MFA enrollment/verification is needed
  if (authState === 'unauthenticated' || authState === 'needs-mfa') {
    return <Login onLogin={() => setAuthState('authenticated')} />;
  }

  // Mobile view (fully authenticated with MFA)
  if (isMobileView) {
    return <MobileContainer />;
  }

  // Main app (fully authenticated with MFA)
  return <AuthenticatedApp onLogout={() => supabase.auth.signOut()} />;
}

// ============================================================================
// AUTHENTICATED APP COMPONENT
// ============================================================================

function AuthenticatedApp({ onLogout }: { onLogout: () => void }) {
  const [view, setView] = useState<View>(() => {
    try {
      const saved = localStorage.getItem('app_activeView');
      return (saved && saved in VIEW_COMPONENTS) ? saved as View : 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [initialJobIdForEntry, setInitialJobIdForEntry] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('app_sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('app_collapsedSections');
      return saved ? new Set(JSON.parse(saved)) : new Set(['Operations', 'Financials', 'Real Estate']);
    } catch {
      return new Set(['Operations', 'Financials', 'Real Estate']);
    }
  });

  // CC settle transfer params
  const [ccSettleTransfer, setCcSettleTransfer] = useState<{
    toAccountId: number;
    toAccountName: string;
    amount: number;
    description: string;
    lineIdsToSettle: number[];
  } | null>(null);

  // Persist view state to localStorage
  useEffect(() => {
    localStorage.setItem('app_activeView', view);
  }, [view]);

  // Persist sidebar collapsed state
  useEffect(() => {
    localStorage.setItem('app_sidebarCollapsed', String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Persist collapsed sections
  useEffect(() => {
    localStorage.setItem('app_collapsedSections', JSON.stringify([...collapsedSections]));
  }, [collapsedSections]);

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
          onNavigateToTransfer={(params) => {
            setCcSettleTransfer(params);
            setView('entry');
          }}
        />
      );
    }

    if (view === 'ledger') {
      return (
        <LedgerView
          onNavigateToTransfer={(params) => {
            setCcSettleTransfer(params);
            setView('entry');
          }}
        />
      );
    }

    if (view === 'entry') {
      return (
        <NewEntryView
          initialJobId={initialJobIdForEntry}
          initialTransfer={ccSettleTransfer}
          onTransferComplete={() => setCcSettleTransfer(null)}
        />
      );
    }

    const ViewComponent = VIEW_COMPONENTS[view];
    return <ViewComponent />;
  };

  const handleNavClick = (navView: View) => {
    setView(navView);
    if (navView !== 'entry') {
      setInitialJobIdForEntry(null);
      setCcSettleTransfer(null);
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
          {mobileMenuOpen ? 'X' : '='}
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
          {sidebarCollapsed ? '>' : '<'}
        </button>

        {/* New Entry Button */}
        <button
          className={`sidebar-new-entry ${view === 'entry' ? 'sidebar-new-entry--active' : ''}`}
          onClick={() => handleNavClick('entry')}
        >
          <span className="sidebar-icon">+</span>
          {!sidebarCollapsed && <span>New Entry</span>}
        </button>

        {/* Navigation Sections */}
        <nav className="sidebar-nav">
          {NAV_SECTIONS.map((section, sectionIndex) => {
            const isCollapsed = section.title ? collapsedSections.has(section.title) : false;
            const toggleSection = () => {
              if (!section.title) return;
              setCollapsedSections(prev => {
                const next = new Set(prev);
                if (next.has(section.title!)) {
                  next.delete(section.title!);
                } else {
                  next.add(section.title!);
                }
                return next;
              });
            };

            return (
              <div key={sectionIndex} className="sidebar-section">
                {section.title && !sidebarCollapsed && (
                  <div 
                    className="sidebar-section-title" 
                    onClick={toggleSection}
                    style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  >
                    <span>{section.title}</span>
                    <span style={{ fontSize: 10, opacity: 0.6 }}>{isCollapsed ? '>' : 'v'}</span>
                  </div>
                )}
                {(!section.title || !isCollapsed) && section.items.map(({ view: navView, label, icon }) => (
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
            );
          })}
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
        {/* Version Tag */}
        <VersionTag collapsed={sidebarCollapsed} />
      </aside>

      {/* Main Content */}
      <main className="main-content">{renderView()}</main>
    </div>
  );
}

export default App;
