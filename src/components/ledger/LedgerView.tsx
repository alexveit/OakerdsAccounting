// src/components/ledger/LedgerView.tsx

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  type LedgerRow,
  type AccountOption,
  type SortField,
  type SortDir,
  type DateRangePreset,
  type DateRange,
  type AccountFilter,
  type CategorizedAccounts,
} from './types';
import {
  getDateRangeForPreset,
  codeMatchesFilter,
  formatDate,
  formatMoney,
  compareValues,
} from './utils';
import { LedgerEditModal, type EditModalResult } from './LedgerEditModal';
import { LedgerClearModal } from './LedgerClearModal';
import { LedgerFilters } from './LedgerFilters';
import { LedgerTable } from './LedgerTable';
import { CcSettleModal } from '../shared/CcSettleModal';
import type { CcBalance, CcSettleTransferParams } from '../../utils/ccTracking';
import { ACCOUNT_CODE_RANGES } from '../../utils/accounts';

// Raw shape from Supabase query
type RawTransactionLine = {
  id: number;
  transaction_id: number;
  amount: number;
  is_cleared: boolean;
  cc_settled: boolean;
  created_at: string;
  account_id: number;
  job_id: number | null;
  accounts: {
    name: string;
    code: string | null;
    account_types: { name: string } | null;
  } | null;
  transactions: {
    date: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  jobs: { name: string } | null;
  vendors: { name: string } | null;
  installers: {
    first_name: string | null;
    last_name: string | null;
    company_name: string | null;
  } | null;
};

type RawAccount = {
  id: number;
  name: string;
  code: string | null;
};

type LedgerViewProps = {
  onNavigateToTransfer?: (params: CcSettleTransferParams) => void;
};

export function LedgerView({ onNavigateToTransfer }: LedgerViewProps) {
  const [allRows, setAllRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [pageSize, setPageSize] = useState<number>(25);
  const [page, setPage] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState<string>('');

  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const [rowActionError, setRowActionError] = useState<string | null>(null);

  // Edit modal state
  const [editingRow, setEditingRow] = useState<LedgerRow | null>(null);

  // All accounts from DB for the tiered dropdown
  const [allAccounts, setAllAccounts] = useState<AccountOption[]>([]);

  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all');

  // Date range filter
  const [dateRangePreset, setDateRangePreset] = useState<DateRangePreset>('last-12-months');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Clear-transaction modal state
  const [clearTarget, setClearTarget] = useState<LedgerRow | null>(null);

  // CC settle selection state
  const [selectedLineIds, setSelectedLineIds] = useState<Set<number>>(new Set());
  const [ccSettleTarget, setCcSettleTarget] = useState<CcBalance | null>(null);
  const [ccSettleError, setCcSettleError] = useState<string | null>(null);

  // ---------- load ledger ----------
  async function loadLedger() {
    setLoading(true);
    setError(null);
    setRowActionError(null);

    try {
      // Fetch 10 years of data for responsive client-side filtering
      const now = new Date();
      const tenYearsAgo = new Date(now);
      tenYearsAgo.setFullYear(now.getFullYear() - 10);
      const tenYearsAgoISO = tenYearsAgo.toISOString().slice(0, 10);

      const { data, error: lineErr } = await supabase
        .from('transaction_lines')
        .select(
          `
          id,
          transaction_id,
          amount,
          is_cleared,
          cc_settled,
          created_at,
          account_id,
          job_id,
          accounts (
            name,
            code,
            account_types ( name )
          ),
          transactions!inner (
            date,
            description,
            created_at,
            updated_at
          ),
          jobs (
            name
          ),
          vendors (
            name
          ),
          installers (
            first_name,
            last_name,
            company_name
          )
        `
        )
        .gte('transactions.date', tenYearsAgoISO)
        .limit(15000);

      if (lineErr) throw lineErr;

      const rawLines = (data ?? []) as unknown as RawTransactionLine[];

      const txMap = new Map<number, RawTransactionLine[]>();
      for (const line of rawLines) {
        const txId: number = line.transaction_id;
        if (!txMap.has(txId)) txMap.set(txId, []);
        txMap.get(txId)!.push(line);
      }

      const ledgerRows: LedgerRow[] = [];

      for (const [txId, lines] of txMap.entries()) {
        if (!lines.length) continue;
        const first = lines[0];
        const tx = first.transactions;

        const date: string = tx?.date ?? '';
        const createdAt: string = tx?.created_at ?? first.created_at;

        // Job name from any line that has a job_id
        const lineWithJob = lines.find((l) => l.jobs?.name);
        const jobName: string | null = lineWithJob?.jobs?.name ?? null;

        // Vendor / installer label
        let vendorInstaller = '';
        const withVendor = lines.find(
          (l) => l.vendors && l.vendors.name && l.vendors.name.trim() !== ''
        );
        if (withVendor?.vendors?.name) {
          vendorInstaller = withVendor.vendors.name;
        } else {
          const withInstaller = lines.find((l) => l.installers != null);
          if (withInstaller?.installers) {
            const inst = withInstaller.installers;
            const fullName = [inst.first_name, inst.last_name]
              .filter(Boolean)
              .join(' ')
              .trim();
            vendorInstaller = inst.company_name || fullName;
          }
        }

        // Cash side (asset/liability)
        const cashLine =
          lines.find((l) => {
            const t = l.accounts?.account_types?.name;
            return t === 'asset' || t === 'liability';
          }) ?? lines[0];

        const cashAccount: string | null =
          cashLine.accounts != null
            ? cashLine.accounts.code
              ? `${cashLine.accounts.name} - ${cashLine.accounts.code}`
              : cashLine.accounts.name
            : null;

        const cashAccountId: number | null =
          typeof cashLine.account_id === 'number' ? cashLine.account_id : null;

        const cashLineId: number = cashLine.id;

        // Type / category side (other account)
        const typeLine = lines.find((l) => l !== cashLine) ?? lines[0];
        const typeLabel: string | null = typeLine.accounts?.name ?? null;

        const amount = Number(cashLine.amount);
        const isCleared = lines.every((l) => !!l.is_cleared);
        const updatedAt: string = tx?.updated_at ?? createdAt;

        // CC tracking: check if cash line is a liability (credit card)
        const isCcTransaction = cashLine.accounts?.account_types?.name === 'liability';
        const ccSettled = isCcTransaction ? !!cashLine.cc_settled : true;

        // Collect all account IDs and codes from all lines
        const allAccountIds: number[] = [];
        const allAccountCodes: (number | null)[] = [];
        for (const line of lines) {
          if (typeof line.account_id === 'number') {
            allAccountIds.push(line.account_id);
            const codeStr = line.accounts?.code;
            const codeNum = codeStr ? parseInt(codeStr, 10) : null;
            allAccountCodes.push(codeNum === null || Number.isNaN(codeNum) ? null : codeNum);
          }
        }

        ledgerRows.push({
          transaction_id: txId,
          line_id: cashLineId,
          date,
          created_at: createdAt,
          updated_at: updatedAt,
          description: tx?.description ?? null,
          job_name: jobName,
          vendor_installer: vendorInstaller || '',
          cash_account: cashAccount,
          cash_account_id: cashAccountId,
          type_label: typeLabel,
          amount,
          is_cleared: isCleared,
          isCcTransaction,
          ccSettled,
          all_account_ids: allAccountIds,
          all_account_codes: allAccountCodes,
        });
      }

      setAllRows(ledgerRows);
      setLoading(false);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load ledger');
      setLoading(false);
    }
  }

  async function loadAccounts() {
    try {
      const { data, error: accErr } = await supabase
        .from('accounts')
        .select('id, name, code')
        .order('code', { ascending: true });

      if (accErr) throw accErr;

      const accounts: AccountOption[] = (data ?? []).map((a: RawAccount) => {
        const code = a.code ? parseInt(a.code, 10) : null;
        return {
          id: a.id,
          name: a.name,
          code: code === null || Number.isNaN(code) ? null : code,
          label: a.code ? `${a.name} - ${a.code}` : a.name,
        };
      });

      setAllAccounts(accounts);
    } catch (err: unknown) {
      console.error('Failed to load accounts:', err);
    }
  }

  useEffect(() => {
    void loadLedger();
    void loadAccounts();
  }, []);

  // ---------- helpers ----------
  // Combine job name and description for display (still needed for delete confirmation)
  const getDisplayDescription = (row: LedgerRow): string => {
    if (row.job_name && row.description) {
      return `${row.job_name} / ${row.description}`;
    }
    return row.job_name || row.description || '';
  };

  const handlePrev = () => setPage((p) => Math.max(1, p - 1));
  const handleNext = () => setPage((p) => Math.min(totalPages, p + 1));

  useEffect(() => {
    setPage(1);
  }, [searchTerm, accountFilter, dateRangePreset, customStartDate, customEndDate]);

  // ---------- account list (for selector) ----------
  // Separate accounts by category based on code ranges
  const categorizedAccounts = useMemo((): CategorizedAccounts => {
    const banks: AccountOption[] = [];
    const cards: AccountOption[] = [];
    const reAssets: AccountOption[] = [];
    const reLiabilities: AccountOption[] = [];
    const other: AccountOption[] = [];

    for (const acc of allAccounts) {
      if (acc.code !== null) {
        if (acc.code >= ACCOUNT_CODE_RANGES.BANK_MIN && acc.code <= ACCOUNT_CODE_RANGES.BANK_MAX) {
          banks.push(acc);
        } else if (acc.code >= ACCOUNT_CODE_RANGES.CREDIT_CARD_MIN && acc.code <= ACCOUNT_CODE_RANGES.CREDIT_CARD_MAX) {
          cards.push(acc);
        } else if (acc.code >= ACCOUNT_CODE_RANGES.RE_ASSET_MIN && acc.code <= ACCOUNT_CODE_RANGES.RE_ASSET_MAX) {
          reAssets.push(acc);
        } else if (acc.code >= ACCOUNT_CODE_RANGES.RE_MORTGAGE_MIN && acc.code <= ACCOUNT_CODE_RANGES.RE_MORTGAGE_MAX) {
          reLiabilities.push(acc);
        }
      }
    }

    // Sort each category by code
    const sortByCode = (a: AccountOption, b: AccountOption) => {
      if (a.code === null && b.code === null) return a.name.localeCompare(b.name);
      if (a.code === null) return 1;
      if (b.code === null) return -1;
      return a.code - b.code;
    };

    banks.sort(sortByCode);
    cards.sort(sortByCode);
    reAssets.sort(sortByCode);
    reLiabilities.sort(sortByCode);

    return { banks, cards, reAssets, reLiabilities, other };
  }, [allAccounts]);

  // ---------- filtered + sorted rows ----------
  // Compute effective date range (from preset or custom)
  const effectiveDateRange = useMemo((): DateRange => {
    if (dateRangePreset === 'custom') {
      return {
        start: customStartDate || null,
        end: customEndDate || null,
      };
    }
    return getDateRangeForPreset(dateRangePreset);
  }, [dateRangePreset, customStartDate, customEndDate]);

  const filteredRows = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();

    let rows = allRows;

    // Date range filter
    if (effectiveDateRange.start || effectiveDateRange.end) {
      rows = rows.filter((row) => {
        if (!row.date) return false;
        if (effectiveDateRange.start && row.date < effectiveDateRange.start) return false;
        if (effectiveDateRange.end && row.date > effectiveDateRange.end) return false;
        return true;
      });
    }

    // account filter - check if ANY line in the transaction matches
    if (accountFilter !== 'all') {
      rows = rows.filter((r) => {
        // If it's a specific account ID (number)
        if (typeof accountFilter === 'number') {
          return r.all_account_ids.includes(accountFilter);
        }
        // Otherwise it's a range filter - check if any account code matches
        return r.all_account_codes.some((code) => codeMatchesFilter(code, accountFilter));
      });
    }

    // text search (include job_name in search)
    if (term) {
      rows = rows.filter((row) => {
        const haystacks: string[] = [
          formatDate(row.date),
          row.date ?? '',
          row.description ?? '',
          row.job_name ?? '',
          row.vendor_installer ?? '',
          row.cash_account ?? '',
          row.type_label ?? '',
          row.amount.toFixed(2),
        ];
        return haystacks.some((h) => h.toLowerCase().includes(term));
      });
    }

    // Always sort - pending first, then user's chosen sort within each group
    const sorted = [...rows].sort((a, b) => {
      // Pending always on top
      if (a.is_cleared !== b.is_cleared) {
        return a.is_cleared ? 1 : -1;
      }

      // Within same cleared status, apply user's sort
      let result = 0;

      switch (sortField) {
        case 'date':
          result = compareValues(a.date, b.date, sortDir);
          // Secondary: updated_at in same direction as date
          if (result === 0) {
            result = compareValues(a.updated_at, b.updated_at, sortDir);
          }
          break;
        case 'description':
          result = compareValues(
            getDisplayDescription(a),
            getDisplayDescription(b),
            sortDir
          );
          break;
        case 'vendor_installer':
          result = compareValues(a.vendor_installer, b.vendor_installer, sortDir);
          break;
        case 'cash_account':
          result = compareValues(a.cash_account, b.cash_account, sortDir);
          break;
        case 'type_label':
          result = compareValues(a.type_label, b.type_label, sortDir);
          break;
        case 'amount':
          result = compareValues(a.amount, b.amount, sortDir);
          break;
        case 'is_cleared':
          result = compareValues(a.is_cleared, b.is_cleared, sortDir);
          break;
      }

      // If still tied on the chosen field, fall back to date desc
      if (result === 0 && sortField !== 'date') {
        result = compareValues(a.date, b.date, 'desc');
      }

      return result;
    });

    return sorted;
  }, [allRows, searchTerm, accountFilter, effectiveDateRange, sortField, sortDir]);

  const totalCount = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const startIndex = (page - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const pageRows = filteredRows.slice(startIndex, endIndex);

  // ---------- edit / delete ----------
  const openEditModal = (row: LedgerRow) => {
    setEditingRow(row);
    setRowActionError(null);
  };

  const handleEditSave = (txId: number, result: EditModalResult) => {
    setAllRows((prev) =>
      prev.map((r) =>
        r.transaction_id === txId
          ? {
              ...r,
              date: result.date,
              description: result.description,
              amount: result.amount,
              cash_account: result.cashAccountLabel,
              cash_account_id: result.cashAccountId,
              type_label: result.categoryAccountLabel,
              job_name: result.jobName,
              vendor_installer: result.vendorInstaller,
              updated_at: new Date().toISOString(),
            }
          : r
      )
    );
    setEditingRow(null);
  };

  const handleEditError = (message: string) => {
    setRowActionError(message);
  };

  async function handleDelete(row: LedgerRow) {
    const confirmed = window.confirm(
      `Delete this transaction?\n\n` +
        `Date: ${formatDate(row.date)}\n` +
        `Amount: ${formatMoney(row.amount)}\n` +
        `Description: ${getDisplayDescription(row) || '(no description)'}\n\n` +
        `This will delete ALL lines for this transaction. This cannot be undone.`
    );
    if (!confirmed) return;

    setRowActionError(null);

    try {
      const { error: linesErr } = await supabase
        .from('transaction_lines')
        .delete()
        .eq('transaction_id', row.transaction_id);
      if (linesErr) throw linesErr;

      const { error: txErr } = await supabase.from('transactions').delete().eq('id', row.transaction_id);
      if (txErr) throw txErr;

      setAllRows((prev) => prev.filter((r) => r.transaction_id !== row.transaction_id));
    } catch (err: unknown) {
      console.error('Delete failed:', err);
      setRowActionError(err instanceof Error ? err.message : 'Failed to delete transaction.');
    }
  }

  // ---------- clear from ledger ----------
  function handleMarkClearedFromLedger(row: LedgerRow) {
    if (row.is_cleared) return;
    setRowActionError(null);
    setClearTarget(row);
  }

  async function handleClearSuccess() {
    setClearTarget(null);
    await loadLedger();
  }

  function handleClearError(message: string) {
    setRowActionError(message);
  }

  // ---------- CC settle selection ----------
  function handleToggleSelect(lineId: number) {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) {
        next.delete(lineId);
      } else {
        next.add(lineId);
      }
      return next;
    });
    setCcSettleError(null);
  }

  function handleSelectAllUnsettledCc(lineIds: number[]) {
    if (lineIds.length === 0) {
      // Deselect all on current page
      const pageLineIds = new Set(pageRows.map((r) => r.line_id));
      setSelectedLineIds((prev) => {
        const next = new Set(prev);
        pageLineIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // Select all provided
      setSelectedLineIds((prev) => {
        const next = new Set(prev);
        lineIds.forEach((id) => next.add(id));
        return next;
      });
    }
    setCcSettleError(null);
  }

  function handleSettleSelectedCc() {
    setCcSettleError(null);

    if (selectedLineIds.size === 0) {
      setCcSettleError('No CC lines selected');
      return;
    }

    // Get selected rows from allRows (not just pageRows)
    const selectedRows = allRows.filter((r) => selectedLineIds.has(r.line_id));

    // Validate all are unsettled CC
    const nonCcRows = selectedRows.filter((r) => !r.isCcTransaction || r.ccSettled);
    if (nonCcRows.length > 0) {
      setCcSettleError('Selection includes non-CC or already settled transactions');
      return;
    }

    // Validate all from same CC account
    const uniqueAccountIds = new Set(selectedRows.map((r) => r.cash_account_id));
    if (uniqueAccountIds.size > 1) {
      const accountNames = [...new Set(selectedRows.map((r) => r.cash_account))].join(', ');
      setCcSettleError(`Selected lines are from different credit cards: ${accountNames}`);
      return;
    }

    // Build CcBalance for modal
    const firstRow = selectedRows[0];
    
    // Null safety - should never happen for valid CC transactions
    if (firstRow.cash_account_id === null || firstRow.cash_account === null) {
      setCcSettleError('Invalid CC transaction: missing account information');
      return;
    }
    
    const totalAmount = Math.round(selectedRows.reduce((sum, r) => sum + Math.abs(r.amount), 0) * 100) / 100;

    const ccBalance: CcBalance = {
      accountId: firstRow.cash_account_id,
      accountName: firstRow.cash_account,
      unclearedAmount: totalAmount,
      lineIds: selectedRows.map((r) => r.line_id),
    };

    setCcSettleTarget(ccBalance);
  }

  async function handleCcSettled() {
    // Refresh data and clear selection
    await loadLedger();
    setSelectedLineIds(new Set());
    setCcSettleTarget(null);
  }

  function handleNavigateToTransfer(params: CcSettleTransferParams) {
    setCcSettleTarget(null);
    setSelectedLineIds(new Set());
    
    if (onNavigateToTransfer) {
      onNavigateToTransfer(params);
    } else {
      // Fallback if prop not provided
      console.log('Navigate to transfer:', params);
      alert(`Transfer navigation not available.\n\nTo account: ${params.toAccountName}\nAmount: $${params.amount.toFixed(2)}`);
    }
  }

  // ---------- JSX ----------
  return (
    <div>
      <h2 className="ledger-title">Ledger</h2>

      <div className="card">
        {loading && <p>Loading transactions...</p>}
        {error && <p className="ledger-error">Error: {error}</p>}
        {rowActionError && !loading && (
          <p className="ledger-row-error">{rowActionError}</p>
        )}

        {!loading && !error && (
          <>
            {/* controls row */}
            <LedgerFilters
              pageSize={pageSize}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              dateRangePreset={dateRangePreset}
              onDateRangePresetChange={setDateRangePreset}
              customStartDate={customStartDate}
              onCustomStartDateChange={setCustomStartDate}
              customEndDate={customEndDate}
              onCustomEndDateChange={setCustomEndDate}
              accountFilter={accountFilter}
              onAccountFilterChange={setAccountFilter}
              categorizedAccounts={categorizedAccounts}
              searchTerm={searchTerm}
              onSearchTermChange={setSearchTerm}
              totalCount={totalCount}
              startIndex={startIndex}
              endIndex={endIndex}
            />

            {/* CC Settle action bar */}
            {selectedLineIds.size > 0 && (
              <div className="cc-select-bar">
                <span className="cc-select-bar__count">
                  {selectedLineIds.size} CC transaction{selectedLineIds.size !== 1 ? 's' : ''} selected
                </span>
                <button
                  type="button"
                  onClick={handleSettleSelectedCc}
                  className="cc-select-bar__btn-settle"
                >
                  Settle Selected CC
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedLineIds(new Set());
                    setCcSettleError(null);
                  }}
                  className="cc-select-bar__btn-clear"
                >
                  Clear Selection
                </button>
              </div>
            )}

            {ccSettleError && (
              <p className="cc-settle-error">
                {ccSettleError}
              </p>
            )}

            {totalCount === 0 && (
              <p className="ledger-empty">No transactions found for this selection.</p>
            )}

            {totalCount > 0 && (
              <LedgerTable
                rows={pageRows}
                sortField={sortField}
                sortDir={sortDir}
                onSort={(field, dir) => {
                  setSortField(field);
                  setSortDir(dir);
                }}
                page={page}
                totalPages={totalPages}
                onPrevPage={handlePrev}
                onNextPage={handleNext}
                onEdit={openEditModal}
                onDelete={(row) => void handleDelete(row)}
                onMarkCleared={handleMarkClearedFromLedger}
                selectedLineIds={selectedLineIds}
                onToggleSelect={handleToggleSelect}
                onSelectAllUnsettledCc={handleSelectAllUnsettledCc}
              />
            )}
          </>
        )}

        {/* edit modal */}
        {editingRow && (
          <LedgerEditModal
            row={editingRow}
            onClose={() => setEditingRow(null)}
            onSave={handleEditSave}
            onError={handleEditError}
          />
        )}

        {/* clear-from-ledger modal */}
        {clearTarget && (
          <LedgerClearModal
            row={clearTarget}
            onClose={() => setClearTarget(null)}
            onSuccess={() => void handleClearSuccess()}
            onError={handleClearError}
          />
        )}

        {/* CC settle modal */}
        {ccSettleTarget && (
          <CcSettleModal
            entityName="Selected Transactions"
            cc={ccSettleTarget}
            onClose={() => setCcSettleTarget(null)}
            onSettled={() => void handleCcSettled()}
            onNavigateToTransfer={handleNavigateToTransfer}
          />
        )}
      </div>
    </div>
  );
}
