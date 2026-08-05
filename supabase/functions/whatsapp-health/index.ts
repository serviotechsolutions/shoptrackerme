// Reports live Meta Cloud API connection health for the caller's tenant.
// Never returns credentials — only derived status information.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: profile } = await admin.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
    if (!profile?.tenant_id) return json({ error: "No tenant" }, 400);

    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin only" }, 403);

    const { data: s } = await admin.from("whatsapp_settings")
      .select("*").eq("tenant_id", profile.tenant_id).maybeSingle();
    if (!s) return json({ configured: false, cloud_api: { ok: false, error: "WhatsApp is not configured yet." } });

    const base = {
      configured: !!(s.access_token && s.phone_number_id),
      enabled: !!s.is_enabled,
      has_app_secret: !!s.app_secret,
      has_verify_token: !!s.verify_token,
      api_version: s.api_version || "v20.0",
      last_webhook_at: s.last_webhook_at,
      last_webhook_signature_ok: s.last_webhook_signature_ok,
      last_webhook_error: s.last_webhook_error,
      last_test_at: s.last_test_at,
      last_test_status: s.last_test_status,
    };

    if (!s.access_token || !s.phone_number_id) {
      return json({ ...base, cloud_api: { ok: false, error: "Access token and Phone Number ID are required." } });
    }

    const version = s.api_version || "v20.0";
    const url = `https://graph.facebook.com/${version}/${String(s.phone_number_id).trim()}?fields=display_phone_number,verified_name,quality_rating,platform_type,throughput`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${String(s.access_token).trim()}` } });
    const payload = await res.json().catch(() => null);

    if (!res.ok) {
      return json({
        ...base,
        cloud_api: {
          ok: false,
          http_status: res.status,
          error: payload?.error?.message || `Meta returned HTTP ${res.status}`,
          code: payload?.error?.code ? String(payload.error.code) : null,
        },
      });
    }

    // Webhook field subscriptions on the WABA (best effort — needs WABA id + permissions).
    let subscribedFields: string[] | null = null;
    if (s.business_account_id) {
      const subRes = await fetch(
        `https://graph.facebook.com/${version}/${String(s.business_account_id).trim()}/subscribed_apps`,
        { headers: { Authorization: `Bearer ${String(s.access_token).trim()}` } },
      );
      const subJson = await subRes.json().catch(() => null);
      if (subRes.ok && Array.isArray(subJson?.data)) {
        subscribedFields = subJson.data.flatMap((d: any) =>
          (d?.whatsapp_business_api_data?.subscribed_fields ?? d?.subscribed_fields ?? []) as string[]);
      }
    }

    return json({
      ...base,
      cloud_api: {
        ok: true,
        http_status: res.status,
        display_phone_number: payload?.display_phone_number ?? null,
        verified_name: payload?.verified_name ?? null,
        quality_rating: payload?.quality_rating ?? null,
        platform_type: payload?.platform_type ?? null,
      },
      subscribed_fields: subscribedFields,
    });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
