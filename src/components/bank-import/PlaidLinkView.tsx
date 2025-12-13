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

  return (
    <div className="p-3" style={{ maxWidth: 1000 }}>
      <h2 className="mt-0 mb-3">Bank Connections (Plaid)</h2>

      {error && (
        <div className="alert alert--error">{error}</div>
      )}

      {successMessage && (
        <div className="alert alert--success">{successMessage}</div>
      )}

      {/* Connected Accounts */}
      <div className="section-panel">
        <h3 className="section-panel__title">Connected Accounts</h3>

        {plaidItems.length === 0 ? (
          <p className="text-muted">No bank accounts connected</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Institution</th>
                <th>Connected</th>
                <th>Last Sync</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {plaidItems.map((item) => (
                <tr key={item.id}>
                  <td>{item.institution_name}</td>
                  <td>{new Date(item.created_at).toLocaleDateString()}</td>
                  <td>{new Date(item.updated_at).toLocaleString()}</td>
                  <td>
                    <button
                      className="btn btn-danger btn-sm"
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

        <div className="btn-row">
          <button
            className="btn btn-blue"
            onClick={createLinkToken}
            disabled={loading}
          >
            {loading ? 'Loading...' : '+ Connect Bank Account'}
          </button>

          {plaidItems.length > 0 && (
            <button
              className="btn btn-success"
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
        <div className="section-panel">
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
