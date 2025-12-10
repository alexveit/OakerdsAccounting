// src/components/bank-import/BankImportView.tsx

import { useEffect, useState, useRef, type CSSProperties } from 'react';
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

      const pendingTransactions: PendingTransaction[] = (pendingData ?? []).map((row: any) => {
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

      const clearedTransactions: ClearedTransaction[] = (clearedData ?? []).map((row: any) => ({
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

      const recentHistory: HistoricalTransaction[] = (historyData ?? []).map((row: any) => ({
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

      const vendors = (vendorsRes.data ?? []).map((v: any) => ({ id: v.id, name: v.name }));
      const jobs = (jobsRes.data ?? [])
        .filter((j: any) => j.status !== 'closed')
        .map((j: any) => ({ id: j.id, name: j.name, address: j.address, status: j.status ?? 'open' }));
      const installers = (installersRes.data ?? []).map((i: any) => ({
        id: i.id,
        name: i.company_name || [i.first_name, i.last_name].filter(Boolean).join(' '),
      }));
      const allAccounts = accountsRes.data ?? [];
      const expenseAccounts = allAccounts
        .filter((a: any) => a.account_type_id === 5 && a.code)
        .map((a: any) => ({ id: a.id, code: a.code, name: a.name }));
      const incomeAccounts = allAccounts
        .filter((a: any) => a.account_type_id === 4 && a.code)
        .map((a: any) => ({ id: a.id, code: a.code, name: a.name }));

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

  // Commit transactions
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
          // Mark ALL lines for this transaction as cleared
          const { error: clearErr } = await supabase
            .from('transaction_lines')
            .update({ is_cleared: true })
            .eq('transaction_id', tx.matched_transaction_id);

          if (clearErr) throw clearErr;
          clearedCount++;
        } else if (tx.match_type === 'tip_adjustment' && tx.matched_transaction_id && tx.original_amount) {
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
            const line: Record<string, any> = {
              account_id: acctId,
              amount: amt,
              purpose,
              is_cleared: isCleared,
            };
            if (jobId) line.job_id = jobId;
            // Only attach vendor/installer to the category line, not the cash line
            if (isCategoryLine) {
              if (vendorId) line.vendor_id = vendorId;
              if (installerId) line.installer_id = installerId;
            }
            return line;
          };

          const lines = isExpense
            ? [buildLine(categoryAccountId, absAmount, true), buildLine(accountId, -absAmount, false)]
            : [buildLine(accountId, absAmount, false), buildLine(categoryAccountId, -absAmount, true)];

          console.log('Creating transaction:', { date: tx.date, description, purpose, lines });

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
          ? String((err as any).message)
          : typeof err === 'object' && err !== null && 'details' in err
            ? String((err as any).details)
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
    label: `${acc.code} – ${acc.name}`,
    searchText: `${acc.code} ${acc.name}`,
  }));

  const incomeAccountOptions: SelectOption[] = (referenceData?.incomeAccounts ?? []).map((acc) => ({
    value: acc.id,
    label: `${acc.code} – ${acc.name}`,
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

  // Styles
  const cardStyle: CSSProperties = { background: '#fff', borderRadius: 8, padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' };
  const textareaStyle: CSSProperties = { width: '100%', minHeight: 200, padding: '0.75rem', fontSize: 13, fontFamily: 'monospace', border: '1px solid #ddd', borderRadius: 4, resize: 'vertical' };
  const confidenceBadge = (confidence: string): CSSProperties => ({
    display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600,
    background: confidence === 'high' ? '#d4edda' : confidence === 'medium' ? '#fff3cd' : '#f8d7da',
    color: confidence === 'high' ? '#155724' : confidence === 'medium' ? '#856404' : '#721c24',
  });
  const comparisonBoxStyle: CSSProperties = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '0.75rem', marginTop: '0.5rem', marginLeft: 40, fontSize: 12 };
  const comparisonRowStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '60px 1fr', gap: '0.5rem', padding: '0.25rem 0' };
  const comparisonLabelStyle: CSSProperties = { fontWeight: 600, color: '#64748b' };

  const isProcessing = processingState === 'loading-context' || processingState === 'processing-ai';

  return (
    <div>
      <h2 style={{ margin: 0, marginBottom: '0.75rem' }}>Bank Import</h2>

      {error && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '0.75rem', borderRadius: 4, marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div style={{ background: '#fff3cd', color: '#856404', padding: '0.75rem', borderRadius: 4, marginBottom: '1rem' }}>
          {warnings.map((w, i) => <div key={i}>{w}</div>)}
        </div>
      )}

      {commitResult && (
        <div style={{ background: '#d4edda', color: '#155724', padding: '0.75rem', borderRadius: 4, marginBottom: '1rem' }}>
          ✓ Committed: {[
            commitResult.cleared > 0 && `${commitResult.cleared} marked cleared`,
            commitResult.tipAdjusted > 0 && `${commitResult.tipAdjusted} tip adjustments`,
            commitResult.created > 0 && `${commitResult.created} new transactions`,
          ].filter(Boolean).join(', ') || 'No changes'}
        </div>
      )}

      {/* Processing Progress */}
      {isProcessing && (
        <div style={{ ...cardStyle, marginBottom: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Processing Bank Data...</div>
            <div style={{ fontFamily: 'monospace', fontSize: 14, color: '#666', background: '#f3f4f6', padding: '0.25rem 0.5rem', borderRadius: 4 }}>
              {formatTime(elapsedSeconds)}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {processingSteps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 20, textAlign: 'center' }}>
                  {step.status === 'done' ? '✓' : step.status === 'active' ? <span style={{ display: 'inline-block', animation: 'pulse 1s infinite' }}>●</span> : '○'}
                </span>
                <span style={{ color: step.status === 'done' ? '#0a7a3c' : step.status === 'active' ? '#2563eb' : '#999', fontWeight: step.status === 'active' ? 600 : 400 }}>
                  {step.label}
                </span>
                {step.detail && <span style={{ color: '#666', fontSize: 12 }}>({step.detail})</span>}
              </div>
            ))}
          </div>
          <style>{`@keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
        </div>
      )}

      {/* Input Section */}
      {processingState === 'idle' && (
        <div style={cardStyle}>
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Account</label>
            <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)} style={{ padding: '0.5rem', fontSize: 14, minWidth: 300 }}>
              <option value="">Select account...</option>
              {accounts.map((acc) => <option key={acc.id} value={acc.id}>{acc.code ? `${acc.code} – ${acc.name}` : acc.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>Paste Bank Transactions</label>
            <textarea value={rawBankData} onChange={(e) => setRawBankData(e.target.value)} placeholder="Copy and paste transaction data from Bank of America website..." style={textareaStyle} />
            <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
              Paste the full transaction list. Transactions already in both systems (pending/pending) will be hidden.
            </div>
          </div>

          <button
            onClick={handleProcess}
            disabled={!selectedAccountId || !rawBankData.trim()}
            style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: selectedAccountId && rawBankData.trim() ? 'pointer' : 'not-allowed', opacity: selectedAccountId && rawBankData.trim() ? 1 : 0.6 }}
          >
            Process with AI
          </button>
        </div>
      )}

      {/* Review Section */}
      {(processingState === 'review' || processingState === 'committing') && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div>
              <strong>{actionableItems.length}</strong> transactions require action
              {toMarkCleared.length > 0 && <span style={{ color: '#0a7a3c', marginLeft: 8 }}>({toMarkCleared.length} to mark cleared)</span>}
              {tipAdjustments.length > 0 && <span style={{ color: '#f59e0b', marginLeft: 8 }}>({tipAdjustments.length} tip adjustments)</span>}
              {newTransactions.length > 0 && <span style={{ color: '#2563eb', marginLeft: 8 }}>({newTransactions.length} new)</span>}
              {anomalies.length > 0 && <span style={{ color: '#dc2626', marginLeft: 8 }}>+ {anomalies.length} anomalies to review</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={selectAll} style={{ fontSize: 13 }}>Select All</button>
              <button onClick={selectNone} style={{ fontSize: 13 }}>Select None</button>
            </div>
          </div>

          {(hiddenStats.bankPending > 0 || hiddenStats.alreadyCleared > 0) && (
            <div style={{ background: '#f3f4f6', color: '#666', padding: '0.5rem 0.75rem', borderRadius: 4, marginBottom: '1rem', fontSize: 13 }}>
              Not shown: {hiddenStats.bankPending > 0 && <span>{hiddenStats.bankPending} pending in both bank &amp; ledger</span>}
              {hiddenStats.bankPending > 0 && hiddenStats.alreadyCleared > 0 && ', '}
              {hiddenStats.alreadyCleared > 0 && <span>{hiddenStats.alreadyCleared} already reconciled</span>}
            </div>
          )}

          {/* Mark as Cleared */}
          {toMarkCleared.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: 15, color: '#0a7a3c' }}>✓ Mark as Cleared ({toMarkCleared.length})</h3>
              <div style={{ fontSize: 12, color: '#666', marginBottom: '0.5rem' }}>Posted bank transactions matching pending ledger entries. Click to expand.</div>
              {reviewTransactions.map((tx, idx) => ({ tx, idx })).filter(({ tx }) => tx.bank_status === 'posted' && tx.match_type === 'matched_pending').map(({ tx, idx }) => {
                const isExpanded = expandedMatches.has(idx);
                const pendingTx = tx.matched_line_id ? pendingTransactionsMap.get(tx.matched_line_id) : null;
                return (
                  <div key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '40px 90px 1fr 100px 120px 30px', gap: '0.5rem', alignItems: 'center', padding: '0.5rem', fontSize: 13, cursor: 'pointer', background: isExpanded ? '#f8fafc' : 'transparent' }}
                      onClick={() => toggleMatchExpanded(idx)}
                    >
                      <input type="checkbox" checked={tx.selected} onChange={(e) => { e.stopPropagation(); toggleTransaction(idx); }} onClick={(e) => e.stopPropagation()} />
                      <span>{formatLocalDate(tx.date)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                      <span style={{ textAlign: 'right', color: tx.amount < 0 ? '#b00020' : '#0a7a3c', fontWeight: 500 }}>{formatCurrency(tx.amount, 2)}</span>
                      <span style={confidenceBadge(tx.match_confidence)}>{tx.match_confidence} confidence</span>
                      <span style={{ color: '#999', fontSize: 11 }}>{isExpanded ? '▼' : '▶'}</span>
                    </div>
                    {isExpanded && pendingTx && (
                      <div style={comparisonBoxStyle}>
                        <div style={comparisonRowStyle}><span style={comparisonLabelStyle}>BANK:</span><span>{formatLocalDate(tx.date)} · "{tx.description}" · <strong>{formatCurrency(tx.amount, 2)}</strong></span></div>
                        <div style={comparisonRowStyle}><span style={comparisonLabelStyle}>LEDGER:</span><span>{formatLocalDate(pendingTx.date)} · "{pendingTx.description || '(no description)'}" · <strong>{formatCurrency(pendingTx.amount, 2)}</strong></span></div>
                        {(pendingTx.job_name || pendingTx.vendor_name || pendingTx.installer_name) && (
                          <div style={{ ...comparisonRowStyle, marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid #e2e8f0' }}>
                            <span style={comparisonLabelStyle}>DETAILS:</span>
                            <span>
                              {pendingTx.job_name && <span>Job: <strong>{pendingTx.job_name}</strong></span>}
                              {pendingTx.vendor_name && <span style={{ marginLeft: pendingTx.job_name ? 12 : 0 }}>Vendor: <strong>{pendingTx.vendor_name}</strong></span>}
                              {pendingTx.installer_name && <span style={{ marginLeft: (pendingTx.job_name || pendingTx.vendor_name) ? 12 : 0 }}>Installer: <strong>{pendingTx.installer_name}</strong></span>}
                            </span>
                          </div>
                        )}
                        {tx.reasoning && <div style={{ marginTop: '0.5rem', color: '#666', fontStyle: 'italic' }}>AI: {tx.reasoning}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Tip Adjustments - Restaurant charges with tips added */}
          {tipAdjustments.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '1rem', borderLeft: '4px solid #f59e0b' }}>
              <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: 15, color: '#f59e0b' }}>⚡ Tip Adjustments ({tipAdjustments.length})</h3>
              <div style={{ fontSize: 12, color: '#666', marginBottom: '0.5rem' }}>
                Restaurant charges where the final amount (with tip) differs from the original. Will update the ledger amount and mark as cleared.
              </div>
              {reviewTransactions.map((tx, idx) => ({ tx, idx })).filter(({ tx }) => tx.match_type === 'tip_adjustment').map(({ tx, idx }) => {
                const isExpanded = expandedMatches.has(idx);
                const pendingTx = tx.matched_line_id ? pendingTransactionsMap.get(tx.matched_line_id) : null;
                const tipAmount = tx.original_amount ? Math.abs(tx.amount) - Math.abs(tx.original_amount) : 0;
                return (
                  <div key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '40px 90px 1fr 100px 100px 30px', gap: '0.5rem', alignItems: 'center', padding: '0.5rem', fontSize: 13, cursor: 'pointer', background: isExpanded ? '#fffbeb' : 'transparent' }}
                      onClick={() => toggleMatchExpanded(idx)}
                    >
                      <input type="checkbox" checked={tx.selected} onChange={(e) => { e.stopPropagation(); toggleTransaction(idx); }} onClick={(e) => e.stopPropagation()} />
                      <span>{formatLocalDate(tx.date)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                      <span style={{ textAlign: 'right', color: '#b00020', fontWeight: 500 }}>{formatCurrency(tx.amount, 2)}</span>
                      <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#fef3c7', color: '#92400e' }}>
                        +{formatCurrency(tipAmount, 2)} tip
                      </span>
                      <span style={{ color: '#999', fontSize: 11 }}>{isExpanded ? '▼' : '▶'}</span>
                    </div>
                    {isExpanded && (
                      <div style={{ ...comparisonBoxStyle, background: '#fffbeb', borderColor: '#fcd34d' }}>
                        <div style={comparisonRowStyle}><span style={comparisonLabelStyle}>BANK:</span><span>{formatLocalDate(tx.date)} · "{tx.description}" · <strong>{formatCurrency(tx.amount, 2)}</strong> (final with tip)</span></div>
                        <div style={comparisonRowStyle}><span style={comparisonLabelStyle}>LEDGER:</span><span>{pendingTx ? `${formatLocalDate(pendingTx.date)} · "${pendingTx.description || '(no description)'}"` : `line_id: ${tx.matched_line_id}`} · <strong>{formatCurrency(tx.original_amount ?? 0, 2)}</strong> (original)</span></div>
                        <div style={{ ...comparisonRowStyle, marginTop: '0.25rem', paddingTop: '0.25rem', borderTop: '1px solid #fcd34d' }}>
                          <span style={comparisonLabelStyle}>TIP:</span>
                          <span><strong>{formatCurrency(tipAmount, 2)}</strong> ({tx.original_amount ? ((tipAmount / Math.abs(tx.original_amount)) * 100).toFixed(1) : 0}%)</span>
                        </div>
                        {pendingTx && (pendingTx.job_name || pendingTx.vendor_name) && (
                          <div style={comparisonRowStyle}>
                            <span style={comparisonLabelStyle}>DETAILS:</span>
                            <span>
                              {pendingTx.job_name && <span>Job: <strong>{pendingTx.job_name}</strong></span>}
                              {pendingTx.vendor_name && <span style={{ marginLeft: pendingTx.job_name ? 12 : 0 }}>Vendor: <strong>{pendingTx.vendor_name}</strong></span>}
                            </span>
                          </div>
                        )}
                        <div style={{ marginTop: '0.5rem', color: '#92400e', fontWeight: 500 }}>
                          ✓ Will update ledger amount to {formatCurrency(tx.amount, 2)} and mark as cleared
                        </div>
                        {tx.reasoning && <div style={{ marginTop: '0.5rem', color: '#666', fontStyle: 'italic' }}>AI: {tx.reasoning}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Anomalies - Bank processing but DB shows cleared */}
          {anomalies.length > 0 && (
            <div style={{ ...cardStyle, marginBottom: '1rem', borderLeft: '4px solid #dc2626' }}>
              <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: 15, color: '#dc2626' }}>⚠ Anomalies ({anomalies.length})</h3>
              <div style={{ fontSize: 12, color: '#666', marginBottom: '0.5rem' }}>
                These transactions are still processing at the bank but already marked as cleared in the ledger. This may indicate duplicates or timing issues. <strong>No action will be taken</strong> — review and investigate in the Ledger.
              </div>
              {reviewTransactions.map((tx, idx) => ({ tx, idx })).filter(({ tx }) => tx.bank_status === 'pending' && tx.match_type === 'matched_cleared').map(({ tx, idx }) => {
                const isExpanded = expandedMatches.has(idx);
                return (
                  <div key={idx} style={{ borderBottom: '1px solid #eee' }}>
                    <div
                      style={{ display: 'grid', gridTemplateColumns: '90px 1fr 100px 120px 30px', gap: '0.5rem', alignItems: 'center', padding: '0.5rem', fontSize: 13, cursor: 'pointer', background: isExpanded ? '#fef2f2' : 'transparent' }}
                      onClick={() => toggleMatchExpanded(idx)}
                    >
                      <span>{formatLocalDate(tx.date)}</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                      <span style={{ textAlign: 'right', color: tx.amount < 0 ? '#b00020' : '#0a7a3c', fontWeight: 500 }}>{formatCurrency(tx.amount, 2)}</span>
                      <span style={{ display: 'inline-block', padding: '2px 6px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>
                        bank pending
                      </span>
                      <span style={{ color: '#999', fontSize: 11 }}>{isExpanded ? '▼' : '▶'}</span>
                    </div>
                    {isExpanded && (
                      <div style={{ ...comparisonBoxStyle, background: '#fef2f2', borderColor: '#fecaca' }}>
                        <div style={comparisonRowStyle}><span style={comparisonLabelStyle}>BANK:</span><span>{formatLocalDate(tx.date)} · "{tx.description}" · <strong>{formatCurrency(tx.amount, 2)}</strong> · <em>Still processing</em></span></div>
                        <div style={comparisonRowStyle}><span style={comparisonLabelStyle}>LEDGER:</span><span>Matched to cleared transaction (line_id: {tx.matched_line_id})</span></div>
                        <div style={{ marginTop: '0.5rem', color: '#dc2626', fontWeight: 500 }}>
                          ⚠ Investigate in the Ledger — this may be a duplicate or timing issue.
                        </div>
                        {tx.reasoning && <div style={{ marginTop: '0.5rem', color: '#666', fontStyle: 'italic' }}>AI: {tx.reasoning}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* New Transactions */}
          {newTransactions.length > 0 && (
            <div style={cardStyle}>
              <h3 style={{ margin: 0, marginBottom: '0.5rem', fontSize: 15, color: '#2563eb' }}>+ New Transactions ({newTransactions.length})</h3>
              <div style={{ fontSize: 12, color: '#666', marginBottom: '0.5rem' }}>Bank transactions with no ledger match. Review and adjust categories.</div>
              {reviewTransactions.map((tx, idx) => ({ tx, idx })).filter(({ tx }) => tx.match_type === 'new').map(({ tx, idx }) => (
                <div key={idx} style={{ padding: '0.75rem', borderBottom: '1px solid #eee', background: tx.selected ? '#f8fafc' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input type="checkbox" checked={tx.selected} onChange={() => toggleTransaction(idx)} />
                    <span style={{ width: 90 }}>{formatLocalDate(tx.date)}</span>
                    <span style={{ flex: 1 }}>{tx.description}</span>
                    <span style={{ fontWeight: 600, color: tx.amount < 0 ? '#b00020' : '#0a7a3c' }}>{formatCurrency(tx.amount, 2)}</span>
                  </div>
                  {tx.selected && (
                    <div style={{ marginTop: '0.5rem', marginLeft: 28, fontSize: 13 }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ fontSize: 11, color: '#666' }}>Description</label>
                        <input
                          type="text"
                          value={tx.override_description ?? tx.description}
                          onChange={(e) => updateTransaction(idx, { override_description: e.target.value })}
                          style={{ width: '100%', padding: '0.25rem 0.5rem', fontSize: 13, border: '1px solid #ddd', borderRadius: 4 }}
                          placeholder="Enter description..."
                        />
                        {tx.override_description !== tx.description && tx.override_description !== null && (
                          <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                            Original: {tx.description}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', gap: '0.75rem', alignItems: 'start' }}>
                        <div style={{ minWidth: 90 }}>
                          <label style={{ fontSize: 11, color: '#666' }}>Status</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
                            <input
                              type="checkbox"
                              id={`cleared-${idx}`}
                              checked={tx.override_is_cleared ?? (tx.bank_status === 'posted')}
                              onChange={(e) => updateTransaction(idx, { override_is_cleared: e.target.checked })}
                            />
                            <label htmlFor={`cleared-${idx}`} style={{ fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {(tx.override_is_cleared ?? (tx.bank_status === 'posted')) ? '✓ Cleared' : '○ Pending'}
                            </label>
                          </div>
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: '#666' }}>Category</label>
                          <SearchableSelect
                            options={tx.amount < 0 ? expenseAccountOptions : incomeAccountOptions}
                            value={tx.override_account_id ?? tx.suggested_account_id ?? null}
                            onChange={(val) => updateTransaction(idx, { override_account_id: val ? Number(val) : null })}
                            placeholder="Type to search..."
                            emptyLabel="Select..."
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: '#666' }}>Job</label>
                          <SearchableSelect
                            options={jobOptions}
                            value={tx.override_job_id ?? tx.suggested_job_id ?? null}
                            onChange={(val) => updateTransaction(idx, { override_job_id: val ? Number(val) : null })}
                            placeholder="Type to search..."
                            emptyLabel="None"
                          />
                        </div>
                        <div>
                          <label style={{ fontSize: 11, color: '#666' }}>Vendor</label>
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
                  {tx.reasoning && <div style={{ marginTop: '0.5rem', marginLeft: 28, fontSize: 12, color: '#666', fontStyle: 'italic' }}>AI: {tx.reasoning}</div>}
                </div>
              ))}
            </div>
          )}

          {actionableItems.length === 0 && anomalies.length === 0 && (
            <div style={{ ...cardStyle, textAlign: 'center', color: '#666' }}>
              <p style={{ margin: 0 }}>No transactions require action.</p>
              {(hiddenStats.bankPending > 0 || hiddenStats.alreadyCleared > 0) && (
                <p style={{ margin: '0.5rem 0 0', fontSize: 13 }}>
                  {hiddenStats.bankPending > 0 && `${hiddenStats.bankPending} are pending in both bank & ledger. `}
                  {hiddenStats.alreadyCleared > 0 && `${hiddenStats.alreadyCleared} were already reconciled.`}
                </p>
              )}
            </div>
          )}

          {actionableItems.length > 0 && (
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
              <button onClick={handleCommit} disabled={selectedCount === 0 || processingState === 'committing'} style={{ background: '#0a7a3c', color: '#fff', border: 'none', padding: '0.75rem 1.5rem', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: selectedCount > 0 ? 'pointer' : 'not-allowed', opacity: selectedCount > 0 ? 1 : 0.6 }}>
                {processingState === 'committing' ? 'Committing...' : `Commit Selected (${selectedCount})`}
              </button>
              <button onClick={() => { setReviewTransactions([]); setProcessingState('idle'); clearSavedState(); }} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '0.75rem 1.5rem', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
                Cancel
              </button>
            </div>
          )}

          {actionableItems.length === 0 && (
            <div style={{ marginTop: '1rem' }}>
              <button onClick={() => { setReviewTransactions([]); setRawBankData(''); setProcessingState('idle'); clearSavedState(); }} style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '0.75rem 1.5rem', borderRadius: 4, fontSize: 14, cursor: 'pointer' }}>
                Done
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
