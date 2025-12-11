// supabase/functions/bank-import/index.ts
//
// Deploy: npx supabase functions deploy bank-import --no-verify-jwt
// Set secret: npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

interface BankImportRequest {
  rawBankData: string;
  selectedAccount: {
    id: number;
    name: string;
    code: string;
  };
  pendingTransactions: Array<{
    line_id: number;
    transaction_id: number;
    date: string;
    description: string | null;
    amount: number;
    vendor_name: string | null;
    job_name: string | null;
    installer_name: string | null;
  }>;
  clearedTransactions: Array<{
    line_id: number;
    transaction_id: number;
    date: string;
    description: string | null;
    amount: number;
  }>;
  recentHistory: Array<{
    date: string;
    description: string | null;
    amount: number;
    account_code: string | null;
    account_name: string;
    vendor_name: string | null;
    job_name: string | null;
  }>;
  referenceData: {
    vendors: Array<{ id: number; name: string }>;
    jobs: Array<{ id: number; name: string; address: string | null; status: string }>;
    installers: Array<{ id: number; name: string }>;
    expenseAccounts: Array<{ id: number; code: string; name: string }>;
    incomeAccounts: Array<{ id: number; code: string; name: string }>;
  };
}

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  bank_status: 'posted' | 'pending';
  match_type: 'matched_pending' | 'matched_cleared' | 'new' | 'tip_adjustment';
  matched_line_id: number | null;
  matched_transaction_id: number | null;
  original_amount: number | null;
  match_confidence: 'high' | 'medium' | 'low';
  suggested_account_id: number | null;
  suggested_account_code: string | null;
  suggested_vendor_id: number | null;
  suggested_job_id: number | null;
  suggested_installer_id: number | null;
  suggested_purpose: 'business' | 'personal' | null;
  reasoning: string;
}

interface BankImportResponse {
  parsed_transactions: ParsedTransaction[];
  warnings: string[];
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Auth check - require valid Authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }

    const body: BankImportRequest = await req.json();

    // Build the prompt
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(body);

    // Call Claude
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }

    const claudeResponse = await response.json();
    const content = claudeResponse.content?.[0]?.text;

    if (!content) {
      throw new Error('No response from Claude');
    }

    // Parse Claude's JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from Claude response');
    }

    // Clean up common JSON issues from LLM output
    let jsonStr = jsonMatch[0];
    
    // Remove trailing commas before } or ]
    jsonStr = jsonStr.replace(/,(\s*[\}\]])/g, '$1');
    
    // Remove any control characters except whitespace
    jsonStr = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    
    // Try to parse, with fallback error handling
    let parsed: BankImportResponse;
    try {
      parsed = JSON.parse(jsonStr);
    } catch (parseError) {
      // Log the problematic JSON for debugging
      console.error('JSON parse failed. First 500 chars:', jsonStr.slice(0, 500));
      console.error('Last 500 chars:', jsonStr.slice(-500));
      throw new Error(`JSON parse error: ${parseError instanceof Error ? parseError.message : 'Unknown'}`);
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Bank import error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

function buildSystemPrompt(): string {
  return `You are a financial data parsing assistant for a small business accounting system.

Your job is to:
1. Parse raw bank transaction data (copy-pasted from Bank of America)
2. Identify whether each transaction is POSTED (cleared) or PENDING at the bank
3. Match posted transactions to existing database transactions
4. Detect tip adjustments (restaurant charges that increased due to tip)
5. Categorize new transactions based on historical patterns

CRITICAL JSON RULES:
- Output ONLY valid JSON - no markdown code fences, no explanation text
- NO trailing commas after the last item in arrays or objects
- Ensure all strings are properly escaped
- Double-check your JSON is valid before responding

CRITICAL MATCHING RULES:
- Output ONLY valid JSON, no markdown, no explanation outside the JSON
- Dates must be in YYYY-MM-DD format
- When bank data shows dates without a year (e.g., "12/07"), use the CURRENT YEAR from the context provided

AMOUNT SIGN CONVENTION - CRITICAL:
The sign convention depends on whether we're importing from a BANK ACCOUNT or a CREDIT CARD.

For BANK ACCOUNTS (checking/savings - codes starting with 1):
- Negative on statement = money out (expense) → use NEGATIVE amount
- Positive on statement = money in (income) → use POSITIVE amount

For CREDIT CARDS (codes starting with 2):
- Positive on statement (charge, you owe more) = expense → use NEGATIVE amount (invert!)
- Negative on statement (payment/refund, you owe less) = income → use POSITIVE amount (invert!)

The selectedAccount.code tells you which type:
- Code starts with "1" (e.g., "1100") = Bank account (keep signs as-is)
- Code starts with "2" (e.g., "2100") = Credit card (INVERT signs)

AMOUNT MATCHING - BE VERY STRICT:
- Match ONLY if amounts are EXACTLY equal (to the cent)
- $96.94 does NOT match $97.00 â€” this is a $0.06 difference, NOT a match
- $817.00 matches $817.00 â€” exact match
- When in doubt, mark as "new" rather than force a bad match

TIP ADJUSTMENT DETECTION:
For restaurant/dining transactions where the bank amount is HIGHER than a pending DB transaction:
- Look for pending DB transactions with similar descriptions (restaurant names)
- Date within 3 days
- Bank amount is higher than DB amount (tip was added)
- Tip should be reasonable: between $1-50 OR 5-50% of original amount
- Mark as match_type="tip_adjustment"
- Include original_amount (the DB pending amount)
- Include matched_line_id and matched_transaction_id

Common tip scenarios:
- "MARIETTA DINER" bank $55.00 vs DB pending $45.37 â†’ tip_adjustment
- "NIKKO JAPANESE" bank $150.00 vs DB pending $124.75 â†’ tip_adjustment
- Restaurant/diner/cafe/grill names are clues for tip scenarios

DATE MATCHING:
- Dates can be within 3 days (bank posting dates may differ slightly)

BANK STATUS DETECTION:
Bank of America typically shows:
- "Processing" or "Pending" transactions at the top (bank_status = "pending")
- "Posted" transactions below with actual post dates (bank_status = "posted")
- Look for keywords like "Processing", "Pending", "Processing." â†’ bank_status = "pending"
- If no such indicator, assume bank_status = "posted"

MATCH TYPE LOGIC (in order of priority):
1. EXACT amount match to PENDING DB transaction â†’ match_type = "matched_pending"
2. EXACT amount match to CLEARED DB transaction â†’ match_type = "matched_cleared"
3. Restaurant/dining with higher amount than pending DB â†’ match_type = "tip_adjustment"
4. No match found â†’ match_type = "new"


CRITICAL FOR CREDIT CARD MATCHING:
For credit cards, the DB stores expenses as NEGATIVE amounts, but the CC statement shows charges as POSITIVE.
When matching a CC statement charge against DB transactions:
- Statement shows: $39.00 (positive charge)
- DB has: -$39.00 (negative expense)
- These ARE THE SAME TRANSACTION! Match by comparing ABSOLUTE VALUES.
- If abs(statement_amount) == abs(db_amount) AND descriptions are similar, it is a match!
After matching, your OUTPUT amount should still be NEGATIVE (the inverted sign for CC).

OUTPUT FORMAT:
{
  "parsed_transactions": [
    {
      "date": "2025-12-03",
      "description": "MARIETTA DINER MARIETTA GA",
      "amount": -55.00,
      "bank_status": "posted",
      "match_type": "tip_adjustment",
      "matched_line_id": 123,
      "matched_transaction_id": 456,
      "original_amount": -45.37,
      "match_confidence": "high",
      "suggested_account_id": null,
      "suggested_account_code": null,
      "suggested_vendor_id": null,
      "suggested_job_id": null,
      "suggested_installer_id": null,
      "suggested_purpose": null,
      "reasoning": "Restaurant charge with tip added. Original $45.37, final $55.00, tip $9.63"
    }
  ],
  "warnings": []
}

IMPORTANT: Output ONLY the JSON object. No markdown, no code fences, no trailing commas. The last item in every array and object must NOT have a comma after it.`;
}

function buildUserPrompt(req: BankImportRequest): string {
  const { rawBankData, selectedAccount, pendingTransactions, clearedTransactions, recentHistory, referenceData } = req;

  // Get current date for context
  const today = new Date();
  const currentYear = today.getFullYear();
  const currentDate = today.toISOString().slice(0, 10);

  // Determine if this is a credit card based on account code
  const isCreditCard = selectedAccount.code.startsWith('2');
  const accountType = isCreditCard ? 'CREDIT CARD' : 'BANK ACCOUNT';
  
  let signInstructions = '';
  if (isCreditCard) {
    signInstructions = `
⚠️ CRITICAL - THIS IS A CREDIT CARD ACCOUNT ⚠️
You MUST INVERT all signs from what the statement shows:
- Statement shows $303.70 charge → output amount: -303.70 (NEGATIVE)
- Statement shows $39.00 fee → output amount: -39.00 (NEGATIVE)  
- Statement shows -$100.00 payment → output amount: 100.00 (POSITIVE)

ALL CHARGES/FEES on a credit card statement are EXPENSES and MUST be NEGATIVE in your output.
The statement shows them as positive because "you owe more" but in accounting they are EXPENSES (negative).`;
  } else {
    signInstructions = `
This is a bank account. Keep signs as shown on statement:
- Statement shows -$50.00 → output amount: -50.00
- Statement shows $100.00 → output amount: 100.00`;
  }

  let prompt = `## Current Date Context
Today is ${currentDate}. When parsing dates without a year (e.g., "12/07"), use ${currentYear} as the year.

## Selected Account
Type: ${accountType}
Code: ${selectedAccount.code}
Name: ${selectedAccount.name}
${signInstructions}

## Raw Bank/Credit Card Data
\`\`\`
${rawBankData}
\`\`\`

## PENDING Database Transactions (is_cleared = false)
These need to be marked as cleared if matched by a POSTED bank transaction.
For tip adjustments, you'll need both line_id and transaction_id.
`;

  if (pendingTransactions.length === 0) {
    prompt += 'None\n';
  } else {
    for (const tx of pendingTransactions.slice(0, 100)) {
      prompt += `- line_id=${tx.line_id}, transaction_id=${tx.transaction_id}, date=${tx.date}, amount=${tx.amount}, desc="${tx.description || ''}"`;
      if (tx.vendor_name) prompt += `, vendor="${tx.vendor_name}"`;
      if (tx.job_name) prompt += `, job="${tx.job_name}"`;
      prompt += '\n';
    }
  }

  prompt += '\n## CLEARED Database Transactions (is_cleared = true, last 60 days)\n';
  prompt += 'If a bank transaction matches one of these, it means it was already reconciled.\n';
  if (!clearedTransactions || clearedTransactions.length === 0) {
    prompt += 'None\n';
  } else {
    for (const tx of clearedTransactions.slice(0, 100)) {
      prompt += `- line_id=${tx.line_id}, date=${tx.date}, amount=${tx.amount}, desc="${tx.description || ''}"\n`;
    }
  }

  prompt += '\n## Recent Transaction History (for pattern learning on NEW transactions)\n';
  if (recentHistory.length === 0) {
    prompt += 'None\n';
  } else {
    for (const tx of recentHistory.slice(0, 50)) {
      prompt += `- date=${tx.date}, amount=${tx.amount}, account="${tx.account_code} ${tx.account_name}", desc="${tx.description || ''}"`;
      if (tx.vendor_name) prompt += `, vendor="${tx.vendor_name}"`;
      if (tx.job_name) prompt += `, job="${tx.job_name}"`;
      prompt += '\n';
    }
  }

  prompt += '\n## Reference Data\n';

  prompt += '\n### Vendors\n';
  for (const v of referenceData.vendors.slice(0, 50)) {
    prompt += `- id=${v.id}, name="${v.name}"\n`;
  }

  prompt += '\n### Jobs (Open)\n';
  for (const j of referenceData.jobs.slice(0, 30)) {
    prompt += `- id=${j.id}, name="${j.name}"`;
    if (j.address) prompt += `, address="${j.address}"`;
    prompt += '\n';
  }

  prompt += '\n### Installers\n';
  for (const i of referenceData.installers.slice(0, 30)) {
    prompt += `- id=${i.id}, name="${i.name}"\n`;
  }

  prompt += '\n### Expense Accounts\n';
  for (const a of referenceData.expenseAccounts) {
    prompt += `- id=${a.id}, code="${a.code}", name="${a.name}"\n`;
  }

  prompt += '\n### Income Accounts\n';
  for (const a of referenceData.incomeAccounts) {
    prompt += `- id=${a.id}, code="${a.code}", name="${a.name}"\n`;
  }

  prompt += `
## Instructions
1. Parse each transaction from the raw bank data
2. Determine bank_status for each:
   - "pending" if the bank shows it as "Processing" or pending
   - "posted" if it has cleared at the bank
3. For each bank transaction:
   a. First look for an EXACT amount match in PENDING database transactions
   b. If exact match found, set match_type="matched_pending" and matched_line_id
   c. If no pending match, look for EXACT amount match in CLEARED database transactions
   d. If cleared match found, set match_type="matched_cleared" and matched_line_id
   e. If NO exact amount match exists, set match_type="new" and suggest categorization
4. CRITICAL: $96.94 â‰  $97.00. These are NOT the same amount. Do not match them.
5. When in doubt, mark as "new" - false positives are worse than false negatives
6. Return ONLY the JSON response, no other text`;

  return prompt;
}