import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { formatCurrency } from '../utils/format';
import { isRentalIncomeCode, isRealEstateExpenseCode } from '../utils/accounts';
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
        const code = line.accounts?.code ?? '';

        // INCOME
        if (accType === 'income') {
          if (purpose === 'business' || purpose === 'mixed') {
            if (isRentalIncomeCode(code)) {
              let row = schedEIncomeMap.get(accountId);
              if (!row) {
                row = { category: 'Rental Income', accountName, total: 0 };
                schedEIncomeMap.set(accountId, row);
              }
              row.total += amount;
            } else {
              let row = schedCIncomeMap.get(accountId);
              if (!row) {
                row = { category: 'Business Income', accountName, total: 0 };
                schedCIncomeMap.set(accountId, row);
              }
              row.total += amount;
            }
          }
        }

        // EXPENSES
        else if (accType === 'expense') {
          if (purpose === 'business' || purpose === 'mixed') {
            if (isRealEstateExpenseCode(code)) {
              let row = schedEExpenseMap.get(accountId);
              if (!row) {
                row = { category: 'Rental Expense', accountName, total: 0 };
                schedEExpenseMap.set(accountId, row);
              }
              row.total += amount;
            } else {
              let row = schedCExpenseMap.get(accountId);
              if (!row) {
                row = { category: 'Business Expense', accountName, total: 0 };
                schedCExpenseMap.set(accountId, row);
              }
              row.total += amount;
            }
          } else if (purpose === 'personal') {
            let row = personalExpenseMap.get(accountId);
            if (!row) {
              row = { category: 'Personal Expense', accountName, total: 0 };
              personalExpenseMap.set(accountId, row);
            }
            row.total += amount;
          }
        }
      }

      const sortByTotal = (a: ScheduleCRow, b: ScheduleCRow) => b.total - a.total;

      setScheduleCIncome(Array.from(schedCIncomeMap.values()).sort(sortByTotal));
      setScheduleCExpenses(Array.from(schedCExpenseMap.values()).sort(sortByTotal));
      setScheduleEIncome(Array.from(schedEIncomeMap.values()).sort(sortByTotal));
      setScheduleEExpenses(Array.from(schedEExpenseMap.values()).sort(sortByTotal));
      setPersonalExpenses(Array.from(personalExpenseMap.values()).sort(sortByTotal));

      await loadContractorPayments();

      setLoading(false);
    } catch (err: unknown) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Failed to load tax data');
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
    } catch (err: unknown) {
      console.error('Error loading contractor payments:', err);
    }
  }

  function generateExcelWorkbook() {
    const wb = XLSX.utils.book_new();
    const data: (string | number | null)[][] = [];

    let row = 1;

    const refs = {
      schedCIncomeTotal: '',
      schedCExpenseTotal: '',
      schedCNet: '',
      schedEIncomeTotal: '',
      schedEExpenseTotal: '',
      schedENet: '',
      personalTotal: '',
      contractorTotal: '',
      schedCIncomeStart: 0,
      schedCIncomeEnd: 0,
      schedCExpenseStart: 0,
      schedCExpenseEnd: 0,
      schedEIncomeStart: 0,
      schedEIncomeEnd: 0,
      schedEExpenseStart: 0,
      schedEExpenseEnd: 0,
      personalStart: 0,
      personalEnd: 0,
      contractorStart: 0,
      contractorEnd: 0,
    };

    const summaryRows = {
      schedCIncome: 0,
      schedCExpense: 0,
      schedCNet: 0,
      schedEIncome: 0,
      schedEExpense: 0,
      schedENet: 0,
      personal: 0,
      contractor: 0,
    };

    // Header
    data.push([`OAKERDS TAX REPORT - TAX YEAR ${year}`]);
    row++;
    data.push([`Generated: ${new Date().toLocaleDateString()}`]);
    row++;
    data.push([]);
    row++;

    // SUMMARY SECTION
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push(['SUMMARY']);
    row++;
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push([]);
    row++;

    data.push(['Schedule C (Business)', '', 'Amount']);
    row++;
    summaryRows.schedCIncome = row;
    data.push(['  Gross Income', '', null]);
    row++;
    summaryRows.schedCExpense = row;
    data.push(['  Total Expenses', '', null]);
    row++;
    summaryRows.schedCNet = row;
    data.push(['  Net Profit/Loss', '', null]);
    row++;
    data.push([]);
    row++;

    data.push(['Schedule E (Rental)', '', 'Amount']);
    row++;
    summaryRows.schedEIncome = row;
    data.push(['  Gross Income', '', null]);
    row++;
    summaryRows.schedEExpense = row;
    data.push(['  Total Expenses', '', null]);
    row++;
    summaryRows.schedENet = row;
    data.push(['  Net Profit/Loss', '', null]);
    row++;
    data.push([]);
    row++;

    summaryRows.personal = row;
    data.push(['Personal Expenses', '', null]);
    row++;
    summaryRows.contractor = row;
    data.push(['1099-NEC Contractors', '', null]);
    row++;
    data.push([]);
    row++;

    // SCHEDULE C - BUSINESS INCOME
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push(['SCHEDULE C - BUSINESS INCOME']);
    row++;
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push([]);
    row++;

    if (scheduleCIncome.length > 0) {
      data.push(['Account', '', 'Amount']);
      row++;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.schedCIncomeStart = row;
      for (const item of scheduleCIncome) {
        data.push([item.accountName, '', item.total]);
        row++;
      }
      refs.schedCIncomeEnd = row - 1;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.schedCIncomeTotal = `C${row}`;
      data.push(['TOTAL BUSINESS INCOME', '', null]);
      row++;
    } else {
      data.push(['No business income recorded for this year.']);
      row++;
    }
    data.push([]);
    row++;

    // SCHEDULE C - BUSINESS EXPENSES
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push(['SCHEDULE C - BUSINESS EXPENSES']);
    row++;
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push([]);
    row++;

    if (scheduleCExpenses.length > 0) {
      data.push(['Account', '', 'Amount']);
      row++;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.schedCExpenseStart = row;
      for (const item of scheduleCExpenses) {
        data.push([item.accountName, '', item.total]);
        row++;
      }
      refs.schedCExpenseEnd = row - 1;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.schedCExpenseTotal = `C${row}`;
      data.push(['TOTAL BUSINESS EXPENSES', '', null]);
      row++;
      data.push([]);
      row++;
      refs.schedCNet = `C${row}`;
      data.push(['SCHEDULE C NET PROFIT/LOSS', '', null]);
      row++;
    } else {
      data.push(['No business expenses recorded for this year.']);
      row++;
    }
    data.push([]);
    row++;

    // SCHEDULE E - RENTAL INCOME
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push(['SCHEDULE E - RENTAL INCOME']);
    row++;
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push([]);
    row++;

    if (scheduleEIncome.length > 0) {
      data.push(['Account', '', 'Amount']);
      row++;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.schedEIncomeStart = row;
      for (const item of scheduleEIncome) {
        data.push([item.accountName, '', item.total]);
        row++;
      }
      refs.schedEIncomeEnd = row - 1;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.schedEIncomeTotal = `C${row}`;
      data.push(['TOTAL RENTAL INCOME', '', null]);
      row++;
    } else {
      data.push(['No rental income recorded for this year.']);
      row++;
    }
    data.push([]);
    row++;

    // SCHEDULE E - RENTAL EXPENSES
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push(['SCHEDULE E - RENTAL EXPENSES']);
    row++;
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push([]);
    row++;

    if (scheduleEExpenses.length > 0) {
      data.push(['Account', '', 'Amount']);
      row++;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.schedEExpenseStart = row;
      for (const item of scheduleEExpenses) {
        data.push([item.accountName, '', item.total]);
        row++;
      }
      refs.schedEExpenseEnd = row - 1;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.schedEExpenseTotal = `C${row}`;
      data.push(['TOTAL RENTAL EXPENSES', '', null]);
      row++;
      data.push([]);
      row++;
      refs.schedENet = `C${row}`;
      data.push(['SCHEDULE E NET PROFIT/LOSS', '', null]);
      row++;
    } else {
      data.push(['No rental expenses recorded for this year.']);
      row++;
    }
    data.push([]);
    row++;

    // PERSONAL EXPENSES
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push(['PERSONAL EXPENSES (POTENTIAL ITEMIZED DEDUCTIONS)']);
    row++;
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push([]);
    row++;

    if (personalExpenses.length > 0) {
      data.push(['Account', '', 'Amount']);
      row++;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.personalStart = row;
      for (const item of personalExpenses) {
        data.push([item.accountName, '', item.total]);
        row++;
      }
      refs.personalEnd = row - 1;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.personalTotal = `C${row}`;
      data.push(['TOTAL PERSONAL EXPENSES', '', null]);
      row++;
    } else {
      data.push(['No personal expenses recorded for this year.']);
      row++;
    }
    data.push([]);
    row++;

    // 1099-NEC CONTRACTORS
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push(['1099-NEC CONTRACTOR PAYMENTS ($600+ THRESHOLD)']);
    row++;
    data.push(['═══════════════════════════════════════════════════════════════']);
    row++;
    data.push([]);
    row++;

    if (contractors.length > 0) {
      data.push(['Name', 'Company', 'Tax ID', 'Address', 'Total Paid']);
      row++;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.contractorStart = row;
      for (const c of contractors) {
        const name = `${c.firstName} ${c.lastName}`.trim();
        data.push([name, c.companyName ?? '', c.taxId ?? '', c.address ?? '', c.totalPaid]);
        row++;
      }
      refs.contractorEnd = row - 1;
      data.push(['───────────────────────────────────────────────────────────────']);
      row++;
      refs.contractorTotal = `E${row}`;
      data.push(['TOTAL 1099 PAYMENTS', '', '', '', null]);
      row++;
      data.push([]);
      row++;
      data.push([`${contractors.length} contractor(s) requiring 1099-NEC forms`]);
    } else {
      data.push(['No contractors paid $600 or more this year.']);
    }

    const ws = XLSX.utils.aoa_to_sheet(data);

    // Add formulas
    if (refs.schedCIncomeTotal && refs.schedCIncomeStart) {
      ws[refs.schedCIncomeTotal] = { t: 's', f: `SUM(C${refs.schedCIncomeStart}:C${refs.schedCIncomeEnd})` };
    }
    if (refs.schedCExpenseTotal && refs.schedCExpenseStart) {
      ws[refs.schedCExpenseTotal] = { t: 's', f: `SUM(C${refs.schedCExpenseStart}:C${refs.schedCExpenseEnd})` };
    }
    if (refs.schedCNet && refs.schedCIncomeTotal && refs.schedCExpenseTotal) {
      ws[refs.schedCNet] = { t: 's', f: `${refs.schedCIncomeTotal}-${refs.schedCExpenseTotal}` };
    }
    if (refs.schedEIncomeTotal && refs.schedEIncomeStart) {
      ws[refs.schedEIncomeTotal] = { t: 's', f: `SUM(C${refs.schedEIncomeStart}:C${refs.schedEIncomeEnd})` };
    }
    if (refs.schedEExpenseTotal && refs.schedEExpenseStart) {
      ws[refs.schedEExpenseTotal] = { t: 's', f: `SUM(C${refs.schedEExpenseStart}:C${refs.schedEExpenseEnd})` };
    }
    if (refs.schedENet && refs.schedEIncomeTotal && refs.schedEExpenseTotal) {
      ws[refs.schedENet] = { t: 's', f: `${refs.schedEIncomeTotal}-${refs.schedEExpenseTotal}` };
    }
    if (refs.personalTotal && refs.personalStart) {
      ws[refs.personalTotal] = { t: 's', f: `SUM(C${refs.personalStart}:C${refs.personalEnd})` };
    }
    if (refs.contractorTotal && refs.contractorStart) {
      ws[refs.contractorTotal] = { t: 's', f: `SUM(E${refs.contractorStart}:E${refs.contractorEnd})` };
    }

    // Summary formulas
    if (refs.schedCIncomeTotal) {
      ws[`C${summaryRows.schedCIncome}`] = { t: 's', f: refs.schedCIncomeTotal };
    }
    if (refs.schedCExpenseTotal) {
      ws[`C${summaryRows.schedCExpense}`] = { t: 's', f: refs.schedCExpenseTotal };
    }
    if (refs.schedCNet) {
      ws[`C${summaryRows.schedCNet}`] = { t: 's', f: refs.schedCNet };
    }
    if (refs.schedEIncomeTotal) {
      ws[`C${summaryRows.schedEIncome}`] = { t: 's', f: refs.schedEIncomeTotal };
    }
    if (refs.schedEExpenseTotal) {
      ws[`C${summaryRows.schedEExpense}`] = { t: 's', f: refs.schedEExpenseTotal };
    }
    if (refs.schedENet) {
      ws[`C${summaryRows.schedENet}`] = { t: 's', f: refs.schedENet };
    }
    if (refs.personalTotal) {
      ws[`C${summaryRows.personal}`] = { t: 's', f: refs.personalTotal };
    }
    if (refs.contractorTotal) {
      ws[`C${summaryRows.contractor}`] = { t: 's', f: refs.contractorTotal };
    }

    ws['!cols'] = [
      { wch: 40 },
      { wch: 20 },
      { wch: 15 },
      { wch: 30 },
      { wch: 15 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, `Tax Report ${year}`);
    return wb;
  }

  function handleDownloadAll() {
    const wb = generateExcelWorkbook();
    XLSX.writeFile(wb, `Oakerds_Tax_Report_${year}.xlsx`);
  }

  const currency = (val: number) => formatCurrency(val, 2);

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

  const schedCIncomeTotal = scheduleCIncome.reduce((s, r) => s + r.total, 0);
  const schedCExpenseTotal = scheduleCExpenses.reduce((s, r) => s + r.total, 0);
  const schedCNet = schedCIncomeTotal - schedCExpenseTotal;

  const schedEIncomeTotal = scheduleEIncome.reduce((s, r) => s + r.total, 0);
  const schedEExpenseTotal = scheduleEExpenses.reduce((s, r) => s + r.total, 0);
  const schedENet = schedEIncomeTotal - schedEExpenseTotal;

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
        {/* Schedule C */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
            Schedule C (Profit or Loss from Business)
          </h3>

          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: 15, marginBottom: '0.5rem' }}>
              Business Income - {currency(schedCIncomeTotal)}
            </h4>
            {scheduleCIncome.length === 0 && (
              <p style={{ fontSize: 13, color: '#777' }}>No business income for {year}.</p>
            )}
            {scheduleCIncome.length > 0 && <ReportTable rows={scheduleCIncome} />}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ fontSize: 15, marginBottom: '0.5rem' }}>
              Business Expenses - {currency(schedCExpenseTotal)}
            </h4>
            {scheduleCExpenses.length === 0 && (
              <p style={{ fontSize: 13, color: '#777' }}>No business expenses for {year}.</p>
            )}
            {scheduleCExpenses.length > 0 && <ReportTable rows={scheduleCExpenses} />}
          </div>

          <div
            style={{
              borderTop: '2px solid #ccc',
              paddingTop: '0.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            <span>Schedule C Net Profit/Loss:</span>
            <span style={{ color: schedCNet >= 0 ? '#0a7a3c' : '#b00020' }}>
              {currency(schedCNet)}
            </span>
          </div>
        </div>

        {/* Schedule E */}
        <div className="card">
          <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>
            Schedule E (Supplemental Income - Rental Property)
          </h3>

          <div style={{ marginBottom: '1.5rem' }}>
            <h4 style={{ fontSize: 15, marginBottom: '0.5rem' }}>
              Rental Income - {currency(schedEIncomeTotal)}
            </h4>
            {scheduleEIncome.length === 0 && (
              <p style={{ fontSize: 13, color: '#777' }}>No rental income for {year}.</p>
            )}
            {scheduleEIncome.length > 0 && <ReportTable rows={scheduleEIncome} />}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <h4 style={{ fontSize: 15, marginBottom: '0.5rem' }}>
              Rental Expenses - {currency(schedEExpenseTotal)}
            </h4>
            {scheduleEExpenses.length === 0 && (
              <p style={{ fontSize: 13, color: '#777' }}>No rental expenses for {year}.</p>
            )}
            {scheduleEExpenses.length > 0 && <ReportTable rows={scheduleEExpenses} />}
          </div>

          <div
            style={{
              borderTop: '2px solid #ccc',
              paddingTop: '0.75rem',
              display: 'flex',
              justifyContent: 'space-between',
              fontWeight: 600,
              fontSize: 15,
            }}
          >
            <span>Schedule E Net Profit/Loss:</span>
            <span style={{ color: schedENet >= 0 ? '#0a7a3c' : '#b00020' }}>
              {currency(schedENet)}
            </span>
          </div>
        </div>

        {/* Personal Expenses */}
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
      </div>
    </div>
  );
}

function ReportTable({ rows }: { rows: ScheduleCRow[] }) {
  const currency = (value: number) => formatCurrency(value, 2);

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
  const currency = (value: number) => formatCurrency(value, 2);

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