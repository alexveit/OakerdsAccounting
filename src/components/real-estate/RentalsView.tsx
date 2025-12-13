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
      <div className="page-header">
        <h2 className="page-header__title">Rentals</h2>

        <label className="page-header__select-label">
          Year:
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            className="page-header__select"
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
