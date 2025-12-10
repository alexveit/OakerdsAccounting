// src/components/real-estate/RentalsView.tsx

import { useState } from 'react';
import { RentalOperationsView } from './RentalOperationsView';

function getYearOptions(): string[] {
  const currentYear = new Date().getFullYear();
  const years: string[] = ['all'];
  for (let y = currentYear; y >= 2020; y--) {
    years.push(String(y));
  }
  return years;
}

export function RentalsView() {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<string>(String(currentYear));
  const yearOptions = getYearOptions();

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
        <h2 style={{ margin: 0 }}>Rentals</h2>

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

      <RentalOperationsView selectedYear={selectedYear} />
    </div>
  );
}
