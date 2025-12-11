/**
 * CC (Credit Card) Tracking Utilities
 * 
 * Shared types and functions for tracking credit card charges across
 * jobs, flips, rentals, and the general ledger.
 */

import type { CSSProperties } from 'react';

// ------------------------------------------------------------
// TYPES
// ------------------------------------------------------------

/** Represents an unsettled CC balance grouped by account */
export type CcBalance = {
  accountId: number;
  accountName: string;
  unclearedAmount: number;
  lineIds: number[];
};

/** CC status info for a single transaction line */
export type CcLineInfo = {
  isCcTransaction: boolean;
  ccSettled: boolean;
};

/** Minimal line shape needed for CC computations */
export type CcTrackableLine = {
  id: number;
  amount: number;
  cc_settled: boolean;
  accounts: {
    id: number;
    name: string;
    account_types: { name: string } | null;
  } | null;
};

/** Parameters passed when navigating to transfer view for CC settlement */
export type CcSettleTransferParams = {
  toAccountId: number;
  toAccountName: string;
  amount: number;
  description: string;
  lineIdsToSettle: number[];
};

// ------------------------------------------------------------
// UTILITY FUNCTIONS
// ------------------------------------------------------------

/**
 * Compute CC balances grouped by account from a list of transaction lines.
 * Only includes liability lines that are not yet settled.
 */
export function computeCcBalances(lines: CcTrackableLine[]): CcBalance[] {
  const ccDataByAccount = new Map<number, { accountName: string; amount: number; lineIds: number[] }>();

  for (const line of lines) {
    const type = line.accounts?.account_types?.name ?? null;
    const accountId = line.accounts?.id;
    const accountName = line.accounts?.name ?? '';

    // Only track unsettled liability (credit card) lines
    if (type === 'liability' && !line.cc_settled && accountId) {
      const existing = ccDataByAccount.get(accountId) ?? { accountName, amount: 0, lineIds: [] };
      existing.amount += Math.abs(line.amount);
      existing.lineIds.push(line.id);
      ccDataByAccount.set(accountId, existing);
    }
  }

  return Array.from(ccDataByAccount.entries())
    .filter(([, data]) => data.amount > 0)
    .map(([accountId, data]) => ({
      accountId,
      accountName: data.accountName,
      unclearedAmount: data.amount,
      lineIds: data.lineIds,
    }))
    .sort((a, b) => b.unclearedAmount - a.unclearedAmount);
}

/**
 * Get CC status info for a single line.
 * Returns whether the line is a CC transaction and its settled status.
 */
export function getCcLineInfo(line: CcTrackableLine): CcLineInfo {
  const type = line.accounts?.account_types?.name ?? null;
  
  if (type === 'liability') {
    return {
      isCcTransaction: true,
      ccSettled: line.cc_settled,
    };
  }
  
  return {
    isCcTransaction: false,
    ccSettled: true, // Non-CC lines are considered "settled" by default
  };
}

/**
 * Check if a line is an unsettled CC transaction.
 * Convenience function for row highlighting.
 */
export function isUnsettledCc(line: CcTrackableLine): boolean {
  const info = getCcLineInfo(line);
  return info.isCcTransaction && !info.ccSettled;
}

/**
 * Row style for CC transactions.
 * Returns light red background for unsettled CC, empty object otherwise.
 */
export function getCcRowStyle(isCc: boolean, settled: boolean): CSSProperties {
  if (isCc && !settled) {
    return { backgroundColor: '#fef2f2' };
  }
  return {};
}

// ------------------------------------------------------------
// CONSTANTS
// ------------------------------------------------------------

export const CC_COLORS = {
  unsettled: '#b91c1c',    // Red for unsettled
  settled: '#10b981',       // Green for settled
  badgeBg: '#fef2f2',       // Light red background
  badgeBorder: '#fecaca',   // Light red border
} as const;
