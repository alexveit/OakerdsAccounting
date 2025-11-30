import { useState } from 'react';
import { RentalOperationsView } from './RentalOperationsView';
import { FlipOperationsView } from './FlipOperationsView';
import { WholesaleOperationsView } from './WholesaleOperationsView';

type REITab = 'rentals' | 'flips' | 'wholesales';

// Generate year options from 2020 to current year
function getYearOptions(): string[] {
  const currentYear = new Date().getFullYear();
  const years: string[] = ['all'];
  for (let y = currentYear; y >= 2020; y--) {
    years.push(String(y));
  }
  return years;
}

export function REIView() {
  const currentYear = new Date().getFullYear();
  const [tab, setTab] = useState<REITab>('rentals');
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));

  const yearOptions = getYearOptions();

  return (
    <div>
      {/* Header row with title and year selector */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem',
        }}
      >
        <h2 style={{ margin: 0 }}>Real Estate Investing</h2>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            fontSize: 14,
          }}
        >
          Year:
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{ padding: '0.25rem 0.5rem', fontSize: 14 }}
          >
            {yearOptions.map((y) => (
              <option key={y} value={y}>
                {y === 'all' ? 'All Years' : y}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* REI tabs */}
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
        {tab === 'rentals' && <RentalOperationsView selectedYear={selectedYear} />}
        {tab === 'flips' && <FlipOperationsView />}
        {tab === 'wholesales' && <WholesaleOperationsView />}
      </div>
    </div>
  );
}