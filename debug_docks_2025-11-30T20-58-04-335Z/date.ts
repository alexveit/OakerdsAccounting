// src/utils/date.ts

// Get today's local date as YYYY-MM-DD (no timezone shift)
export function todayLocalISO(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Format YYYY-MM-DD → M/D/YYYY for display
export function formatLocalDate(dateStr?: string | null): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return y && m && d ? `${Number(m)}/${Number(d)}/${y}` : dateStr;
}

// Day-of-year helper used for run-rate math
// - Past year: full-year days (365/366)
// - Current year: up to today
// - Future year: null (no run-rate)
export function getDayOfYearForYear(selectedYear: number): number | null {
  const today = new Date();
  const currentYear = today.getFullYear();

  if (selectedYear < currentYear) {
    const isLeap =
      (selectedYear % 4 === 0 && selectedYear % 100 !== 0) ||
      selectedYear % 400 === 0;
    return isLeap ? 366 : 365;
  }

  if (selectedYear > currentYear) return null;

  const startOfYear = new Date(selectedYear, 0, 1);
  const todayMidnight = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );

  const diffMs = todayMidnight.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
  return dayOfYear > 0 ? dayOfYear : null;
}
