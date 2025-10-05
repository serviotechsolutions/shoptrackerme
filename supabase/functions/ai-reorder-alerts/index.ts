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

    // Get all products with their sales velocity
    const { data: products } = await supabase
      .from('products')
      .select('id, name, stock, low_stock_threshold, buying_price')
      .eq('tenant_id', profile.tenant_id);

    if (!products || products.length === 0) {
      return new Response(JSON.stringify({ alerts: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get sales data for last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('product_id, quantity, created_at')
      .eq('tenant_id', profile.tenant_id)
      .gte('created_at', thirtyDaysAgo.toISOString());

    // Calculate sales velocity per product
    const productVelocity = products.map((product) => {
      const productSales = transactions?.filter(t => t.product_id === product.id) || [];
      const totalSold = productSales.reduce((sum, t) => sum + t.quantity, 0);
      const dailyVelocity = totalSold / 30; // Average per day

      return {
        ...product,
        dailyVelocity,
        totalSold,
        daysUntilStockout: dailyVelocity > 0 ? product.stock / dailyVelocity : 999,
      };
    });

    // Filter products that need attention
    const criticalProducts = productVelocity.filter(
      p => p.daysUntilStockout < 14 || p.stock <= p.low_stock_threshold
    );

    if (criticalProducts.length === 0) {
      return new Response(JSON.stringify({ alerts: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call AI for intelligent recommendations
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
            content: 'You are an inventory management expert. Analyze product stock levels and sales velocity to provide smart reorder recommendations.',
          },
          {
            role: 'user',
            content: `Analyze these products and provide reorder recommendations:

${JSON.stringify(criticalProducts.map(p => ({
  name: p.name,
  currentStock: p.stock,
  threshold: p.low_stock_threshold,
  dailySales: p.dailyVelocity.toFixed(2),
  daysUntilStockout: p.daysUntilStockout.toFixed(1),
  buyingPrice: p.buying_price,
})), null, 2)}

For each product, suggest:
1. Recommended reorder quantity
2. Urgency level (Critical/High/Medium)
3. Brief reason

Format as JSON array with keys: productName, reorderQuantity, urgency, reason`,
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
    const recommendations = aiData.choices[0].message.content;

    let parsedRecommendations;
    try {
      const jsonMatch = recommendations.match(/```json\s*([\s\S]*?)\s*```/) || 
                       recommendations.match(/\[[\s\S]*\]/);
      parsedRecommendations = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : [];
    } catch (e) {
      parsedRecommendations = criticalProducts.map(p => ({
        productName: p.name,
        reorderQuantity: Math.ceil(p.dailyVelocity * 14),
        urgency: p.daysUntilStockout < 7 ? 'Critical' : 'High',
        reason: `${p.daysUntilStockout.toFixed(1)} days until stockout`,
      }));
    }

    return new Response(JSON.stringify({
      alerts: parsedRecommendations,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-reorder-alerts:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
