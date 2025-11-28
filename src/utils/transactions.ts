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
