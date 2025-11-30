import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

type Vendor = {
  id: number;
  name: string;
  nick_name: string | null;
  tax_id: string | null;
  is_active: boolean;
};

export function VendorsOverview() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [ytdSpend, setYtdSpend] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<'name' | 'spendDesc'>('spendDesc');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1) Load vendors
        const { data: vendorsData, error: vendErr } = await supabase
          .from('vendors')
          .select('id, name, nick_name, tax_id, is_active')
          .order('name', { ascending: true });

        if (vendErr) throw vendErr;

        const vendorsTyped: Vendor[] = (vendorsData ?? []) as Vendor[];

        // 2) Load YTD cleared spend grouped by vendor_id
        const currentYear = new Date().getFullYear();
        const startDate = `${currentYear}-01-01`;
        const endDate = `${currentYear}-12-31`;

        const { data: linesData, error: linesErr } = await supabase
          .from('transaction_lines')
          .select(`
            vendor_id,
            amount,
            transactions!inner ( date )
          `)
          .eq('is_cleared', true)
          .not('vendor_id', 'is', null)
          .gte('transactions.date', startDate)
          .lte('transactions.date', endDate);

        if (linesErr) throw linesErr;

        // Sum by vendor_id (amounts are typically negative for expenses, so we use abs)
        const spendMap: Record<number, number> = {};
        for (const line of linesData ?? []) {
          const vendorId = line.vendor_id as number;
          const amount = Math.abs(Number(line.amount) || 0);
          spendMap[vendorId] = (spendMap[vendorId] || 0) + amount;
        }

        setVendors(vendorsTyped);
        setYtdSpend(spendMap);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load vendors');
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) return <p>Loading vendors...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (vendors.length === 0) return <p>No vendors found.</p>;

  function formatMoney(value: number) {
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });
  }

  // Filter and sort
  const filteredVendors = showInactive
    ? vendors
    : vendors.filter((v) => v.is_active);

  const sortedVendors = [...filteredVendors].sort((a, b) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    const spendA = ytdSpend[a.id] ?? 0;
    const spendB = ytdSpend[b.id] ?? 0;

    if (sortMode === 'name') {
      return nameA.localeCompare(nameB);
    }

    // spendDesc
    return spendB - spendA;
  });

  // Calculate total YTD spend
  const totalYtdSpend = sortedVendors.reduce((sum, v) => sum + (ytdSpend[v.id] ?? 0), 0);

  return (
    <div className="card">
      {/* Controls row */}
      <div
        style={{
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1.5rem',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: 13 }}>Sort by:</label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'name' | 'spendDesc')}
            style={{ padding: '0.25rem 0.5rem', fontSize: 13, width: 'auto' }}
          >
            <option value="name">Name (A → Z)</option>
            <option value="spendDesc">Spend (High → Low)</option>
          </select>
        </div>

        <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <table className="table">
        <thead>
          <tr>
            <Th>Vendor</Th>
            <Th>Nickname</Th>
            <Th>Tax ID</Th>
            <Th align="right">YTD Spend (Cleared)</Th>
          </tr>
        </thead>

        <tbody>
          {sortedVendors.map((v) => {
            const ytd = ytdSpend[v.id] ?? 0;

            return (
              <tr key={v.id} style={{ opacity: v.is_active ? 1 : 0.5 }}>
                <Td>{v.name}</Td>
                <Td>{v.nick_name ?? ''}</Td>
                <Td>{v.tax_id ?? ''}</Td>
                <Td align="right">{formatMoney(ytd)}</Td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr>
            <Th>Total</Th>
            <Th></Th>
            <Th></Th>
            <Th align="right">{formatMoney(totalYtdSpend)}</Th>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function Th({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <th
      style={{
        borderBottom: '1px solid #ccc',
        textAlign: align,
        padding: '4px 6px',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
}) {
  return (
    <td
      style={{
        padding: '3px 6px',
        textAlign: align,
        borderBottom: '1px solid #f2f2f2',
        verticalAlign: 'top',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}
