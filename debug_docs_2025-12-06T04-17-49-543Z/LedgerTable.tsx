// src/components/ledger/LedgerTable.tsx

import type { LedgerRow, SortField, SortDir } from './types';
import { formatDate, getDefaultSortDir } from './utils';
import { formatMoney } from '../../utils/format';

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
}: LedgerTableProps) {
  
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
    const arrow = isActive ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

    return (
      <th
        style={{
          ...thStyleBase,
          textAlign: align,
          cursor: 'pointer',
          userSelect: 'none' as const,
          whiteSpace: 'nowrap' as const,
          background: isActive ? '#f5f5f5' : 'transparent',
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
                textAlign: 'right',
                cursor: 'default',
              }}
            >
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.transaction_id}
              style={{
                background: row.is_cleared ? 'transparent' : '#fffbe6',
              }}
            >
              <td style={tdStyle}>{formatDate(row.date)}</td>
              <td style={tdStyle}>{getDisplayDescription(row)}</td>
              <td style={tdStyle}>{row.vendor_installer}</td>
              <td style={tdStyle}>{row.cash_account}</td>
              <td style={tdStyle}>{row.type_label}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{formatMoney(row.amount)}</td>
              <td style={{ ...tdStyle, textAlign: 'center' }}>{row.is_cleared ? '✓' : ''}</td>
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
                    ✓
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
                  ✏️
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
                  ×
                </button>
              </td>
            </tr>
          ))}
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
