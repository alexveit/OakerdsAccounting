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
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        fontSize: 11,
        background: CC_COLORS.badgeBg,
        color: CC_COLORS.unsettled,
        padding: '2px 8px',
        borderRadius: 999,
        border: `1px solid ${CC_COLORS.badgeBorder}`,
        cursor: 'pointer',
      }}
      title={`Click to settle ${cc.accountName}`}
    >
      💳 {cc.accountName}: ${cc.unclearedAmount.toLocaleString(undefined, { 
        minimumFractionDigits: 0, 
        maximumFractionDigits: 0 
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
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        flexWrap: 'wrap',
        marginBottom: 6,
      }}
    >
      {ccBalances.map((cc) => (
        <CcBadge key={cc.accountId} cc={cc} onClick={() => onBadgeClick(cc)} />
      ))}
    </div>
  );
}
