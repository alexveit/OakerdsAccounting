import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Types
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

type Vendor = {
  id: number;
  name: string;
};

type Account = {
  id: number;
  code: string;
  name: string;
};

type Job = {
  id: number;
  address: string;
};

type MerchantMapping = {
  merchant_name: string;
  vendor_id: number | null;
  default_account_id: number | null;
  default_job_id: number | null;
};

type TransactionAssignment = {
  plaid_transaction_id: string;
  vendor_id: number | null;
  account_id: number | null;
  job_id: number | null;
  description: string;
  selected: boolean;
};

type Props = {
  transactions: PlaidTransaction[];
  onComplete: () => void;
};

export function PlaidTransactionReview({ transactions, onComplete }: Props) {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [mappings, setMappings] = useState<Map<string, MerchantMapping>>(new Map());
  const [assignments, setAssignments] = useState<Map<string, TransactionAssignment>>(new Map());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState(0);

  // Load reference data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);

      // Load vendors
      const { data: vendorData } = await supabase
        .from('vendors')
        .select('id, name')
        .order('name');

      // Load expense accounts (50000-69999 range)
      const { data: accountData } = await supabase
        .from('accounts')
        .select('id, code, name')
        .gte('code', 50000)
        .lte('code', 69999)
        .order('code');

      // Load active jobs
      const { data: jobData } = await supabase
        .from('jobs')
        .select('id, address')
        .order('created_at', { ascending: false })
        .limit(50);

      // Load existing merchant mappings
      const { data: mappingData } = await supabase
        .from('merchant_mappings')
        .select('merchant_name, vendor_id, default_account_id, default_job_id');

      setVendors(vendorData || []);
      setAccounts(accountData || []);
      setJobs(jobData || []);

      // Build mapping lookup
      const mappingMap = new Map<string, MerchantMapping>();
      (mappingData || []).forEach((m) => {
        mappingMap.set(m.merchant_name.toLowerCase(), m);
      });
      setMappings(mappingMap);

      // Initialize assignments with mappings applied
      const initialAssignments = new Map<string, TransactionAssignment>();
      transactions.forEach((tx) => {
        const merchantKey = (tx.merchant_name || tx.name).toLowerCase();
        const existing = mappingMap.get(merchantKey);

        initialAssignments.set(tx.plaid_transaction_id, {
          plaid_transaction_id: tx.plaid_transaction_id,
          vendor_id: existing?.vendor_id || null,
          account_id: existing?.default_account_id || null,
          job_id: existing?.default_job_id || null,
          description: tx.merchant_name || tx.name,
          selected: true,
        });
      });
      setAssignments(initialAssignments);

      setLoading(false);
    };

    loadData();
  }, [transactions]);

  // Update assignment
  const updateAssignment = useCallback(
    (txId: string, field: keyof TransactionAssignment, value: any) => {
      setAssignments((prev) => {
        const next = new Map(prev);
        const current = next.get(txId);
        if (current) {
          next.set(txId, { ...current, [field]: value });
        }
        return next;
      });
    },
    []
  );

  // Toggle selection
  const toggleSelect = useCallback((txId: string) => {
    setAssignments((prev) => {
      const next = new Map(prev);
      const current = next.get(txId);
      if (current) {
        next.set(txId, { ...current, selected: !current.selected });
      }
      return next;
    });
  }, []);

  // Select all / none
  const toggleSelectAll = useCallback(() => {
    const allSelected = Array.from(assignments.values()).every((a) => a.selected);
    setAssignments((prev) => {
      const next = new Map(prev);
      next.forEach((v, k) => {
        next.set(k, { ...v, selected: !allSelected });
      });
      return next;
    });
  }, [assignments]);

  // Submit approved transactions
  const submitApproved = async () => {
    setSubmitting(true);
    setError(null);

    const selected = transactions.filter(
      (tx) => assignments.get(tx.plaid_transaction_id)?.selected
    );

    if (selected.length === 0) {
      setError('No transactions selected');
      setSubmitting(false);
      return;
    }

    let successCount = 0;

    for (const tx of selected) {
      const assignment = assignments.get(tx.plaid_transaction_id);
      if (!assignment) continue;

      // Validate required fields
      if (!assignment.account_id) {
        continue; // Skip transactions without account
      }

      try {
        // Plaid: positive = debit (money out), negative = credit (money in)
        // Your system: positive = debit, negative = credit
        const amount = Math.abs(tx.amount);
        const isExpense = tx.amount > 0;

        // Create transaction with bank tracking fields
        const { data: txData, error: txError } = await supabase
          .from('transactions')
          .insert({
            date: tx.date,
            description: assignment.description,
            bank_description: tx.name,
            plaid_transaction_id: tx.plaid_transaction_id,
            bank_date: tx.date,
          })
          .select('id')
          .single();

        if (txError) throw txError;

        // Create transaction lines (double-entry)
        // vendor/job/installer only on category line, not cash line
        const categoryLine = {
          transaction_id: txData.id,
          account_id: assignment.account_id,
          amount: isExpense ? amount : -amount,
          job_id: assignment.job_id,
          vendor_id: assignment.vendor_id,
          purpose: 'business',
          is_cleared: !tx.pending,
        };
        const cashLine = {
          transaction_id: txData.id,
          account_id: 1, // Account 1 = Checking
          amount: isExpense ? -amount : amount,
          purpose: 'business',
          is_cleared: !tx.pending,
        };

        const lines = isExpense
          ? [categoryLine, cashLine]
          : [cashLine, categoryLine];

        const { error: lineError } = await supabase
          .from('transaction_lines')
          .insert(lines);

        if (lineError) throw lineError;

        // Save merchant mapping for future
        const merchantName = tx.merchant_name || tx.name;
        const { error: mappingError } = await supabase.from('merchant_mappings').upsert(
          {
            user_id: (await supabase.auth.getUser()).data.user?.id,
            merchant_name: merchantName,
            vendor_id: assignment.vendor_id,
            default_account_id: assignment.account_id,
            default_job_id: assignment.job_id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,merchant_name' }
        );

        if (mappingError) console.warn('Mapping save failed:', mappingError);

        successCount++;
      } catch (err: unknown) {
        console.error('Failed to create transaction:', err);
      }
    }

    setSuccessCount(successCount);
    setSubmitting(false);

    if (successCount > 0) {
      setTimeout(() => {
        onComplete();
      }, 2000);
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    padding: 20,
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 13,
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '8px 6px',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
    position: 'sticky',
    top: 0,
    background: 'white',
  };

  const tdStyle: React.CSSProperties = {
    padding: '8px 6px',
    borderBottom: '1px solid #e5e7eb',
    verticalAlign: 'middle',
  };

  const selectStyle: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    fontSize: 12,
    border: '1px solid #d1d5db',
    borderRadius: 4,
    background: 'white',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: '#16a34a',
    color: 'white',
  };

  if (loading) {
    return <div style={containerStyle}>Loading...</div>;
  }

  const selectedCount = Array.from(assignments.values()).filter((a) => a.selected).length;
  const allSelected = selectedCount === transactions.length;

  return (
    <div style={containerStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Review Transactions ({transactions.length})</h3>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ color: '#6b7280', fontSize: 14 }}>
            {selectedCount} selected
          </span>
          <button
            style={buttonStyle}
            onClick={submitApproved}
            disabled={submitting || selectedCount === 0}
          >
            {submitting ? 'Processing...' : `Approve ${selectedCount} Transactions`}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {successCount > 0 && (
        <div style={{ background: '#dcfce7', color: '#16a34a', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          Successfully created {successCount} transactions! Redirecting...
        </div>
      )}

      <div style={{ maxHeight: 600, overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 40 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                />
              </th>
              <th style={{ ...thStyle, width: 90 }}>Date</th>
              <th style={{ ...thStyle, width: 160 }}>Merchant</th>
              <th style={{ ...thStyle, width: 90, textAlign: 'right' }}>Amount</th>
              <th style={{ ...thStyle, width: 180 }}>Vendor</th>
              <th style={{ ...thStyle, width: 200 }}>Account</th>
              <th style={{ ...thStyle, width: 160 }}>Job</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => {
              const assignment = assignments.get(tx.plaid_transaction_id);
              if (!assignment) return null;

              const hasMapping = mappings.has((tx.merchant_name || tx.name).toLowerCase());

              return (
                <tr
                  key={tx.plaid_transaction_id}
                  style={{
                    background: assignment.selected
                      ? hasMapping
                        ? '#f0fdf4'
                        : 'white'
                      : '#f9fafb',
                    opacity: assignment.selected ? 1 : 0.6,
                  }}
                >
                  <td style={tdStyle}>
                    <input
                      type="checkbox"
                      checked={assignment.selected}
                      onChange={() => toggleSelect(tx.plaid_transaction_id)}
                    />
                  </td>
                  <td style={tdStyle}>{tx.date}</td>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 500 }}>{tx.merchant_name || tx.name}</div>
                    {hasMapping && (
                      <div style={{ fontSize: 10, color: '#16a34a' }}>✓ Auto-mapped</div>
                    )}
                  </td>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'right',
                      fontWeight: 600,
                      color: tx.amount > 0 ? '#dc2626' : '#16a34a',
                    }}
                  >
                    {tx.amount > 0 ? '-' : '+'}${Math.abs(tx.amount).toFixed(2)}
                  </td>
                  <td style={tdStyle}>
                    <select
                      style={selectStyle}
                      value={assignment.vendor_id || ''}
                      onChange={(e) =>
                        updateAssignment(
                          tx.plaid_transaction_id,
                          'vendor_id',
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                    >
                      <option value="">-- None --</option>
                      {vendors.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select
                      style={{
                        ...selectStyle,
                        borderColor: assignment.account_id ? '#d1d5db' : '#f87171',
                      }}
                      value={assignment.account_id || ''}
                      onChange={(e) =>
                        updateAssignment(
                          tx.plaid_transaction_id,
                          'account_id',
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                    >
                      <option value="">-- Select Account --</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} - {a.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td style={tdStyle}>
                    <select
                      style={selectStyle}
                      value={assignment.job_id || ''}
                      onChange={(e) =>
                        updateAssignment(
                          tx.plaid_transaction_id,
                          'job_id',
                          e.target.value ? parseInt(e.target.value) : null
                        )
                      }
                    >
                      <option value="">-- None --</option>
                      {jobs.map((j) => (
                        <option key={j.id} value={j.id}>
                          {j.address}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
