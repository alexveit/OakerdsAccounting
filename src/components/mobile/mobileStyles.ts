import type { CSSProperties } from 'react';

export const mobileStyles: Record<string, CSSProperties> = {
  // Layout
  container: {
    minHeight: '100vh',
    backgroundColor: '#111827',
    color: '#f3f4f6',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    paddingBottom: '60px',
  },
  tabBar: {
    display: 'flex',
    backgroundColor: '#1f2937',
    borderBottom: '1px solid #374151',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  tab: {
    flex: 1,
    padding: '14px 16px',
    fontSize: '15px',
    fontWeight: 600,
    border: 'none',
    backgroundColor: 'transparent',
    color: '#9ca3af',
    cursor: 'pointer',
    borderBottom: '3px solid transparent',
  },
  tabActive: {
    color: '#fff',
    borderBottomColor: '#3b82f6',
  },
  tabContent: {
    padding: '16px',
  },
  footer: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '12px 16px',
    backgroundColor: '#111827',
    borderTop: '1px solid #374151',
    textAlign: 'center',
    fontSize: '12px',
    color: '#6b7280',
  },

  // Inputs & Filters
  searchInput: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '1px solid #374151',
    borderRadius: '8px',
    backgroundColor: '#1f2937',
    color: '#f3f4f6',
    marginBottom: '12px',
    boxSizing: 'border-box',
  },
  filterRow: {
    display: 'flex',
    gap: '8px',
    marginBottom: '12px',
  },
  filterBtn: {
    flex: 1,
    padding: '10px 12px',
    fontSize: '14px',
    fontWeight: 500,
    border: '1px solid #374151',
    borderRadius: '8px',
    backgroundColor: '#1f2937',
    color: '#9ca3af',
    cursor: 'pointer',
  },
  filterBtnActive: {
    backgroundColor: '#3b82f6',
    borderColor: '#3b82f6',
    color: '#fff',
  },
  selectInput: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #374151',
    borderRadius: '8px',
    backgroundColor: '#1f2937',
    color: '#f3f4f6',
    marginBottom: '12px',
  },
  countText: {
    fontSize: '13px',
    color: '#6b7280',
    marginBottom: '12px',
  },

  // Cards (Jobs)
  cardList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  card: {
    backgroundColor: '#1f2937',
    borderRadius: '12px',
    border: '1px solid #374151',
    overflow: 'hidden',
  },
  cardTouchable: {
    padding: '16px',
    cursor: 'pointer',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '4px',
  },
  jobName: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    flex: 1,
    paddingRight: '8px',
  },
  statusBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: '4px',
    color: '#fff',
    textTransform: 'uppercase',
  },
  address: {
    fontSize: '13px',
    color: '#9ca3af',
    marginBottom: '12px',
  },
  financials: {
    borderTop: '1px solid #374151',
    paddingTop: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  finRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  finLabel: {
    fontSize: '13px',
    color: '#9ca3af',
    width: '60px',
  },
  finAmount: {
    fontSize: '14px',
    color: '#f3f4f6',
    flex: 1,
  },
  expandHint: {
    marginTop: '12px',
    fontSize: '12px',
    color: '#6b7280',
    textAlign: 'center',
  },

  // Transactions
  transactionsSection: {
    borderTop: '1px solid #374151',
    backgroundColor: '#111827',
    padding: '12px 16px',
  },
  noTransactions: {
    fontSize: '13px',
    color: '#6b7280',
    textAlign: 'center',
    padding: '8px 0',
  },
  txRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #1f2937',
  },
  txLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '10px',
    flex: 1,
  },
  txDate: {
    fontSize: '12px',
    color: '#6b7280',
    width: '40px',
  },
  txDetails: {
    flex: 1,
  },
  txDesc: {
    fontSize: '13px',
    color: '#f3f4f6',
  },
  txVendor: {
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '2px',
  },
  txRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  txAmount: {
    fontSize: '13px',
    fontWeight: 500,
  },
  txCleared: {
    fontSize: '14px',
    width: '20px',
    textAlign: 'center',
  },
  txStatus: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '14px',
  },

  // Prices
  priceCategory: {
    marginBottom: '16px',
  },
  priceCategoryHeader: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#9ca3af',
    padding: '8px 0',
    borderBottom: '1px solid #374151',
    marginBottom: '8px',
  },
  priceRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 0',
    borderBottom: '1px solid #1f2937',
  },
  priceItemName: {
    fontSize: '14px',
    color: '#f3f4f6',
    flex: 1,
    paddingRight: '12px',
  },
  priceRight: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
  },
  priceAmount: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#10b981',
    fontFamily: 'monospace',
  },
  priceUnit: {
    fontSize: '11px',
    color: '#6b7280',
  },

  // States
  loading: {
    textAlign: 'center',
    padding: '48px 16px',
    color: '#9ca3af',
  },
  error: {
    textAlign: 'center',
    padding: '48px 16px',
    color: '#ef4444',
  },
  empty: {
    textAlign: 'center',
    padding: '32px 16px',
    color: '#6b7280',
    fontSize: '14px',
  },
};

// Transaction type colors
export const TX_COLORS = {
  income: '#10b981',
  labor: '#f59e0b',
  materials: '#3b82f6',
  expense: '#f3f4f6',
  other: '#9ca3af',
} as const;
