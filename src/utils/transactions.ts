import { supabase } from '../lib/supabaseClient';

export type Purpose = 'business' | 'personal' | 'mixed';

export interface BankToCardTransferInput {
  date: string;              // ISO string: '2025-11-27'
  description: string;       // e.g. 'Pay Amex from Checking'
  bankAccountId: number;     // asset account (checking)
  cardAccountId: number;     // liability account (credit card)
  amount: number;            // positive number, e.g. 1000 for $1,000
  purpose?: Purpose;         // default 'business'
}

/**
 * Creates a transaction that transfers money from a bank account
 * to a credit card account (pays down card debt).
 *
 * Double-entry:
 *  - Bank (asset):        amount = -A   → credit (cash out)
 *  - Card (liability):    amount = +A   → debit (debt down)
 */
export async function createBankToCardTransfer(
  input: BankToCardTransferInput,
): Promise<void> {
  const {
    date,
    description,
    bankAccountId,
    cardAccountId,
    amount,
    purpose = 'business',
  } = input;

  if (amount <= 0) {
    throw new Error('Transfer amount must be a positive number.');
  }

  if (bankAccountId === cardAccountId) {
    throw new Error('Bank account and card account must be different.');
  }

  // 1) Create the parent transaction
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({
      date,
      description,
      // add any other defaults you know are safe here
      // e.g. source: 'manual'
    })
    .select('id')
    .single();

  if (txError || !tx) {
    console.error('Failed to create bank→card transfer transaction', txError);
    throw new Error('Could not create transfer transaction.');
  }

  const transactionId = tx.id;

  // 2) Create the two lines (must net to zero)
  const { error: lineError } = await supabase.from('transaction_lines').insert([
    {
      transaction_id: transactionId,
      account_id: bankAccountId,
      amount: -amount,          // money leaving bank
      is_cleared: true,
      purpose,
    },
    {
      transaction_id: transactionId,
      account_id: cardAccountId,
      amount: amount,           // debt going down on card
      is_cleared: true,
      purpose,
    },
  ]);

  if (lineError) {
    console.error('Failed to create lines for bank→card transfer', lineError);
    throw new Error('Could not create transfer transaction lines.');
  }
}

export interface MortgageSplit {
  principal: number;
  interest: number;
  escrow: number;
}

export interface MortgagePaymentInput {
  date: string;                // '2025-10-01'
  description: string | null;
  dealId: number;              // real_estate_deals.id
  bankAccountId: number;       // checking account used to pay
  totalPayment: number;        // e.g. 566.23
  purpose?: Purpose;           // default 'business'
}

/**
 * Compute principal / interest / escrow for the next mortgage payment on a deal.
 * Uses original_loan_amount, interest_rate, loan_term_months and prior principal
 * booked against the loan account.
 */
async function computeMortgageSplit(
  dealId: number,
  totalPayment: number
): Promise<MortgageSplit> {
  // 1) Load deal
  const { data: deals, error: dealErr } = await supabase
    .from('real_estate_deals')
    .select(
      `
        id,
        loan_account_id,
        original_loan_amount,
        interest_rate,
        loan_term_months
      `
    )
    .eq('id', dealId)
    .limit(1);

  if (dealErr) {
    console.error('computeMortgageSplit: deal error', dealErr);
    throw new Error('Could not load real estate deal.');
  }

  const deal = deals?.[0];
  if (!deal) throw new Error('Real estate deal not found.');

  const loanAccountId = Number(deal.loan_account_id);
  const originalLoanAmount = Number(deal.original_loan_amount ?? 0);
  const annualRate = Number(deal.interest_rate ?? 0);
  const termMonths = Number(deal.loan_term_months ?? 0);

  if (!loanAccountId || !originalLoanAmount || !annualRate || !termMonths) {
    throw new Error(
      'Deal is missing loan_account_id, original_loan_amount, interest_rate, or loan_term_months.'
    );
  }

  // 2) Sum principal already booked (debits to loan account for this deal)
  const { data: principalLines, error: principalErr } = await supabase
    .from('transaction_lines')
    .select('amount')
    .eq('real_estate_deal_id', dealId)
    .eq('account_id', loanAccountId)
    .gt('amount', 0); // principal reduces liability, so we book positive

  if (principalErr) {
    console.error('computeMortgageSplit: principal error', principalErr);
    throw new Error('Could not load prior principal payments.');
  }

  const principalPaidSoFar = (principalLines ?? []).reduce(
    (sum: number, line: any) => sum + Number(line.amount || 0),
    0
  );

  const remainingBalance = originalLoanAmount - principalPaidSoFar;
  const monthlyRate = annualRate / 100 / 12;

  if (monthlyRate <= 0) {
    // No interest? Then treat everything as principal for now.
    const principal = Math.round(totalPayment * 100) / 100;
    return { principal, interest: 0, escrow: 0 };
  }

  // Standard amortization formula for constant P&I payment
  const theoreticalPI =
    (originalLoanAmount * monthlyRate) /
    (1 - Math.pow(1 + monthlyRate, -termMonths));

  let interest = remainingBalance * monthlyRate;
  let principal = theoreticalPI - interest;

  // Round to cents
  interest = Math.round(interest * 100) / 100;
  principal = Math.round(principal * 100) / 100;

  // Whatever is left is escrow (taxes/insurance)
  let escrow = totalPayment - (principal + interest);

  // Handle weird lender differences / rounding
  escrow = Math.round(escrow * 100) / 100;

  if (escrow < -0.01) {
    // If our PI estimate overshoots, fall back to: no escrow, all to principal+interest
    escrow = 0;
    principal = Math.round((totalPayment - interest) * 100) / 100;
  }

  // Final tweak: ensure they add up exactly
  const sum = principal + interest + escrow;
  const delta = Math.round((totalPayment - sum) * 100) / 100;
  if (Math.abs(delta) >= 0.01) {
    principal = Math.round((principal + delta) * 100) / 100;
  }

  return { principal, interest, escrow };
}

/**
 * Create a multi-line mortgage payment:
 * - Credit bank
 * - Debit loan (principal)
 * - Debit RE – Mortgage Interest
 * - Debit RE – Taxes & Insurance (escrow)
 */
export async function createMortgagePaymentWithSplit(
  input: MortgagePaymentInput
) {
  const {
    date,
    description,
    dealId,
    bankAccountId,
    totalPayment,
    purpose = 'business',
  } = input;

  // 1) Compute split
  const split = await computeMortgageSplit(dealId, totalPayment);

  // 2) Load deal (for loan account)
  const { data: deals, error: dealErr } = await supabase
    .from('real_estate_deals')
    .select('id, loan_account_id')
    .eq('id', dealId)
    .limit(1);

  if (dealErr) throw dealErr;
  const deal = deals?.[0];
  if (!deal || !deal.loan_account_id) {
    throw new Error('Real estate deal has no loan_account_id.');
  }

  const loanAccountId = Number(deal.loan_account_id);

  // 3) Look up interest + escrow accounts by code
  const { data: reAccounts, error: accErr } = await supabase
    .from('accounts')
    .select('id, code')
    .in('code', ['62011', '62012']); // Taxes & Insurance, Mortgage Interest

  if (accErr) throw accErr;

  const interestAccount = reAccounts?.find((a: any) => a.code === '62012');
  const escrowAccount = reAccounts?.find((a: any) => a.code === '62011');

  if (!interestAccount || !escrowAccount) {
    throw new Error('Could not find RE interest/escrow accounts by code.');
  }

  // 4) Create transaction header
  const { data: tx, error: txErr } = await supabase
    .from('transactions')
    .insert({
      date,
      description,
    })
    .select('id')
    .single();

  if (txErr) {
    console.error('Mortgage tx insert failed', txErr);
    throw new Error('Could not create mortgage transaction.');
  }

  const transactionId = tx.id as number;

  // 5) Insert lines: bank, principal, interest, escrow
  const linesToInsert = [
    {
      transaction_id: transactionId,
      account_id: bankAccountId,
      amount: -Math.abs(totalPayment), // cash out
      purpose,
      is_cleared: true,
      real_estate_deal_id: dealId,
    },
    {
      transaction_id: transactionId,
      account_id: loanAccountId,
      amount: split.principal, // principal reduces loan
      purpose,
      is_cleared: true,
      real_estate_deal_id: dealId,
    },
    {
      transaction_id: transactionId,
      account_id: interestAccount.id,
      amount: split.interest,
      purpose,
      is_cleared: true,
      real_estate_deal_id: dealId,
    },
    {
      transaction_id: transactionId,
      account_id: escrowAccount.id,
      amount: split.escrow,
      purpose,
      is_cleared: true,
      real_estate_deal_id: dealId,
    },
  ];

  const { error: lineErr } = await supabase
    .from('transaction_lines')
    .insert(linesToInsert);

  if (lineErr) {
    console.error('Mortgage line insert failed', lineErr);
    throw new Error('Could not create mortgage transaction lines.');
  }

  return { transactionId, split };
}

