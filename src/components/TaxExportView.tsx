import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import * as XLSX from 'xlsx';

type TaxYear = number;

type ScheduleCRow = {
  category: string;
  accountName: string;
  total: number;
};

type ContractorPayment = {
  installerId: number;
  firstName: string;
  lastName: string;
  companyName: string | null;
  taxId: string | null;
  address: string | null;
  totalPaid: number;
};

export function TaxExportView() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<TaxYear>(currentYear);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scheduleCIncome, setScheduleCIncome] = useState<ScheduleCRow[]>([]);
  const [scheduleCExpenses, setScheduleCExpenses] = useState<ScheduleCRow[]>([]);
  const [scheduleEIncome, setScheduleEIncome] = useState<ScheduleCRow[]>([]);
  const [scheduleEExpenses, setScheduleEExpenses] = useState<ScheduleCRow[]>([]);
  const [contractors, setContractors] = useState<ContractorPayment[]>([]);
  const [personalExpenses, setPersonalExpenses] = useState<ScheduleCRow[]>([]);

  useEffect(() => {
    loadTaxData();
  }, [year]);

  async function loadTaxData() {
    setLoading(true);
    setError(null);

    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const { data: linesData, error: linesErr } = await supabase
        .from('transaction_lines')
        .select(`
          id,
          account_id,
          amount,
          purpose,
          job_id,
          installer_id,
          accounts (name, code, account_types (name)),
          transactions!inner (date)
        `)
        .eq('is_cleared', true)
        .gte('transactions.date', startDate)
        .lte('transactions.date', endDate);


      if (linesErr) throw linesErr;

      const lines = (linesData ?? []) as any[];

      const schedCIncomeMap = new Map<number, ScheduleCRow>();
      const schedCExpenseMap = new Map<number, ScheduleCRow>();
      const schedEIncomeMap = new Map<number, ScheduleCRow>();
      const schedEExpenseMap = new Map<number, ScheduleCRow>();
      const personalExpenseMap = new Map<number, ScheduleCRow>();

      for (const line of lines) {
        const accType = line.accounts?.account_types?.name;
        const purpose = line.purpose ?? 'business';
        const accountId = line.account_id;
        const accountName = line.accounts?.name ?? 'Unknown';
        const amount = Math.abs(Number(line.amount) || 0);

        const codeStr: string = line.accounts?.code ?? '';
        const codeNum = Number(codeStr) || 0;

        // -----------------------------
        // INCOME
        // -----------------------------
        if (accType === 'income') {
          if (purpose === 'business' || purpose === 'mixed') {
            
            // Rental Income = 42000–42999
            if (codeNum >= 42000 && codeNum <= 42999) {
              let row = schedEIncomeMap.get(accountId);
              if (!row) {
                row = { category: 'Rental Income', accountName, total: 0 };
                schedEIncomeMap.set(accountId, row);
              }
              row.total += amount;

            } else {
              // Everything else is Schedule C (Job/business income)
              let row = schedCIncomeMap.get(accountId);
              if (!row) {
                row = { category: 'Business Income', accountName, total: 0 };
                schedCIncomeMap.set(accountId, row);
              }
              row.total += amount;
            }
          }
        }

        // -----------------------------
        // EXPENSES
        // -----------------------------
        else if (accType === 'expense') {

          if (purpose === 'business' || purpose === 'mixed') {

            // Rental Expenses = 62000–62999
            if (codeNum >= 62000 && codeNum <= 62999) {
              let row = schedEExpenseMap.get(accountId);
              if (!row) {
                row = { category: 'Rental Expense', accountName, total: 0 };
                schedEExpenseMap.set(accountId, row);
              }
              row.total += amount;

            } else {
              // Everything else is Schedule C
              let row = schedCExpenseMap.get(accountId);
              if (!row) {
                row = { category: 'Business Expense', accountName, total: 0 };
                schedCExpenseMap.set(accountId, row);
              }
              row.total += amount;
            }
          }

          // Personal section unchanged
          else if (purpose === 'personal') {
            let row = personalExpenseMap.get(accountId);
            if (!row) {
              row = { category: 'Personal Expense', accountName, total: 0 };
              personalExpenseMap.set(accountId, row);
            }
            row.total += amount;
          }
        }
      }


      const sortByTotal = (a: ScheduleCRow, b: ScheduleCRow) =>
        b.total - a.total;

      setScheduleCIncome(Array.from(schedCIncomeMap.values()).sort(sortByTotal));
      setScheduleCExpenses(Array.from(schedCExpenseMap.values()).sort(sortByTotal));
      setScheduleEIncome(Array.from(schedEIncomeMap.values()).sort(sortByTotal));
      setScheduleEExpenses(Array.from(schedEExpenseMap.values()).sort(sortByTotal));
      setPersonalExpenses(Array.from(personalExpenseMap.values()).sort(sortByTotal));

      await loadContractorPayments();

      setLoading(false);
    } catch (err: any) {
      console.error(err);
      setError(err.message ?? 'Failed to load tax data');
      setLoading(false);
    }
  }

  async function loadContractorPayments() {
    try {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const { data: paymentsData, error: paymentsErr } = await supabase
        .from('transaction_lines')
        .select(`
          amount,
          installer_id,
          installers (first_name, last_name, company_name, tax_id, address),
          transactions!inner (date)
        `)
        .eq('is_cleared', true)
        .not('installer_id', 'is', null)
        .gte('transactions.date', startDate)
        .lte('transactions.date', endDate);

      if (paymentsErr) throw paymentsErr;

      const payments = (paymentsData ?? []) as any[];
      const contractorMap = new Map<number, ContractorPayment>();

      for (const payment of payments) {
        const installerId = payment.installer_id;
        const amount = Math.abs(Number(payment.amount) || 0);

        let contractor = contractorMap.get(installerId);
        if (!contractor) {
          const installer = payment.installers;
          contractor = {
            installerId,
            firstName: installer?.first_name ?? '',
            lastName: installer?.last_name ?? '',
            companyName: installer?.company_name ?? null,
            taxId: installer?.tax_id ?? null,
            address: installer?.address ?? null,
            totalPaid: 0,
          };
          contractorMap.set(installerId, contractor);
        }

        contractor.totalPaid += amount;
      }

      const contractorList = Array.from(contractorMap.values())
        .filter((c) => c.totalPaid >= 600)
        .sort((a, b) => b.totalPaid - a.totalPaid);

      setContractors(contractorList);
    } catch (err: any) {
      console.error('Error loading contractor payments:', err);
    }
  }

  function generateExcelWorkbook() {
    const wb = XLSX.utils.book_new();

    // Schedule C Income Sheet
    if (scheduleCIncome.length > 0) {
      const schedCIncomeData = [
        [`Schedule C - Business Income (Tax Year ${year})`],
        [],
        ['Account', 'Total'],
        ...scheduleCIncome.map((r) => [r.accountName, r.total]),
        [],
        ['TOTAL', scheduleCIncome.reduce((s, r) => s + r.total, 0)],
      ];
      const ws1 = XLSX.utils.aoa_to_sheet(schedCIncomeData);
      XLSX.utils.book_append_sheet(wb, ws1, 'Sched C Income');
    }

    // Schedule C Expenses Sheet
    if (scheduleCExpenses.length > 0) {
      const schedCExpenseData = [
        [`Schedule C - Business Expenses (Tax Year ${year})`],
        [],
        ['Account', 'Total'],
        ...scheduleCExpenses.map((r) => [r.accountName, r.total]),
        [],
        ['TOTAL', scheduleCExpenses.reduce((s, r) => s + r.total, 0)],
      ];
      const ws2 = XLSX.utils.aoa_to_sheet(schedCExpenseData);
      XLSX.utils.book_append_sheet(wb, ws2, 'Sched C Expenses');
    }

    // Schedule E Income Sheet
    if (scheduleEIncome.length > 0) {
      const schedEIncomeData = [
        [`Schedule E - Rental Income (Tax Year ${year})`],
        [],
        ['Account', 'Total'],
        ...scheduleEIncome.map((r) => [r.accountName, r.total]),
        [],
        ['TOTAL', scheduleEIncome.reduce((s, r) => s + r.total, 0)],
      ];
      const ws3 = XLSX.utils.aoa_to_sheet(schedEIncomeData);
      XLSX.utils.book_append_sheet(wb, ws3, 'Sched E Income');
    }

    // Schedule E Expenses Sheet
    if (scheduleEExpenses.length > 0) {
      const schedEExpenseData = [
        [`Schedule E - Rental Expenses (Tax Year ${year})`],
        [],
        ['Account', 'Total'],
        ...scheduleEExpenses.map((r) => [r.accountName, r.total]),
        [],
        ['TOTAL', scheduleEExpenses.reduce((s, r) => s + r.total, 0)],
      ];
      const ws4 = XLSX.utils.aoa_to_sheet(schedEExpenseData);
      XLSX.utils.book_append_sheet(wb, ws4, 'Sched E Expenses');
    }

    // 1099 Contractors Sheet
    if (contractors.length > 0) {
      const contractorData = [
        [`1099-NEC Contractor Report (Tax Year ${year})`],
        [`Threshold: $600 or more`],
        [],
        ['First Name', 'Last Name', 'Company Name', 'Tax ID', 'Address', 'Total Paid'],
        ...contractors.map((c) => [
          c.firstName,
          c.lastName ?? '',
          c.companyName ?? '',
          c.taxId ?? '',
          c.address ?? '',
          c.totalPaid,
        ]),
        [],
        ['', '', '', '', 'TOTAL', contractors.reduce((s, c) => s + c.totalPaid, 0)],
      ];
      const ws5 = XLSX.utils.aoa_to_sheet(contractorData);
      XLSX.utils.book_append_sheet(wb, ws5, '1099 Contractors');
    }

    // Personal Expenses Sheet
    if (personalExpenses.length > 0) {
      const personalData = [
        [`Personal Expenses - Potential Itemized Deductions (Tax Year ${year})`],
        [],
        ['Account', 'Total'],
        ...personalExpenses.map((r) => [r.accountName, r.total]),
        [],
        ['TOTAL', personalExpenses.reduce((s, r) => s + r.total, 0)],
      ];
      const ws6 = XLSX.utils.aoa_to_sheet(personalData);
      XLSX.utils.book_append_sheet(wb, ws6, 'Personal Expenses');
    }

    return wb;
  }

  function handleDownloadAll() {
    const wb = generateExcelWorkbook();
    XLSX.writeFile(wb, `Oakerds_Tax_Report_${year}.xlsx`);
  }

  const currency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  const btnStyle: React.CSSProperties = {
    padding: '0.75rem 1.5rem',
    borderRadius: 8,
    border: '2px solid #111',
    background: '#111',
    color: '#fff',
    cursor: 'pointer',
    fontSize: 16,
    fontWeight: 600,
  };

  if (loading) return <p>Loading tax data…</p>;
  if (error) return <p style={{ color: 'red' }}>Error: {error}</p>;

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <h2 style={{ margin: 0 }}>Tax Season Exports</h2>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: 14 }}>Tax Year:</span>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value) || currentYear)}
              style={{ width: 80, padding: '4px 6px' }}
            />
          </label>
        </div>

        <button type="button" onClick={handleDownloadAll} style={btnStyle}>
          📥 Download Complete Tax Report
        </button>
      </div>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {/* Schedule C - Business Income/Expenses */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
            Schedule C (Profit or Loss from Business)
          </h3>

          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: 15, marginBottom: '0.5rem' }}>
              Business Income - {currency(scheduleCIncome.reduce((s, r) => s + r.total, 0))}
            </h4>
            {scheduleCIncome.length === 0 && (
              <p style={{ fontSize: 13, color: '#777' }}>No business income for {year}.</p>
            )}
            {scheduleCIncome.length > 0 && <ReportTable rows={scheduleCIncome} />}
          </div>

          <div>
            <h4 style={{ fontSize: 15, marginBottom: '0.5rem' }}>
              Business Expenses - {currency(scheduleCExpenses.reduce((s, r) => s + r.total, 0))}
            </h4>
            {scheduleCExpenses.length === 0 && (
              <p style={{ fontSize: 13, color: '#777' }}>No business expenses for {year}.</p>
            )}
            {scheduleCExpenses.length > 0 && <ReportTable rows={scheduleCExpenses} />}
          </div>
        </div>

        {/* Schedule E - Rental Income/Expenses */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
            Schedule E (Supplemental Income - Rental Property)
          </h3>

          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: 15, marginBottom: '0.5rem' }}>
              Rental Income - {currency(scheduleEIncome.reduce((s, r) => s + r.total, 0))}
            </h4>
            {scheduleEIncome.length === 0 && (
              <p style={{ fontSize: 13, color: '#777' }}>No rental income for {year}.</p>
            )}
            {scheduleEIncome.length > 0 && <ReportTable rows={scheduleEIncome} />}
          </div>

          <div>
            <h4 style={{ fontSize: 15, marginBottom: '0.5rem' }}>
              Rental Expenses - {currency(scheduleEExpenses.reduce((s, r) => s + r.total, 0))}
            </h4>
            {scheduleEExpenses.length === 0 && (
              <p style={{ fontSize: 13, color: '#777' }}>No rental expenses for {year}.</p>
            )}
            {scheduleEExpenses.length > 0 && <ReportTable rows={scheduleEExpenses} />}
          </div>
        </div>

        {/* 1099-NEC Contractors */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
            1099-NEC Contractor Payments ($600+ threshold)
          </h3>
          {contractors.length === 0 && (
            <p style={{ fontSize: 13, color: '#777' }}>
              No contractors paid $600 or more in {year}.
            </p>
          )}
          {contractors.length > 0 && (
            <>
              <p style={{ fontSize: 13, color: '#555', marginBottom: '0.5rem' }}>
                {contractors.length} contractor{contractors.length === 1 ? '' : 's'} requiring 1099-NEC forms.
                Total paid: {currency(contractors.reduce((s, c) => s + c.totalPaid, 0))}
              </p>
              <ContractorTable contractors={contractors} />
            </>
          )}
        </div>

        {/* Personal Expenses (Itemized Deductions) */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
            Personal Expenses (Potential Itemized Deductions)
          </h3>
          {personalExpenses.length === 0 && (
            <p style={{ fontSize: 13, color: '#777' }}>
              No personal expenses recorded for {year}.
            </p>
          )}
          {personalExpenses.length > 0 && (
            <>
              <p style={{ fontSize: 13, color: '#555', marginBottom: '0.5rem' }}>
                Total: {currency(personalExpenses.reduce((s, r) => s + r.total, 0))}
              </p>
              <ReportTable rows={personalExpenses} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReportTable({ rows }: { rows: ScheduleCRow[] }) {
  const currency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    borderBottom: '1px solid #ccc',
    padding: '4px 6px',
  };

  const tdStyle: React.CSSProperties = {
    padding: '4px 6px',
    borderBottom: '1px solid #eee',
  };

  return (
    <table className="table">
      <thead>
        <tr>
          <th style={thStyle}>Account</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, idx) => (
          <tr key={idx}>
            <td style={tdStyle}>{row.accountName}</td>
            <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(row.total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ContractorTable({ contractors }: { contractors: ContractorPayment[] }) {
  const currency = (value: number) =>
    value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    });

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    borderBottom: '1px solid #ccc',
    padding: '4px 6px',
    whiteSpace: 'nowrap',
  };

  const tdStyle: React.CSSProperties = {
    padding: '4px 6px',
    borderBottom: '1px solid #eee',
  };

  return (
    <table className="table">
      <thead>
        <tr>
          <th style={thStyle}>Name</th>
          <th style={thStyle}>Company</th>
          <th style={thStyle}>Tax ID</th>
          <th style={thStyle}>Address</th>
          <th style={{ ...thStyle, textAlign: 'right' }}>Total Paid</th>
        </tr>
      </thead>
      <tbody>
        {contractors.map((c) => {
          const name = `${c.firstName} ${c.lastName}`.trim();
          return (
            <tr key={c.installerId}>
              <td style={tdStyle}>{name}</td>
              <td style={tdStyle}>{c.companyName ?? ''}</td>
              <td style={tdStyle}>{c.taxId ?? ''}</td>
              <td style={tdStyle}>{c.address ?? ''}</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>{currency(c.totalPaid)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}