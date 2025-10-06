import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Generating daily sales summaries...');

    // Get all tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id');

    if (tenantsError) throw tenantsError;

    for (const tenant of tenants || []) {
      // Get today's transactions
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: transactions, error: txError } = await supabase
        .from('transactions')
        .select('total_amount, profit, quantity')
        .eq('tenant_id', tenant.id)
        .gte('created_at', startOfDay.toISOString());

      if (txError) {
        console.error(`Error fetching transactions for tenant ${tenant.id}:`, txError);
        continue;
      }

      if (!transactions || transactions.length === 0) continue;

      const totalSales = transactions.reduce((sum, t) => sum + Number(t.total_amount), 0);
      const totalProfit = transactions.reduce((sum, t) => sum + Number(t.profit), 0);
      const totalItems = transactions.reduce((sum, t) => sum + Number(t.quantity), 0);

      // Create notification
      const { error: notifError } = await supabase
        .from('notifications')
        .insert({
          tenant_id: tenant.id,
          title: 'Daily Sales Summary',
          message: `Today's performance: ${transactions.length} transactions, ${totalItems} items sold. Revenue: $${totalSales.toFixed(2)}, Profit: $${totalProfit.toFixed(2)}`,
          type: 'sales_summary',
          metadata: {
            date: new Date().toISOString().split('T')[0],
            transaction_count: transactions.length,
            total_items: totalItems,
            total_sales: totalSales,
            total_profit: totalProfit,
          },
        });

      if (notifError) {
        console.error(`Error creating notification for tenant ${tenant.id}:`, notifError);
      } else {
        console.log(`Created sales summary for tenant ${tenant.id}`);
      }
    }

    console.log('Daily sales summaries completed');

    return new Response(
      JSON.stringify({ success: true, message: 'Daily summaries generated' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in daily-sales-summary function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
