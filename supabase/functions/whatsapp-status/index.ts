// Twilio status callback webhook. Public endpoint.
// Updates whatsapp_messages by provider_message_id (MessageSid).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const contentType = req.headers.get("content-type") || "";
    let params: URLSearchParams;
    if (contentType.includes("application/json")) {
      const j = await req.json();
      params = new URLSearchParams(j as Record<string, string>);
    } else {
      const text = await req.text();
      params = new URLSearchParams(text);
    }
    const sid = params.get("MessageSid") || params.get("SmsSid");
    const status = (params.get("MessageStatus") || params.get("SmsStatus") || "").toLowerCase();
    const errorCode = params.get("ErrorCode");
    const errorMessage = params.get("ErrorMessage");

    if (!sid || !status) {
      return new Response("ok", { headers: corsHeaders });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const patch: Record<string, unknown> = {};
    const now = new Date().toISOString();
    // Map Twilio statuses to ours
    if (["queued", "accepted", "sending"].includes(status)) {
      patch.status = "pending";
    } else if (status === "sent") {
      patch.status = "sent";
      patch.sent_at = now;
    } else if (status === "delivered") {
      patch.status = "delivered";
      patch.delivered_at = now;
    } else if (status === "read") {
      patch.status = "read";
      patch.read_at = now;
    } else if (["failed", "undelivered"].includes(status)) {
      patch.status = "failed";
      patch.failed_at = now;
      if (errorCode) patch.error_code = errorCode;
      if (errorMessage) patch.error_message = errorMessage;
    }
    if (Object.keys(patch).length) {
      await admin.from("whatsapp_messages").update(patch).eq("provider_message_id", sid);
    }
    return new Response("ok", { headers: corsHeaders });
  } catch (e) {
    console.error("whatsapp-status error", e);
    return new Response("error", { status: 200, headers: corsHeaders });
  }
});
