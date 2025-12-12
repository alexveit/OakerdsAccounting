// src/utils/mortgageAmortization.ts

export type PaymentFrequency = 'monthly' | 'semimonthly' | 'biweekly';

export type MortgageParams = {
  originalLoanAmount: number;
  annualRatePercent: number;  // e.g. 7.125
  termMonths: number;         // e.g. 360 (still stored as months for compatibility)
  startDate: string;          // ISO "YYYY-MM-DD" (close_date) - used as fallback
  firstPaymentDate?: string;  // ISO "YYYY-MM-DD" - the actual first payment due date
  paymentFrequency?: PaymentFrequency; // defaults to 'monthly'
};

export type MortgageSplit = {
  principal: number;
  interest: number;
  escrowTaxes: number;
  escrowInsurance: number;
  totalPayment: number;
};

/**
 * Get the number of payments per year for a given frequency
 */
function getPeriodsPerYear(frequency: PaymentFrequency): number {
  switch (frequency) {
    case 'biweekly': return 26;
    case 'semimonthly': return 24;
    case 'monthly':
    default: return 12;
  }
}

/**
 * Convert term in months to total number of payments for the frequency
 */
function getTotalPayments(termMonths: number, frequency: PaymentFrequency): number {
  const periodsPerYear = getPeriodsPerYear(frequency);
  const years = termMonths / 12;
  return Math.round(years * periodsPerYear);
}

/**
 * Calculate days between two dates
 */
function daysBetween(startISO: string, endISO: string): number {
  const start = new Date(startISO + 'T00:00:00');
  const end = new Date(endISO + 'T00:00:00');
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculate payment index for bi-weekly payments (every 14 days)
 */
function getBiweeklyPaymentIndex(firstPaymentISO: string, paymentDateISO: string): number {
  const days = daysBetween(firstPaymentISO, paymentDateISO);
  if (days < 0) return 0;
  return Math.floor(days / 14);
}

/**
 * Calculate payment index for semi-monthly payments (1st & 15th, or based on first payment)
 * Counts how many semi-monthly periods have elapsed since first payment
 */
function getSemimonthlyPaymentIndex(firstPaymentISO: string, paymentDateISO: string): number {
  const firstDate = new Date(firstPaymentISO + 'T00:00:00');
  const payDate = new Date(paymentDateISO + 'T00:00:00');
  
  if (payDate < firstDate) return 0;
  
  // Determine if first payment is in first half (day 1-14) or second half (day 15+)
  const firstDay = firstDate.getDate();
  const firstIsFirstHalf = firstDay < 15;
  
  // Count full months difference
  const yearDiff = payDate.getFullYear() - firstDate.getFullYear();
  const monthDiff = payDate.getMonth() - firstDate.getMonth();
  const totalMonths = yearDiff * 12 + monthDiff;
  
  // Each full month = 2 payments
  let index = totalMonths * 2;
  
  // Adjust for position within month
  const payDay = payDate.getDate();
  const payIsFirstHalf = payDay < 15;
  
  if (firstIsFirstHalf) {
    // First payment was in first half (e.g., 1st)
    // Payments are: 1st (index 0), 15th (index 1), next 1st (index 2), etc.
    if (!payIsFirstHalf) {
      // We're in the second half, add 1 for the mid-month payment
      index += 1;
    }
  } else {
    // First payment was in second half (e.g., 15th)
    // Payments are: 15th (index 0), 1st (index 1), next 15th (index 2), etc.
    if (payIsFirstHalf) {
      // We're in first half of a later month
      // This means we've passed the previous month's 15th but not this month's 15th
      index -= 1;
    }
  }
  
  return Math.max(index, 0);
}

/**
 * Calculate payment index for monthly payments
 */
function getMonthlyPaymentIndex(
  firstPaymentDateISO: string | undefined,
  startDateISO: string,
  paymentDateISO: string
): number {
  const payDate = new Date(paymentDateISO + 'T00:00:00');

  if (firstPaymentDateISO) {
    const firstDate = new Date(firstPaymentDateISO + 'T00:00:00');
    
    const yearDiff = payDate.getFullYear() - firstDate.getFullYear();
    const monthDiff = payDate.getMonth() - firstDate.getMonth();
    
    let index = yearDiff * 12 + monthDiff;
    
    // If payment day is before first payment day, we haven't reached this month's payment yet
    if (payDate.getDate() < firstDate.getDate()) {
      index -= 1;
    }
    
    return Math.max(index, 0);
  }

  // Fallback: use close_date
  return monthsBetween(startDateISO, paymentDateISO);
}

function monthsBetween(startISO: string, payISO: string): number {
  const s = new Date(startISO + 'T00:00:00');
  const p = new Date(payISO + 'T00:00:00');

  const yearDiff = p.getFullYear() - s.getFullYear();
  const monthDiff = p.getMonth() - s.getMonth();

  let n = yearDiff * 12 + monthDiff;
  if (p.getDate() < s.getDate()) {
    n -= 1;
  }
  return Math.max(n, 0);
}

/**
 * Get payment index based on frequency
 */
function getPaymentIndex(
  params: MortgageParams,
  paymentDateISO: string
): number {
  const frequency = params.paymentFrequency || 'monthly';
  const firstPayment = params.firstPaymentDate || params.startDate;
  
  switch (frequency) {
    case 'biweekly':
      return getBiweeklyPaymentIndex(firstPayment, paymentDateISO);
    case 'semimonthly':
      return getSemimonthlyPaymentIndex(firstPayment, paymentDateISO);
    case 'monthly':
    default:
      return getMonthlyPaymentIndex(params.firstPaymentDate, params.startDate, paymentDateISO);
  }
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Compute the P&I part for a given payment index (0-based).
 * Returns { principal, interest, remainingBalanceAfter }.
 */
function amortForPaymentIndex(
  params: MortgageParams,
  paymentIndex: number,
  paymentAmountOverride?: number
) {
  const L = params.originalLoanAmount;
  const frequency = params.paymentFrequency || 'monthly';
  const periodsPerYear = getPeriodsPerYear(frequency);
  const totalPayments = getTotalPayments(params.termMonths, frequency);
  
  // Periodic interest rate
  const r = params.annualRatePercent / 100 / periodsPerYear;

  // Standard amortization payment formula
  const basePayment =
    r === 0
      ? L / totalPayments
      : (L * r) / (1 - Math.pow(1 + r, -totalPayments));

  const payment = paymentAmountOverride ?? basePayment;

  // Roll forward from payment 0 to paymentIndex
  let balance = L;
  for (let i = 0; i < paymentIndex; i++) {
    const interest = balance * r;
    const principal = payment - interest;
    balance = balance - principal;
    if (balance <= 0) {
      balance = 0;
      break;
    }
  }

  // Payment at paymentIndex
  const interestN = balance * r;
  const principalN = Math.min(payment - interestN, balance); // Don't overpay
  const newBalance = Math.max(0, balance - principalN);

  return {
    principal: round2(principalN),
    interest: round2(interestN),
    remainingBalanceAfter: round2(newBalance),
    paymentAmount: round2(basePayment),
  };
}

/**
 * Given a total payment (PITI) and deal fields, compute
 * approximate principal, interest, and escrow breakdown.
 * 
 * If escrow data (taxes/insurance) is missing, it will be inferred
 * as the difference between the total payment and the calculated P&I.
 */
export function computeMortgageSplit(
  params: MortgageParams & {
    rentalMonthlyTaxes: number;
    rentalMonthlyInsurance: number;
  },
  paymentDateISO: string,
  totalPayment: number
): MortgageSplit & { escrowInferred: boolean; paymentNumber: number; frequency: PaymentFrequency } {
  const frequency = params.paymentFrequency || 'monthly';
  const periodsPerYear = getPeriodsPerYear(frequency);
  
  // Scale monthly escrow amounts to payment frequency
  // (stored as monthly amounts, need to convert)
  const escrowScaleFactor = 12 / periodsPerYear;
  const scaledTaxes = (params.rentalMonthlyTaxes || 0) * escrowScaleFactor;
  const scaledInsurance = (params.rentalMonthlyInsurance || 0) * escrowScaleFactor;
  
  const hasEscrowData = (params.rentalMonthlyTaxes > 0 || params.rentalMonthlyInsurance > 0);
  
  const index = getPaymentIndex(params, paymentDateISO);
  
  // Calculate expected P&I from loan terms
  const { principal: expectedPrincipal, interest: expectedInterest } = amortForPaymentIndex(params, index);
  const expectedPI = expectedPrincipal + expectedInterest;
  
  let escrowTaxes: number;
  let escrowInsurance: number;
  let principal: number;
  let interest: number;
  let escrowInferred = false;
  
  if (hasEscrowData) {
    // Use provided escrow data (scaled to payment frequency)
    escrowTaxes = round2(scaledTaxes);
    escrowInsurance = round2(scaledInsurance);
    const escrow = escrowTaxes + escrowInsurance;
    
    // P&I is total minus escrow
    const actualPI = totalPayment - escrow;
    
    // Recalculate P&I split using actual PI (in case of rounding differences)
    const result = amortForPaymentIndex(params, index, actualPI);
    principal = result.principal;
    interest = result.interest;
  } else {
    // No escrow data: infer escrow from the difference
    const inferredEscrow = Math.max(0, round2(totalPayment - expectedPI));
    
    // Can't split inferred escrow into taxes vs insurance, so put it all in taxes
    escrowTaxes = inferredEscrow;
    escrowInsurance = 0;
    escrowInferred = true;
    
    // Use the expected P&I values
    principal = expectedPrincipal;
    interest = expectedInterest;
  }
  
  // Safety caps
  const principalCapped = Math.max(0, Math.min(principal, totalPayment));
  const interestCapped = Math.max(0, Math.min(interest, totalPayment - principalCapped));

  return {
    principal: round2(principalCapped),
    interest: round2(interestCapped),
    escrowTaxes: round2(escrowTaxes),
    escrowInsurance: round2(escrowInsurance),
    totalPayment: round2(totalPayment),
    escrowInferred,
    paymentNumber: index + 1, // 1-based for display
    frequency,
  };
}

/**
 * Get estimated payment amount for a loan (P&I only, no escrow)
 */
export function getEstimatedPayment(params: MortgageParams): number {
  const frequency = params.paymentFrequency || 'monthly';
  const periodsPerYear = getPeriodsPerYear(frequency);
  const totalPayments = getTotalPayments(params.termMonths, frequency);
  
  const L = params.originalLoanAmount;
  const r = params.annualRatePercent / 100 / periodsPerYear;
  
  if (r === 0) return round2(L / totalPayments);
  
  return round2((L * r) / (1 - Math.pow(1 + r, -totalPayments)));
}

/**
 * Get remaining balance after a specific number of payments
 */
export function getRemainingBalance(params: MortgageParams, paymentsMade: number): number {
  const { remainingBalanceAfter } = amortForPaymentIndex(params, paymentsMade - 1);
  return remainingBalanceAfter;
}
