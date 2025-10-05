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

    // Get recent transactions (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentTransactions } = await supabase
      .from('transactions')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    if (!recentTransactions || recentTransactions.length === 0) {
      return new Response(JSON.stringify({ suspiciousTransactions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Calculate statistical baselines
    const amounts = recentTransactions.map(t => Number(t.total_amount));
    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const stdDev = Math.sqrt(
      amounts.reduce((sum, val) => sum + Math.pow(val - avgAmount, 2), 0) / amounts.length
    );

    // Flag potential anomalies
    const flaggedTransactions = recentTransactions.filter(t => {
      const amount = Number(t.total_amount);
      const isOutlier = Math.abs(amount - avgAmount) > (2.5 * stdDev);
      const isNegativeProfit = Number(t.profit) < 0;
      const isHighQuantity = t.quantity > 20;
      
      return isOutlier || isNegativeProfit || isHighQuantity;
    }).slice(0, 10); // Top 10 suspicious

    if (flaggedTransactions.length === 0) {
      return new Response(JSON.stringify({ suspiciousTransactions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Call AI for fraud analysis
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
            content: 'You are a fraud detection analyst for retail transactions. Analyze transactions for suspicious patterns.',
          },
          {
            role: 'user',
            content: `Analyze these potentially suspicious transactions:

Average Transaction: ${avgAmount.toFixed(2)} UGX
Standard Deviation: ${stdDev.toFixed(2)} UGX

Flagged Transactions:
${JSON.stringify(flaggedTransactions.map(t => ({
  id: t.id.slice(0, 8),
  product: t.product_name,
  quantity: t.quantity,
  amount: t.total_amount,
  profit: t.profit,
  payment: t.payment_method,
  time: t.created_at,
})), null, 2)}

For each transaction, assess:
1. Risk level (High/Medium/Low)
2. Reason for suspicion
3. Recommended action

Format as JSON array with keys: transactionId, riskLevel, reason, action`,
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
    const analysis = aiData.choices[0].message.content;

    let parsedAnalysis;
    try {
      const jsonMatch = analysis.match(/```json\s*([\s\S]*?)\s*```/) || 
                       analysis.match(/\[[\s\S]*\]/);
      parsedAnalysis = jsonMatch ? JSON.parse(jsonMatch[1] || jsonMatch[0]) : [];
    } catch (e) {
      parsedAnalysis = flaggedTransactions.map(t => ({
        transactionId: t.id.slice(0, 8),
        riskLevel: 'Medium',
        reason: 'Statistical anomaly detected',
        action: 'Review transaction details',
      }));
    }

    return new Response(JSON.stringify({
      suspiciousTransactions: parsedAnalysis,
      totalFlagged: flaggedTransactions.length,
      avgTransaction: avgAmount,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ai-fraud-detection:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
