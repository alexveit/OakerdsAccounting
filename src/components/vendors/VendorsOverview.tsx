import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { formatCurrency } from '../../utils/format';

type Vendor = {
  id: number;
  name: string;
  nick_name: string | null;
  tax_id: string | null;
  is_active: boolean;
  is_lender: boolean;
};

type VendorsOverviewProps = {
  onVendorSelect?: (vendorId: number) => void;
};

export function VendorsOverview({ onVendorSelect }: VendorsOverviewProps) {
  const currentYear = new Date().getFullYear();
  
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [spend, setSpend] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [year, setYear] = useState<number | 'all'>(currentYear);
  const [sortMode, setSortMode] = useState<'name' | 'spendDesc'>('spendDesc');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1) Load vendors including is_lender flag
        const { data: vendorsData, error: vendErr } = await supabase
          .from('vendors')
          .select('id, name, nick_name, tax_id, is_active, is_lender')
          .order('name', { ascending: true });

        if (vendErr) throw vendErr;

        const vendorsTyped: Vendor[] = ((vendorsData ?? []) as unknown as Vendor[]).map((v) => ({
          ...v,
          is_lender: v.is_lender ?? false,
        }));

        // 2) Load cleared spend grouped by vendor_id for selected year (or all time)
        let query = supabase
          .from('transaction_lines')
          .select(`
            vendor_id,
            amount,
            transactions!inner ( date )
          `)
          .eq('is_cleared', true)
          .not('vendor_id', 'is', null);

        if (year !== 'all') {
          const startDate = `${year}-01-01`;
          const endDate = `${year}-12-31`;
          query = query
            .gte('transactions.date', startDate)
            .lte('transactions.date', endDate);
        }

        const { data: linesData, error: linesErr } = await query;

        if (linesErr) throw linesErr;

        // Sum by vendor_id - use signed amounts to allow credits to reduce totals
        const spendMap: Record<number, number> = {};
        for (const line of linesData ?? []) {
          const vendorId = line.vendor_id as number;
          const amount = Number(line.amount) || 0;
          spendMap[vendorId] = (spendMap[vendorId] || 0) + amount;
        }

        setVendors(vendorsTyped);
        setSpend(spendMap);
        setLoading(false);
      } catch (err: unknown) {
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load vendors');
        setLoading(false);
      }
    }

    loadData();
  }, [year]);

  if (loading) return <p>Loading vendors...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (vendors.length === 0) return <p>No vendors found.</p>;

  // Separate lenders from vendors
  const allVendors = vendors.filter((v) => !v.is_lender);
  const allLenders = vendors.filter((v) => v.is_lender);

  // Filter by active status
  const filteredVendors = showInactive
    ? allVendors
    : allVendors.filter((v) => v.is_active);

  const filteredLenders = showInactive
    ? allLenders
    : allLenders.filter((v) => v.is_active);

  // Sort function
  const sortFn = (a: Vendor, b: Vendor) => {
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    const spendA = spend[a.id] ?? 0;
    const spendB = spend[b.id] ?? 0;

    if (sortMode === 'name') {
      return nameA.localeCompare(nameB);
    }
    return spendB - spendA;
  };

  const sortedVendors = [...filteredVendors].sort(sortFn);
  const sortedLenders = [...filteredLenders].sort(sortFn);

  // Calculate totals
  const totalVendorSpend = sortedVendors.reduce((sum, v) => sum + (spend[v.id] ?? 0), 0);
  const totalLenderSpend = sortedLenders.reduce((sum, v) => sum + (spend[v.id] ?? 0), 0);

  // Generate year options (current year down to 2020)
  const yearOptions = Array.from(
    { length: currentYear - 2019 },
    (_, i) => currentYear - i
  );

  const periodLabel = year === 'all' ? 'All Time' : year.toString();

  return (
    <div>
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
          <label style={{ fontSize: 13 }}>Year:</label>
          <select
            value={year}
            onChange={(e) => setYear(e.target.value === 'all' ? 'all' : Number(e.target.value))}
            style={{ padding: '0.25rem 0.5rem', fontSize: 13, width: 'auto' }}
          >
            <option value="all">All Time</option>
            {yearOptions.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label style={{ fontSize: 13 }}>Sort by:</label>
          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as 'name' | 'spendDesc')}
            style={{ padding: '0.25rem 0.5rem', fontSize: 13, width: 'auto' }}
          >
            <option value="name">Name (A to Z)</option>
            <option value="spendDesc">Spend (High to Low)</option>
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

      {/* Vendors Table */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Vendors</h3>
        <table className="table">
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th>Nickname</Th>
              <Th>Tax ID</Th>
              <Th align="right">{periodLabel} Spend</Th>
            </tr>
          </thead>

          <tbody>
            {sortedVendors.map((v) => {
              const vendorSpend = spend[v.id] ?? 0;

              return (
                <tr 
                  key={v.id} 
                  style={{ 
                    opacity: v.is_active ? 1 : 0.5,
                    cursor: onVendorSelect ? 'pointer' : 'default',
                  }}
                  onClick={() => onVendorSelect?.(v.id)}
                  title={onVendorSelect ? 'Click to edit' : undefined}
                >
                  <Td>{v.name}</Td>
                  <Td>{v.nick_name ?? ''}</Td>
                  <Td>{v.tax_id ?? ''}</Td>
                  <Td align="right">{formatCurrency(vendorSpend, 2)}</Td>
                </tr>
              );
            })}
          </tbody>

          <tfoot>
            <tr>
              <Th>Total Vendor Spend</Th>
              <Th>&nbsp;</Th>
              <Th>&nbsp;</Th>
              <Th align="right">{formatCurrency(totalVendorSpend, 2)}</Th>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Lenders Table */}
      {sortedLenders.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '0.75rem' }}>Lenders</h3>
          <table className="table">
            <thead>
              <tr>
                <Th>Lender</Th>
                <Th>Nickname</Th>
                <Th>Tax ID</Th>
                <Th align="right">{periodLabel} Paid</Th>
              </tr>
            </thead>

            <tbody>
              {sortedLenders.map((v) => {
                const lenderSpend = spend[v.id] ?? 0;

                return (
                  <tr 
                    key={v.id} 
                    style={{ 
                      opacity: v.is_active ? 1 : 0.5,
                      cursor: onVendorSelect ? 'pointer' : 'default',
                    }}
                    onClick={() => onVendorSelect?.(v.id)}
                    title={onVendorSelect ? 'Click to edit' : undefined}
                  >
                    <Td>{v.name}</Td>
                    <Td>{v.nick_name ?? ''}</Td>
                    <Td>{v.tax_id ?? ''}</Td>
                    <Td align="right">{formatCurrency(lenderSpend, 2)}</Td>
                  </tr>
                );
              })}
            </tbody>

            <tfoot>
              <tr>
                <Th>Total Lender Payments</Th>
                <Th>&nbsp;</Th>
                <Th>&nbsp;</Th>
                <Th align="right">{formatCurrency(totalLenderSpend, 2)}</Th>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
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
