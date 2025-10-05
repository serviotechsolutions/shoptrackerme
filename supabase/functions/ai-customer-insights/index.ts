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
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Profile not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all transactions
    const { data: transactions } = await supabase
      .from('transactions')
      .select('created_by, total_amount, profit, created_at, payment_method, product_name')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false });

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({
        insights: 'Not enough transaction data to generate insights.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Aggregate customer behavior
    const clerkStats: { [key: string]: {
      transactions: number;
      totalSales: number;
      totalProfit: number;
      paymentMethods: { [key: string]: number };
      products: { [key: string]: number };
    }} = {};

    transactions.forEach((t) => {
      const clerkId = t.created_by;
      if (!clerkStats[clerkId]) {
        clerkStats[clerkId] = {
          transactions: 0,
          totalSales: 0,
          totalProfit: 0,
          paymentMethods: {},
          products: {},
        };
      }
      
      clerkStats[clerkId].transactions += 1;
      clerkStats[clerkId].totalSales += Number(t.total_amount);
      clerkStats[clerkId].totalProfit += Number(t.profit);
      clerkStats[clerkId].paymentMethods[t.payment_method] = 
        (clerkStats[clerkId].paymentMethods[t.payment_method] || 0) + 1;
      clerkStats[clerkId].products[t.product_name] = 
        (clerkStats[clerkId].products[t.product_name] || 0) + 1;
    });

    // Get clerk details
    const clerkIds = Object.keys(clerkStats);
    const { data: clerks } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', clerkIds);

    const clerkData = clerkIds.map(id => {
      const clerk = clerks?.find(c => c.id === id);
      const stats = clerkStats[id];
      return {
        name: clerk?.full_name || clerk?.email || 'Unknown',
        ...stats,
        avgTransactionValue: stats.totalSales / stats.transactions,
        topPaymentMethod: Object.entries(stats.paymentMethods)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || 'None',
        topProduct: Object.entries(stats.products)
          .sort(([, a], [, b]) => b - a)[0]?.[0] || 'None',
      };
    });

    // Sort by total sales
    const topClerks = clerkData.sort((a, b) => b.totalSales - a.totalSales).slice(0, 5);

    // Call AI for insights
    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'You are a business intelligence analyst. Analyze sales clerk performance and customer behavior to provide actionable insights.',
          },
          {
            role: 'user',
            content: `Analyze this sales clerk and customer data:

Total Transactions: ${transactions.length}
Time Period: ${transactions[transactions.length - 1]?.created_at} to ${transactions[0]?.created_at}

Top Clerks:
${JSON.stringify(topClerks, null, 2)}

Provide insights on:
1. Top performing clerk and why
2. Payment method trends
3. Customer purchase patterns
4. Recommendations to increase sales

Format as JSON with keys: topClerk, paymentTrends, purchasePatterns, recommendations`,
          },
        ],
      }),
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    const insights = aiData.choices[0].message.content;

    let parsedInsights;
    try {
      const jsonMatch = insights.match(/```json\s*([\s\S]*?)\s*```/) || 
                       insights.match(/\{[\s\S]*\}/);
      parsedInsights = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : { insights };
    } catch (e) {
      parsedInsights = { insights };
    }

    return new Response(JSON.stringify({
      ...parsedInsights,
      topClerks,
      totalTransactions: transactions.length,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-customer-insights:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
