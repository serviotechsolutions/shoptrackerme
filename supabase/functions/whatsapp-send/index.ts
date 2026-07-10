// Send WhatsApp message via the tenant's configured provider.
// Business logic (validation, logging, rate limits) is provider-agnostic.
// Providers implement a small interface — Meta Cloud API is the default.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface SendPayload {
  to: string;
  body?: string;
  media_url?: string;
  media_kind?: "pdf" | "image" | null;
  message_type?: string;
  customer_id?: string | null;
  related_sale_id?: string | null;
  related_payment_id?: string | null;
  related_promotion_id?: string | null;
  test?: boolean;
}

function normalizePhone(input: string): string | null {
  if (!input) return null;
  const s = String(input).trim().replace(/[\s\-()]/g, "");
  if (s.startsWith("+")) {
    const digits = s.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return "+" + digits;
  }
  const digits = s.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return "+256" + digits.slice(1);
  if (digits.length >= 11 && digits.length <= 15) return "+" + digits;
  return null;
}

// ---------- Provider abstraction ----------
interface ProviderSendArgs {
  to: string;              // E.164 with '+'
  body?: string;
  mediaUrl?: string;
  mediaKind?: "pdf" | "image" | null;
}
interface ProviderSendResult {
  ok: boolean;
  providerMessageId?: string;
  errorCode?: string;
  errorMessage?: string;
  providerResponse?: unknown;
  providerStatus?: number;
}
interface WhatsAppProvider {
  name: string;
  isConfigured(s: any): boolean;
  send(s: any, args: ProviderSendArgs): Promise<ProviderSendResult>;
}

const metaProvider: WhatsAppProvider = {
  name: "meta",
  isConfigured: (s) => !!(s?.access_token && s?.phone_number_id),
  async send(s, { to, body, mediaUrl, mediaKind }) {
    const version = s.api_version || "v20.0";
    // NOTE: Meta Cloud API requires the Phone Number ID (not the WABA ID) in the URL.
    const phoneNumberId = String(s.phone_number_id).trim();
    const url = `https://graph.facebook.com/${version}/${phoneNumberId}/messages`;
    // E.164 digits only — no leading '+'.
    const toDigits = to.replace(/\D/g, "");
    let payload: Record<string, unknown>;
    if (mediaUrl && mediaKind === "pdf") {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toDigits,
        type: "document",
        document: { link: mediaUrl, filename: "receipt.pdf", caption: body || undefined },
      };
    } else if (mediaUrl && mediaKind === "image") {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toDigits,
        type: "image",
        image: { link: mediaUrl, caption: body || undefined },
      };
    } else {
      payload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toDigits,
        type: "text",
        text: { body: body || "", preview_url: false },
      };
    }
    console.log("[whatsapp-send] Meta request", {
      url,
      to: toDigits,
      type: payload.type,
      hasMedia: !!mediaUrl,
    });
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${String(s.access_token).trim()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      console.error("[whatsapp-send] Network error calling Meta", e);
      return { ok: false, errorCode: "network_error", errorMessage: (e as Error).message };
    }
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    console.log("[whatsapp-send] Meta response", {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers.entries()),
      rawBody: text,
      parsed: json,
      messaging_product: json?.messaging_product,
      contacts: json?.contacts,
      messages: json?.messages,
      error: json?.error,
    });
    const messageId = json?.messages?.[0]?.id;
    if (res.status !== 200 || !messageId) {
      const err = json?.error;
      const code = err?.code ?? err?.error_subcode ?? res.status;
      const msg = err?.error_user_msg
        || err?.message
        || (json ? JSON.stringify(json) : text)
        || `Meta API returned HTTP ${res.status} with no message id`;
      return { ok: false, errorCode: String(code), errorMessage: msg, providerResponse: json ?? text, providerStatus: res.status } as ProviderSendResult;
    }
    return { ok: true, providerMessageId: messageId, providerResponse: json, providerStatus: res.status } as ProviderSendResult;
  },
};

const twilioProvider: WhatsAppProvider = {
  name: "twilio",
  isConfigured: (s) => !!(s?.account_sid && s?.auth_token && s?.from_number),
  async send(s, { to, body, mediaUrl }) {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${s.account_sid}/Messages.json`;
    const params = new URLSearchParams();
    params.set("From", s.from_number.startsWith("whatsapp:") ? s.from_number : `whatsapp:${s.from_number}`);
    params.set("To", `whatsapp:${to}`);
    if (body) params.set("Body", body);
    if (mediaUrl) params.set("MediaUrl", mediaUrl);
    const projectRef = Deno.env.get("SUPABASE_URL")?.match(/https?:\/\/([^.]+)/)?.[1];
    if (projectRef) params.set("StatusCallback", `https://${projectRef}.functions.supabase.co/whatsapp-status`);
    const auth = btoa(`${s.account_sid}:${s.auth_token}`);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const text = await res.text();
    let json: any = null;
    try { json = JSON.parse(text); } catch { /* ignore */ }
    if (!res.ok || !json?.sid) {
      return {
        ok: false,
        errorCode: json?.code ? String(json.code) : String(res.status),
        errorMessage: json?.message || text || "Twilio error",
      };
    }
    return { ok: true, providerMessageId: json.sid };
  },
};

const providers: Record<string, WhatsAppProvider> = {
  meta: metaProvider,
  twilio: twilioProvider,
};

function getProvider(name?: string | null): WhatsAppProvider {
  return providers[(name || "meta").toLowerCase()] || metaProvider;
}
// ---------- End provider abstraction ----------

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

    const provider = getProvider(settings?.provider);
    if (!settings || !settings.is_enabled || !provider.isConfigured(settings)) {
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
      provider: provider.name,
      related_sale_id: payload.related_sale_id ?? null,
      related_payment_id: payload.related_payment_id ?? null,
      related_promotion_id: payload.related_promotion_id ?? null,
      sent_by: userId,
    }).select("id").single();

    const result = await provider.send(settings, {
      to, body: payload.body, mediaUrl: payload.media_url, mediaKind: payload.media_kind ?? null,
    });

    if (!result.ok) {
      if (log?.id) {
        await admin.from("whatsapp_messages").update({
          status: "failed",
          error_code: result.errorCode ?? null,
          error_message: result.errorMessage ?? "Send failed",
          failed_at: new Date().toISOString(),
        }).eq("id", log.id);
      }
      if (payload.test) {
        await admin.from("whatsapp_settings").update({
          last_test_at: new Date().toISOString(),
          last_test_status: "failed",
          last_test_error: result.errorMessage ?? "Send failed",
        }).eq("tenant_id", tenantId);
      }
      return new Response(JSON.stringify({ error: result.errorMessage, code: result.errorCode, message_id: log?.id }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (log?.id) {
      await admin.from("whatsapp_messages").update({
        status: "sent",
        provider_message_id: result.providerMessageId,
        sent_at: new Date().toISOString(),
      }).eq("id", log.id);
    }

    if (payload.test) {
      await admin.from("whatsapp_settings").update({
        last_test_at: new Date().toISOString(),
        last_test_status: "ok",
        last_test_error: null,
      }).eq("tenant_id", tenantId);
    }

    return new Response(JSON.stringify({ ok: true, message_id: log?.id, provider_sid: result.providerMessageId, provider: provider.name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("whatsapp-send error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
