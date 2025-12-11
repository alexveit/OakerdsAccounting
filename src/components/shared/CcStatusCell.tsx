/**
 * CcStatusCell - Table cell component for CC status column
 * 
 * Shows:
 * - 💳 (red) for unsettled CC charges
 * - ✓ (green) for settled CC charges
 * - Empty for non-CC transactions
 */

import { CC_COLORS } from '../../utils/ccTracking';

type Props = {
  isCcTransaction: boolean;
  ccSettled: boolean;
  /** Optional click handler (e.g., to open settle modal) */
  onClick?: () => void;
};

export function CcStatusCell({ isCcTransaction, ccSettled, onClick }: Props) {
  if (!isCcTransaction) {
    return null;
  }

  const content = (
    <span
      style={{
        color: ccSettled ? CC_COLORS.settled : CC_COLORS.unsettled,
        fontSize: 12,
        cursor: onClick ? 'pointer' : 'default',
      }}
      title={ccSettled ? 'CC Settled' : 'CC Unsettled - Click to settle'}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined}
    >
      {ccSettled ? '✓' : '💳'}
    </span>
  );

  return content;
}
