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

    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id');

    if (tenantsError) throw tenantsError;

    let notificationsCreated = 0;

    for (const tenant of tenants || []) {
      console.log(`Checking notifications for tenant: ${tenant.id}`);

      // 1. Low stock products
      const { data: allProducts } = await supabase
        .from('products')
        .select('id, name, stock, low_stock_threshold, selling_price')
        .eq('tenant_id', tenant.id);

      for (const product of (allProducts || []).filter(p => p.stock <= p.low_stock_threshold)) {
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

      // 2. Sales drop detection (compare this week vs last week)
      const now = new Date();
      const thisWeekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

      const { data: thisWeekSales } = await supabase
        .from('transactions')
        .select('total_amount')
        .eq('tenant_id', tenant.id)
        .gte('created_at', thisWeekStart.toISOString());

      const { data: lastWeekSales } = await supabase
        .from('transactions')
        .select('total_amount')
        .eq('tenant_id', tenant.id)
        .gte('created_at', lastWeekStart.toISOString())
        .lt('created_at', thisWeekStart.toISOString());

      const thisWeekTotal = thisWeekSales?.reduce((s, t) => s + Number(t.total_amount), 0) || 0;
      const lastWeekTotal = lastWeekSales?.reduce((s, t) => s + Number(t.total_amount), 0) || 0;

      if (lastWeekTotal > 0) {
        const dropPercent = ((lastWeekTotal - thisWeekTotal) / lastWeekTotal) * 100;
        if (dropPercent >= 20) {
          const { data: existingDrop } = await supabase
            .from('notifications')
            .select('id')
            .eq('tenant_id', tenant.id)
            .eq('type', 'sales_summary')
            .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
            .contains('metadata', { alert_type: 'sales_drop' })
            .single();

          if (!existingDrop) {
            await supabase.from('notifications').insert({
              tenant_id: tenant.id,
              type: 'sales_summary',
              title: '📉 Sales Drop Alert',
              message: `Sales dropped ${dropPercent.toFixed(0)}% compared to last week (UGX ${thisWeekTotal.toLocaleString()} vs UGX ${lastWeekTotal.toLocaleString()})`,
              metadata: { alert_type: 'sales_drop', drop_percent: dropPercent, this_week: thisWeekTotal, last_week: lastWeekTotal }
            });
            notificationsCreated++;
          }
        }
      }

      // 3. Stale products (no sales in 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: recentTransactions } = await supabase
        .from('transactions')
        .select('product_id')
        .eq('tenant_id', tenant.id)
        .gte('created_at', thirtyDaysAgo);

      const soldProductIds = new Set(recentTransactions?.map(t => t.product_id) || []);
      const staleProducts = (allProducts || []).filter(p => p.stock > 0 && !soldProductIds.has(p.id));

      for (const product of staleProducts.slice(0, 5)) {
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

      // 4. Fast-selling products (>10 sales in 7 days)
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
            .gte('created_at', sevenDaysAgo)
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

      // 5. High daily profit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todaysTransactions } = await supabase
        .from('transactions')
        .select('profit')
        .eq('tenant_id', tenant.id)
        .gte('created_at', today.toISOString());

      const todaysProfit = todaysTransactions?.reduce((sum, t) => sum + Number(t.profit), 0) || 0;
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
            message: `Today's profit: UGX ${todaysProfit.toLocaleString()} (Target: UGX ${profitTarget.toLocaleString()})`,
            metadata: { profit: todaysProfit, target: profitTarget, date: today.toISOString() }
          });
          notificationsCreated++;
        }
      }
    }

    console.log(`Smart notifications check completed. Created ${notificationsCreated} notifications`);

    return new Response(
      JSON.stringify({ success: true, notificationsCreated }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  } catch (error) {
    console.error('Error in smart-notifications function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
