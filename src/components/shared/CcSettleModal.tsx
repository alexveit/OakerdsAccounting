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
      amount: Math.round(cc.unclearedAmount * 100) / 100, // Fix floating point precision
      description: `CC settle: ${entityName}`,
      lineIdsToSettle: cc.lineIds,
    });

    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="cc-settle-modal" onClick={(e) => e.stopPropagation()}>
        <h3 className="cc-settle-modal__title">Settle CC Balance</h3>
        
        <p className="cc-settle-modal__info">
          <strong>{entityName}</strong>
          <br />
          {cc.accountName}: ${cc.unclearedAmount.toLocaleString(undefined, { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
          })}
        </p>

        {error && (
          <p className="cc-settle-modal__error">
            {error}
          </p>
        )}

        <div className="cc-settle-modal__actions">
          <button
            type="button"
            disabled={settling}
            onClick={() => void handleJustMarkSettled()}
            className="cc-settle-modal__btn cc-settle-modal__btn--secondary"
          >
            {settling ? 'Settling...' : 'Just Mark Settled'}
          </button>

          {onNavigateToTransfer && (
            <button
              type="button"
              disabled={settling}
              onClick={handleCreateTransferAndSettle}
              className="cc-settle-modal__btn cc-settle-modal__btn--primary"
            >
              Create Transfer &amp; Settle
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="cc-settle-modal__btn cc-settle-modal__btn--cancel"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}