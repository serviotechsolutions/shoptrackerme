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

    console.log('Starting smart notifications check...');

    // Get all tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id');

    if (tenantsError) throw tenantsError;

    let notificationsCreated = 0;

    for (const tenant of tenants || []) {
      console.log(`Checking notifications for tenant: ${tenant.id}`);

      // 1. Check for low stock products
      const { data: lowStockProducts, error: lowStockError } = await supabase
        .from('products')
        .select('id, name, stock, low_stock_threshold')
        .eq('tenant_id', tenant.id)
        .lte('stock', supabase.rpc('stock', { column: 'low_stock_threshold' }));

      if (!lowStockError && lowStockProducts) {
        for (const product of lowStockProducts) {
          if (product.stock <= product.low_stock_threshold) {
            // Check if notification already exists in last 24 hours
            const { data: existingNotif } = await supabase
              .from('notifications')
              .select('id')
              .eq('tenant_id', tenant.id)
              .eq('type', 'low_stock')
              .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
              .contains('metadata', { product_id: product.id })
              .single();

            if (!existingNotif) {
              await supabase.from('notifications').insert({
                tenant_id: tenant.id,
                type: 'low_stock',
                title: '📦 Low Stock Alert',
                message: `${product.name} is running low (${product.stock} units remaining)`,
                metadata: { product_id: product.id, current_stock: product.stock }
              });
              notificationsCreated++;
            }
          }
        }
      }

      // 2. Check for stale products (no sales in last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentTransactions } = await supabase
        .from('transactions')
        .select('product_id')
        .eq('tenant_id', tenant.id)
        .gte('created_at', thirtyDaysAgo);

      const soldProductIds = new Set(recentTransactions?.map(t => t.product_id) || []);

      const { data: allProducts } = await supabase
        .from('products')
        .select('id, name, stock')
        .eq('tenant_id', tenant.id)
        .gt('stock', 0);

      const staleProducts = allProducts?.filter(p => !soldProductIds.has(p.id)) || [];

      for (const product of staleProducts) {
        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('type', 'stale_product')
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .contains('metadata', { product_id: product.id })
          .single();

        if (!existingNotif) {
          await supabase.from('notifications').insert({
            tenant_id: tenant.id,
            type: 'stale_product',
            title: '⚠️ Stale Product Alert',
            message: `${product.name} hasn't sold in 30 days (${product.stock} units in stock)`,
            metadata: { product_id: product.id, days_without_sale: 30 }
          });
          notificationsCreated++;
        }
      }

      // 3. Check for fast-selling products (>10 sales in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentSales } = await supabase
        .from('transactions')
        .select('product_id, product_name, quantity')
        .eq('tenant_id', tenant.id)
        .gte('created_at', sevenDaysAgo);

      const salesByProduct = new Map<string, { name: string; total: number }>();
      recentSales?.forEach(sale => {
        const existing = salesByProduct.get(sale.product_id) || { name: sale.product_name, total: 0 };
        existing.total += sale.quantity;
        salesByProduct.set(sale.product_id, existing);
      });

      for (const [productId, data] of salesByProduct.entries()) {
        if (data.total >= 10) {
          const { data: existingNotif } = await supabase
            .from('notifications')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('type', 'fast_selling')
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
            .contains('metadata', { product_id: productId })
            .single();

          if (!existingNotif) {
            await supabase.from('notifications').insert({
              tenant_id: tenant.id,
              type: 'fast_selling',
              title: '🔥 Fast-Selling Product',
              message: `${data.name} is selling fast! ${data.total} units sold in the last 7 days`,
              metadata: { product_id: productId, sales_count: data.total, period_days: 7 }
            });
            notificationsCreated++;
          }
        }
      }

      // 4. Check for high daily profit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todaysTransactions } = await supabase
        .from('transactions')
        .select('profit')
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString());

      const todaysProfit = todaysTransactions?.reduce((sum, t) => sum + Number(t.profit), 0) || 0;
      
      // Target: 10000 (you can adjust this)
      const profitTarget = 10000;
      if (todaysProfit >= profitTarget) {
        const { data: existingNotif } = await supabase
          .from('notifications')
          .select('id')
          .eq('tenant_id', tenant.id)
          .eq('type', 'high_profit')
          .gte('created_at', today.toISOString())
          .single();

        if (!existingNotif) {
          await supabase.from('notifications').insert({
            tenant_id: tenant.id,
            type: 'high_profit',
            title: '💰 Profit Target Reached!',
            message: `Today's profit: ${todaysProfit.toFixed(2)} (Target: ${profitTarget})`,
            metadata: { profit: todaysProfit, target: profitTarget, date: today.toISOString() }
          });
          notificationsCreated++;
        }
      }
    }

    console.log(`Smart notifications check completed. Created ${notificationsCreated} notifications`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Smart notifications processed',
        notificationsCreated 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in smart-notifications function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
