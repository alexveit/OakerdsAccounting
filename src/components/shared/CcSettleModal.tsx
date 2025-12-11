/**
 * CcSettleModal - Modal for settling CC balances
 * 
 * Provides two options:
 * 1. "Just Mark Settled" - marks lines as settled without creating a transfer
 * 2. "Create Transfer & Settle" - navigates to transfer view with pre-filled data
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import type { CcBalance, CcSettleTransferParams } from '../../utils/ccTracking';

type Props = {
  /** Display name of the entity (job name, flip address, rental name, or "Ledger") */
  entityName: string;
  /** The CC balance to settle */
  cc: CcBalance;
  /** Callback when modal is closed */
  onClose: () => void;
  /** Callback after successfully marking as settled */
  onSettled: () => void;
  /** Optional callback to navigate to transfer view. If not provided, only "Just Mark Settled" is shown */
  onNavigateToTransfer?: (params: CcSettleTransferParams) => void;
};

export function CcSettleModal({ 
  entityName, 
  cc, 
  onClose, 
  onSettled, 
  onNavigateToTransfer 
}: Props) {
  const [settling, setSettling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleJustMarkSettled() {
    setSettling(true);
    setError(null);

    try {
      const { error: updateErr } = await supabase
        .from('transaction_lines')
        .update({ cc_settled: true })
        .in('id', cc.lineIds);

      if (updateErr) throw updateErr;

      onSettled();
      onClose();
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Error settling CC');
    } finally {
      setSettling(false);
    }
  }

  function handleCreateTransferAndSettle() {
    if (!onNavigateToTransfer) return;

    onNavigateToTransfer({
      toAccountId: cc.accountId,
      toAccountName: cc.accountName,
      amount: cc.unclearedAmount,
      description: `CC settle: ${entityName}`,
      lineIdsToSettle: cc.lineIds,
    });

    onClose();
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: 12,
          padding: '1.5rem',
          maxWidth: 400,
          width: '90%',
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ marginTop: 0, marginBottom: '0.5rem' }}>Settle CC Balance</h3>
        
        <p style={{ fontSize: 14, color: '#555', marginBottom: '1rem' }}>
          <strong>{entityName}</strong>
          <br />
          {cc.accountName}: ${cc.unclearedAmount.toLocaleString(undefined, { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
        </p>

        {error && (
          <p style={{ color: '#b91c1c', fontSize: 13, marginBottom: '0.75rem' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', flexDirection: 'column' }}>
          <button
            type="button"
            disabled={settling}
            onClick={() => void handleJustMarkSettled()}
            style={{
              padding: '0.6rem 1rem',
              borderRadius: 6,
              border: '1px solid #ddd',
              background: '#f9f9f9',
              cursor: settling ? 'not-allowed' : 'pointer',
              fontSize: 14,
            }}
          >
            {settling ? 'Settling...' : 'Just Mark Settled'}
          </button>

          {onNavigateToTransfer && (
            <button
              type="button"
              disabled={settling}
              onClick={handleCreateTransferAndSettle}
              style={{
                padding: '0.6rem 1rem',
                borderRadius: 6,
                border: '1px solid #0a7a3c',
                background: '#0a7a3c',
                color: '#fff',
                cursor: settling ? 'not-allowed' : 'pointer',
                fontSize: 14,
              }}
            >
              Create Transfer &amp; Settle
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.5rem 1rem',
              borderRadius: 6,
              border: 'none',
              background: 'transparent',
              color: '#777',
              cursor: 'pointer',
              fontSize: 13,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
