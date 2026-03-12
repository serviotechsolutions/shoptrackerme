import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user tenant
    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader! } },
    });
    const { data: { user } } = await anonClient.auth.getUser();
    if (!user) throw new Error("Unauthorized");

    const { data: profile } = await supabase
      .from("profiles").select("tenant_id").eq("id", user.id).single();
    if (!profile) throw new Error("No profile found");
    const tenantId = profile.tenant_id;

    // Gather data for AI analysis
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [productsRes, transactionsRes, customersRes] = await Promise.all([
      supabase.from("products").select("*").eq("tenant_id", tenantId),
      supabase.from("transactions").select("*").eq("tenant_id", tenantId)
        .gte("created_at", thirtyDaysAgo.toISOString()),
      supabase.from("customers").select("*").eq("tenant_id", tenantId),
    ]);

    const products = productsRes.data || [];
    const transactions = transactionsRes.data || [];
    const customers = customersRes.data || [];

    // Calculate sales velocity per product
    const productSales: Record<string, { qty: number; revenue: number; name: string }> = {};
    transactions.forEach((t: any) => {
      if (!productSales[t.product_id]) {
        productSales[t.product_id] = { qty: 0, revenue: 0, name: t.product_name };
      }
      productSales[t.product_id].qty += t.quantity;
      productSales[t.product_id].revenue += Number(t.total_amount);
    });

    // Day-of-week analysis
    const dayOfWeekSales: Record<string, number> = {};
    transactions.forEach((t: any) => {
      const day = new Date(t.created_at).toLocaleDateString("en-US", { weekday: "long" });
      dayOfWeekSales[day] = (dayOfWeekSales[day] || 0) + Number(t.total_amount);
    });

    // Slow-moving products
    const slowMoving = products.filter(p => {
      const sales = productSales[p.id];
      return !sales || sales.qty < 3;
    }).slice(0, 10);

    // Best sellers
    const bestSellers = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5);

    const prompt = `You are a retail marketing AI. Analyze the following shop data and suggest 3-5 specific promotional campaigns.

PRODUCTS (${products.length} total):
${products.slice(0, 20).map(p => `- ${p.name}: Price ${p.selling_price}, Stock ${p.stock}, Category ${p.category}`).join("\n")}

SLOW-MOVING PRODUCTS (low or no sales in 30 days):
${slowMoving.map(p => `- ${p.name}: Price ${p.selling_price}, Stock ${p.stock}`).join("\n")}

BEST SELLERS (last 30 days):
${bestSellers.map(([id, s]) => `- ${s.name}: ${s.qty} units, Revenue ${s.revenue}`).join("\n")}

SALES BY DAY OF WEEK:
${Object.entries(dayOfWeekSales).map(([day, total]) => `- ${day}: ${total}`).join("\n")}

TOTAL CUSTOMERS: ${customers.length}
TOTAL TRANSACTIONS (30 days): ${transactions.length}

Return a JSON array of promotion suggestions with this structure:
[{
  "name": "Campaign Name",
  "description": "What the campaign does",
  "type": "flash_sale" or "automated" or "manual",
  "discount_type": "percentage" or "fixed",
  "discount_value": number,
  "duration_hours": number,
  "target_products": ["product names"],
  "reasoning": "Why this promotion makes sense based on the data",
  "expected_impact": "Expected result"
}]`;

    if (!lovableKey) {
      // Fallback: generate basic suggestions without AI
      const suggestions = [];
      if (slowMoving.length > 0) {
        suggestions.push({
          name: `Clear Slow Stock: ${slowMoving[0].name}`,
          description: `Discount on ${slowMoving[0].name} to clear inventory`,
          type: "manual",
          discount_type: "percentage",
          discount_value: 15,
          duration_hours: 120,
          target_products: [slowMoving[0].name],
          reasoning: `${slowMoving[0].name} has had very low sales in the past 30 days with ${slowMoving[0].stock} units in stock.`,
          expected_impact: "Clear slow-moving inventory and recover capital"
        });
      }
      if (bestSellers.length > 0) {
        const peakDay = Object.entries(dayOfWeekSales).sort((a, b) => b[1] - a[1])[0];
        if (peakDay) {
          suggestions.push({
            name: `${peakDay[0]} Flash Sale`,
            description: `Flash sale on ${peakDay[0]}s when traffic is highest`,
            type: "flash_sale",
            discount_type: "percentage",
            discount_value: 10,
            duration_hours: 4,
            target_products: [],
            reasoning: `${peakDay[0]} has the highest sales volume at ${peakDay[1]}. A flash sale can boost it further.`,
            expected_impact: "Increase peak-day revenue by 15-25%"
          });
        }
      }
      return new Response(JSON.stringify({ suggestions }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Call AI
    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a retail marketing expert. Return ONLY valid JSON array, no markdown." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      throw new Error("AI service error");
    }

    const aiData = await aiResponse.json();
    let content = aiData.choices?.[0]?.message?.content || "[]";
    
    // Clean markdown code blocks if present
    content = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    
    const suggestions = JSON.parse(content);

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
