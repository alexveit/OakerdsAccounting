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
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        marginBottom: '0.5rem',
        fontSize: 13,
        gap: '0.75rem',
        flexWrap: 'wrap',
      }}
    >
      {/* page size */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Show</span>
        <select
          value={pageSize}
          onChange={handlePageSizeChange}
          style={{
            padding: '4px 8px',
            fontSize: 13,
            borderRadius: 4,
            border: '1px solid #ccc',
            width: 'auto',
          }}
        >
          <option value={25}>25</option>
          <option value={50}>50</option>
          <option value={100}>100</option>
        </select>
        <span>rows</span>
      </div>

      {/* date range picker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Date:</span>
        <select
          value={dateRangePreset}
          onChange={(e) => onDateRangePresetChange(e.target.value as DateRangePreset)}
          style={{
            padding: '4px 8px',
            fontSize: 13,
            borderRadius: 4,
            border: '1px solid #ccc',
            width: 'auto',
          }}
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
              style={{
                padding: '4px 6px',
                fontSize: 13,
                borderRadius: 4,
                border: '1px solid #ccc',
              }}
            />
            <span>-</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => onCustomEndDateChange(e.target.value)}
              style={{
                padding: '4px 6px',
                fontSize: 13,
                borderRadius: 4,
                border: '1px solid #ccc',
              }}
            />
          </>
        )}
      </div>

      {/* account selector - tiered dropdown */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span>Account:</span>
        <select
          value={typeof accountFilter === 'number' ? String(accountFilter) : accountFilter}
          onChange={handleAccountFilterChange}
          style={{
            padding: '4px 8px',
            fontSize: 13,
            borderRadius: 4,
            border: '1px solid #ccc',
            minWidth: 220,
          }}
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
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          flex: 1,
          maxWidth: 560,
          minWidth: 220,
        }}
      >
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => onSearchTermChange(e.target.value)}
          placeholder="Search: date, description, job, vendor, account, type, amount..."
          style={{
            flex: 1,
            minWidth: 0,
            padding: '4px 8px',
            fontSize: 13,
            borderRadius: 4,
            border: '1px solid #ccc',
          }}
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => onSearchTermChange('')}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 14,
              lineHeight: 1,
              padding: '0 4px',
            }}
            aria-label="Clear fast search"
          >
            ×
          </button>
        )}
      </div>

      {/* summary */}
      <div
        style={{
          marginLeft: 'auto',
          whiteSpace: 'nowrap',
          fontSize: 12,
        }}
      >
        Showing {totalCount === 0 ? 0 : startIndex + 1}-{Math.min(endIndex, totalCount)} of{' '}
        {totalCount} {accountFilter !== 'all' ? '(filtered)' : ''}
      </div>
    </div>
  );
}
