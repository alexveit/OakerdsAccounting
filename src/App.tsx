import { useState } from 'react';
import { NewTransactionForm } from './components/NewTransactionForm';
import { NewJobForm } from './components/NewJobForm';
import { JobDetailView } from './components/JobDetailView';
import { DashboardOverview } from './components/DashboardOverview';
import { ExpenseByCategory } from './components/ExpenseByCategory';
import { InstallersOverview } from './components/InstallersOverview';
import { LedgerView } from './components/LedgerView';

type View =
  | 'dashboard'
  | 'installers'
  | 'newTx'
  | 'newJob'
  | 'jobDetail'
  | 'expenseByCategory'
  | 'ledger';

function App() {
  const [view, setView] = useState<View>('dashboard');

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

      {/* Navigation */}
      <div className="pill-nav">
        <button
          onClick={() => setView('dashboard')}
          className={`pill-button ${view === 'dashboard' ? 'pill-button--active' : ''}`}
        >
          Dashboard
        </button>

        <button
          onClick={() => setView('installers')}
          className={`pill-button ${view === 'installers' ? 'pill-button--active' : ''}`}
        >
          Installers
        </button>

        <button
          onClick={() => setView('expenseByCategory')}
          className={`pill-button ${view === 'expenseByCategory' ? 'pill-button--active' : ''}`}
        >
          Expense by Category
        </button>

        <button
          onClick={() => setView('newTx')}
          className={`pill-button ${view === 'newTx' ? 'pill-button--active' : ''}`}
        >
          New Transaction
        </button>

        <button
          onClick={() => setView('newJob')}
          className={`pill-button ${ view === 'newJob' ? 'pill-button--active' : ''}`}
        >
          New Job
        </button>

        <button
          onClick={() => setView('jobDetail')}
          className={`pill-button ${view === 'jobDetail' ? 'pill-button--active' : '' }`}
        >
          Job Detail
        </button>
        <button
          onClick={() => setView('ledger')}
          className={`pill-button ${view === 'ledger' ? 'pill-button--active' : ''}`}
        >
          Ledger
        </button>
      </div>

      {/* Views */}
      {view === 'dashboard' && <DashboardOverview />}
      {view === 'installers' && <InstallersOverview />}
      {view === 'newTx' && <NewTransactionForm />}
      {view === 'newJob' && <NewJobForm />}
      {view === 'jobDetail' && <JobDetailView />}
      {view === 'expenseByCategory' && <ExpenseByCategory />}
      {view === 'ledger' && <LedgerView />} 
    </div>
  );
}

export default App;
