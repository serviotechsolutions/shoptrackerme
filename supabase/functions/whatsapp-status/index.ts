// WhatsApp status / delivery webhook. Public endpoint.
// Supports:
//  • Meta Cloud API — GET verify handshake (hub.mode/hub.verify_token/hub.challenge)
//                     and POST status/message callbacks
//  • Twilio         — form-encoded POST status callback (kept for extensibility)
//
// Uses a small provider abstraction so future providers can plug in.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = () => createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function mapStatus(status: string): Record<string, unknown> | null {
  const s = status.toLowerCase();
  const now = new Date().toISOString();
  if (["queued", "accepted", "sending"].includes(s)) return { status: "pending" };
  if (s === "sent") return { status: "sent", sent_at: now };
  if (s === "delivered") return { status: "delivered", delivered_at: now };
  if (s === "read") return { status: "read", read_at: now };
  if (["failed", "undelivered"].includes(s)) return { status: "failed", failed_at: now };
  return null;
}

async function updateByProviderId(sid: string, patch: Record<string, unknown>) {
  if (!sid || !Object.keys(patch).length) return;
  await admin().from("whatsapp_messages").update(patch).eq("provider_message_id", sid);
}

async function handleMetaPost(body: any) {
  // body.entry[].changes[].value.statuses[] — delivery status updates
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const patch = mapStatus(String(st.status || ""));
        if (!patch) continue;
        if (st.errors && Array.isArray(st.errors) && st.errors.length) {
          const e = st.errors[0];
          (patch as any).error_code = e?.code ? String(e.code) : null;
          (patch as any).error_message = e?.title || e?.message || e?.error_data?.details || null;
        }
        await updateByProviderId(String(st.id || ""), patch);
      }
      // Inbound messages could be handled here later (value.messages[])
    }
  }
}

async function handleTwilioForm(params: URLSearchParams) {
  const sid = params.get("MessageSid") || params.get("SmsSid") || "";
  const status = (params.get("MessageStatus") || params.get("SmsStatus") || "").toLowerCase();
  const patch = mapStatus(status);
  if (!patch) return;
  const errorCode = params.get("ErrorCode");
  const errorMessage = params.get("ErrorMessage");
  if (errorCode) (patch as any).error_code = errorCode;
  if (errorMessage) (patch as any).error_message = errorMessage;
  await updateByProviderId(sid, patch);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Meta verify handshake
    if (req.method === "GET") {
      const u = new URL(req.url);
      const mode = u.searchParams.get("hub.mode");
      const token = u.searchParams.get("hub.verify_token");
      const challenge = u.searchParams.get("hub.challenge") || "";
      if (mode === "subscribe" && token) {
        const { data } = await admin().from("whatsapp_settings")
          .select("tenant_id").eq("verify_token", token).limit(1).maybeSingle();
        if (data) {
          return new Response(challenge, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/plain" } });
        }
        return new Response("Forbidden", { status: 403, headers: corsHeaders });
      }
      return new Response("ok", { headers: corsHeaders });
    }

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const body = await req.json();
      // Meta payloads always include `object: "whatsapp_business_account"`
      if (body?.object === "whatsapp_business_account" || Array.isArray(body?.entry)) {
        await handleMetaPost(body);
      } else if (body?.MessageSid || body?.SmsSid) {
        await handleTwilioForm(new URLSearchParams(body as Record<string, string>));
      }
    } else {
      const text = await req.text();
      const params = new URLSearchParams(text);
      if (params.get("MessageSid") || params.get("SmsSid")) {
        await handleTwilioForm(params);
      }
    }
    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("whatsapp-status error", e);
    return new Response("error", { status: 200, headers: corsHeaders });
  }
});
