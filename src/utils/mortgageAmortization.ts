// src/utils/mortgageAmortization.ts

export type MortgageParams = {
  originalLoanAmount: number;
  annualRatePercent: number;  // e.g. 7.125
  termMonths: number;         // e.g. 360
  startDate: string;          // ISO "YYYY-MM-DD" (close_date)
};

export type MortgageSplit = {
  principal: number;
  interest: number;
  escrowTaxes: number;
  escrowInsurance: number;
  totalPayment: number;
};

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
  monthlyPIOverride?: number
) {
  const L = params.originalLoanAmount;
  const r = params.annualRatePercent / 100 / 12; // monthly rate
  const n = params.termMonths;

  // Standard mortgage payment formula
  const basePI =
    r === 0
      ? L / n
      : (L * r) / (1 - Math.pow(1 + r, -n));

  const monthlyPI = monthlyPIOverride ?? basePI;

  // Roll forward from month 0 to paymentIndex
  let balance = L;
  for (let i = 0; i < paymentIndex; i++) {
    const interest = balance * r;
    const principal = monthlyPI - interest;
    balance = balance - principal;
  }

  // Payment at paymentIndex
  const interestN = balance * r;
  const principalN = monthlyPI - interestN;
  const newBalance = balance - principalN;

  return {
    principal: round2(principalN),
    interest: round2(interestN),
    remainingBalanceAfter: round2(newBalance),
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
): MortgageSplit & { escrowInferred: boolean } {
  const hasEscrowData = (params.rentalMonthlyTaxes > 0 || params.rentalMonthlyInsurance > 0);
  
  const index = monthsBetween(params.startDate, paymentDateISO);
  
  // First, calculate the expected P&I from loan terms (no override)
  // This gives us what principal + interest SHOULD be for this payment
  const { principal: expectedPrincipal, interest: expectedInterest } = amortForPaymentIndex(params, index);
  const expectedPI = expectedPrincipal + expectedInterest;
  
  let escrowTaxes: number;
  let escrowInsurance: number;
  let principal: number;
  let interest: number;
  let escrowInferred = false;
  
  if (hasEscrowData) {
    // Use provided escrow data
    escrowTaxes = params.rentalMonthlyTaxes || 0;
    escrowInsurance = params.rentalMonthlyInsurance || 0;
    const escrow = escrowTaxes + escrowInsurance;
    
    // P&I is total minus escrow
    const actualPI = totalPayment - escrow;
    
    // Recalculate P&I split using actual PI (in case of rounding differences)
    const result = amortForPaymentIndex(params, index, actualPI);
    principal = result.principal;
    interest = result.interest;
  } else {
    // No escrow data: infer escrow from the difference
    // escrow = totalPayment - expectedPI
    const inferredEscrow = Math.max(0, round2(totalPayment - expectedPI));
    
    // We can't split inferred escrow into taxes vs insurance, so put it all in taxes
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
  };
}