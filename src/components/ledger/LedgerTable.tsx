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
    const alignClass = align !== 'left' ? align : '';

    return (
      <th
        className={`sortable ${alignClass}`}
        onClick={() => handleSort(field)}
      >
        {label}
        {arrow}
      </th>
    );
  };

  return (
    <>
      <table className="table ledger-table">
        <thead>
          <tr>
            <th
              className={`col-checkbox ${unsettledCcLineIds.length > 0 ? 'cursor-pointer' : ''}`}
              title={unsettledCcLineIds.length > 0 ? 'Select all unsettled CC on this page' : ''}
            >
              {unsettledCcLineIds.length > 0 && (
                <input
                  type="checkbox"
                  checked={allUnsettledSelected}
                  onChange={handleSelectAllToggle}
                  className="cursor-pointer"
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
            <th className="center">CC</th>
            <th className="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isUnsettledCc = row.isCcTransaction && !row.ccSettled;
            const rowClass = isUnsettledCc ? 'unsettled-cc' : (!row.is_cleared ? 'uncleared' : '');
            const isSelected = selectedLineIds.has(row.line_id);
            
            return (
              <tr
                key={row.transaction_id}
                className={rowClass}
              >
                <td className="center">
                  {isUnsettledCc && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(row.line_id)}
                      className="cursor-pointer"
                    />
                  )}
                </td>
                <td>{formatDate(row.date)}</td>
                <td>{getDisplayDescription(row)}</td>
                <td>{row.vendor_installer}</td>
                <td>{row.cash_account}</td>
                <td>{row.type_label}</td>
                <td className="right">{formatMoney(row.amount)}</td>
                <td className="center">{row.is_cleared ? '\u2713' : ''}</td>
                <td className="center">
                  <CcStatusCell 
                    isCcTransaction={row.isCcTransaction} 
                    ccSettled={row.ccSettled} 
                  />
                </td>
                <td className="actions">
                  {!row.is_cleared && (
                    <button
                      type="button"
                      onClick={() => onMarkCleared(row)}
                      className="ledger-btn-clear"
                      title="Mark cleared"
                    >
                      {'\u2713'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onEdit(row)}
                    className="ledger-btn-edit"
                    title="Edit"
                  >
                    {'\u270F\uFE0F'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(row)}
                    className="ledger-btn-delete"
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

      <div className="ledger-pagination">
        <button
          onClick={onPrevPage}
          disabled={page === 1}
        >
          Prev
        </button>
        <span>
          Page {page} of {totalPages}
        </span>
        <button
          onClick={onNextPage}
          disabled={page === totalPages}
        >
          Next
        </button>
      </div>
    </>
  );
}
