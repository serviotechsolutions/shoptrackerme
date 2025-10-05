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

    // Get auth header from request
    const authHeader = req.headers.get('Authorization')!;
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get user's tenant
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

    // Fetch last 30 days of transactions
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const { data: transactions } = await supabase
      .from('transactions')
      .select('created_at, total_amount, profit, quantity')
      .eq('tenant_id', profile.tenant_id)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    if (!transactions || transactions.length === 0) {
      return new Response(JSON.stringify({
        forecast: 'Not enough data to generate forecast. Need at least 7 days of transaction history.',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Aggregate daily sales
    const dailySales: { [key: string]: { sales: number; profit: number; transactions: number } } = {};
    transactions.forEach((t) => {
      const date = new Date(t.created_at).toISOString().split('T')[0];
      if (!dailySales[date]) {
        dailySales[date] = { sales: 0, profit: 0, transactions: 0 };
      }
      dailySales[date].sales += Number(t.total_amount);
      dailySales[date].profit += Number(t.profit);
      dailySales[date].transactions += 1;
    });

    const salesData = Object.entries(dailySales).map(([date, data]) => ({
      date,
      ...data,
    }));

    // Call Lovable AI for forecasting
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
            content: 'You are an expert business analyst specializing in retail sales forecasting. Analyze historical sales data and provide actionable predictions.',
          },
          {
            role: 'user',
            content: `Analyze this sales data and provide a forecast for next week and next month:
            
Sales History (Last 30 days):
${JSON.stringify(salesData, null, 2)}

Provide:
1. Next 7 days forecast (daily average)
2. Next 30 days forecast (monthly total)
3. Key trends and insights
4. Recommendations for inventory planning

Format your response as JSON with these keys: nextWeekDaily, nextMonthTotal, trends, recommendations`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('AI API error:', error);
      return new Response(JSON.stringify({ error: 'AI service error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const aiData = await response.json();
    const forecast = aiData.choices[0].message.content;

    // Try to parse JSON from AI response
    let parsedForecast;
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = forecast.match(/```json\s*([\s\S]*?)\s*```/) || 
                       forecast.match(/\{[\s\S]*\}/);
      parsedForecast = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : { forecast };
    } catch (e) {
      parsedForecast = { forecast };
    }

    return new Response(JSON.stringify({
      ...parsedForecast,
      historicalData: salesData.slice(-7), // Last 7 days
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-sales-forecast:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
