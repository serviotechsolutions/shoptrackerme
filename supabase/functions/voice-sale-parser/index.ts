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
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: 'AI service not configured' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authenticate the caller
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const transcript = String(body?.transcript || '').slice(0, 1000);
    const products = Array.isArray(body?.products) ? body.products.slice(0, 400) : [];
    const customers = Array.isArray(body?.customers) ? body.customers.slice(0, 400) : [];
    if (!transcript.trim()) {
      return new Response(JSON.stringify({ error: 'Empty transcript' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const catalog = products.map((p: any) => ({
      id: String(p.id),
      name: String(p.name),
      price: Number(p.price) || 0,
      stock: Number(p.stock) || 0,
    }));

    const customerCatalog = customers.map((c: any) => ({
      id: String(c.id),
      name: String(c.name),
    }));

    const systemPrompt = `You are a POS voice command parser for a shop in Uganda (currency UGX).
Parse the attendant's spoken command into structured sale actions.

PRODUCT CATALOG (JSON): ${JSON.stringify(catalog)}
CUSTOMER LIST (JSON): ${JSON.stringify(customerCatalog)}

RULES:
- Match spoken product names to catalog products using fuzzy/natural matching (e.g. "rice" matches "Super Rice 10kg").
- If exactly ONE product clearly matches, set product_id. If SEVERAL could match, leave product_id empty and list all candidate_ids. If NONE match, leave both empty.
- Numbers may be spoken as words ("twenty-five thousand" = 25000, "two" = 2).
- "at X each" / "for X" / "at today's price of X" = unit_price override for that item.
- "give X percent discount" / "X percent off" = percentage discount. "discount X (shillings)" = fixed discount.
- "update PRODUCT price to X" (without selling) = a permanent price_update, not a sale item.
- Default quantity is 1 when not stated.
- CUSTOMER: phrases like "sell to John", "customer is Sarah", "add this sale to Peter" name the customer. Match against the CUSTOMER LIST (fuzzy). If one clear match, set customer.customer_id; otherwise leave it empty and keep the spoken name in customer.query. If no customer mentioned, omit customer.
- PAYMENT: phrases like "customer paid fifty thousand cash", "received 100000", "paid by mobile money / Airtel Money / MTN / momo" = payment. Map Airtel Money, MTN, momo, mobile money to method "mobile_money"; cash to "cash"; card/visa to "card"; anything else to "other". amount = the amount received (0 if only a method was spoken).
- RECEIPT: "print receipt" = print, "download receipt" = download, "send receipt by whatsapp" = whatsapp, "send receipt by email" = email. Omit if not mentioned.
- summary: a short natural sentence confirming what was understood, suitable to be read aloud, using UGX amounts.
Always call the build_sale_actions tool exactly once.`;

    const tools = [{
      type: "function",
      function: {
        name: "build_sale_actions",
        description: "Return the structured sale actions parsed from the voice command",
        parameters: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  query: { type: "string", description: "the product phrase as spoken" },
                  product_id: { type: "string", description: "matched catalog id, empty if ambiguous or not found" },
                  candidate_ids: { type: "array", items: { type: "string" } },
                  quantity: { type: "number" },
                  unit_price: { type: "number", description: "spoken price override, 0 if none" },
                },
                required: ["query", "quantity"],
              },
            },
            discount: {
              type: "object",
              properties: {
                kind: { type: "string", enum: ["percentage", "fixed"] },
                value: { type: "number" },
              },
              required: ["kind", "value"],
            },
            price_updates: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  product_id: { type: "string" },
                  new_price: { type: "number" },
                },
                required: ["product_id", "new_price"],
              },
            },
            customer: {
              type: "object",
              properties: {
                query: { type: "string", description: "customer name as spoken" },
                customer_id: { type: "string", description: "matched customer id, empty if not in list" },
              },
              required: ["query"],
            },
            payment: {
              type: "object",
              properties: {
                amount: { type: "number", description: "amount received, 0 if not stated" },
                method: { type: "string", enum: ["cash", "mobile_money", "card", "other"] },
              },
            },
            receipt_action: { type: "string", enum: ["print", "download", "whatsapp", "email", "none"] },
            summary: { type: "string" },
          },
          required: ["items", "summary"],
        },
      },
    }];

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: transcript },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "build_sale_actions" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI gateway error', response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded, please try again shortly.' }), {
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

    const aiData = await response.json();
    const toolCall = aiData?.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: 'Could not understand the command. Please try again.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let parsed: any;
    try {
      parsed = JSON.parse(toolCall.function.arguments);
    } catch {
      return new Response(JSON.stringify({ error: 'Could not parse the command. Please try again.' }), {
        status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = {
      items: (parsed.items || []).map((i: any) => ({
        query: String(i.query || ''),
        product_id: i.product_id ? String(i.product_id) : null,
        candidate_ids: Array.isArray(i.candidate_ids) ? i.candidate_ids.map(String) : [],
        quantity: Math.max(1, Math.round(Number(i.quantity) || 1)),
        unit_price: Number(i.unit_price) > 0 ? Number(i.unit_price) : null,
      })),
      discount: parsed.discount && Number(parsed.discount.value) > 0
        ? { kind: parsed.discount.kind === 'fixed' ? 'fixed' : 'percentage', value: Number(parsed.discount.value) }
        : null,
      price_updates: (parsed.price_updates || [])
        .filter((u: any) => u.product_id && Number(u.new_price) > 0)
        .map((u: any) => ({ product_id: String(u.product_id), new_price: Number(u.new_price) })),
      summary: String(parsed.summary || 'Command processed.'),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in voice-sale-parser:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
