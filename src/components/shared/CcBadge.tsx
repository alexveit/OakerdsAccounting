/**
 * CcBadge - Clickable badge showing CC balance on cards
 * 
 * Displays: "💳 Chase 2989: $450"
 * Used on job cards, flip cards, rental cards to show unsettled CC charges.
 */

import type { CcBalance } from '../../utils/ccTracking';
import { CC_COLORS } from '../../utils/ccTracking';

type Props = {
  cc: CcBalance;
  onClick: () => void;
};

export function CcBadge({ cc, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="cc-badge"
      title={`Click to settle ${cc.accountName}`}
    >
      💳 {cc.accountName}: ${cc.unclearedAmount.toLocaleString(undefined, { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
      })}
    </button>
  );
}

/**
 * CcBadgeList - Renders multiple CC badges in a flex row
 */
type ListProps = {
  ccBalances: CcBalance[];
  onBadgeClick: (cc: CcBalance) => void;
};

export function CcBadgeList({ ccBalances, onBadgeClick }: ListProps) {
  if (ccBalances.length === 0) {
    return null;
  }

  return (
    <div className="cc-badge-list">
      {ccBalances.map((cc) => (
        <CcBadge key={cc.accountId} cc={cc} onClick={() => onBadgeClick(cc)} />
      ))}
    </div>
  );
}
