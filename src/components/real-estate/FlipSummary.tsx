// src/components/FlipSummary.tsx
// Executive summary view for flip deals - answers "Am I making money?"

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency, formatPercent } from '../../utils/format';
import { formatLocalDate } from '../../utils/date';
import {
  ACCOUNT_CODES,
  ACCOUNT_CODE_RANGES,
  REHAB_CODES,
  isFlipExpenseCode,
} from '../../utils/accounts';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type FlipDeal = {
  id: number;
  nickname: string;
  address: string;
  status: string;
  purchase_price: number | null;
  arv: number | null;
  rehab_budget: number | null;
  closing_costs_estimate: number | null;
  holding_costs_estimate: number | null;
  start_date: string | null;
  close_date: string | null;
  original_loan_amount: number | null;
  interest_rate: number | null;
  asset_account_id: number | null;
  loan_account_id: number | null;
};

type FlipMetrics = {
  purchaseAsset: number;
  totalCostBasis: number;
  rehabSpent: number;
  holdingSpent: number;
  closingSpent: number;
  creditCardDebt: number;
  hardMoneyBalance: number;
  helocDraws: number;
  cashOutOfPocket: number;
  daysInProject: number;
  monthsInProject: number;
  projectedProfit: number;
  profitMargin: number;
  breakEvenPrice: number;
  roiOnCash: number;
  monthlyHoldingBurn: number;
};

type DealStatus = 'rehab' | 'listed' | 'under_contract' | 'sold' | 'unknown';

type Props = {
  initialDealId?: number;
  onDealChange?: (dealId: number | null) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SELLING_COST_OPTIONS = [
  { value: 0.03, label: '3% (FSBO)' },
  { value: 0.05, label: '5% (Discount/Self-list)' },
  { value: 0.06, label: '6% (Traditional)' },
  { value: 0.08, label: '8% (Full service + closing)' },
];

const STATUS_LABELS: Record<DealStatus, string> = {
  rehab: '🔨 In Rehab',
  listed: '📋 Listed',
  under_contract: '📝 Under Contract',
  sold: '✅ Sold',
  unknown: '❓ Unknown',
};

const STATUS_COLORS: Record<DealStatus, string> = {
  rehab: '#e65100',
  listed: '#1565c0',
  under_contract: '#6a1b9a',
  sold: '#2e7d32',
  unknown: '#757575',
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function FlipSummary({ initialDealId, onDealChange }: Props) {
  const [deals, setDeals] = useState<FlipDeal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(initialDealId ?? null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<FlipMetrics | null>(null);
  const [sellingCostRate, setSellingCostRate] = useState(0.05);

  const selectedDeal = deals.find((d) => d.id === selectedDealId) ?? null;

  // ─────────────────────────────────────────────────────────────────────────
  // Load deals on mount
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function loadDeals() {
      setLoading(true);
      try {
        const { data, error: err } = await supabase
          .from('real_estate_deals')
          .select('*')
          .eq('type', 'flip')
          .order('created_at', { ascending: false });

        if (err) throw err;
        setDeals(data ?? []);

        // Set initial selection
        if (initialDealId && data?.some((d) => d.id === initialDealId)) {
          setSelectedDealId(initialDealId);
        } else if (data && data.length > 0) {
          setSelectedDealId(data[0].id);
          onDealChange?.(data[0].id);
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load deals');
      } finally {
        setLoading(false);
      }
    }
    loadDeals();
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Load metrics when deal changes
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedDealId || !selectedDeal) {
      setMetrics(null);
      return;
    }

    async function loadMetrics() {
      try {
        const { data: linesData, error: linesErr } = await supabase
          .from('transaction_lines')
          .select(`
            amount,
            account_id,
            accounts!inner(code, name),
            rehab_categories(code)
          `)
          .eq('real_estate_deal_id', selectedDealId);

        if (linesErr) throw linesErr;

        let purchaseAsset = 0;
        let rehabSpent = 0;
        let holdingSpent = 0;
        let closingSpent = 0;
        let creditCardDebt = 0;
        let helocDraws = 0;
        let hardMoneyBalance = 0;

        for (const line of linesData ?? []) {
          const amt = Number(line.amount) || 0;
          const accounts = Array.isArray(line.accounts) ? line.accounts[0] : line.accounts;
          const accountCode = accounts?.code ?? '';
          const rehabCats = Array.isArray(line.rehab_categories) ? line.rehab_categories[0] : line.rehab_categories;
          const rehabCode = rehabCats?.code;
          const codeNum = Number(accountCode);

          // Asset accounts (63xxx) - purchase price contribution
          if (codeNum >= ACCOUNT_CODE_RANGES.RE_ASSET_MIN && codeNum <= ACCOUNT_CODE_RANGES.RE_ASSET_MAX) {
            purchaseAsset += amt;
          }
          // Flip expense accounts (62100-62105)
          else if (isFlipExpenseCode(accountCode)) {
            if (rehabCode === REHAB_CODES.CRED) continue;

            if (accountCode === ACCOUNT_CODES.FLIP_INTEREST || accountCode === ACCOUNT_CODES.FLIP_HOLDING_COSTS) {
              holdingSpent += amt;
            } else if (accountCode === ACCOUNT_CODES.FLIP_CLOSING_COSTS) {
              closingSpent += amt;
            } else {
              rehabSpent += amt;
            }
          }
          // Credit cards (2xxx)
          else if (codeNum >= ACCOUNT_CODE_RANGES.CREDIT_CARD_MIN && codeNum <= ACCOUNT_CODE_RANGES.CREDIT_CARD_MAX) {
            creditCardDebt += amt;
          }
          // Mortgages/HELOC (64xxx)
          else if (codeNum >= ACCOUNT_CODE_RANGES.RE_MORTGAGE_MIN && codeNum <= ACCOUNT_CODE_RANGES.RE_MORTGAGE_MAX) {
            if (amt < 0) {
              if (selectedDeal?.loan_account_id && line.account_id === selectedDeal.loan_account_id) {
                hardMoneyBalance += Math.abs(amt);
              } else {
                helocDraws += Math.abs(amt);
              }
            }
          }
        }

        creditCardDebt = Math.abs(creditCardDebt);
        const totalCostBasis = purchaseAsset + rehabSpent + holdingSpent + closingSpent;

        const startDate = selectedDeal?.close_date ? new Date(selectedDeal.close_date) : null;
        const daysInProject = startDate
          ? Math.floor((Date.now() - startDate.getTime()) / (1000 * 60 * 60 * 24))
          : 0;
        const monthsInProject = daysInProject / 30;

        const arv = selectedDeal?.arv ?? 0;
        const sellingCostsAmt = arv * sellingCostRate;
        const projectedProfit = arv - totalCostBasis - sellingCostsAmt;
        const profitMargin = arv > 0 ? projectedProfit / arv : 0;
        const breakEvenPrice = totalCostBasis / (1 - sellingCostRate);

        const totalDebt = hardMoneyBalance + creditCardDebt + helocDraws;
        const cashOutOfPocket = totalCostBasis - totalDebt;
        const roiOnCash = cashOutOfPocket > 0 ? projectedProfit / cashOutOfPocket : 0;
        const monthlyHoldingBurn = monthsInProject > 0 ? holdingSpent / monthsInProject : 0;

        setMetrics({
          purchaseAsset,
          totalCostBasis,
          rehabSpent,
          holdingSpent,
          closingSpent,
          creditCardDebt,
          hardMoneyBalance,
          helocDraws,
          cashOutOfPocket,
          daysInProject,
          monthsInProject,
          projectedProfit,
          profitMargin,
          breakEvenPrice,
          roiOnCash,
          monthlyHoldingBurn,
        });
      } catch (err: unknown) {
        console.error('Error loading metrics:', err);
      }
    }

    loadMetrics();
  }, [selectedDealId, selectedDeal, sellingCostRate]);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  function handleDealChange(newDealId: number | null) {
    setSelectedDealId(newDealId);
    onDealChange?.(newDealId);
  }

  function parseStatus(status: string | null | undefined): DealStatus {
    if (!status) return 'unknown';
    const s = status.toLowerCase();
    if (s.includes('rehab')) return 'rehab';
    if (s.includes('list')) return 'listed';
    if (s.includes('contract')) return 'under_contract';
    if (s.includes('sold')) return 'sold';
    return 'unknown';
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (loading) return <p>Loading flip deals...</p>;
  if (error) return <p style={{ color: '#c00' }}>{error}</p>;
  if (deals.length === 0) return <p>No flip deals found.</p>;

  const status = parseStatus(selectedDeal?.status);

  return (
    <div>
      {/* Deal Selector */}
      <div style={{ marginBottom: '1rem' }}>
        <select
          value={selectedDealId ?? ''}
          onChange={(e) => handleDealChange(Number(e.target.value) || null)}
          style={{ fontSize: 16, padding: '0.5rem', minWidth: 300 }}
        >
          {deals.map((d) => (
            <option key={d.id} value={d.id}>
              {d.nickname} — {d.address}
            </option>
          ))}
        </select>
      </div>

      {selectedDeal && metrics && (
        <div>
          {/* Header */}
          <div style={{ marginBottom: '1rem' }}>
            <h2 style={{ margin: 0 }}>{selectedDeal.nickname}</h2>
            <p style={{ margin: '0.25rem 0', color: '#666' }}>{selectedDeal.address}</p>
            <StatusBadge status={status} />
          </div>

          {/* Selling cost selector */}
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ fontSize: 13 }}>
              Selling Cost Estimate:{' '}
              <select
                value={sellingCostRate}
                onChange={(e) => setSellingCostRate(Number(e.target.value))}
                style={{ marginLeft: '0.5rem' }}
              >
                {SELLING_COST_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Metrics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            {/* Timeline */}
            <Card title="Timeline">
              <MetricRow label="Close Date" value={selectedDeal.close_date ? formatLocalDate(selectedDeal.close_date) : '—'} />
              <MetricRow label="Days in Project" value={`${metrics.daysInProject} days`} />
              <MetricRow label="Monthly Holding Burn" value={formatCurrency(metrics.monthlyHoldingBurn, 0)} sublabel="(interest + utilities + fees)" />
            </Card>

            {/* Cost Basis */}
            <Card title="Cost Basis">
              <MetricRow label="Purchase (Asset)" value={formatCurrency(metrics.purchaseAsset, 0)} />
              <MetricRow label="Rehab Costs" value={formatCurrency(metrics.rehabSpent, 0)} />
              <MetricRow label="Holding Costs" value={formatCurrency(metrics.holdingSpent, 0)} />
              <MetricRow label="Closing Costs" value={formatCurrency(metrics.closingSpent, 0)} />
              <Divider />
              <MetricRow label="Total Cost Basis" value={formatCurrency(metrics.totalCostBasis, 0)} bold />
              <MetricRow
                label="Budget Variance"
                value={formatCurrency((selectedDeal.rehab_budget ?? 0) - metrics.rehabSpent, 0)}
                highlight={(selectedDeal.rehab_budget ?? 0) >= metrics.rehabSpent ? 'positive' : 'negative'}
                sublabel={`Budget: ${formatCurrency(selectedDeal.rehab_budget ?? 0, 0)}`}
              />
            </Card>

            {/* Capital Stack */}
            <Card title="Capital Stack">
              <MetricRow label="Hard Money Balance" value={formatCurrency(metrics.hardMoneyBalance, 0)} />
              <MetricRow label="Credit Card Debt" value={formatCurrency(metrics.creditCardDebt, 0)} />
              <MetricRow label="HELOC Draws" value={formatCurrency(metrics.helocDraws, 0)} />
              <Divider />
              <MetricRow label="Total Debt" value={formatCurrency(metrics.hardMoneyBalance + metrics.creditCardDebt + metrics.helocDraws, 0)} bold />
              <MetricRow label="Cash Out of Pocket" value={formatCurrency(metrics.cashOutOfPocket, 0)} />
            </Card>
          </div>

          {/* Profit Projection */}
          <Card title="Profit Projection" accent style={{ marginTop: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '2rem' }}>
              <div>
                <MetricRow label="ARV (Expected Sale)" value={formatCurrency(selectedDeal.arv ?? 0, 0)} />
                <MetricRow label="Less: Total Cost Basis" value={`(${formatCurrency(metrics.totalCostBasis, 0)})`} />
                <MetricRow label={`Less: Selling Costs (~${(sellingCostRate * 100).toFixed(0)}%)`} value={`(${formatCurrency((selectedDeal.arv ?? 0) * sellingCostRate, 0)})`} />
                <Divider />
                <MetricRow
                  label="Projected Net Profit"
                  value={formatCurrency(metrics.projectedProfit, 0)}
                  highlight={metrics.projectedProfit >= 0 ? 'positive' : 'negative'}
                  bold
                  large
                />
              </div>
              <div style={{ borderLeft: '1px solid #e0e0e0', paddingLeft: '1.5rem' }}>
                <MetricRow label="Profit Margin" value={formatPercent(metrics.profitMargin)} highlight={metrics.profitMargin >= 0 ? 'positive' : 'negative'} large />
                <MetricRow label="ROI on Cash" value={formatPercent(metrics.roiOnCash)} large />
                <MetricRow label="Break-Even Price" value={formatCurrency(metrics.breakEvenPrice, 0)} />
              </div>
            </div>
          </Card>

          {/* Warnings */}
          {metrics.projectedProfit < 0 && (
            <Alert type="error" style={{ marginTop: '1rem' }}>
              ⚠️ This deal is projected to lose <strong>{formatCurrency(Math.abs(metrics.projectedProfit), 0)}</strong>. Review costs or adjust ARV.
            </Alert>
          )}
          {metrics.profitMargin < 0.1 && metrics.projectedProfit >= 0 && (
            <Alert type="warning" style={{ marginTop: '1rem' }}>
              ⚡ Profit margin is below 10%. Consider whether the risk justifies the return.
            </Alert>
          )}
          {metrics.daysInProject > 180 && status !== 'sold' && (
            <Alert type="warning" style={{ marginTop: '1rem' }}>
              ⏱️ This project has been active for {metrics.daysInProject} days. Holding costs are accumulating at {formatCurrency(metrics.monthlyHoldingBurn, 0)}/month.
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper Components
// ─────────────────────────────────────────────────────────────────────────────

function Card({ title, accent, style, children }: { title?: string; accent?: boolean; style?: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div style={{ background: accent ? '#f8fdf8' : '#fff', border: accent ? '2px solid #2e7d32' : '1px solid #e0e0e0', borderRadius: 8, padding: '1rem', ...style }}>
      {title && <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: accent ? '#2e7d32' : '#666', marginBottom: '0.75rem', letterSpacing: 0.5 }}>{title}</div>}
      {children}
    </div>
  );
}

function MetricRow({ label, value, sublabel, highlight, bold, large }: { label: string; value: string; sublabel?: string; highlight?: 'positive' | 'negative' | 'neutral'; bold?: boolean; large?: boolean }) {
  let valueColor = '#111';
  if (highlight === 'positive') valueColor = '#2e7d32';
  if (highlight === 'negative') valueColor = '#c62828';

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: large ? '0.75rem' : '0.4rem' }}>
      <div>
        <span style={{ fontSize: 13, color: '#555' }}>{label}</span>
        {sublabel && <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>{sublabel}</span>}
      </div>
      <span style={{ fontSize: large ? 18 : 14, fontWeight: bold || large ? 600 : 400, color: valueColor }}>{value}</span>
    </div>
  );
}

function Divider() {
  return <div style={{ borderTop: '1px solid #e0e0e0', margin: '0.5rem 0' }} />;
}

function StatusBadge({ status }: { status: DealStatus }) {
  return (
    <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 500, background: `${STATUS_COLORS[status]}15`, color: STATUS_COLORS[status], border: `1px solid ${STATUS_COLORS[status]}40` }}>
      {STATUS_LABELS[status]}
    </span>
  );
}

function Alert({ type, style, children }: { type: 'error' | 'warning' | 'info'; style?: React.CSSProperties; children: React.ReactNode }) {
  const colors = {
    error: { bg: '#ffebee', border: '#c62828', text: '#b71c1c' },
    warning: { bg: '#fff8e1', border: '#f9a825', text: '#e65100' },
    info: { bg: '#e3f2fd', border: '#1976d2', text: '#0d47a1' },
  };
  const c = colors[type];
  return <div style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: 6, padding: '0.75rem 1rem', fontSize: 13, color: c.text, ...style }}>{children}</div>;
}
