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
    const { productId } = await req.json();

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

    // Get current product
    const { data: currentProduct } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .single();

    if (!currentProduct) {
      return new Response(JSON.stringify({ error: 'Product not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get all transactions with this product
    const { data: currentProductTransactions } = await supabase
      .from('transactions')
      .select('created_at, created_by')
      .eq('product_id', productId)
      .eq('tenant_id', profile.tenant_id);

    // Get all other products
    const { data: allProducts } = await supabase
      .from('products')
      .select('id, name, selling_price')
      .eq('tenant_id', profile.tenant_id)
      .neq('id', productId)
      .gt('stock', 0);

    if (!allProducts || allProducts.length === 0) {
      return new Response(JSON.stringify({ recommendations: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Find products frequently bought together (within same hour by same user)
    const coOccurrences: { [key: string]: number } = {};
    
    if (currentProductTransactions) {
      for (const transaction of currentProductTransactions) {
        const hourWindow = new Date(transaction.created_at);
        hourWindow.setHours(hourWindow.getHours() - 1);
        const hourEnd = new Date(transaction.created_at);
        hourEnd.setHours(hourEnd.getHours() + 1);

        const { data: relatedTransactions } = await supabase
          .from('transactions')
          .select('product_id')
          .eq('created_by', transaction.created_by)
          .eq('tenant_id', profile.tenant_id)
          .neq('product_id', productId)
          .gte('created_at', hourWindow.toISOString())
          .lte('created_at', hourEnd.toISOString());

        relatedTransactions?.forEach(t => {
          coOccurrences[t.product_id] = (coOccurrences[t.product_id] || 0) + 1;
        });
      }
    }

    // Get top co-occurring products
    const topProducts = Object.entries(coOccurrences)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([productId]) => productId);

    const recommendations = allProducts
      .filter(p => topProducts.includes(p.id))
      .slice(0, 3);

    // If not enough co-occurrences, use AI for recommendations
    if (recommendations.length < 3) {
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
              content: 'You are a retail expert. Suggest complementary products that customers might buy together.',
            },
            {
              role: 'user',
              content: `Current product: ${currentProduct.name}
Price: ${currentProduct.selling_price}
Description: ${currentProduct.description || 'No description'}

Available products:
${allProducts.slice(0, 20).map(p => `- ${p.name} (${p.selling_price} UGX)`).join('\n')}

Suggest 3 products from the list that customers might buy with ${currentProduct.name}. Return just the product names as a JSON array of strings.`,
            },
          ],
        }),
      });

      if (response.ok) {
        const aiData = await response.json();
        const suggestions = aiData.choices[0].message.content;
        
        try {
          const jsonMatch = suggestions.match(/```json\s*([\s\S]*?)\s*```/) || 
                           suggestions.match(/\[[\s\S]*?\]/);
          const suggestedNames = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : [];
          
          const aiRecommendations = allProducts.filter(p => 
            suggestedNames.some((name: string) => p.name.toLowerCase().includes(name.toLowerCase()))
          ).slice(0, 3);

          return new Response(JSON.stringify({
            recommendations: aiRecommendations.length > 0 ? aiRecommendations : allProducts.slice(0, 3),
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        } catch (e) {
          console.error('AI parsing error:', e);
        }
      }
    }

    return new Response(JSON.stringify({
      recommendations: recommendations.length > 0 ? recommendations : allProducts.slice(0, 3),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-product-recommendations:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
