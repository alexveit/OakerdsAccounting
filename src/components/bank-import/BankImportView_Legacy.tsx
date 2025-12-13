// src/components/bank-import/BankImportView.tsx

import { useEffect, useState, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';
import { formatLocalDate } from '../../utils/date';
import { isBankCode, isCreditCardCode, compareAccountsForSort } from '../../utils/accounts';
import { SearchableSelect, type SelectOption } from '../shared/SearchableSelect';
import type {
  PendingTransaction,
  ClearedTransaction,
  HistoricalTransaction,
  ReferenceData,
  BankImportRequest,
  BankImportResponse,
  ReviewTransaction,
} from './bankImportTypes';

// Raw query shapes from Supabase
type RawPendingLineRow = {
  id: number;
  transaction_id: number;
  amount: number;
  transactions: { date: string; description: string | null } | null;
  vendors: { name: string } | null;
  jobs: { name: string } | null;
  installers: { first_name: string | null; last_name: string | null; company_name: string | null } | null;
};

type RawClearedLineRow = {
  id: number;
  transaction_id: number;
  amount: number;
  transactions: { date: string; description: string | null } | null;
};

type RawHistoryLineRow = {
  amount: number;
  transactions: { date: string; description: string | null } | null;
  accounts: { code: string | null; name: string } | null;
  vendors: { name: string } | null;
  jobs: { name: string } | null;
};

type RawVendorRow = { id: number; name: string };
type RawJobRow = { id: number; name: string; address: string | null; status: string | null };
type RawInstallerRow = { id: number; first_name: string | null; last_name: string | null; company_name: string | null };
type RawAccountRow = { id: number; code: string | null; name: string; account_type_id: number };

type Account = {
  id: number;
  name: string;
  code: string | null;
};

type ProcessingState = 'idle' | 'loading-context' | 'processing-ai' | 'review' | 'committing';

type ProcessingStep = {
  label: string;
  status: 'pending' | 'active' | 'done';
  detail?: string;
};

export function BankImportView() {
  // Storage key for persistence
  const STORAGE_KEY = 'bankImport_reviewState';

  // State
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [rawBankData, setRawBankData] = useState<string>('');
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  // Processing feedback state
  const [processingSteps, setProcessingSteps] = useState<ProcessingStep[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const timerRef = useRef<number | null>(null);

  // Review state
  const [reviewTransactions, setReviewTransactions] = useState<ReviewTransaction[]>([]);
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [pendingTransactionsMap, setPendingTransactionsMap] = useState<Map<number, PendingTransaction>>(new Map());
  const [expandedMatches, setExpandedMatches] = useState<Set<number>>(new Set());

  // Stats for hidden transactions
  const [hiddenStats, setHiddenStats] = useState<{ bankPending: number; alreadyCleared: number }>({ bankPending: 0, alreadyCleared: 0 });

  // Success state
  const [commitResult, setCommitResult] = useState<{ cleared: number; created: number; tipAdjusted: number } | null>(null);

  // Restore state from localStorage on mount
  // Restore state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.reviewTransactions?.length > 0) {
          setReviewTransactions(parsed.reviewTransactions);
          setReferenceData(parsed.referenceData || null);
          setSelectedAccountId(parsed.selectedAccountId || '');
          setWarnings(parsed.warnings || []);
          setHiddenStats(parsed.hiddenStats || { bankPending: 0, alreadyCleared: 0 });
          // Restore pendingTransactionsMap from array
          if (parsed.pendingTransactionsArray) {
            const map = new Map<number, PendingTransaction>();
            parsed.pendingTransactionsArray.forEach((tx: PendingTransaction) => map.set(tx.line_id, tx));
            setPendingTransactionsMap(map);
          }
          setProcessingState('review');
        }
      }
    } catch (e) {
      console.warn('Failed to restore bank import state:', e);
    }
  }, []);

  // Save state to localStorage when review data changes
  useEffect(() => {
    if (reviewTransactions.length > 0 && processingState === 'review') {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          reviewTransactions,
          referenceData,
          selectedAccountId,
          warnings,
          hiddenStats,
          pendingTransactionsArray: Array.from(pendingTransactionsMap.values()),
          savedAt: new Date().toISOString(),
        }));
      } catch (e) {
        console.warn('Failed to save bank import state:', e);
      }
    }
  }, [reviewTransactions, referenceData, selectedAccountId, warnings, hiddenStats, processingState, pendingTransactionsMap]);

  // Clear saved state after successful commit or manual clear
  function clearSavedState() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      console.warn('Failed to clear bank import state:', e);
    }
  }

  // Timer helpers
  function startTimer() {
    setElapsedSeconds(0);
    timerRef.current = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  useEffect(() => {
    return () => stopTimer();
  }, []);

  // Load accounts on mount
  useEffect(() => {
    async function loadAccounts() {
      try {
        const { data, error: err } = await supabase
          .from('accounts')
          .select('id, name, code')
          .eq('is_active', true);

        if (err) throw err;

        const cashAccounts = (data ?? [])
          .filter((a) => isBankCode(a.code) || isCreditCardCode(a.code))
          .sort(compareAccountsForSort);

        setAccounts(cashAccounts);

        if (cashAccounts.length > 0) {
          setSelectedAccountId(String(cashAccounts[0].id));
        }
      } catch (err: unknown) {
        console.error('Failed to load accounts:', err);
        setError(err instanceof Error ? err.message : 'Failed to load accounts');
      }
    }

    void loadAccounts();
  }, []);

  // Process with AI
  async function handleProcess() {
    if (!selectedAccountId || !rawBankData.trim()) {
      setError('Please select an account and paste bank data.');
      return;
    }

    setError(null);
    setWarnings([]);
    setCommitResult(null);
    setExpandedMatches(new Set());
    setHiddenStats({ bankPending: 0, alreadyCleared: 0 });
    startTimer();

    setProcessingSteps([
      { label: 'Loading pending transactions', status: 'active' },
      { label: 'Loading cleared transactions', status: 'pending' },
      { label: 'Loading transaction history', status: 'pending' },
      { label: 'Loading reference data', status: 'pending' },
      { label: 'Analyzing with AI', status: 'pending' },
    ]);
    setProcessingState('loading-context');

    try {
      const accountId = Number(selectedAccountId);
      const selectedAccount = accounts.find((a) => a.id === accountId);
      if (!selectedAccount) throw new Error('Selected account not found');

      // Step 1: Pending transactions
      const { data: pendingData, error: pendingErr } = await supabase
        .from('transaction_lines')
        .select(`
          id, transaction_id, amount,
          transactions!inner (date, description),
          vendors (name),
          jobs (name),
          installers (first_name, last_name, company_name)
        `)
        .eq('account_id', accountId)
        .eq('is_cleared', false)
        .order('transactions(date)', { ascending: false })
        .limit(200);

      if (pendingErr) throw pendingErr;

      const rawPending = (pendingData ?? []) as unknown as RawPendingLineRow[];
      const pendingTransactions: PendingTransaction[] = rawPending.map((row) => {
        const installer = row.installers;
        let installerName: string | null = null;
        if (installer) {
          installerName = installer.company_name ||
            [installer.first_name, installer.last_name].filter(Boolean).join(' ');
        }
        return {
          line_id: row.id,
          transaction_id: row.transaction_id,
          date: row.transactions?.date ?? '',
          description: row.transactions?.description ?? null,
          amount: Number(row.amount),
          vendor_name: row.vendors?.name ?? null,
          job_name: row.jobs?.name ?? null,
          installer_name: installerName,
        };
      });

      const pendingMap = new Map<number, PendingTransaction>();
      pendingTransactions.forEach((tx) => pendingMap.set(tx.line_id, tx));
      setPendingTransactionsMap(pendingMap);

      setProcessingSteps((prev) => prev.map((s, i) =>
        i === 0 ? { ...s, status: 'done', detail: `${pendingTransactions.length} found` } :
        i === 1 ? { ...s, status: 'active' } : s
      ));

      // Step 2: Cleared transactions (last 60 days)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
      const sixtyDaysAgoISO = sixtyDaysAgo.toISOString().slice(0, 10);

      const { data: clearedData, error: clearedErr } = await supabase
        .from('transaction_lines')
        .select(`
          id, transaction_id, amount,
          transactions!inner (date, description)
        `)
        .eq('account_id', accountId)
        .eq('is_cleared', true)
        .gte('transactions.date', sixtyDaysAgoISO)
        .order('transactions(date)', { ascending: false })
        .limit(200);

      if (clearedErr) throw clearedErr;

      const rawCleared = (clearedData ?? []) as unknown as RawClearedLineRow[];
      const clearedTransactions: ClearedTransaction[] = rawCleared.map((row) => ({
        line_id: row.id,
        transaction_id: row.transaction_id,
        date: row.transactions?.date ?? '',
        description: row.transactions?.description ?? null,
        amount: Number(row.amount),
      }));

      setProcessingSteps((prev) => prev.map((s, i) =>
        i === 1 ? { ...s, status: 'done', detail: `${clearedTransactions.length} found` } :
        i === 2 ? { ...s, status: 'active' } : s
      ));

      // Step 3: Transaction history
      const { data: historyData, error: historyErr } = await supabase
        .from('transaction_lines')
        .select(`
          amount,
          transactions!inner (date, description),
          accounts!inner (code, name),
          vendors (name),
          jobs (name)
        `)
        .eq('account_id', accountId)
        .eq('is_cleared', true)
        .order('transactions(date)', { ascending: false })
        .limit(100);

      if (historyErr) throw historyErr;

      const rawHistory = (historyData ?? []) as unknown as RawHistoryLineRow[];
      const recentHistory: HistoricalTransaction[] = rawHistory.map((row) => ({
        date: row.transactions?.date ?? '',
        description: row.transactions?.description ?? null,
        amount: Number(row.amount),
        account_code: row.accounts?.code ?? null,
        account_name: row.accounts?.name ?? '',
        vendor_name: row.vendors?.name ?? null,
        job_name: row.jobs?.name ?? null,
      }));

      setProcessingSteps((prev) => prev.map((s, i) =>
        i === 2 ? { ...s, status: 'done', detail: `${recentHistory.length} records` } :
        i === 3 ? { ...s, status: 'active' } : s
      ));

      // Step 4: Reference data
      const [vendorsRes, jobsRes, installersRes, accountsRes] = await Promise.all([
        supabase.from('vendors').select('id, name').eq('is_active', true),
        supabase.from('jobs').select('id, name, address, status'),
        supabase.from('installers').select('id, first_name, last_name, company_name').eq('is_active', true),
        supabase.from('accounts').select('id, code, name, account_type_id').eq('is_active', true),
      ]);

      if (vendorsRes.error) throw vendorsRes.error;
      if (jobsRes.error) throw jobsRes.error;
      if (installersRes.error) throw installersRes.error;
      if (accountsRes.error) throw accountsRes.error;

      const rawVendors = (vendorsRes.data ?? []) as unknown as RawVendorRow[];
      const vendors = rawVendors.map((v) => ({ id: v.id, name: v.name }));

      const rawJobs = (jobsRes.data ?? []) as unknown as RawJobRow[];
      const jobs = rawJobs
        .filter((j) => j.status !== 'closed')
        .map((j) => ({ id: j.id, name: j.name, address: j.address ?? '', status: j.status ?? 'open' }));

      const rawInstallers = (installersRes.data ?? []) as unknown as RawInstallerRow[];
      const installers = rawInstallers.map((i) => ({
        id: i.id,
        name: i.company_name || [i.first_name, i.last_name].filter(Boolean).join(' '),
      }));

      const rawAccounts = (accountsRes.data ?? []) as unknown as RawAccountRow[];
      const expenseAccounts = rawAccounts
        .filter((a) => a.account_type_id === 5 && a.code)
        .map((a) => ({ id: a.id, code: a.code!, name: a.name }));
      const incomeAccounts = rawAccounts
        .filter((a) => a.account_type_id === 4 && a.code)
        .map((a) => ({ id: a.id, code: a.code!, name: a.name }));

      const refData: ReferenceData = { vendors, jobs, installers, expenseAccounts, incomeAccounts };
      setReferenceData(refData);

      setProcessingSteps((prev) => prev.map((s, i) =>
        i === 3 ? { ...s, status: 'done', detail: `${vendors.length} vendors, ${jobs.length} jobs` } :
        i === 4 ? { ...s, status: 'active' } : s
      ));

      setProcessingState('processing-ai');

      // Step 5: AI processing
      const request: BankImportRequest = {
        rawBankData,
        selectedAccount: { id: selectedAccount.id, name: selectedAccount.name, code: selectedAccount.code ?? '' },
        pendingTransactions,
        clearedTransactions,
        recentHistory,
        referenceData: refData,
      };

      const { data, error: fnErr } = await supabase.functions.invoke('bank-import', { body: request });

      if (fnErr) throw fnErr;

      const response = data as BankImportResponse;

      setProcessingSteps((prev) => prev.map((s, i) =>
        i === 4 ? { ...s, status: 'done', detail: `${response.parsed_transactions.length} transactions parsed` } : s
      ));

      stopTimer();

      if (response.warnings?.length) {
        setWarnings(response.warnings);
      }

      // Filter logic:
      // - Hide: bank_pending + matched_pending (both systems have it pending, nothing to do)
      // - Hide: bank_posted + matched_cleared (already reconciled, normal)
      // - Show: NEW (regardless of bank status - need to create in DB)
      // - Show: posted + matched_pending (mark as cleared)
      // - Show: tip_adjustment (update amount and mark as cleared)
      // - Show: bank_pending + matched_cleared (ANOMALY - cleared in DB but still processing at bank)
      const allParsed = response.parsed_transactions;
      
      const bothPendingCount = allParsed.filter(tx => tx.bank_status === 'pending' && tx.match_type === 'matched_pending').length;
      const alreadyClearedCount = allParsed.filter(tx => tx.bank_status === 'posted' && tx.match_type === 'matched_cleared').length;
      setHiddenStats({ bankPending: bothPendingCount, alreadyCleared: alreadyClearedCount });

      const actionableTransactions = allParsed.filter(tx => {
        // Always show NEW transactions (no DB match)
        if (tx.match_type === 'new') return true;
        // Show tip adjustments (update amount + mark cleared)
        if (tx.match_type === 'tip_adjustment') return true;
        // Show posted + matched_pending (to mark as cleared)
        if (tx.bank_status === 'posted' && tx.match_type === 'matched_pending') return true;
        // Show anomaly: bank still processing but DB shows cleared
        if (tx.bank_status === 'pending' && tx.match_type === 'matched_cleared') return true;
        // Hide everything else
        return false;
      });

      const reviewTxns: ReviewTransaction[] = actionableTransactions.map((tx) => ({
        ...tx,
        // Default anomalies to unselected - they need explicit review
        selected: !(tx.bank_status === 'pending' && tx.match_type === 'matched_cleared'),
        override_account_id: null,
        override_vendor_id: null,
        override_job_id: null,
        override_installer_id: null,
        override_description: null,
        override_is_cleared: null, // null = use bank_status (posted = cleared, pending = unchecked)
      }));

      setReviewTransactions(reviewTxns);
      setProcessingState('review');
    } catch (err: unknown) {
      stopTimer();
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Failed to process bank data');
      setProcessingState('idle');
    }
  }

  // ============================================================================
  // COMMIT TRANSACTIONS
  // ============================================================================
  async function handleCommit() {
    const selected = reviewTransactions.filter((tx) => tx.selected);
    if (selected.length === 0) {
      setError('No transactions selected');
      return;
    }

    setProcessingState('committing');
    setError(null);

    try {
      let clearedCount = 0;
      let createdCount = 0;
      let tipAdjustedCount = 0;
      const accountId = Number(selectedAccountId);

      for (const tx of selected) {
        // Mark as cleared: only for posted bank transactions matching pending DB entries
        if (tx.bank_status === 'posted' && tx.match_type === 'matched_pending' && tx.matched_transaction_id) {
          // Update transaction date to bank's cleared date
          const { error: dateErr } = await supabase
            .from('transactions')
            .update({ date: tx.date })
            .eq('id', tx.matched_transaction_id);

          if (dateErr) throw dateErr;

          // Mark ALL lines for this transaction as cleared
          const { error: clearErr } = await supabase
            .from('transaction_lines')
            .update({ is_cleared: true })
            .eq('transaction_id', tx.matched_transaction_id);

          if (clearErr) throw clearErr;
          clearedCount++;

        } else if (tx.match_type === 'tip_adjustment' && tx.matched_transaction_id && tx.original_amount) {
          // Update transaction date to bank's cleared date
          const { error: dateErr } = await supabase
            .from('transactions')
            .update({ date: tx.date })
            .eq('id', tx.matched_transaction_id);

          if (dateErr) throw dateErr;

          // Tip adjustment: scale all lines atomically and mark as cleared
          const scaleFactor = Math.abs(tx.amount) / Math.abs(tx.original_amount);
          
          const { error: tipErr } = await supabase.rpc('adjust_tip_transaction', {
            p_transaction_id: tx.matched_transaction_id,
            p_scale_factor: scaleFactor,
          });
          
          if (tipErr) throw tipErr;
          tipAdjustedCount++;

        } else if (tx.match_type === 'new') {
          const categoryAccountId = tx.override_account_id ?? tx.suggested_account_id;
          const vendorId = tx.override_vendor_id ?? tx.suggested_vendor_id;
          const jobId = tx.override_job_id ?? tx.suggested_job_id;
          const installerId = tx.override_installer_id ?? tx.suggested_installer_id;
          const purpose = 'business'; // Default all imports to business
          const description = tx.override_description ?? tx.description;

          if (!categoryAccountId) {
            throw new Error(`No category account for transaction: ${tx.description}`);
          }

          const absAmount = Math.abs(tx.amount);
          const isExpense = tx.amount < 0;
          const isCleared = tx.override_is_cleared ?? (tx.bank_status === 'posted');
          
          // Build line object, only including optional fields if they have values
          const buildLine = (acctId: number, amt: number, isCategoryLine: boolean) => {
            const line: Record<string, unknown> = {
              account_id: acctId,
              amount: amt,
              purpose,
              is_cleared: isCleared,
            };
            // Only attach job/vendor/installer to the category line, not the cash line
            if (isCategoryLine) {
              if (jobId) line.job_id = jobId;
              if (vendorId) line.vendor_id = vendorId;
              if (installerId) line.installer_id = installerId;
            }
            return line;
          };

          const lines = isExpense
            ? [buildLine(categoryAccountId, absAmount, true), buildLine(accountId, -absAmount, false)]
            : [buildLine(accountId, absAmount, false), buildLine(categoryAccountId, -absAmount, true)];

          const { error: rpcErr } = await supabase.rpc('create_transaction_multi', {
            p_date: tx.date,
            p_description: description,
            p_purpose: purpose,
            p_lines: lines,
          });

          if (rpcErr) throw rpcErr;
          createdCount++;
        }
      }

      setCommitResult({ cleared: clearedCount, created: createdCount, tipAdjusted: tipAdjustedCount });
      setReviewTransactions([]);
      setRawBankData('');
      setProcessingState('idle');
      clearSavedState();

    } catch (err: unknown) {
      console.error('Commit error:', err);
      console.error('Error JSON:', JSON.stringify(err, null, 2));
      const errMsg = err instanceof Error 
        ? err.message 
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as unknown as { message: string }).message)
          : typeof err === 'object' && err !== null && 'details' in err
            ? String((err as unknown as { details: string }).details)
            : 'Failed to commit transactions';
      setError(errMsg);
      setProcessingState('review');
    }
  }

  // UI Helpers
  function toggleTransaction(index: number) {
    setReviewTransactions((prev) => prev.map((tx, i) => (i === index ? { ...tx, selected: !tx.selected } : tx)));
  }

  function updateTransaction(index: number, updates: Partial<ReviewTransaction>) {
    setReviewTransactions((prev) => prev.map((tx, i) => (i === index ? { ...tx, ...updates } : tx)));
  }

  function toggleMatchExpanded(index: number) {
    setExpandedMatches((prev) => {
      const next = new Set(prev);
      next.has(index) ? next.delete(index) : next.add(index);
      return next;
    });
  }

  function selectAll() {
    setReviewTransactions((prev) => prev.map((tx) => {
      // Don't select anomalies
      if (tx.bank_status === 'pending' && tx.match_type === 'matched_cleared') return tx;
      return { ...tx, selected: true };
    }));
  }

  function selectNone() {
    setReviewTransactions((prev) => prev.map((tx) => ({ ...tx, selected: false })));
  }

  // Create a new vendor and add it to referenceData
  async function createVendor(name: string): Promise<number | null> {
    try {
      const { data, error } = await supabase
        .from('vendors')
        .insert({ name, nick_name: name })
        .select('id')
        .single();

      if (error) throw error;
      
      // Add to referenceData so it appears in dropdown immediately
      if (data && referenceData) {
        setReferenceData({
          ...referenceData,
          vendors: [...referenceData.vendors, { id: data.id, name }],
        });
      }
      
      return data?.id ?? null;
    } catch (err) {
      console.error('Failed to create vendor:', err);
      return null;
    }
  }

  const toMarkCleared = reviewTransactions.filter((tx) => tx.bank_status === 'posted' && tx.match_type === 'matched_pending');
  const newTransactions = reviewTransactions.filter((tx) => tx.match_type === 'new');
  const tipAdjustments = reviewTransactions.filter((tx) => tx.match_type === 'tip_adjustment');
  const anomalies = reviewTransactions.filter((tx) => tx.bank_status === 'pending' && tx.match_type === 'matched_cleared');
  // Only count actionable items (not anomalies)
  const actionableItems = reviewTransactions.filter((tx) => !(tx.bank_status === 'pending' && tx.match_type === 'matched_cleared'));
  const selectedCount = actionableItems.filter((tx) => tx.selected).length;

  // Convert reference data to SelectOption arrays for SearchableSelect
  const expenseAccountOptions: SelectOption[] = (referenceData?.expenseAccounts ?? []).map((acc) => ({
    value: acc.id,
    label: `${acc.code}  –  ${acc.name}`,
    searchText: `${acc.code} ${acc.name}`,
  }));

  const incomeAccountOptions: SelectOption[] = (referenceData?.incomeAccounts ?? []).map((acc) => ({
    value: acc.id,
    label: `${acc.code}  –  ${acc.name}`,
    searchText: `${acc.code} ${acc.name}`,
  }));

  const jobOptions: SelectOption[] = (referenceData?.jobs ?? []).map((job) => ({
    value: job.id,
    label: job.name,
    searchText: `${job.name} ${job.address || ''}`,
  }));

  const vendorOptions: SelectOption[] = (referenceData?.vendors ?? []).map((v) => ({
    value: v.id,
    label: v.name,
  }));

  // Helper for confidence badge class
  const confidenceBadgeClass = (confidence: string): string => 
    `confidence-badge confidence-badge--${confidence}`;

  const isProcessing = processingState === 'loading-context' || processingState === 'processing-ai';

  return (
    <div>
      <h2 className="mt-0 mb-1h">Bank Import</h2>

      {error && (
        <div className="alert alert--error">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="alert alert--warning">
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {commitResult && (
        <div className="alert alert--success">
          ✓ Committed: {[
            commitResult.cleared > 0 && `${commitResult.cleared} marked cleared`,
            commitResult.tipAdjusted > 0 && `${commitResult.tipAdjusted} tip adjustments`,
            commitResult.created > 0 && `${commitResult.created} new transactions`,
          ].filter(Boolean).join(', ') || 'No changes'}
        </div>
      )}

      {/* Processing Progress */}
      {isProcessing && (
        <div className="import-card">
          <div className="processing-header">
            <div className="processing-title">Processing Bank Data...</div>
            <div className="processing-timer">
              {formatTime(elapsedSeconds)}
            </div>
          </div>
          <div className="processing-steps">
            {processingSteps.map((step, i) => (
              <div key={i} className="processing-step">
                <span className="processing-step__icon">
                  {step.status === 'done' ? '✓' : step.status === 'active' ? <span className="pulse-icon">●</span> : '○'}
                </span>
                <span className={`processing-step__label--${step.status}`}>
                  {step.label}
                </span>
                {step.detail && <span className="processing-step__detail">({step.detail})</span>}
              </div>
            ))}
          </div>
          
        </div>
      )}

      {/* Input Section */}
      {processingState === 'idle' && (
        <div className="import-card">
          <div className="mb-2">
            <label className="filter-control__label">Account</label>
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} style={{ minWidth: 300 }}>
              <option value="">Select account...</option>
              {accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.code ? `${acc.code}  –  ${acc.name}` : acc.name}</option>)}
            </select>
          </div>

          <div className="mb-2">
            <label className="filter-control__label">Paste Bank Transactions</label>
            <textarea value={rawBankData} onChange={(e) => setRawBankData(e.target.value)} placeholder="Copy and paste transaction data from Bank of America website..." className="import-textarea" />
            <div className="text-muted text-sm mt-1">
              Paste the full transaction list. Transactions already in both systems (pending/pending) will be hidden.
            </div>
          </div>

          <button
            onClick={handleProcess}
            disabled={!selectedAccountId || !rawBankData.trim()}
            className="btn btn-blue"
          >
            Process with AI
          </button>
        </div>
      )}

      {/* Review Section */}
      {(processingState === 'review' || processingState === 'committing') && (
        <div>
          <div className="review-summary">
            <div className="review-stats">
              <strong>{actionableItems.length}</strong> transactions require action
              {toMarkCleared.length > 0 && <span className="review-stats--cleared">({toMarkCleared.length} to mark cleared)</span>}
              {tipAdjustments.length > 0 && <span className="review-stats--tips">({tipAdjustments.length} tip adjustments)</span>}
              {newTransactions.length > 0 && <span className="review-stats--new">({newTransactions.length} new)</span>}
              {anomalies.length > 0 && <span className="review-stats--anomalies">+ {anomalies.length} anomalies to review</span>}
            </div>
            <div className="review-actions">
              <button onClick={selectAll} className="btn btn-sm">Select All</button>
              <button onClick={selectNone} className="btn btn-sm">Select None</button>
            </div>
          </div>

          {(hiddenStats.bankPending > 0 || hiddenStats.alreadyCleared > 0) && (
            <div className="hidden-stats">
              Not shown: {hiddenStats.bankPending > 0 && <span>{hiddenStats.bankPending} pending in both bank &amp; ledger</span>}
              {hiddenStats.bankPending > 0 && hiddenStats.alreadyCleared > 0 && ', '}
              {hiddenStats.alreadyCleared > 0 && <span>{hiddenStats.alreadyCleared} already reconciled</span>}
            </div>
          )}

          {/* Mark as Cleared */}
          {toMarkCleared.length > 0 && (
            <div className="import-card">
              <h3 className="import-section-title import-section-title--success">✓ Mark as Cleared ({toMarkCleared.length})</h3>
              <div className="import-section-hint">Posted bank transactions matching pending ledger entries. Click to expand.</div>
              {reviewTransactions.map((tx, idx) => ({ tx, idx })).filter(({ tx }) => tx.bank_status === 'posted' && tx.match_type === 'matched_pending').map(({ tx, idx }) => {
                const isExpanded = expandedMatches.has(idx);
                const pendingTx = tx.matched_line_id ? pendingTransactionsMap.get(tx.matched_line_id) : null;
                return (
                  <div key={idx} className="tx-row-wrapper">
                    <div
                      className={`tx-row tx-row--6col ${isExpanded ? 'tx-row--expanded' : ''}`}
                      onClick={() => toggleMatchExpanded(idx)}
                    >
                      <input type="checkbox" checked={tx.selected} onChange={(e) => { e.stopPropagation(); toggleTransaction(idx); }} onClick={(e) => e.stopPropagation()} />
                      <span>{formatLocalDate(tx.date)}</span>
                      <span className="tx-row__description">{tx.description}</span>
                      <span className={`tx-row__amount ${tx.amount < 0 ? 'tx-row__amount--negative' : 'tx-row__amount--positive'}`}>{formatCurrency(tx.amount, 2)}</span>
                      <span className={confidenceBadgeClass(tx.match_confidence)}>{tx.match_confidence} confidence</span>
                      <span className="tx-row__expand">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                    {isExpanded && pendingTx && (
                      <div className="comparison-box">
                        <div className="comparison-row"><span className="comparison-label">BANK:</span><span>{formatLocalDate(tx.date)} · "{tx.description}" · <strong>{formatCurrency(tx.amount, 2)}</strong></span></div>
                        <div className="comparison-row"><span className="comparison-label">LEDGER:</span><span>{formatLocalDate(pendingTx.date)} · "{pendingTx.description || '(no description)'}" · <strong>{formatCurrency(pendingTx.amount, 2)}</strong></span></div>
                        {(pendingTx.job_name || pendingTx.vendor_name || pendingTx.installer_name) && (
                          <div className="comparison-row comparison-row--bordered">
                            <span className="comparison-label">DETAILS:</span>
                            <span>
                              {pendingTx.job_name && <span>Job: <strong>{pendingTx.job_name}</strong></span>}
                              {pendingTx.vendor_name && <span className={pendingTx.job_name ? 'ml-12' : ''}>Vendor: <strong>{pendingTx.vendor_name}</strong></span>}
                              {pendingTx.installer_name && <span className={(pendingTx.job_name || pendingTx.vendor_name) ? 'ml-12' : ''}>Installer: <strong>{pendingTx.installer_name}</strong></span>}
                            </span>
                          </div>
                        )}
                        {tx.reasoning && <div className="comparison-note">AI: {tx.reasoning}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tip Adjustments - Restaurant charges with tips added */}
          {tipAdjustments.length > 0 && (
            <div className="import-card import-card--bordered-warning">
              <h3 className="import-section-title import-section-title--warning">⚡ Tip Adjustments ({tipAdjustments.length})</h3>
              <div className="import-section-hint">
                Restaurant charges where the final amount (with tip) differs from the original. Will update the ledger amount and mark as cleared.
              </div>
              {reviewTransactions.map((tx, idx) => ({ tx, idx })).filter(({ tx }) => tx.match_type === 'tip_adjustment').map(({ tx, idx }) => {
                const isExpanded = expandedMatches.has(idx);
                const pendingTx = tx.matched_line_id ? pendingTransactionsMap.get(tx.matched_line_id) : null;
                const tipAmount = tx.original_amount ? Math.abs(tx.amount) - Math.abs(tx.original_amount) : 0;
                return (
                  <div key={idx} className="tx-row-wrapper">
                    <div
                      className={`tx-row tx-row--6col ${isExpanded ? 'tx-row--expanded-warning' : ''}`}
                      onClick={() => toggleMatchExpanded(idx)}
                    >
                      <input type="checkbox" checked={tx.selected} onChange={(e) => { e.stopPropagation(); toggleTransaction(idx); }} onClick={(e) => e.stopPropagation()} />
                      <span>{formatLocalDate(tx.date)}</span>
                      <span className="tx-row__description">{tx.description}</span>
                      <span className="tx-row__amount tx-row__amount--negative">{formatCurrency(tx.amount, 2)}</span>
                      <span className="tip-badge">
                        +{formatCurrency(tipAmount, 2)} tip
                      </span>
                      <span className="tx-row__expand">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                    {isExpanded && (
                      <div className="comparison-box comparison-box--warning">
                        <div className="comparison-row"><span className="comparison-label">BANK:</span><span>{formatLocalDate(tx.date)} · "{tx.description}" · <strong>{formatCurrency(tx.amount, 2)}</strong> (final with tip)</span></div>
                        <div className="comparison-row"><span className="comparison-label">LEDGER:</span><span>{pendingTx ? `${formatLocalDate(pendingTx.date)} · "${pendingTx.description || '(no description)'}"` : `line_id: ${tx.matched_line_id}`} · <strong>{formatCurrency(tx.original_amount ?? 0, 2)}</strong> (original)</span></div>
                        <div className="comparison-row comparison-row--bordered comparison-row--bordered-warning">
                          <span className="comparison-label">TIP:</span>
                          <span><strong>{formatCurrency(tipAmount, 2)}</strong> ({tx.original_amount ? ((tipAmount / Math.abs(tx.original_amount)) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        {pendingTx && (pendingTx.job_name || pendingTx.vendor_name) && (
                          <div className="comparison-row">
                            <span className="comparison-label">DETAILS:</span>
                            <span>
                              {pendingTx.job_name && <span>Job: <strong>{pendingTx.job_name}</strong></span>}
                              {pendingTx.vendor_name && <span className={pendingTx.job_name ? 'ml-12' : ''}>Vendor: <strong>{pendingTx.vendor_name}</strong></span>}
                            </span>
                          </div>
                        )}
                        <div className="comparison-action comparison-action--warning">
                          ✓ Will update ledger amount to {formatCurrency(tx.amount, 2)} and mark as cleared
                        </div>
                        {tx.reasoning && <div className="comparison-note">AI: {tx.reasoning}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Anomalies - Bank processing but DB shows cleared */}
          {anomalies.length > 0 && (
            <div className="import-card import-card--bordered-danger">
              <h3 className="import-section-title import-section-title--danger">⚠ Anomalies ({anomalies.length})</h3>
              <div className="import-section-hint">
                These transactions are still processing at the bank but already marked as cleared in the ledger. This may indicate duplicates or timing issues. <strong>No action will be taken</strong> "" review and investigate in the Ledger.
              </div>
              {reviewTransactions.map((tx, idx) => ({ tx, idx })).filter(({ tx }) => tx.bank_status === 'pending' && tx.match_type === 'matched_cleared').map(({ tx, idx }) => {
                const isExpanded = expandedMatches.has(idx);
                return (
                  <div key={idx} className="tx-row-wrapper">
                    <div
                      className={`tx-row tx-row--5col ${isExpanded ? 'tx-row--expanded-danger' : ''}`}
                      onClick={() => toggleMatchExpanded(idx)}
                    >
                      <span>{formatLocalDate(tx.date)}</span>
                      <span className="tx-row__description">{tx.description}</span>
                      <span className={`tx-row__amount ${tx.amount < 0 ? 'tx-row__amount--negative' : 'tx-row__amount--positive'}`}>{formatCurrency(tx.amount, 2)}</span>
                      <span className="status-badge--pending">
                        bank pending
                      </span>
                      <span className="tx-row__expand">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                    {isExpanded && (
                      <div className="comparison-box comparison-box--danger">
                        <div className="comparison-row"><span className="comparison-label">BANK:</span><span>{formatLocalDate(tx.date)} · "{tx.description}" · <strong>{formatCurrency(tx.amount, 2)}</strong> · <em>Still processing</em></span></div>
                        <div className="comparison-row"><span className="comparison-label">LEDGER:</span><span>Matched to cleared transaction (line_id: {tx.matched_line_id})</span></div>
                        <div className="comparison-action comparison-action--danger">
                          ⚠  Investigate in the Ledger "" this may be a duplicate or timing issue.
                        </div>
                        {tx.reasoning && <div className="comparison-note">AI: {tx.reasoning}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* New Transactions */}
          {newTransactions.length > 0 && (
            <div className="import-card">
              <h3 className="import-section-title import-section-title--info">+ New Transactions ({newTransactions.length})</h3>
              <div className="import-section-hint">Bank transactions with no ledger match. Review and adjust categories.</div>
              {reviewTransactions.map((tx, idx) => ({ tx, idx })).filter(({ tx }) => tx.match_type === 'new').map(({ tx, idx }) => (
                <div key={idx} className={`new-tx-item ${tx.selected ? 'new-tx-item--selected' : ''}`}>
                  <div className="new-tx-header">
                    <input type="checkbox" checked={tx.selected} onChange={() => toggleTransaction(idx)} />
                    <span className="new-tx-date">{formatLocalDate(tx.date)}</span>
                    <span className="new-tx-desc">{tx.description}</span>
                    <span className={`new-tx-amount ${tx.amount < 0 ? 'tx-row__amount--negative' : 'tx-row__amount--positive'}`}>{formatCurrency(tx.amount, 2)}</span>
                  </div>
                  {tx.selected && (
                    <div className="new-tx-form">
                      <div className="new-tx-form__field">
                        <label className="new-tx-form__label">Description</label>
                        <input
                          type="text"
                          value={tx.override_description ?? tx.description}
                          onChange={(e) => updateTransaction(idx, { override_description: e.target.value })}
                          className="form-input"
                          placeholder="Enter description..."
                        />
                        {tx.override_description !== tx.description && tx.override_description !== null && (
                          <div className="new-tx-form__original">
                            Original: {tx.description}
                          </div>
                        )}
                      </div>
                      <div className="new-tx-form__grid">
                        <div className="new-tx-form__status">
                          <label className="new-tx-form__label">Status</label>
                          <div className="new-tx-form__status-row">
                            <input
                              type="checkbox"
                              id={`cleared-${idx}`}
                              checked={tx.override_is_cleared ?? (tx.bank_status === 'posted')}
                              onChange={(e) => updateTransaction(idx, { override_is_cleared: e.target.checked })}
                            />
                            <label htmlFor={`cleared-${idx}`} className="text-sm">
                              {(tx.override_is_cleared ?? (tx.bank_status === 'posted')) ? '✓ Cleared' : '○ Pending'}
                            </label>
                          </div>
                        </div>
                        <div>
                          <label className="new-tx-form__label">Category</label>
                          <SearchableSelect
                            options={tx.amount < 0 ? expenseAccountOptions : incomeAccountOptions}
                            value={tx.override_account_id ?? tx.suggested_account_id ?? null}
                            onChange={(val) => updateTransaction(idx, { override_account_id: val ? Number(val) : null })}
                            placeholder="Type to search..."
                            emptyLabel="Select..."
                          />
                        </div>
                        <div>
                          <label className="new-tx-form__label">Job</label>
                          <SearchableSelect
                            options={jobOptions}
                            value={tx.override_job_id ?? tx.suggested_job_id ?? null}
                            onChange={(val) => updateTransaction(idx, { override_job_id: val ? Number(val) : null })}
                            placeholder="Type to search..."
                            emptyLabel="None"
                          />
                        </div>
                        <div>
                          <label className="new-tx-form__label">Vendor</label>
                          <SearchableSelect
                            options={vendorOptions}
                            value={tx.override_vendor_id ?? tx.suggested_vendor_id ?? null}
                            onChange={(val) => updateTransaction(idx, { override_vendor_id: val ? Number(val) : null })}
                            placeholder="Type to search..."
                            emptyLabel="None"
                            allowCreate
                            onCreateNew={createVendor}
                            createLabel="Create vendor"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {tx.reasoning && <div className="ai-note">AI: {tx.reasoning}</div>}
                </div>
              ))}
            </div>
          )}

          {actionableItems.length === 0 && anomalies.length === 0 && (
            <div className="import-card text-center text-muted">
              <p className="m-0">No transactions require action.</p>
              {(hiddenStats.bankPending > 0 || hiddenStats.alreadyCleared > 0) && (
                <p className="text-sm mt-1">
                  {hiddenStats.bankPending > 0 && `${hiddenStats.bankPending} are pending in both bank & ledger. `}
                  {hiddenStats.alreadyCleared > 0 && `${hiddenStats.alreadyCleared} were already reconciled.`}
                </p>
              )}
            </div>
          )}

          {actionableItems.length > 0 && (
            <div className="btn-row">
              <button onClick={handleCommit} disabled={selectedCount === 0 || processingState === 'committing'} className="btn btn-success">
                {processingState === 'committing' ? 'Committing...' : `Commit Selected (${selectedCount})`}
              </button>
              <button onClick={() => { setReviewTransactions([]); setProcessingState('idle'); clearSavedState(); }} className="btn">
                Cancel
              </button>
            </div>
          )}

          {actionableItems.length === 0 && (
            <div className="mt-2">
              <button onClick={() => { setReviewTransactions([]); setRawBankData(''); setProcessingState('idle'); clearSavedState(); }} className="btn">
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
