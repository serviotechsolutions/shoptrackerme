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

    const now = new Date();

    // 1. Auto-expire promotions past their end_time
    const { data: expiredPromos } = await supabase
      .from("promotions")
      .select("id")
      .eq("status", "active")
      .lt("end_time", now.toISOString())
      .not("end_time", "is", null);

    if (expiredPromos && expiredPromos.length > 0) {
      await supabase
        .from("promotions")
        .update({ status: "expired" })
        .in("id", expiredPromos.map((p: any) => p.id));
      console.log(`Expired ${expiredPromos.length} promotions`);
    }

    // 2. Auto-activate promotions whose start_time has passed
    const { data: pendingPromos } = await supabase
      .from("promotions")
      .select("id")
      .eq("status", "draft")
      .lte("start_time", now.toISOString());

    if (pendingPromos && pendingPromos.length > 0) {
      await supabase
        .from("promotions")
        .update({ status: "active" })
        .in("id", pendingPromos.map((p: any) => p.id));
      console.log(`Activated ${pendingPromos.length} promotions`);
    }

    // 3. Check max redemptions
    const { data: maxedPromos } = await supabase
      .from("promotions")
      .select("id, max_redemptions, current_redemptions")
      .eq("status", "active")
      .not("max_redemptions", "is", null);

    const toComplete = (maxedPromos || []).filter(
      (p: any) => p.current_redemptions >= p.max_redemptions
    );

    if (toComplete.length > 0) {
      await supabase
        .from("promotions")
        .update({ status: "completed" })
        .in("id", toComplete.map((p: any) => p.id));
      console.log(`Completed ${toComplete.length} fully-redeemed promotions`);
    }

    return new Response(JSON.stringify({
      expired: expiredPromos?.length || 0,
      activated: pendingPromos?.length || 0,
      completed: toComplete.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auto promotions error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
