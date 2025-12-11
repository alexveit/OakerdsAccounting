// src/components/ledger/LedgerTable.tsx

import type { LedgerRow, SortField, SortDir } from './types';
import { formatLocalDate as formatDate } from '../../utils/date';
import { formatMoney } from '../../utils/format';
import { CcStatusCell } from '../shared/CcStatusCell';

// Re-use getDefaultSortDir inline since utils has broken re-exports
function getDefaultSortDir(field: string): SortDir {
  return field === 'date' || field === 'amount' ? 'desc' : 'asc';
}

type LedgerTableProps = {
  rows: LedgerRow[];
  
  // Sorting
  sortField: SortField;
  sortDir: SortDir;
  onSort: (field: SortField, dir: SortDir) => void;
  
  // Pagination
  page: number;
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  
  // Actions
  onEdit: (row: LedgerRow) => void;
  onDelete: (row: LedgerRow) => void;
  onMarkCleared: (row: LedgerRow) => void;
  
  // CC Selection
  selectedLineIds: Set<number>;
  onToggleSelect: (lineId: number) => void;
  onSelectAllUnsettledCc: (lineIds: number[]) => void;
};

/**
 * Get display description combining job name and description
 */
function getDisplayDescription(row: LedgerRow): string {
  if (row.job_name && row.description) {
    return `${row.job_name} / ${row.description}`;
  }
  return row.job_name || row.description || '';
}

const thStyleBase = {
  textAlign: 'left' as const,
  borderBottom: '1px solid #ccc',
  padding: '4px 4px',
};

const tdStyle = {
  padding: '6px 4px',
  borderBottom: '1px solid #eee',
};

export function LedgerTable({
  rows,
  sortField,
  sortDir,
  onSort,
  page,
  totalPages,
  onPrevPage,
  onNextPage,
  onEdit,
  onDelete,
  onMarkCleared,
  selectedLineIds,
  onToggleSelect,
  onSelectAllUnsettledCc,
}: LedgerTableProps) {
  
  // Get all unsettled CC line IDs on current page
  const unsettledCcLineIds = rows
    .filter((r) => r.isCcTransaction && !r.ccSettled)
    .map((r) => r.line_id);
  
  const allUnsettledSelected = unsettledCcLineIds.length > 0 && 
    unsettledCcLineIds.every((id) => selectedLineIds.has(id));
  
  const handleSelectAllToggle = () => {
    if (allUnsettledSelected) {
      // Deselect all on this page
      onSelectAllUnsettledCc([]);
    } else {
      // Select all unsettled CC on this page
      onSelectAllUnsettledCc(unsettledCcLineIds);
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Toggle direction
      const newDir = sortDir === 'asc' ? 'desc' : 'asc';
      onSort(field, newDir);
    } else {
      // New field: default direction based on field type
      onSort(field, getDefaultSortDir(field));
    }
  };

  const sortableTh = (field: SortField, label: string, align: 'left' | 'right' | 'center' = 'left') => {
    const isActive = sortField === field;
    const arrow = isActive ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : '';

    return (
      <th
        style={{
          ...thStyleBase,
          textAlign: align,
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => handleSort(field)}
      >
        {label}
        {arrow}
      </th>
    );
  };

  return (
    <>
      <table className="table">
        <thead>
          <tr>
            <th
              style={{
                ...thStyleBase,
                textAlign: 'center',
                cursor: unsettledCcLineIds.length > 0 ? 'pointer' : 'default',
                width: 32,
              }}
              title={unsettledCcLineIds.length > 0 ? 'Select all unsettled CC on this page' : ''}
            >
              {unsettledCcLineIds.length > 0 && (
                <input
                  type="checkbox"
                  checked={allUnsettledSelected}
                  onChange={handleSelectAllToggle}
                  style={{ cursor: 'pointer' }}
                />
              )}
            </th>
            {sortableTh('date', 'Date')}
            {sortableTh('description', 'Description')}
            {sortableTh('vendor_installer', 'Vendor / Installer')}
            {sortableTh('cash_account', 'Account')}
            {sortableTh('type_label', 'Category')}
            {sortableTh('amount', 'Amount', 'right')}
            {sortableTh('is_cleared', 'Cleared', 'center')}
            <th
              style={{
                ...thStyleBase,
                textAlign: 'center',
                cursor: 'default',
              }}
            >
              CC
            </th>
            <th
              style={{
                ...thStyleBase,
                textAlign: 'right',
                cursor: 'default',
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            // Combine uncleared styling (yellow) with unsettled CC styling (light red)
            // Unsettled CC takes precedence
            let rowBg = 'transparent';
            const isUnsettledCc = row.isCcTransaction && !row.ccSettled;
            if (isUnsettledCc) {
              rowBg = '#fef2f2'; // Light red for unsettled CC
            } else if (!row.is_cleared) {
              rowBg = '#fffbe6'; // Yellow for uncleared
            }
            
            const isSelected = selectedLineIds.has(row.line_id);
            
            return (
              <tr
                key={row.transaction_id}
                style={{ background: rowBg }}
              >
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  {isUnsettledCc && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(row.line_id)}
                      style={{ cursor: 'pointer' }}
                    />
                  )}
                </td>
                <td style={tdStyle}>{formatDate(row.date)}</td>
                <td style={tdStyle}>{getDisplayDescription(row)}</td>
                <td style={tdStyle}>{row.vendor_installer}</td>
                <td style={tdStyle}>{row.cash_account}</td>
                <td style={tdStyle}>{row.type_label}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatMoney(row.amount)}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{row.is_cleared ? '\u2713' : ''}</td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <CcStatusCell 
                    isCcTransaction={row.isCcTransaction} 
                    ccSettled={row.ccSettled} 
                  />
                </td>
                <td
                  style={{
                    ...tdStyle,
                    textAlign: 'right',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {!row.is_cleared && (
                    <button
                      type="button"
                      onClick={() => onMarkCleared(row)}
                      style={{
                        border: '1px solid #0a7a3c',
                        background: '#e8f5e9',
                        borderRadius: 4,
                        cursor: 'pointer',
                        padding: '2px 6px',
                        fontSize: 13,
                        color: '#0a7a3c',
                        marginRight: 4,
                        lineHeight: 1,
                      }}
                      title="Mark cleared"
                    >
                      {'\u2713'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: '0 4px',
                      fontSize: 14,
                    }}
                    title="Edit"
                  >
                    {'\u270F\uFE0F'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      cursor: 'pointer',
                      padding: '0 4px',
                      fontSize: 14,
                      color: '#b00020',
                    }}
                    title="Delete"
                  >
                    {'\u00D7'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: '0.5rem',
          fontSize: 13,
        }}
      >
        <button
          onClick={onPrevPage}
          disabled={page === 1}
          style={{ padding: '0.2rem 0.6rem', fontSize: 13 }}
        >
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={onNextPage}
          disabled={page === totalPages}
          style={{ padding: '0.2rem 0.6rem', fontSize: 13 }}
        >
          Next
        </button>
      </div>
    </>
  );
}
