// src/components/bank-import/BankImportView.tsx
// Plaid-integrated version - replaces copy/paste with Plaid sync
// Legacy copy/paste version saved as BankImportView_Legacy.tsx

import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';
import { formatLocalDate } from '../../utils/date';

// ============================================================================
// TYPES
// ============================================================================

type PlaidItem = {
  id: string;
  institution_name: string;
  created_at: string;
  updated_at: string;
};

type PlaidTransaction = {
  plaid_transaction_id: string;
  date: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  category: string[];
  pending: boolean;
  account_id: string;
};

type PendingDBTransaction = {
  line_id: number;
  transaction_id: number;
  date: string;
  description: string | null;
  amount: number;
  vendor_name: string | null;
  job_name: string | null;
};

type ClearedDBTransaction = {
  line_id: number;
  transaction_id: number;
  date: string;
  description: string | null;
  amount: number;
};

type MerchantMapping = {
  merchant_name: string;
  vendor_id: number | null;
  default_account_id: number | null;
  default_job_id: number | null;
};

type ReviewTransaction = {
  plaid_id: string;
  date: string;
  description: string;
  amount: number;
  bank_status: 'pending' | 'posted';
  match_type: 'new' | 'matched_pending' | 'matched_cleared';
  matched_line_id: number | null;
  matched_description: string | null;
  // Suggestions from merchant mapping
  suggested_vendor_id: number | null;
  suggested_account_id: number | null;
  suggested_job_id: number | null;
  // User overrides
  selected: boolean;
  override_vendor_id: number | null;
  override_account_id: number | null;
  override_job_id: number | null;
  override_description: string | null;
};

type ReferenceData = {
  vendors: { id: number; name: string }[];
  jobs: { id: number; name: string; address: string }[];
  expenseAccounts: { id: number; code: string; name: string }[];
  incomeAccounts: { id: number; code: string; name: string }[];
};

type ProcessingState = 'idle' | 'syncing' | 'matching' | 'review' | 'committing';

// ============================================================================
// COMPONENT
// ============================================================================

export function BankImportView() {
  // Plaid state
  const [plaidItems, setPlaidItems] = useState<PlaidItem[]>([]);
  const [plaidConnected, setPlaidConnected] = useState(false);

  // Processing state
  const [processingState, setProcessingState] = useState<ProcessingState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Review state
  const [reviewTransactions, setReviewTransactions] = useState<ReviewTransaction[]>([]);
  const [referenceData, setReferenceData] = useState<ReferenceData | null>(null);
  const [merchantMappings, setMerchantMappings] = useState<Map<string, MerchantMapping>>(new Map());

  // Hidden stats
  const [hiddenStats, setHiddenStats] = useState<{ 
    bankPending: number; 
    alreadyCleared: number;
    total: number;
  }>({ bankPending: 0, alreadyCleared: 0, total: 0 });

  // Commit result
  const [commitResult, setCommitResult] = useState<{ cleared: number; created: number } | null>(null);

  // ============================================================================
  // LOAD PLAID CONNECTIONS
  // ============================================================================

  const fetchPlaidItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('plaid_items')
      .select('id, institution_name, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching plaid items:', error);
    } else {
      setPlaidItems(data || []);
      setPlaidConnected((data || []).length > 0);
    }
  }, []);

  useEffect(() => {
    fetchPlaidItems();
  }, [fetchPlaidItems]);

  // ============================================================================
  // SYNC FROM PLAID
  // ============================================================================

  async function handleSync() {
    if (!plaidConnected) {
      setError('No bank account connected. Go to Bank Sync to connect.');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setCommitResult(null);
    setProcessingState('syncing');

    try {
      // Get session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      // Fetch transactions from Plaid
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plaid-sync-transactions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      const plaidTransactions: PlaidTransaction[] = data.transactions || [];
      
      if (plaidTransactions.length === 0) {
        setSuccessMessage('No new transactions to import.');
        setProcessingState('idle');
        return;
      }

      setProcessingState('matching');

      // Load DB data for matching
      const accountId = 1; // Checking account - TODO: make this selectable if multiple accounts

      // Load pending transactions from DB
      const { data: pendingData, error: pendingErr } = await supabase
        .from('transaction_lines')
        .select(`
          id, transaction_id, amount,
          transactions!inner (date, description),
          vendors (name),
          jobs (name)
        `)
        .eq('account_id', accountId)
        .eq('is_cleared', false)
        .order('transactions(date)', { ascending: false })
        .limit(200);

      if (pendingErr) throw pendingErr;

      const pendingDBTransactions: PendingDBTransaction[] = (pendingData ?? []).map((row: any) => ({
        line_id: row.id,
        transaction_id: row.transaction_id,
        date: row.transactions?.date ?? '',
        description: row.transactions?.description ?? null,
        amount: Number(row.amount),
        vendor_name: row.vendors?.name ?? null,
        job_name: row.jobs?.name ?? null,
      }));

      // Load cleared transactions (last 60 days)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const { data: clearedData, error: clearedErr } = await supabase
        .from('transaction_lines')
        .select(`
          id, transaction_id, amount,
          transactions!inner (date, description)
        `)
        .eq('account_id', accountId)
        .eq('is_cleared', true)
        .gte('transactions.date', sixtyDaysAgo.toISOString().slice(0, 10))
        .limit(200);

      if (clearedErr) throw clearedErr;

      const clearedDBTransactions: ClearedDBTransaction[] = (clearedData ?? []).map((row: any) => ({
        line_id: row.id,
        transaction_id: row.transaction_id,
        date: row.transactions?.date ?? '',
        description: row.transactions?.description ?? null,
        amount: Number(row.amount),
      }));

      // Load reference data
      const [vendorsRes, jobsRes, accountsRes, mappingsRes] = await Promise.all([
        supabase.from('vendors').select('id, name').eq('is_active', true),
        supabase.from('jobs').select('id, name, address, status'),
        supabase.from('accounts').select('id, code, name, account_type_id').eq('is_active', true),
        supabase.from('merchant_mappings').select('merchant_name, vendor_id, default_account_id, default_job_id'),
      ]);

      const vendors = (vendorsRes.data ?? []).map((v: any) => ({ id: v.id, name: v.name }));
      const jobs = (jobsRes.data ?? [])
        .filter((j: any) => j.status !== 'closed')
        .map((j: any) => ({ id: j.id, name: j.name, address: j.address }));
      const allAccounts = accountsRes.data ?? [];
      const expenseAccounts = allAccounts
        .filter((a: any) => a.account_type_id === 5 && a.code)
        .map((a: any) => ({ id: a.id, code: a.code, name: a.name }));
      const incomeAccounts = allAccounts
        .filter((a: any) => a.account_type_id === 4 && a.code)
        .map((a: any) => ({ id: a.id, code: a.code, name: a.name }));

      setReferenceData({ vendors, jobs, expenseAccounts, incomeAccounts });

      // Build merchant mappings lookup
      const mappingMap = new Map<string, MerchantMapping>();
      (mappingsRes.data || []).forEach((m: any) => {
        mappingMap.set(m.merchant_name.toLowerCase(), m);
      });
      setMerchantMappings(mappingMap);

      // Match Plaid transactions against DB
      const reviewTxns: ReviewTransaction[] = [];
      let bankPendingHidden = 0;
      let alreadyClearedHidden = 0;

      for (const plaidTx of plaidTransactions) {
        const bankStatus = plaidTx.pending ? 'pending' : 'posted';
        // Plaid: positive = money out (debit), negative = money in (credit)
        // Our DB: negative = expense (money out), positive = income (money in)
        const normalizedAmount = -plaidTx.amount; // Flip sign to match our convention
        const merchantName = plaidTx.merchant_name || plaidTx.name;

        // Try to match against pending DB transactions
        let matchedPending: PendingDBTransaction | null = null;
        for (const pending of pendingDBTransactions) {
          // Match by amount (within $0.50 for tip adjustments)
          const amountDiff = Math.abs(pending.amount - normalizedAmount);
          if (amountDiff < 0.50) {
            // Check date is within 7 days
            const plaidDate = new Date(plaidTx.date);
            const pendingDate = new Date(pending.date);
            const daysDiff = Math.abs((plaidDate.getTime() - pendingDate.getTime()) / (1000 * 60 * 60 * 24));
            if (daysDiff <= 7) {
              matchedPending = pending;
              break;
            }
          }
        }

        // Try to match against cleared DB transactions
        let matchedCleared: ClearedDBTransaction | null = null;
        if (!matchedPending) {
          for (const cleared of clearedDBTransactions) {
            const amountDiff = Math.abs(cleared.amount - normalizedAmount);
            if (amountDiff < 0.01) {
              const plaidDate = new Date(plaidTx.date);
              const clearedDate = new Date(cleared.date);
              const daysDiff = Math.abs((plaidDate.getTime() - clearedDate.getTime()) / (1000 * 60 * 60 * 24));
              if (daysDiff <= 7) {
                matchedCleared = cleared;
                break;
              }
            }
          }
        }

        // Determine match type and whether to show
        let matchType: 'new' | 'matched_pending' | 'matched_cleared';
        let matchedLineId: number | null = null;
        let matchedDescription: string | null = null;
        let showTransaction = true;

        if (matchedPending) {
          matchType = 'matched_pending';
          matchedLineId = matchedPending.line_id;
          matchedDescription = matchedPending.description;

          if (bankStatus === 'pending') {
            // Both systems have it pending - hide
            showTransaction = false;
            bankPendingHidden++;
          }
          // If posted, show it to mark as cleared
        } else if (matchedCleared) {
          matchType = 'matched_cleared';
          matchedLineId = matchedCleared.line_id;
          matchedDescription = matchedCleared.description;

          if (bankStatus === 'posted') {
            // Already reconciled - hide
            showTransaction = false;
            alreadyClearedHidden++;
          }
          // If pending but cleared in DB, show as ANOMALY
        } else {
          matchType = 'new';
        }

        if (showTransaction) {
          // Get suggestions from merchant mapping
          const mapping = mappingMap.get(merchantName.toLowerCase());

          reviewTxns.push({
            plaid_id: plaidTx.plaid_transaction_id,
            date: plaidTx.date,
            description: merchantName,
            amount: normalizedAmount,
            bank_status: bankStatus,
            match_type: matchType,
            matched_line_id: matchedLineId,
            matched_description: matchedDescription,
            suggested_vendor_id: mapping?.vendor_id ?? null,
            suggested_account_id: mapping?.default_account_id ?? null,
            suggested_job_id: mapping?.default_job_id ?? null,
            selected: matchType !== 'matched_cleared' || bankStatus !== 'pending', // Anomalies start unselected
            override_vendor_id: null,
            override_account_id: null,
            override_job_id: null,
            override_description: null,
          });
        }
      }

      setHiddenStats({ 
        bankPending: bankPendingHidden, 
        alreadyCleared: alreadyClearedHidden,
        total: plaidTransactions.length,
      });
      setReviewTransactions(reviewTxns);
      setProcessingState('review');

    } catch (err) {
      console.error('Sync error:', err);
      setError(err instanceof Error ? err.message : 'Failed to sync transactions');
      setProcessingState('idle');
    }
  }

  // ============================================================================
  // UPDATE TRANSACTION FIELDS
  // ============================================================================

  function updateTransaction(index: number, field: keyof ReviewTransaction, value: any) {
    setReviewTransactions(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function toggleSelected(index: number) {
    updateTransaction(index, 'selected', !reviewTransactions[index].selected);
  }

  function toggleSelectAll() {
    const allSelected = reviewTransactions.every(tx => tx.selected);
    setReviewTransactions(prev => prev.map(tx => ({ ...tx, selected: !allSelected })));
  }

  // ============================================================================
  // COMMIT TRANSACTIONS
  // ============================================================================

  async function handleCommit() {
    const selected = reviewTransactions.filter(tx => tx.selected);
    if (selected.length === 0) {
      setError('No transactions selected');
      return;
    }

    setProcessingState('committing');
    setError(null);

    try {
      let clearedCount = 0;
      let createdCount = 0;
      const accountId = 1; // Checking account

      for (const tx of selected) {
        if (tx.match_type === 'matched_pending' && tx.matched_line_id && tx.bank_status === 'posted') {
          // Mark as cleared
          const { error: clearErr } = await supabase
            .from('transaction_lines')
            .update({ is_cleared: true })
            .eq('id', tx.matched_line_id);

          if (clearErr) throw clearErr;
          clearedCount++;

        } else if (tx.match_type === 'new') {
          // Create new transaction
          const categoryAccountId = tx.override_account_id ?? tx.suggested_account_id;
          const vendorId = tx.override_vendor_id ?? tx.suggested_vendor_id;
          const jobId = tx.override_job_id ?? tx.suggested_job_id;
          const description = tx.override_description ?? tx.description;

          if (!categoryAccountId) {
            console.warn(`Skipping ${tx.description}: no account assigned`);
            continue;
          }

          const absAmount = Math.abs(tx.amount);
          const isExpense = tx.amount < 0;
          const isCleared = tx.bank_status === 'posted';

          // Create transaction header
          const { data: txData, error: txErr } = await supabase
            .from('transactions')
            .insert({
              date: tx.date,
              description,
              vendor_id: vendorId,
              job_id: jobId,
              source: 'plaid',
            })
            .select('id')
            .single();

          if (txErr) throw txErr;

          // Create double-entry lines
          const lines = isExpense
            ? [
                { transaction_id: txData.id, account_id: categoryAccountId, amount: absAmount, is_cleared: isCleared },
                { transaction_id: txData.id, account_id: accountId, amount: -absAmount, is_cleared: isCleared },
              ]
            : [
                { transaction_id: txData.id, account_id: accountId, amount: absAmount, is_cleared: isCleared },
                { transaction_id: txData.id, account_id: categoryAccountId, amount: -absAmount, is_cleared: isCleared },
              ];

          const { error: lineErr } = await supabase
            .from('transaction_lines')
            .insert(lines);

          if (lineErr) throw lineErr;

          // Save merchant mapping
          const merchantName = tx.description;
          const { data: { user } } = await supabase.auth.getUser();
          
          await supabase.from('merchant_mappings').upsert(
            {
              user_id: user?.id,
              merchant_name: merchantName,
              vendor_id: vendorId,
              default_account_id: categoryAccountId,
              default_job_id: jobId,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'user_id,merchant_name' }
          );

          createdCount++;
        }
      }

      setCommitResult({ cleared: clearedCount, created: createdCount });
      setReviewTransactions([]);
      setProcessingState('idle');

    } catch (err) {
      console.error('Commit error:', err);
      setError(err instanceof Error ? err.message : 'Failed to commit transactions');
      setProcessingState('review');
    }
  }

  // ============================================================================
  // CLEAR / RESET
  // ============================================================================

  function handleClear() {
    setReviewTransactions([]);
    setProcessingState('idle');
    setError(null);
    setSuccessMessage(null);
    setCommitResult(null);
  }

  // ============================================================================
  // RENDER HELPERS
  // ============================================================================

  function getStatusBadge(tx: ReviewTransaction): { label: string; color: string; bg: string } {
    if (tx.match_type === 'new') {
      return { label: 'NEW', color: '#166534', bg: '#dcfce7' };
    }
    if (tx.match_type === 'matched_pending' && tx.bank_status === 'posted') {
      return { label: 'MARK CLEARED', color: '#1e40af', bg: '#dbeafe' };
    }
    if (tx.match_type === 'matched_cleared' && tx.bank_status === 'pending') {
      return { label: 'ANOMALY', color: '#991b1b', bg: '#fee2e2' };
    }
    return { label: '?', color: '#666', bg: '#eee' };
  }

  // ============================================================================
  // STYLES
  // ============================================================================

  const containerStyle: CSSProperties = { padding: 24, maxWidth: 1200 };
  const headerStyle: CSSProperties = { fontSize: 24, fontWeight: 600, marginBottom: 8 };
  const subheaderStyle: CSSProperties = { color: '#6b7280', marginBottom: 24 };
  const sectionStyle: CSSProperties = { background: '#f8f9fa', borderRadius: 8, padding: 20, marginBottom: 20 };
  const buttonStyle: CSSProperties = { padding: '12px 24px', fontSize: 14, fontWeight: 600, border: 'none', borderRadius: 6, cursor: 'pointer', backgroundColor: '#2563eb', color: 'white' };
  const successButtonStyle: CSSProperties = { ...buttonStyle, backgroundColor: '#16a34a' };
  const tableStyle: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13 };
  const thStyle: CSSProperties = { textAlign: 'left', padding: '10px 8px', borderBottom: '2px solid #e5e7eb', fontWeight: 600, position: 'sticky', top: 0, background: '#f8f9fa' };
  const tdStyle: CSSProperties = { padding: '10px 8px', borderBottom: '1px solid #e5e7eb', verticalAlign: 'middle' };
  const selectStyle: CSSProperties = { width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 4, background: 'white' };
  const badgeStyle: CSSProperties = { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600 };

  // ============================================================================
  // RENDER
  // ============================================================================

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Bank Import</div>
      <div style={subheaderStyle}>
        {plaidConnected 
          ? `Connected to ${plaidItems[0]?.institution_name || 'Bank'}` 
          : 'No bank connected'}
      </div>

      {/* Error / Success Messages */}
      {error && (
        <div style={{ ...sectionStyle, background: '#fee2e2', color: '#dc2626' }}>
          {error}
        </div>
      )}
      {successMessage && (
        <div style={{ ...sectionStyle, background: '#dcfce7', color: '#16a34a' }}>
          {successMessage}
        </div>
      )}
      {commitResult && (
        <div style={{ ...sectionStyle, background: '#dcfce7', color: '#16a34a' }}>
          ✓ Committed: {commitResult.cleared} marked cleared, {commitResult.created} created
        </div>
      )}

      {/* Sync Button */}
      {processingState === 'idle' && (
        <div style={sectionStyle}>
          <button
            style={buttonStyle}
            onClick={handleSync}
            disabled={!plaidConnected}
          >
            🔄 Sync from Bank
          </button>
          {!plaidConnected && (
            <span style={{ marginLeft: 16, color: '#6b7280' }}>
              Go to <strong>Bank Sync</strong> to connect your bank first.
            </span>
          )}
        </div>
      )}

      {/* Loading States */}
      {(processingState === 'syncing' || processingState === 'matching') && (
        <div style={sectionStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 20, height: 20, border: '3px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
            <span>
              {processingState === 'syncing' ? 'Fetching transactions from bank...' : 'Matching against ledger...'}
            </span>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Review Table */}
      {processingState === 'review' && reviewTransactions.length > 0 && (
        <div style={sectionStyle}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ margin: 0 }}>Review Transactions ({reviewTransactions.length})</h3>
              {hiddenStats.total > 0 && (
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                  Hidden: {hiddenStats.bankPending} pending in both systems, {hiddenStats.alreadyCleared} already cleared
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              <button style={{ ...buttonStyle, background: '#6b7280' }} onClick={handleClear}>
                Clear
              </button>
              <button
                style={successButtonStyle}
                onClick={handleCommit}
                disabled={processingState === 'committing'}
              >
                {processingState === 'committing' 
                  ? 'Committing...' 
                  : `Commit ${reviewTransactions.filter(t => t.selected).length} Transactions`}
              </button>
            </div>
          </div>

          {/* Table */}
          <div style={{ maxHeight: 600, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, width: 40 }}>
                    <input
                      type="checkbox"
                      checked={reviewTransactions.every(t => t.selected)}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th style={{ ...thStyle, width: 100 }}>Status</th>
                  <th style={{ ...thStyle, width: 90 }}>Date</th>
                  <th style={{ ...thStyle, width: 180 }}>Description</th>
                  <th style={{ ...thStyle, width: 100, textAlign: 'right' }}>Amount</th>
                  <th style={{ ...thStyle, width: 160 }}>Vendor</th>
                  <th style={{ ...thStyle, width: 200 }}>Account</th>
                  <th style={{ ...thStyle, width: 160 }}>Job</th>
                </tr>
              </thead>
              <tbody>
                {reviewTransactions.map((tx, idx) => {
                  const status = getStatusBadge(tx);
                  const hasMapping = merchantMappings.has(tx.description.toLowerCase());
                  const needsAccount = tx.match_type === 'new' && !tx.suggested_account_id && !tx.override_account_id;

                  return (
                    <tr
                      key={tx.plaid_id}
                      style={{
                        background: tx.selected 
                          ? hasMapping ? '#f0fdf4' : 'white'
                          : '#f9fafb',
                        opacity: tx.selected ? 1 : 0.6,
                      }}
                    >
                      <td style={tdStyle}>
                        <input
                          type="checkbox"
                          checked={tx.selected}
                          onChange={() => toggleSelected(idx)}
                        />
                      </td>
                      <td style={tdStyle}>
                        <span style={{ ...badgeStyle, color: status.color, background: status.bg }}>
                          {status.label}
                        </span>
                      </td>
                      <td style={tdStyle}>{formatLocalDate(tx.date)}</td>
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 500 }}>{tx.description}</div>
                        {tx.matched_description && (
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            Matched: {tx.matched_description}
                          </div>
                        )}
                        {hasMapping && (
                          <div style={{ fontSize: 10, color: '#16a34a' }}>✓ Auto-mapped</div>
                        )}
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: tx.amount < 0 ? '#dc2626' : '#16a34a' }}>
                        {formatCurrency(tx.amount)}
                      </td>
                      <td style={tdStyle}>
                        {tx.match_type === 'new' ? (
                          <select
                            style={selectStyle}
                            value={tx.override_vendor_id ?? tx.suggested_vendor_id ?? ''}
                            onChange={(e) => updateTransaction(idx, 'override_vendor_id', e.target.value ? Number(e.target.value) : null)}
                          >
                            <option value="">-- None --</option>
                            {referenceData?.vendors.map(v => (
                              <option key={v.id} value={v.id}>{v.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: '#6b7280', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {tx.match_type === 'new' ? (
                          <select
                            style={{ ...selectStyle, borderColor: needsAccount ? '#f87171' : '#d1d5db' }}
                            value={tx.override_account_id ?? tx.suggested_account_id ?? ''}
                            onChange={(e) => updateTransaction(idx, 'override_account_id', e.target.value ? Number(e.target.value) : null)}
                          >
                            <option value="">-- Select --</option>
                            {referenceData?.expenseAccounts.map(a => (
                              <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                            ))}
                            {referenceData?.incomeAccounts.map(a => (
                              <option key={a.id} value={a.id}>{a.code} - {a.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: '#6b7280', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        {tx.match_type === 'new' ? (
                          <select
                            style={selectStyle}
                            value={tx.override_job_id ?? tx.suggested_job_id ?? ''}
                            onChange={(e) => updateTransaction(idx, 'override_job_id', e.target.value ? Number(e.target.value) : null)}
                          >
                            <option value="">-- None --</option>
                            {referenceData?.jobs.map(j => (
                              <option key={j.id} value={j.id}>{j.address || j.name}</option>
                            ))}
                          </select>
                        ) : (
                          <span style={{ color: '#6b7280', fontSize: 12 }}>—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty state after sync */}
      {processingState === 'review' && reviewTransactions.length === 0 && (
        <div style={sectionStyle}>
          <p style={{ color: '#6b7280' }}>
            No actionable transactions. {hiddenStats.total > 0 && (
              <span>({hiddenStats.bankPending} pending in both, {hiddenStats.alreadyCleared} already cleared)</span>
            )}
          </p>
          <button style={buttonStyle} onClick={handleClear}>Done</button>
        </div>
      )}
    </div>
  );
}
