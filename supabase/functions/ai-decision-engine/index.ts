import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, full_name')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { message, conversationHistory } = await req.json();

    // Gather business data for context
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [transactionsRes, productsRes, todayTxRes] = await Promise.all([
      supabase.from('transactions')
        .select('created_at, total_amount, profit, quantity, product_name, payment_method')
        .eq('tenant_id', profile.tenant_id)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false }),
      supabase.from('products')
        .select('name, stock, low_stock_threshold, buying_price, selling_price, category')
        .eq('tenant_id', profile.tenant_id),
      supabase.from('transactions')
        .select('total_amount, profit')
        .eq('tenant_id', profile.tenant_id)
        .gte('created_at', today.toISOString()),
    ]);

    const transactions = transactionsRes.data || [];
    const products = productsRes.data || [];
    const todayTransactions = todayTxRes.data || [];

    // Compute key metrics
    const totalSales30d = transactions.reduce((s, t) => s + Number(t.total_amount), 0);
    const totalProfit30d = transactions.reduce((s, t) => s + Number(t.profit), 0);
    const todaySales = todayTransactions.reduce((s, t) => s + Number(t.total_amount), 0);
    const todayProfit = todayTransactions.reduce((s, t) => s + Number(t.profit), 0);
    const lowStockProducts = products.filter(p => p.stock <= p.low_stock_threshold);
    const outOfStock = products.filter(p => p.stock === 0);

    // Daily sales for trend
    const dailySales: Record<string, { sales: number; count: number }> = {};
    transactions.forEach(t => {
      const date = new Date(t.created_at).toISOString().split('T')[0];
      if (!dailySales[date]) dailySales[date] = { sales: 0, count: 0 };
      dailySales[date].sales += Number(t.total_amount);
      dailySales[date].count += 1;
    });

    // Top products
    const productSales: Record<string, number> = {};
    transactions.forEach(t => {
      productSales[t.product_name] = (productSales[t.product_name] || 0) + Number(t.total_amount);
    });
    const topProducts = Object.entries(productSales)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([name, revenue]) => ({ name, revenue }));

    // Slow products (in inventory but low/no sales)
    const soldProducts = new Set(transactions.map(t => t.product_name));
    const slowProducts = products
      .filter(p => !soldProducts.has(p.name) && p.stock > 0)
      .slice(0, 5)
      .map(p => ({ name: p.name, stock: p.stock }));

    // Weekly comparison
    const thisWeekTx = transactions.filter(t => new Date(t.created_at) >= sevenDaysAgo);
    const lastWeekTx = transactions.filter(t => {
      const d = new Date(t.created_at);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
      return d >= twoWeeksAgo && d < sevenDaysAgo;
    });
    const thisWeekSales = thisWeekTx.reduce((s, t) => s + Number(t.total_amount), 0);
    const lastWeekSales = lastWeekTx.reduce((s, t) => s + Number(t.total_amount), 0);
    const weekChange = lastWeekSales > 0 ? ((thisWeekSales - lastWeekSales) / lastWeekSales * 100).toFixed(1) : 'N/A';

    const businessContext = `
BUSINESS DATA (as of ${new Date().toISOString().split('T')[0]}):

TODAY: Sales: UGX ${todaySales.toLocaleString()}, Profit: UGX ${todayProfit.toLocaleString()}, Transactions: ${todayTransactions.length}

LAST 30 DAYS: Total Sales: UGX ${totalSales30d.toLocaleString()}, Total Profit: UGX ${totalProfit30d.toLocaleString()}, Total Transactions: ${transactions.length}

WEEKLY TREND: This week: UGX ${thisWeekSales.toLocaleString()}, Last week: UGX ${lastWeekSales.toLocaleString()}, Change: ${weekChange}%

TOP 5 PRODUCTS BY REVENUE: ${JSON.stringify(topProducts)}

SLOW-MOVING PRODUCTS (in stock but no sales last 30 days): ${JSON.stringify(slowProducts)}

LOW STOCK ALERTS (${lowStockProducts.length} products): ${JSON.stringify(lowStockProducts.map(p => ({ name: p.name, stock: p.stock, threshold: p.low_stock_threshold })))}

OUT OF STOCK: ${outOfStock.length} products

TOTAL INVENTORY: ${products.length} products, ${products.reduce((s, p) => s + p.stock, 0)} total items

DAILY SALES TREND (last 7 days): ${JSON.stringify(Object.entries(dailySales).slice(0, 7).map(([date, d]) => ({ date, sales: d.sales, transactions: d.count })))}
`;

    const systemPrompt = `You are an AI business advisor for "${profile.full_name || 'the shop owner'}". You have access to their real shop data below. 

Your job is to:
1. Answer questions about their business using ACTUAL DATA
2. Provide root-cause analysis when sales drop (e.g. "Sales dropped because fewer transactions AND low stock on top sellers")
3. Give specific, actionable recommendations with numbers
4. Predict future trends based on historical patterns
5. Be proactive — suggest actions they should take NOW

IMPORTANT RULES:
- Always reference actual data and numbers from the business context
- Use UGX currency format
- Be concise but thorough
- When suggesting actions, be specific (e.g. "Restock Product X — you only have 3 left and it generated UGX 50,000 last week")
- Use bullet points and clear formatting
- If asked "why are sales low", analyze: transaction count changes, stock issues, product mix changes, day-of-week patterns

${businessContext}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      ...(conversationHistory || []),
      { role: 'user', content: message },
    ];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Please try again in a moment.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'AI credits exhausted. Please add funds.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, 'Content-Type': 'text/event-stream' },
    });

  } catch (error) {
    console.error('Error in ai-decision-engine:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
