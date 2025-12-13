// src/components/ledger/LedgerFilters.tsx

import type { DateRangePreset, AccountFilter, CategorizedAccounts } from './types';

type LedgerFiltersProps = {
  // Page size
  pageSize: number;
  onPageSizeChange: (size: number) => void;

  // Date range
  dateRangePreset: DateRangePreset;
  onDateRangePresetChange: (preset: DateRangePreset) => void;
  customStartDate: string;
  onCustomStartDateChange: (date: string) => void;
  customEndDate: string;
  onCustomEndDateChange: (date: string) => void;

  // Account filter
  accountFilter: AccountFilter;
  onAccountFilterChange: (filter: AccountFilter) => void;
  categorizedAccounts: CategorizedAccounts;

  // Search
  searchTerm: string;
  onSearchTermChange: (term: string) => void;

  // Summary info
  totalCount: number;
  startIndex: number;
  endIndex: number;
};

export function LedgerFilters({
  pageSize,
  onPageSizeChange,
  dateRangePreset,
  onDateRangePresetChange,
  customStartDate,
  onCustomStartDateChange,
  customEndDate,
  onCustomEndDateChange,
  accountFilter,
  onAccountFilterChange,
  categorizedAccounts,
  searchTerm,
  onSearchTermChange,
  totalCount,
  startIndex,
  endIndex,
}: LedgerFiltersProps) {
  const handlePageSizeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = Number(e.target.value) || 25;
    onPageSizeChange(newSize);
  };

  const handleAccountFilterChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (
      val === 'all' ||
      val === 'banks' ||
      val === 'cards' ||
      val === 're-all' ||
      val === 're-assets' ||
      val === 're-liabilities'
    ) {
      onAccountFilterChange(val as AccountFilter);
    } else {
      onAccountFilterChange(Number(val));
    }
  };

  return (
    <div className="filter-bar">
      {/* page size */}
      <div className="filter-bar__group">
        <span>Show</span>
        <select
          value={pageSize}
          onChange={handlePageSizeChange}
          className="filter-bar__select"
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>rows</span>
      </div>

      {/* date range picker */}
      <div className="filter-bar__group">
        <span>Date:</span>
        <select
          value={dateRangePreset}
          onChange={(e) => onDateRangePresetChange(e.target.value as DateRangePreset)}
          className="filter-bar__select"
        >
          <option value="last-12-months">Last 12 months</option>
          <option value="custom">Custom range</option>
        </select>
        {dateRangePreset === 'custom' && (
          <>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => onCustomStartDateChange(e.target.value)}
              className="filter-bar__input"
            />
            <span>-</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => onCustomEndDateChange(e.target.value)}
              className="filter-bar__input"
            />
          </>
        )}
      </div>

      {/* account selector - tiered dropdown */}
      <div className="filter-bar__group">
        <span>Account:</span>
        <select
          value={typeof accountFilter === 'number' ? String(accountFilter) : accountFilter}
          onChange={handleAccountFilterChange}
          className="filter-bar__select filter-bar__select--wide"
        >
          <option value="all">All Accounts</option>

          {/* Banks group */}
          {categorizedAccounts.banks.length > 0 && (
            <>
              <option value="banks">── All Banks (1000-1999)</option>
              {categorizedAccounts.banks.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  &nbsp;&nbsp;&nbsp;&nbsp;{acc.label}
                </option>
              ))}
            </>
          )}

          {/* Cards group */}
          {categorizedAccounts.cards.length > 0 && (
            <>
              <option value="cards">── All Cards (2000-2999)</option>
              {categorizedAccounts.cards.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  &nbsp;&nbsp;&nbsp;&nbsp;{acc.label}
                </option>
              ))}
            </>
          )}

          {/* RE group */}
          {(categorizedAccounts.reAssets.length > 0 ||
            categorizedAccounts.reLiabilities.length > 0) && (
            <>
              <option value="re-all">── All RE (63000-64999)</option>

              {/* RE Assets subgroup */}
              {categorizedAccounts.reAssets.length > 0 && (
                <>
                  <option value="re-assets">&nbsp;&nbsp;── All RE Assets (63000-63999)</option>
                  {categorizedAccounts.reAssets.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{acc.label}
                    </option>
                  ))}
                </>
              )}

              {/* RE Liabilities subgroup */}
              {categorizedAccounts.reLiabilities.length > 0 && (
                <>
                  <option value="re-liabilities">
                    &nbsp;&nbsp;── All RE Liabilities (64000-64999)
                  </option>
                  {categorizedAccounts.reLiabilities.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{acc.label}
                    </option>
                  ))}
                </>
              )}
            </>
          )}

          {/* Other accounts */}
          {categorizedAccounts.other.length > 0 && (
            <>
              <option disabled>──────────</option>
              {categorizedAccounts.other.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.label}
                </option>
              ))}
            </>
          )}
        </select>
      </div>

      {/* fast search */}
      <div className="filter-bar__search">
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          placeholder="Search: date, description, job, vendor, account, type, amount..."
          className="filter-bar__search-input"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchTermChange('')}
            className="filter-bar__search-clear"
            aria-label="Clear fast search"
          >
            ×
          </button>
        )}
      </div>

      {/* summary */}
      <div className="filter-bar__summary">
        Showing {totalCount === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, totalCount)} of{' '}
        {totalCount} {accountFilter !== 'all' ? '(filtered)' : ''}
      </div>
    </div>
  );
}
