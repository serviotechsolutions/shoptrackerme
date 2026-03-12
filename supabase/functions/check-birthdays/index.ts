import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    // Find customers with birthdays today (match month and day)
    const { data: customers, error } = await supabase
      .from("customers")
      .select("id, name, tenant_id, date_of_birth")
      .not("date_of_birth", "is", null);

    if (error) throw error;

    const birthdayCustomers = (customers || []).filter((c: any) => {
      if (!c.date_of_birth) return false;
      const dob = new Date(c.date_of_birth);
      return dob.getMonth() + 1 === month && dob.getDate() === day;
    });

    console.log(`Found ${birthdayCustomers.length} birthday customers today`);

    const results = [];

    for (const customer of birthdayCustomers) {
      // Check if we already created a birthday promo for this customer this year
      const yearStart = new Date(today.getFullYear(), 0, 1).toISOString();
      const { data: existing } = await supabase
        .from("promotions")
        .select("id")
        .eq("tenant_id", customer.tenant_id)
        .eq("type", "birthday")
        .eq("trigger_type", "birthday")
        .gte("created_at", yearStart)
        .contains("metadata", { customer_id: customer.id });

      if (existing && existing.length > 0) {
        console.log(`Birthday promo already exists for ${customer.name}`);
        continue;
      }

      // Generate unique promo code
      const firstName = customer.name.split(" ")[0].toUpperCase().replace(/[^A-Z]/g, "");
      const promoCode = `${firstName}BDAY${Math.floor(Math.random() * 100).toString().padStart(2, "0")}`;

      // Default 10% discount, valid for 3 days
      const endTime = new Date();
      endTime.setDate(endTime.getDate() + 3);

      const { data: promo, error: promoError } = await supabase
        .from("promotions")
        .insert({
          tenant_id: customer.tenant_id,
          name: `🎂 Happy Birthday ${customer.name}!`,
          description: `Special birthday discount for ${customer.name}`,
          type: "birthday",
          status: "active",
          discount_type: "percentage",
          discount_value: 10,
          promo_code: promoCode,
          start_time: today.toISOString(),
          end_time: endTime.toISOString(),
          max_redemptions: 1,
          trigger_type: "birthday",
          target_customers: JSON.stringify([customer.id]),
          metadata: { customer_id: customer.id, customer_name: customer.name },
        })
        .select()
        .single();

      if (promoError) {
        console.error(`Error creating promo for ${customer.name}:`, promoError);
        continue;
      }

      // Create notification
      await supabase.from("notifications").insert({
        tenant_id: customer.tenant_id,
        title: "🎂 Birthday Promotion Created",
        message: `Happy Birthday ${customer.name}! A special 10% discount code ${promoCode} has been generated. Valid for 3 days.`,
        type: "birthday_promo",
        metadata: {
          customer_id: customer.id,
          customer_name: customer.name,
          promo_code: promoCode,
          promotion_id: promo.id,
        },
      });

      results.push({
        customer: customer.name,
        promoCode,
        discount: "10%",
        validUntil: endTime.toISOString(),
      });
    }

    return new Response(JSON.stringify({ 
      message: `Processed ${birthdayCustomers.length} birthday(s), created ${results.length} promos`,
      results 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Birthday check error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
