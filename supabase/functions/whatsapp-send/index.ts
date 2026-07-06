// Send WhatsApp message via the tenant's Twilio credentials.
// Logs every attempt to public.whatsapp_messages and enforces rate limits.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface SendPayload {
  to: string;
  body?: string;
  media_url?: string;
  media_kind?: "pdf" | "image" | null;
  message_type?: string; // receipt | payment | promotion | reminder | custom
  customer_id?: string | null;
  related_sale_id?: string | null;
  related_payment_id?: string | null;
  related_promotion_id?: string | null;
  test?: boolean;
}

function normalizePhone(input: string): string | null {
  if (!input) return null;
  let s = String(input).trim().replace(/[\s\-()]/g, "");
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return "+" + digits;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) {
    // Uganda / East Africa default
    return "+256" + digits.slice(1);
  }
  if (digits.length >= 11 && digits.length <= 15) return "+" + digits;
  return null;
}

async function twilioSend(sid: string, token: string, from: string, to: string, body?: string, mediaUrl?: string) {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const params = new URLSearchParams();
  params.set("From", from.startsWith("whatsapp:") ? from : `whatsapp:${from}`);
  params.set("To", `whatsapp:${to}`);
  if (body) params.set("Body", body);
  if (mediaUrl) params.set("MediaUrl", mediaUrl);
  // Delivery status callback (project webhook)
  const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https?:\/\/([^.]+)/)?.[1];
  if (projectRef) {
    params.set(
      "StatusCallback",
      `https://${projectRef}.functions.supabase.co/whatsapp-status`,
    );
  }
  const auth = btoa(`${sid}:${token}`);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, json, text };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const userId = claims.claims.sub as string;

    const { data: profile } = await admin.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const tenantId = profile.tenant_id as string;

    const payload = (await req.json()) as SendPayload;
    const to = normalizePhone(payload.to);
    if (!to) {
      return new Response(JSON.stringify({ error: "Invalid phone number" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!payload.body && !payload.media_url) {
      return new Response(JSON.stringify({ error: "Message must have body or media_url" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: settings } = await admin
      .from("whatsapp_settings").select("*").eq("tenant_id", tenantId).maybeSingle();

    if (!settings || !settings.is_enabled || !settings.account_sid || !settings.auth_token || !settings.from_number) {
      return new Response(JSON.stringify({ error: "WhatsApp is not configured. Ask an admin to set it up in Settings → WhatsApp." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Rate limits
    const now = new Date();
    const minuteAgo = new Date(now.getTime() - 60 * 1000).toISOString();
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const { count: minCount } = await admin.from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("created_at", minuteAgo)
      .in("status", ["pending", "sent", "delivered", "read"]);
    if ((minCount ?? 0) >= (settings.max_per_minute ?? 20)) {
      return new Response(JSON.stringify({ error: `Rate limit: max ${settings.max_per_minute} messages/minute reached.` }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { count: dayCount } = await admin.from("whatsapp_messages")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId).gte("created_at", dayAgo)
      .in("status", ["pending", "sent", "delivered", "read"]);
    if ((dayCount ?? 0) >= (settings.max_per_day ?? 1000)) {
      return new Response(JSON.stringify({ error: `Rate limit: max ${settings.max_per_day} messages/day reached.` }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Log pending row first
    const { data: log } = await admin.from("whatsapp_messages").insert({
      tenant_id: tenantId,
      customer_id: payload.customer_id ?? null,
      recipient_phone: to,
      message_type: payload.message_type ?? "custom",
      body: payload.body ?? null,
      media_url: payload.media_url ?? null,
      media_kind: payload.media_kind ?? null,
      status: "pending",
      related_sale_id: payload.related_sale_id ?? null,
      related_payment_id: payload.related_payment_id ?? null,
      related_promotion_id: payload.related_promotion_id ?? null,
      sent_by: userId,
    }).select("id").single();

    const result = await twilioSend(
      settings.account_sid, settings.auth_token, settings.from_number,
      to, payload.body, payload.media_url,
    );

    if (!result.ok || !result.json?.sid) {
      const errMsg = result.json?.message || result.text || "Twilio error";
      const errCode = result.json?.code ? String(result.json.code) : String(result.status);
      if (log?.id) {
        await admin.from("whatsapp_messages").update({
          status: "failed", error_code: errCode, error_message: errMsg, failed_at: new Date().toISOString(),
        }).eq("id", log.id);
      }
      return new Response(JSON.stringify({ error: errMsg, code: errCode, message_id: log?.id }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (log?.id) {
      await admin.from("whatsapp_messages").update({
        status: "sent",
        provider_message_id: result.json.sid,
        sent_at: new Date().toISOString(),
      }).eq("id", log.id);
    }

    // If this was a "test" ping, record test status
    if (payload.test) {
      await admin.from("whatsapp_settings").update({
        last_test_at: new Date().toISOString(),
        last_test_status: "ok",
        last_test_error: null,
      }).eq("tenant_id", tenantId);
    }

    return new Response(JSON.stringify({ ok: true, message_id: log?.id, provider_sid: result.json.sid }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("whatsapp-send error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
