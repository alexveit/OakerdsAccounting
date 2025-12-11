import { useState, useCallback, useEffect } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { supabase } from '../../lib/supabaseClient';
import { PlaidTransactionReview } from './PlaidTransactionReview';

// Types
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

// Plaid Link metadata type (minimal shape based on usage)
type PlaidLinkMetadata = {
  institution?: {
    name?: string;
    institution_id?: string;
  } | null;
  accounts?: Array<{
    id: string;
    name: string;
    mask: string | null;
    type: string;
    subtype: string;
  }>;
  link_session_id?: string;
};

export function PlaidLinkView() {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [plaidItems, setPlaidItems] = useState<PlaidItem[]>([]);
  const [transactions, setTransactions] = useState<PlaidTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch existing Plaid connections
  const fetchPlaidItems = useCallback(async () => {
    const { data, error } = await supabase
      .from('plaid_items')
      .select('id, institution_name, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching plaid items:', error);
    } else {
      setPlaidItems(data || []);
    }
  }, []);

  useEffect(() => {
    fetchPlaidItems();
  }, [fetchPlaidItems]);

  // Get link token for Plaid Link
  const createLinkToken = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plaid-create-link-token`,
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
        setError(data.error);
      } else {
        setLinkToken(data.link_token);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create link token');
    } finally {
      setLoading(false);
    }
  };

  // Handle successful Plaid Link connection
  const onSuccess = useCallback(
    async (publicToken: string, metadata: PlaidLinkMetadata) => {
      setLoading(true);
      setError(null);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setError('Not authenticated');
          return;
        }

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/plaid-exchange-token`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              public_token: publicToken,
              institution_name: metadata.institution?.name || 'Unknown',
            }),
          }
        );

        const data = await response.json();

        if (data.error) {
          setError(data.error);
        } else {
          setSuccessMessage('Bank account connected successfully!');
          setLinkToken(null);
          fetchPlaidItems();
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to exchange token');
      } finally {
        setLoading(false);
      }
    },
    [fetchPlaidItems]
  );

  // Plaid Link hook
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: () => {
      setLinkToken(null);
    },
  });

  // Auto-open Plaid Link when token is ready
  useEffect(() => {
    if (linkToken && ready) {
      open();
    }
  }, [linkToken, ready, open]);

  // Sync transactions
  const syncTransactions = async () => {
    setSyncing(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        return;
      }

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
        setError(data.error);
      } else {
        setTransactions(data.transactions || []);
        setSuccessMessage(`Synced ${data.count} transactions`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to sync transactions');
    } finally {
      setSyncing(false);
    }
  };

  // Delete a Plaid connection
  const deletePlaidItem = async (id: string) => {
    if (!confirm('Disconnect this bank account?')) return;

    const { error } = await supabase.from('plaid_items').delete().eq('id', id);

    if (error) {
      setError(error.message);
    } else {
      fetchPlaidItems();
      setTransactions([]);
    }
  };

  // Styles
  const containerStyle: React.CSSProperties = {
    padding: 24,
    maxWidth: 1000,
  };

  const headerStyle: React.CSSProperties = {
    fontSize: 24,
    fontWeight: 600,
    marginBottom: 24,
  };

  const sectionStyle: React.CSSProperties = {
    background: '#f8f9fa',
    borderRadius: 8,
    padding: 20,
    marginBottom: 20,
  };

  const buttonStyle: React.CSSProperties = {
    padding: '12px 24px',
    fontSize: 14,
    fontWeight: 600,
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    backgroundColor: '#2563eb',
    color: 'white',
  };

  const dangerButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#dc2626',
    padding: '8px 16px',
  };

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: 14,
  };

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '10px 12px',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: 600,
  };

  const tdStyle: React.CSSProperties = {
    padding: '10px 12px',
    borderBottom: '1px solid #e5e7eb',
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>Bank Connections (Plaid)</div>

      {error && (
        <div style={{ ...sectionStyle, background: '#fee2e2', color: '#dc2626', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {successMessage && (
        <div style={{ ...sectionStyle, background: '#dcfce7', color: '#16a34a', marginBottom: 16 }}>
          {successMessage}
        </div>
      )}

      {/* Connected Accounts */}
      <div style={sectionStyle}>
        <h3 style={{ marginTop: 0, marginBottom: 16 }}>Connected Accounts</h3>

        {plaidItems.length === 0 ? (
          <p style={{ color: '#6b7280' }}>No bank accounts connected</p>
        ) : (
          <table style={tableStyle}>
            <thead>
              <tr>
                <th style={thStyle}>Institution</th>
                <th style={thStyle}>Connected</th>
                <th style={thStyle}>Last Sync</th>
                <th style={thStyle}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plaidItems.map((item) => (
                <tr key={item.id}>
                  <td style={tdStyle}>{item.institution_name}</td>
                  <td style={tdStyle}>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td style={tdStyle}>{new Date(item.updated_at).toLocaleString()}</td>
                  <td style={tdStyle}>
                    <button
                      style={dangerButtonStyle}
                      onClick={() => deletePlaidItem(item.id)}
                    >
                      Disconnect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
          <button
            style={buttonStyle}
            onClick={createLinkToken}
            disabled={loading}
          >
            {loading ? 'Loading...' : '+ Connect Bank Account'}
          </button>

          {plaidItems.length > 0 && (
            <button
              style={{ ...buttonStyle, backgroundColor: '#16a34a' }}
              onClick={syncTransactions}
              disabled={syncing}
            >
              {syncing ? 'Syncing...' : 'Sync Transactions'}
            </button>
          )}
        </div>
      </div>

      {/* Transaction Review */}
      {transactions.length > 0 && (
        <div style={sectionStyle}>
          <PlaidTransactionReview
            transactions={transactions}
            onComplete={() => {
              setTransactions([]);
              setSuccessMessage('Transactions imported to ledger!');
            }}
          />
        </div>
      )}
    </div>
  );
}
