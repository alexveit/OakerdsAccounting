import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PLAID_CLIENT_ID = Deno.env.get("PLAID_CLIENT_ID")!;
const PLAID_SECRET = Deno.env.get("PLAID_SECRET")!;
const PLAID_ENV = Deno.env.get("PLAID_ENV") ?? "production"; // Change to "development" for real banks

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Plaid transaction shape from API
type PlaidSyncTransaction = {
  transaction_id: string;
  date: string;
  amount: number;
  name: string;
  merchant_name: string | null;
  category: string[];
  pending: boolean;
  account_id: string;
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get user from auth header
    const authHeader = req.headers.get("Authorization")!;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SERVICE_ROLE_KEY")!; // Need service role to read access_token
    
    const supabaseAuth = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the user's Plaid item
    const { data: plaidItems, error: itemError } = await supabase
      .from("plaid_items")
      .select("*")
      .eq("user_id", user.id);

    if (itemError || !plaidItems || plaidItems.length === 0) {
      return new Response(JSON.stringify({ error: "No connected bank account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const plaidItem = plaidItems[0];
    const allTransactions: PlaidSyncTransaction[] = [];
    let hasMore = true;
    let cursor = plaidItem.cursor || undefined;

    // Fetch all transactions using sync endpoint
    while (hasMore) {
      const response = await fetch(`https://${PLAID_ENV}.plaid.com/transactions/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: PLAID_CLIENT_ID,
          secret: PLAID_SECRET,
          access_token: plaidItem.access_token,
          cursor: cursor,
          count: 100,
        }),
      });

      const data = await response.json();

      if (data.error_code) {
        return new Response(JSON.stringify({ error: data.error_message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Add new transactions
      allTransactions.push(...data.added);

      hasMore = data.has_more;
      cursor = data.next_cursor;
    }

    // Update cursor for next sync
    await supabase
      .from("plaid_items")
      .update({ cursor, updated_at: new Date().toISOString() })
      .eq("id", plaidItem.id);

    // Format transactions for response
    const formattedTransactions = allTransactions.map((tx) => ({
      plaid_transaction_id: tx.transaction_id,
      date: tx.date,
      amount: tx.amount, // Plaid uses positive for debits, negative for credits
      name: tx.name,
      merchant_name: tx.merchant_name,
      category: tx.category,
      pending: tx.pending,
      account_id: tx.account_id,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        transactions: formattedTransactions,
        count: formattedTransactions.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
