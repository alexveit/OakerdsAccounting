import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatLocalDate } from '../utils/date';

type FlipDeal = {
  id: number;
  nickname: string;
  address: string;
  status: string;
  purchase_price: number | null;
  arv: number | null;
  rehab_budget: number | null;
  closing_costs_estimate: number | null;
  start_date: string | null;
  close_date: string | null;
  original_loan_amount: number | null;
  interest_rate: number | null;
};

type CategorySummary = {
  code: string;
  name: string;
  category_group: string;
  budget: number;
  spent: number;
  variance: number;
};

type LedgerRow = {
  transactionId: number;
  date: string;
  description: string;
  category: string;
  costType: string;
  vendorInstaller: string;
  account: string;
  amount: number;
};

type CardBalance = {
  accountId: number;
  name: string;
  balance: number;
};

type InstallerSummary = {
  id: number;
  name: string;
  txCount: number;
  totalPaid: number;
};

type VendorSummary = {
  id: number;
  name: string;
  txCount: number;
  totalSpent: number;
};

export function FlipDetailView() {
  const [deals, setDeals] = useState<FlipDeal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data for selected deal
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [cardBalances, setCardBalances] = useState<CardBalance[]>([]);
  const [installers, setInstallers] = useState<InstallerSummary[]>([]);
  const [vendors, setVendors] = useState<VendorSummary[]>([]);
  const [totals, setTotals] = useState({
    totalBudget: 0,
    totalSpent: 0,
    totalVariance: 0,
  });

  // UI state
  const [activeTab, setActiveTab] = useState<'categories' | 'ledger' | 'cards' | 'people'>('categories');
  const [ledgerFilter, setLedgerFilter] = useState<string>('all');

  // Load deals on mount
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
        
        // Auto-select first deal if available
        if (data && data.length > 0) {
          setSelectedDealId(data[0].id);
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    loadDeals();
  }, []);

  // Load deal details when selection changes
  useEffect(() => {
    if (!selectedDealId) return;

    async function loadDealDetails() {
      try {
        // Load categories manually
        await loadCategoriesManually();

        // Load transaction ledger
        await loadLedger();

        // Load card balances
        await loadCardBalances();

        // Load installer/vendor summaries
        await loadPeopleSummaries();

      } catch (err: any) {
        console.error(err);
        setError(err.message);
      }
    }

    async function loadCategoriesManually() {
      // Get budget items
      const { data: budgetData } = await supabase
        .from('deal_budget_items')
        .select('rehab_category_id, budget_amount, rehab_categories(code, name, category_group, sort_order)')
        .eq('deal_id', selectedDealId);

      // Get spent by category
      const { data: spentData } = await supabase
        .from('transaction_lines')
        .select('rehab_category_id, amount')
        .eq('real_estate_deal_id', selectedDealId)
        .gt('amount', 0);

      // Build map of spent by category
      const spentByCategory = new Map<number, number>();
      for (const line of spentData ?? []) {
        if (line.rehab_category_id) {
          const current = spentByCategory.get(line.rehab_category_id) || 0;
          spentByCategory.set(line.rehab_category_id, current + Number(line.amount));
        }
      }

      // Combine
      const cats: CategorySummary[] = [];
      for (const item of budgetData ?? []) {
        const rc = item.rehab_categories as any;
        const budget = Number(item.budget_amount) || 0;
        const spent = spentByCategory.get(item.rehab_category_id) || 0;
        cats.push({
          code: rc.code,
          name: rc.name,
          category_group: rc.category_group,
          budget,
          spent,
          variance: budget - spent,
        });
      }

      // Add categories with spending but no budget
      const { data: allCats } = await supabase
        .from('rehab_categories')
        .select('id, code, name, category_group, sort_order')
        .order('sort_order');

      for (const cat of allCats ?? []) {
        const spent = spentByCategory.get(cat.id) || 0;
        if (spent > 0 && !cats.find(c => c.code === cat.code)) {
          cats.push({
            code: cat.code,
            name: cat.name,
            category_group: cat.category_group,
            budget: 0,
            spent,
            variance: -spent,
          });
        }
      }

      // Sort by category group and code
      cats.sort((a, b) => {
        const groupOrder: Record<string, number> = {
          site_prep: 1, structural: 2, mep_rough: 3, interior: 4, mep_trim: 5,
          exterior_site: 6, final: 7, permits: 8, other: 9, transactional: 10,
        };
        const aGroup = groupOrder[a.category_group] || 99;
        const bGroup = groupOrder[b.category_group] || 99;
        if (aGroup !== bGroup) return aGroup - bGroup;
        return a.code.localeCompare(b.code);
      });

      setCategories(cats);
      calculateTotals(cats);
    }

    async function loadLedger() {
      const { data, error: err } = await supabase
        .from('transaction_lines')
        .select(`
          id,
          amount,
          cost_type,
          transaction_id,
          transactions(date, description),
          accounts(name, account_types(name)),
          rehab_categories(code, name),
          vendors(name, nick_name),
          installers(first_name, last_name)
        `)
        .eq('real_estate_deal_id', selectedDealId)
        .order('transaction_id', { ascending: true });

      if (err) throw err;

      // Group by transaction, take expense line
      const txMap = new Map<number, LedgerRow>();
      for (const line of data ?? []) {
        const txId = line.transaction_id;
        const accountType = (line.accounts as any)?.account_types?.name ?? '';
        
        if (!txMap.has(txId)) {
          const tx = line.transactions as any;
          const rc = line.rehab_categories as any;
          const vendor = line.vendors as any;
          const installer = line.installers as any;
          
          let vendorInstaller = '';
          if (installer) {
            vendorInstaller = `${installer.first_name} ${installer.last_name ?? ''}`.trim();
          } else if (vendor) {
            vendorInstaller = vendor.nick_name || vendor.name;
          }

          txMap.set(txId, {
            transactionId: txId,
            date: tx?.date ?? '',
            description: tx?.description ?? '',
            category: rc?.code ?? '',
            costType: line.cost_type ?? '',
            vendorInstaller,
            account: '',
            amount: 0,
          });
        }

        const row = txMap.get(txId)!;
        
        // Get amount from asset/liability line
        if (accountType === 'asset' || accountType === 'liability') {
          row.account = (line.accounts as any)?.name ?? '';
          row.amount = Math.abs(Number(line.amount));
        }
      }

      const rows = Array.from(txMap.values()).sort((a, b) => {
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      });

      setLedger(rows);
    }

    async function loadCardBalances() {
      const { data, error: err } = await supabase
        .from('transaction_lines')
        .select('account_id, amount, accounts(id, name, code)')
        .eq('real_estate_deal_id', selectedDealId);

      if (err) throw err;

      // Sum by account where code starts with '2' (liabilities/credit cards)
      const balanceMap = new Map<number, { name: string; balance: number }>();
      for (const line of data ?? []) {
        const acc = line.accounts as any;
        if (acc?.code?.startsWith('2')) {
          const current = balanceMap.get(acc.id) || { name: acc.name, balance: 0 };
          current.balance += Number(line.amount);
          balanceMap.set(acc.id, current);
        }
      }

      const cards: CardBalance[] = [];
      for (const [id, val] of balanceMap) {
        if (val.balance !== 0) {
          cards.push({ accountId: id, name: val.name, balance: val.balance });
        }
      }
      cards.sort((a, b) => a.balance - b.balance);
      setCardBalances(cards);
    }

    async function loadPeopleSummaries() {
      // Installers
      const { data: instData } = await supabase
        .from('transaction_lines')
        .select('installer_id, amount, installers(id, first_name, last_name)')
        .eq('real_estate_deal_id', selectedDealId)
        .not('installer_id', 'is', null)
        .gt('amount', 0);

      const instMap = new Map<number, InstallerSummary>();
      for (const line of instData ?? []) {
        const inst = line.installers as any;
        if (!inst) continue;
        const current = instMap.get(inst.id) || {
          id: inst.id,
          name: `${inst.first_name} ${inst.last_name ?? ''}`.trim(),
          txCount: 0,
          totalPaid: 0,
        };
        current.txCount += 1;
        current.totalPaid += Number(line.amount);
        instMap.set(inst.id, current);
      }
      setInstallers(Array.from(instMap.values()).sort((a, b) => b.totalPaid - a.totalPaid));

      // Vendors
      const { data: vendData } = await supabase
        .from('transaction_lines')
        .select('vendor_id, amount, vendors(id, name, nick_name)')
        .eq('real_estate_deal_id', selectedDealId)
        .not('vendor_id', 'is', null)
        .gt('amount', 0);

      const vendMap = new Map<number, VendorSummary>();
      for (const line of vendData ?? []) {
        const vend = line.vendors as any;
        if (!vend) continue;
        const current = vendMap.get(vend.id) || {
          id: vend.id,
          name: vend.nick_name || vend.name,
          txCount: 0,
          totalSpent: 0,
        };
        current.txCount += 1;
        current.totalSpent += Number(line.amount);
        vendMap.set(vend.id, current);
      }
      setVendors(Array.from(vendMap.values()).sort((a, b) => b.totalSpent - a.totalSpent));
    }

    function calculateTotals(cats: CategorySummary[]) {
      const totalBudget = cats.reduce((sum, c) => sum + c.budget, 0);
      const totalSpent = cats.reduce((sum, c) => sum + c.spent, 0);
      setTotals({
        totalBudget,
        totalSpent,
        totalVariance: totalBudget - totalSpent,
      });
    }

    loadDealDetails();
  }, [selectedDealId]);

  const selectedDeal = deals.find(d => d.id === selectedDealId);

  // Filter ledger by category if needed
  const filteredLedger = ledgerFilter === 'all' 
    ? ledger 
    : ledger.filter(r => r.category === ledgerFilter);

  // Get unique categories for filter dropdown
  const ledgerCategories = [...new Set(ledger.map(r => r.category))].filter(Boolean).sort();

  if (loading) return <p>Loading flip deals...</p>;
  if (error) return <p style={{ color: 'red' }}>{error}</p>;
  if (deals.length === 0) return <p>No flip deals found.</p>;

  return (
    <div>
      {/* Deal selector */}
      <div style={{ marginBottom: '1rem' }}>
        <label style={{ fontSize: 14, marginRight: '0.5rem' }}>Select Deal:</label>
        <select
          value={selectedDealId ?? ''}
          onChange={(e) => setSelectedDealId(Number(e.target.value))}
          style={{ padding: '0.25rem 0.5rem', fontSize: 14 }}
        >
          {deals.map(d => (
            <option key={d.id} value={d.id}>
              {d.nickname} - {d.address}
            </option>
          ))}
        </select>
      </div>

      {selectedDeal && (
        <>
          {/* Deal header */}
          <div style={{
            background: '#f9f9f9',
            borderRadius: 8,
            padding: '1rem',
            marginBottom: '1rem',
          }}>
            <h3 style={{ margin: 0, marginBottom: '0.5rem' }}>{selectedDeal.nickname}</h3>
            <div style={{ fontSize: 13, color: '#555', marginBottom: '0.75rem' }}>
              {selectedDeal.address}
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '1rem',
            }}>
              <StatBox label="Purchase" value={selectedDeal.purchase_price} money />
              <StatBox label="ARV" value={selectedDeal.arv} money />
              <StatBox label="Loan Amount" value={selectedDeal.original_loan_amount} money />
              <StatBox label="Interest Rate" value={selectedDeal.interest_rate} suffix="%" />
              <StatBox label="Total Budget" value={totals.totalBudget} money />
              <StatBox label="Total Spent" value={totals.totalSpent} money />
              <StatBox 
                label="Variance" 
                value={totals.totalVariance} 
                money 
                highlight={totals.totalVariance >= 0 ? 'positive' : 'negative'} 
              />
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {(['categories', 'ledger', 'cards', 'people'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: '0.5rem 1rem',
                  border: '1px solid #ccc',
                  borderRadius: 4,
                  background: activeTab === tab ? '#333' : '#fff',
                  color: activeTab === tab ? '#fff' : '#333',
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                {tab === 'categories' && 'Budget vs Actual'}
                {tab === 'ledger' && `Ledger (${ledger.length})`}
                {tab === 'cards' && `Cards (${cardBalances.length})`}
                {tab === 'people' && 'Installers/Vendors'}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {activeTab === 'categories' && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <Th>Code</Th>
                    <Th>Category</Th>
                    <Th align="right">Budget</Th>
                    <Th align="right">Spent</Th>
                    <Th align="right">Variance</Th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map(cat => (
                    <tr key={cat.code}>
                      <Td>{cat.code}</Td>
                      <Td>{cat.name}</Td>
                      <Td align="right">{formatMoney(cat.budget)}</Td>
                      <Td align="right">{formatMoney(cat.spent)}</Td>
                      <Td align="right" style={{ 
                        color: cat.variance >= 0 ? '#0a7a3c' : '#b00020',
                        fontWeight: 500,
                      }}>
                        {formatMoney(cat.variance)}
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f5f5f5', fontWeight: 600 }}>
                    <Td colSpan={2}>TOTAL</Td>
                    <Td align="right">{formatMoney(totals.totalBudget)}</Td>
                    <Td align="right">{formatMoney(totals.totalSpent)}</Td>
                    <Td align="right" style={{ 
                      color: totals.totalVariance >= 0 ? '#0a7a3c' : '#b00020',
                    }}>
                      {formatMoney(totals.totalVariance)}
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {activeTab === 'ledger' && (
            <div>
              {/* Filter */}
              <div style={{ marginBottom: '0.75rem' }}>
                <label style={{ fontSize: 13, marginRight: '0.5rem' }}>Filter by category:</label>
                <select
                  value={ledgerFilter}
                  onChange={(e) => setLedgerFilter(e.target.value)}
                  style={{ padding: '0.25rem 0.5rem', fontSize: 13 }}
                >
                  <option value="all">All ({ledger.length})</option>
                  {ledgerCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat} ({ledger.filter(r => r.category === cat).length})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ overflowX: 'auto', maxHeight: '60vh', overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#fff' }}>
                    <tr style={{ background: '#f5f5f5' }}>
                      <Th>Date</Th>
                      <Th>Description</Th>
                      <Th>Cat</Th>
                      <Th>Type</Th>
                      <Th>Vendor/Installer</Th>
                      <Th>Account</Th>
                      <Th align="right">Amount</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLedger.map(row => (
                      <tr key={row.transactionId}>
                        <Td>{formatLocalDate(row.date)}</Td>
                        <Td>{row.description}</Td>
                        <Td>{row.category}</Td>
                        <Td>{row.costType}</Td>
                        <Td>{row.vendorInstaller}</Td>
                        <Td>{row.account}</Td>
                        <Td align="right">{formatMoney(row.amount)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'cards' && (
            <div>
              <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Credit Card Balances (this flip)</h4>
              <table style={{ width: '100%', maxWidth: 400, borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f5f5f5' }}>
                    <Th>Card</Th>
                    <Th align="right">Balance Owed</Th>
                  </tr>
                </thead>
                <tbody>
                  {cardBalances.map(card => (
                    <tr key={card.accountId}>
                      <Td>{card.name}</Td>
                      <Td align="right" style={{ color: '#b00020', fontWeight: 500 }}>
                        {formatMoney(Math.abs(card.balance))}
                      </Td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ background: '#f5f5f5', fontWeight: 600 }}>
                    <Td>TOTAL</Td>
                    <Td align="right" style={{ color: '#b00020' }}>
                      {formatMoney(Math.abs(cardBalances.reduce((sum, c) => sum + c.balance, 0)))}
                    </Td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {activeTab === 'people' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
              {/* Installers */}
              <div>
                <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Installers</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <Th>Name</Th>
                      <Th align="right">Txns</Th>
                      <Th align="right">Total Paid</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {installers.map(inst => (
                      <tr key={inst.id}>
                        <Td>{inst.name}</Td>
                        <Td align="right">{inst.txCount}</Td>
                        <Td align="right">{formatMoney(inst.totalPaid)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f5f5f5', fontWeight: 600 }}>
                      <Td>TOTAL</Td>
                      <Td align="right">{installers.reduce((sum, i) => sum + i.txCount, 0)}</Td>
                      <Td align="right">{formatMoney(installers.reduce((sum, i) => sum + i.totalPaid, 0))}</Td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Vendors */}
              <div>
                <h4 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Vendors</h4>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f5f5f5' }}>
                      <Th>Name</Th>
                      <Th align="right">Txns</Th>
                      <Th align="right">Total Spent</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {vendors.map(vend => (
                      <tr key={vend.id}>
                        <Td>{vend.name}</Td>
                        <Td align="right">{vend.txCount}</Td>
                        <Td align="right">{formatMoney(vend.totalSpent)}</Td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background: '#f5f5f5', fontWeight: 600 }}>
                      <Td>TOTAL</Td>
                      <Td align="right">{vendors.reduce((sum, v) => sum + v.txCount, 0)}</Td>
                      <Td align="right">{formatMoney(vendors.reduce((sum, v) => sum + v.totalSpent, 0))}</Td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Helper components
function StatBox({
  label,
  value,
  money,
  suffix,
  highlight,
}: {
  label: string;
  value: number | null;
  money?: boolean;
  suffix?: string;
  highlight?: 'positive' | 'negative';
}) {
  let color = '#111';
  if (highlight === 'positive') color = '#0a7a3c';
  if (highlight === 'negative') color = '#b00020';

  const display = value == null
    ? '—'
    : money
    ? formatMoney(value)
    : `${value.toFixed(2)}${suffix ?? ''}`;

  return (
    <div>
      <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#777' }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color }}>{display}</div>
    </div>
  );
}

function Th({ children, align = 'left', colSpan }: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; colSpan?: number }) {
  return (
    <th style={{ borderBottom: '1px solid #ccc', textAlign: align, padding: '6px 8px', whiteSpace: 'nowrap' }} colSpan={colSpan}>
      {children}
    </th>
  );
}

function Td({ children, align = 'left', style, colSpan }: { children: React.ReactNode; align?: 'left' | 'right' | 'center'; style?: React.CSSProperties; colSpan?: number }) {
  return (
    <td style={{ padding: '4px 8px', textAlign: align, borderBottom: '1px solid #f0f0f0', ...style }} colSpan={colSpan}>
      {children}
    </td>
  );
}

function formatMoney(value: number): string {
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  });
}
