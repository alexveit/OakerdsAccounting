import { useState } from 'react';
import { RentalOperationsView } from './RentalOperationsView';
import { FlipOperationsView } from './FlipOperationsView';
import { WholesaleOperationsView } from './WholesaleOperationsView';

type REITab = 'rentals' | 'flips' | 'wholesales';

export function REIView() {
  const [tab, setTab] = useState<REITab>('rentals');

  return (
    <div>
      {/* Optional title &subtitle 
      <h2>Real Estate Investing</h2>
      <p
        style={{
          fontSize: 13,
          color: '#777',
          marginTop: 0,
          marginBottom: '0.75rem',
        }}
      >
        Rentals for long-term cash flow. Flips for mid-term profit. Wholesales for
        fast turn.
      </p> */}
          
      {/* REI tabs (match NewEntryView style) */}
      <div className="tab-strip">
        <button
          type="button"
          className={`tab ${tab === 'rentals' ? 'tab--active' : ''}`}
          onClick={() => setTab('rentals')}
        >
          Rentals
        </button>

        <button
          type="button"
          className={`tab ${tab === 'flips' ? 'tab--active' : ''}`}
          onClick={() => setTab('flips')}
        >
          Flips
        </button>

        <button
          type="button"
          className={`tab ${tab === 'wholesales' ? 'tab--active' : ''}`}
          onClick={() => setTab('wholesales')}
        >
          Wholesales
        </button>
      </div>

      {/* Content */}
      <div style={{ marginTop: '0.75rem' }}>
        {tab === 'rentals' && <RentalOperationsView />}
        {tab === 'flips' && <FlipOperationsView />}
        {tab === 'wholesales' && <WholesaleOperationsView />}
      </div>
    </div>
  );
}
