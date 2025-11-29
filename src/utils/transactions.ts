// src/utils/transactions.ts
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
  input: BankToCardTransferInput
): Promise<{ transactionId: number }> {
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

  const lines = [
    {
      account_id: bankAccountId,
      amount: -amount,  // money leaving bank
      purpose,
      is_cleared: true,
    },
    {
      account_id: cardAccountId,
      amount: amount,   // debt going down on card
      purpose,
      is_cleared: true,
    },
  ];

  const { data, error } = await supabase.rpc('create_transaction_multi', {
    p_date: date,
    p_description: description,
    p_purpose: purpose,
    p_lines: lines,
  });

  if (error) {
    console.error('Failed to create bank→card transfer', error);
    throw new Error('Could not create transfer transaction.');
  }

  return { transactionId: data as number };
}