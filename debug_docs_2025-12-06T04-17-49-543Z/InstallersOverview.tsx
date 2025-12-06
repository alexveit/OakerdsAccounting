import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/format';

type Installer = {
  id: number;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  tax_id: string | null;
  is_active: boolean;
};

export function InstallersOverview() {
  const currentYear = new Date().getFullYear();

  const [installers, setInstallers] = useState<Installer[]>([]);
  const [paid, setPaid] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [year, setYear] = useState<number | 'all'>(currentYear);
  const [sortMode, setSortMode] = useState<'name' | 'paidDesc'>('paidDesc');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1) Load installers
        const { data: installersData, error: instErr } = await supabase
          .from('installers')
          .select('id, first_name, last_name, company_name, tax_id, is_active')
          .order('first_name', { ascending: true });

        if (instErr) throw instErr;

        const installersTyped: Installer[] = (installersData ?? []) as Installer[];

        // 2) Load cleared payments grouped by installer_id for selected year (or all time)
        let query = supabase
          .from('transaction_lines')
          .select(`
            installer_id,
            amount,
            transactions!inner ( date )
          `)
          .eq('is_cleared', true)
          .not('installer_id', 'is', null);

        if (year !== 'all') {
          const startDate = `${year}-01-01`;
          const endDate = `${year}-12-31`;
          query = query
            .gte('transactions.date', startDate)
            .lte('transactions.date', endDate);
        }

        const { data: linesData, error: linesErr } = await query;

        if (linesErr) throw linesErr;

        // Sum by installer_id (amounts are typically negative for expenses, so we use abs)
        const paidMap: Record<number, number> = {};
        for (const line of linesData ?? []) {
          const installerId = line.installer_id as number;
          const amount = Number(line.amount) || 0;
          paidMap[installerId] = (paidMap[installerId] || 0) + amount;
        }

        setInstallers(installersTyped);
        setPaid(paidMap);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? 'Failed to load installers');
        setLoading(false);
      }
    }

    loadData();
  }, [year]);

  if (loading) return <p>Loading installers...</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;
  if (installers.length === 0) return <p>No installers found.</p>;

  // Filter and sort
  const filteredInstallers = showInactive
    ? installers
    : installers.filter((i) => i.is_active);

  const sortedInstallers = [...filteredInstallers].sort((a, b) => {
    const nameA = `${a.first_name} ${a.last_name ?? ''}`.toLowerCase();
    const nameB = `${b.first_name} ${b.last_name ?? ''}`.toLowerCase();
    const paidA = paid[a.id] ?? 0;
    const paidB = paid[b.id] ?? 0;

    if (sortMode === 'name') {
      return nameA.localeCompare(nameB);
    }

    // paidDesc
    return paidB - paidA;
  });

  // Calculate total paid for filtered installers
  const totalPaid = sortedInstallers.reduce((sum, i) => sum + (paid[i.id] ?? 0), 0);

  // Generate year options (current year down to 2020)
  const yearOptions = Array.from(
    { length: currentYear - 2019 },
    (_, i) => currentYear - i
  );

  const periodLabel = year === 'all' ? 'All Time' : year.toString();

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
            onChange={(e) => setSortMode(e.target.value as 'name' | 'paidDesc')}
            style={{ padding: '0.25rem 0.5rem', fontSize: 13, width: 'auto' }}
          >
            <option value="name">Name (A to Z)</option>
            <option value="paidDesc">Paid (High to Low)</option>
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
            <Th>Name</Th>
            <Th>Company</Th>
            <Th>Tax ID</Th>
            <Th align="right">{periodLabel} Paid (Cleared)</Th>
          </tr>
        </thead>

        <tbody>
          {sortedInstallers.map((i) => {
            const name = `${i.first_name} ${i.last_name ?? ''}`.trim();
            const installerPaid = paid[i.id] ?? 0;

            return (
              <tr key={i.id} style={{ opacity: i.is_active ? 1 : 0.5 }}>
                <Td>{name}</Td>
                <Td>{i.company_name ?? ''}</Td>
                <Td>{i.tax_id ?? ''}</Td>
                <Td align="right">{formatCurrency(installerPaid, 2)}</Td>
              </tr>
            );
          })}
        </tbody>

        <tfoot>
          <tr>
            <Th>Total</Th>
            <Th></Th>
            <Th></Th>
            <Th align="right">{formatCurrency(totalPaid, 2)}</Th>
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
