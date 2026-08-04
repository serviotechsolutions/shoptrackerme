// WhatsApp webhook. Public endpoint (verify_jwt disabled by default).
// Handles:
//  • Meta Cloud API GET verify handshake (hub.mode/hub.verify_token/hub.challenge)
//  • Meta POST callbacks: delivery statuses AND inbound customer messages
//  • Twilio form-encoded status callbacks (kept for extensibility)
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getOrCreateConversation, touchConversation, previewOf, normalizePhone } from "../_shared/conversations.ts";

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
  const db = admin();
  await db.from("whatsapp_messages").update(patch).eq("provider_message_id", sid);

  // Mirror delivery state onto any purchase order sent with this message.
  const status = String((patch as any).status || "");
  if (["delivered", "read", "failed"].includes(status)) {
    const poPatch: Record<string, unknown> = {
      whatsapp_status: status === "read" ? "delivered" : status,
    };
    if (status === "failed") {
      poPatch.whatsapp_error = (patch as any).error_message ?? "Delivery failed";
    }
    await db.from("purchase_orders").update(poPatch).eq("whatsapp_message_id", sid);
  }
}

// ---------- Inbound handling ----------

interface Settings {
  tenant_id: string;
  access_token: string | null;
  api_version: string | null;
  phone_number_id: string | null;
  auto_create_customers: boolean | null;
  notify_on_incoming: boolean | null;
  greeting_enabled: boolean | null;
  greeting_message: string | null;
  away_enabled: boolean | null;
  away_message: string | null;
  instant_reply_enabled: boolean | null;
  instant_reply_message: string | null;
  holiday_enabled: boolean | null;
  holiday_message: string | null;
  business_open_time: string | null;
  business_close_time: string | null;
  closed_days: unknown;
}

function isWithinBusinessHours(s: Settings): boolean {
  const now = new Date();
  const day = now.getUTCDay(); // 0=Sun
  const closed = Array.isArray(s.closed_days) ? (s.closed_days as number[]).map(Number) : [];
  if (closed.includes(day)) return false;
  const [oh, om] = String(s.business_open_time || "08:00").split(":").map(Number);
  const [ch, cm] = String(s.business_close_time || "18:00").split(":").map(Number);
  const mins = now.getUTCHours() * 60 + now.getUTCMinutes();
  return mins >= oh * 60 + om && mins <= ch * 60 + cm;
}

async function sendText(s: Settings, toDigits: string, body: string): Promise<string | null> {
  if (!s.access_token || !s.phone_number_id || !body) return null;
  const version = s.api_version || "v20.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${String(s.phone_number_id).trim()}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${s.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to: toDigits,
      type: "text", text: { body, preview_url: false },
    }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("[whatsapp-webhook] auto-reply failed", res.status, JSON.stringify(json));
    return null;
  }
  return json?.messages?.[0]?.id ?? null;
}

/** Downloads Meta-hosted media and stores it privately for the tenant. */
async function storeMedia(s: Settings, mediaId: string, mime: string | null, filename: string | null): Promise<string | null> {
  try {
    if (!s.access_token) return null;
    const version = s.api_version || "v20.0";
    const metaRes = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { Authorization: `Bearer ${s.access_token}` },
    });
    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    if (!meta?.url) return null;
    const binRes = await fetch(meta.url, { headers: { Authorization: `Bearer ${s.access_token}` } });
    if (!binRes.ok) return null;
    const bytes = new Uint8Array(await binRes.arrayBuffer());
    const ext = (filename?.split(".").pop()) || (mime || "").split("/")[1]?.split(";")[0] || "bin";
    const path = `${s.tenant_id}/inbound/${mediaId}.${ext}`;
    const db = admin();
    await db.storage.from("whatsapp-media").upload(path, bytes, {
      contentType: mime || meta.mime_type || "application/octet-stream",
      upsert: true,
    });
    return path;
  } catch (e) {
    console.error("[whatsapp-webhook] media store failed", e);
    return null;
  }
}

function describeMessage(msg: any): { body: string; kind: string | null; mediaId: string | null; mime: string | null; filename: string | null } {
  const type = String(msg?.type || "text");
  switch (type) {
    case "text":
      return { body: msg.text?.body || "", kind: null, mediaId: null, mime: null, filename: null };
    case "image":
      return { body: msg.image?.caption || "", kind: "image", mediaId: msg.image?.id ?? null, mime: msg.image?.mime_type ?? null, filename: null };
    case "video":
      return { body: msg.video?.caption || "", kind: "video", mediaId: msg.video?.id ?? null, mime: msg.video?.mime_type ?? null, filename: null };
    case "audio":
      return { body: "", kind: "audio", mediaId: msg.audio?.id ?? null, mime: msg.audio?.mime_type ?? null, filename: null };
    case "voice":
      return { body: "", kind: "audio", mediaId: msg.voice?.id ?? null, mime: msg.voice?.mime_type ?? null, filename: null };
    case "sticker":
      return { body: "", kind: "image", mediaId: msg.sticker?.id ?? null, mime: msg.sticker?.mime_type ?? null, filename: null };
    case "document":
      return { body: msg.document?.caption || "", kind: "document", mediaId: msg.document?.id ?? null, mime: msg.document?.mime_type ?? null, filename: msg.document?.filename ?? null };
    case "location": {
      const l = msg.location || {};
      return { body: `📍 Location: ${l.name || ""} ${l.address || ""} (${l.latitude}, ${l.longitude})`.trim(), kind: "location", mediaId: null, mime: null, filename: null };
    }
    case "contacts":
      return { body: `👤 Contact shared: ${(msg.contacts || []).map((c: any) => c?.name?.formatted_name).filter(Boolean).join(", ")}`, kind: "contact", mediaId: null, mime: null, filename: null };
    case "button":
      return { body: msg.button?.text || "", kind: null, mediaId: null, mime: null, filename: null };
    case "interactive":
      return { body: msg.interactive?.button_reply?.title || msg.interactive?.list_reply?.title || "", kind: null, mediaId: null, mime: null, filename: null };
    case "reaction":
      return { body: `${msg.reaction?.emoji || "👍"}`, kind: "reaction", mediaId: null, mime: null, filename: null };
    default:
      return { body: `[${type}]`, kind: null, mediaId: null, mime: null, filename: null };
  }
}

async function handleInbound(s: Settings, value: any) {
  const db = admin();
  const contacts: any[] = Array.isArray(value?.contacts) ? value.contacts : [];
  const messages: any[] = Array.isArray(value?.messages) ? value.messages : [];

  for (const msg of messages) {
    const waId = String(msg.from || "");
    const phone = normalizePhone("+" + waId.replace(/\D/g, ""));
    if (!phone) continue;
    const profileName = contacts.find((c) => String(c?.wa_id) === waId)?.profile?.name ?? null;

    // Skip duplicates (Meta retries webhooks)
    const { data: dupe } = await db.from("whatsapp_messages")
      .select("id").eq("provider_message_id", String(msg.id)).maybeSingle();
    if (dupe) continue;

    // Match or auto-create the customer
    let customerId: string | null = null;
    const digits = phone.replace(/\D/g, "").slice(-9);
    const { data: matches } = await db.from("customers")
      .select("id, phone, alt_phone").eq("tenant_id", s.tenant_id).limit(500);
    const found = (matches || []).find((c: any) =>
      String(c.phone || "").replace(/\D/g, "").endsWith(digits) ||
      String(c.alt_phone || "").replace(/\D/g, "").endsWith(digits));
    if (found) {
      customerId = found.id;
    } else if (s.auto_create_customers !== false) {
      const { data: created } = await db.from("customers").insert({
        tenant_id: s.tenant_id,
        name: profileName || phone,
        phone,
        status: "active",
        notes: "Auto-created from WhatsApp",
      }).select("id").single();
      customerId = created?.id ?? null;
    }

    const conversation = await getOrCreateConversation(db, s.tenant_id, phone, {
      displayName: profileName, customerId,
    });
    if (!conversation) continue;
    if (profileName) {
      await db.from("whatsapp_conversations").update({ display_name: profileName }).eq("id", conversation.id);
    }

    const info = describeMessage(msg);
    let mediaUrl: string | null = null;
    if (info.mediaId) mediaUrl = await storeMedia(s, info.mediaId, info.mime, info.filename);

    await db.from("whatsapp_messages").insert({
      tenant_id: s.tenant_id,
      conversation_id: conversation.id,
      direction: "in",
      customer_id: customerId,
      recipient_phone: phone,
      message_type: "inbound",
      body: info.body || null,
      media_url: mediaUrl,
      media_kind: info.kind,
      media_id: info.mediaId,
      media_mime: info.mime,
      media_filename: info.filename,
      provider: "meta",
      provider_message_id: String(msg.id),
      meta_message_id: String(msg.id),
      status: "delivered",
      delivered_at: new Date().toISOString(),
      payload: msg,
    });

    await touchConversation(db, conversation.id, {
      preview: previewOf(info.body, info.kind),
      direction: "in",
      incrementUnread: true,
    });

    if (s.notify_on_incoming !== false) {
      await db.from("notifications").insert({
        tenant_id: s.tenant_id,
        title: "New WhatsApp message",
        message: `${profileName || phone}: ${previewOf(info.body, info.kind) || "sent a message"}`,
        type: "whatsapp_inbound",
        link: `/whatsapp?conversation=${conversation.id}`,
        metadata: { conversation_id: conversation.id, customer_id: customerId },
      });
    }

    // ---- Auto replies ----
    const toDigits = phone.replace(/\D/g, "");
    const recentlyAutoReplied = conversation.last_auto_reply_at
      ? Date.now() - new Date(conversation.last_auto_reply_at).getTime() < 60 * 60 * 1000
      : false;
    let autoReply: string | null = null;
    if (s.greeting_enabled && s.greeting_message && !conversation.greeted_at) {
      autoReply = s.greeting_message;
    } else if (!recentlyAutoReplied) {
      if (s.holiday_enabled && s.holiday_message) autoReply = s.holiday_message;
      else if (!isWithinBusinessHours(s) && s.away_enabled && s.away_message) autoReply = s.away_message;
      else if (s.instant_reply_enabled && s.instant_reply_message) autoReply = s.instant_reply_message;
    }
    if (autoReply) {
      const sid = await sendText(s, toDigits, autoReply);
      await db.from("whatsapp_messages").insert({
        tenant_id: s.tenant_id,
        conversation_id: conversation.id,
        direction: "out",
        customer_id: customerId,
        recipient_phone: phone,
        message_type: "auto_reply",
        body: autoReply,
        provider: "meta",
        provider_message_id: sid,
        meta_message_id: sid,
        status: sid ? "sent" : "failed",
        sent_at: sid ? new Date().toISOString() : null,
      });
      await db.from("whatsapp_conversations").update({
        greeted_at: conversation.greeted_at ?? new Date().toISOString(),
        last_auto_reply_at: new Date().toISOString(),
        last_message_preview: previewOf(autoReply, null),
        last_message_direction: "out",
        last_message_at: new Date().toISOString(),
      }).eq("id", conversation.id);
    }
  }
}

async function handleMetaPost(body: any) {
  const db = admin();
  const entries = Array.isArray(body?.entry) ? body.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value || {};

      // Delivery statuses
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const st of statuses) {
        const patch = mapStatus(String(st.status || ""));
        if (!patch) continue;
        if (Array.isArray(st.errors) && st.errors.length) {
          const e = st.errors[0];
          (patch as any).error_code = e?.code ? String(e.code) : null;
          (patch as any).error_message = e?.title || e?.message || e?.error_data?.details || null;
        }
        await updateByProviderId(String(st.id || ""), patch);
      }

      // Inbound messages — resolve the tenant from the receiving phone number id
      if (Array.isArray(value.messages) && value.messages.length) {
        const phoneNumberId = String(value?.metadata?.phone_number_id || "");
        const { data: settings } = await db.from("whatsapp_settings")
          .select("tenant_id, access_token, api_version, phone_number_id, auto_create_customers, notify_on_incoming, greeting_enabled, greeting_message, away_enabled, away_message, instant_reply_enabled, instant_reply_message, holiday_enabled, holiday_message, business_open_time, business_close_time, closed_days")
          .eq("phone_number_id", phoneNumberId).maybeSingle();
        if (!settings) {
          console.warn("[whatsapp-webhook] no tenant for phone_number_id", phoneNumberId);
          continue;
        }
        await handleInbound(settings as Settings, value);
      }
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
