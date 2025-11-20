import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

type Installer = {
  id: number;
  first_name: string;
  last_name: string | null;
  company_name: string | null;
  tax_id: string | null;
};

export function InstallersOverview() {
  const [installers, setInstallers] = useState<Installer[]>([]);
  const [ytdPaid, setYtdPaid] = useState<Record<number, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<"name" | "paidDesc">("paidDesc");

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);

      try {
        // 1) Load installers
        const { data: installersData, error: instErr } = await supabase
          .from("installers")
          .select("id, first_name, last_name, company_name, tax_id")
          .order("first_name", { ascending: true });

        if (instErr) throw instErr;

        const installersTyped: Installer[] = (installersData ?? []) as any[];

        // 2) Load cleared payments grouped by installer_id
        const { data: sumsData, error: sumsErr } = await supabase
          .from("installer_payments_view")
          .select("installer_id, ytd_cleared");

        if (sumsErr) throw sumsErr;

        const sumsMap: Record<number, number> = {};
        for (const row of sumsData ?? []) {
          sumsMap[row.installer_id] = row.ytd_cleared ?? 0;
        }

        setInstallers(installersTyped);
        setYtdPaid(sumsMap);
        setLoading(false);
      } catch (err: any) {
        console.error(err);
        setError(err.message ?? "Failed to load installers");
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) return <p>Loading installers…</p>;
  if (error) return <p style={{ color: "red" }}>Error: {error}</p>;
  if (installers.length === 0) return <p>No installers found.</p>;

  function formatMoney(value: number) {
    return value.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });
  }

  // apply sorting logic
  const sortedInstallers = [...installers].sort((a, b) => {
    const nameA = `${a.first_name} ${a.last_name ?? ""}`.toLowerCase();
    const nameB = `${b.first_name} ${b.last_name ?? ""}`.toLowerCase();
    const paidA = ytdPaid[a.id] ?? 0;
    const paidB = ytdPaid[b.id] ?? 0;

    if (sortMode === "name") {
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    }

    // paidDesc
    if (paidA > paidB) return -1;
    if (paidA < paidB) return 1;
    return 0;
  });

  return (
    <div className="card">
      <h2>Installers Overview</h2>

      {/* Sort Selector */}
      <div style={{ marginBottom: "1rem" }}>
        <label style={{ marginRight: "0.5rem" }}>Sort by:</label>
        <select
          value={sortMode}
          onChange={(e) =>
            setSortMode(e.target.value as "name" | "paidDesc")
          }
        >
          <option value="name">Name (A → Z)</option>
          <option value="paidDesc">Paid (High → Low)</option>
        </select>
      </div>

      <table className="table">
        <thead>
          <tr>
            <Th>Name</Th>
            <Th>Company</Th>
            <Th>Tax ID</Th>
            <Th align="right">YTD Paid (Cleared)</Th>
          </tr>
        </thead>

        <tbody>
          {sortedInstallers.map((i) => {
            const name = `${i.first_name} ${i.last_name ?? ""}`.trim();
            const ytd = ytdPaid[i.id] ?? 0;

            return (
              <tr key={i.id}>
                <Td>{name}</Td>
                <Td>{i.company_name ?? ""}</Td>
                <Td>{i.tax_id ?? ""}</Td>
                <Td align="right">{formatMoney(ytd)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <th
      style={{
        borderBottom: "1px solid #ccc",
        textAlign: align,
        padding: "4px 6px",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <td
      style={{
        padding: "3px 6px",
        textAlign: align,
        borderBottom: "1px solid #f2f2f2",
        verticalAlign: "top",
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </td>
  );
}
