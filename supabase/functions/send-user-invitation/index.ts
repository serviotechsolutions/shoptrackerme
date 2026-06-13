import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  email: string;
  full_name: string;
  role: string;
  join_url?: string;
}

const isEmail = (v: string) =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 255;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify caller identity
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await userClient.auth.getClaims(token);
    const userId = claims?.claims?.sub as string | undefined;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceKey);

    // Verify caller is admin
    const { data: roleRow } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch caller profile/tenant server-side
    const { data: profile } = await adminClient
      .from("profiles")
      .select("tenant_id, full_name, email")
      .eq("id", userId)
      .single();

    if (!profile?.tenant_id) {
      return new Response(JSON.stringify({ error: "Profile not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: tenant } = await adminClient
      .from("tenants")
      .select("name")
      .eq("id", profile.tenant_id)
      .single();

    const body = await req.json().catch(() => ({}));
    const { email, full_name, role, join_url }: InvitationRequest = body;

    if (!isEmail(email)) {
      return new Response(JSON.stringify({ error: "Invalid email" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (typeof full_name !== "string" || full_name.length === 0 || full_name.length > 120) {
      return new Response(JSON.stringify({ error: "Invalid full_name" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["admin", "staff", "viewer"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let safeJoinUrl: string | undefined;
    if (join_url) {
      try {
        const u = new URL(join_url);
        if (u.protocol === "https:" || u.protocol === "http:") safeJoinUrl = u.toString();
      } catch { /* ignore */ }
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      throw new Error("Email service not configured");
    }
    const resend = new Resend(resendApiKey);

    const shop_name = tenant?.name || "the shop";
    const inviter_name = profile.full_name || profile.email || "An admin";

    const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

    const emailResponse = await resend.emails.send({
      from: "ShopTracker <onboarding@resend.dev>",
      to: [email],
      subject: `You've been invited to join ${shop_name}`,
      html: `
        <!DOCTYPE html><html><body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9fafb;">
          <div style="background-color: #ffffff; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <h1 style="color: #1f2937; margin: 0 0 24px; font-size: 28px; text-align:center;">Welcome to ${escape(shop_name)}!</h1>
            <p style="color: #374151; font-size: 16px;">Hi ${escape(full_name)},</p>
            <p style="color: #374151; font-size: 16px;">
              <strong>${escape(inviter_name)}</strong> has invited you to join <strong>${escape(shop_name)}</strong> as a <strong style="color:#2563eb;">${escape(role)}</strong>.
            </p>
            <div style="background:#f0f9ff; padding:24px; border-radius:8px; margin:24px 0; border-left:4px solid #0ea5e9;">
              <p style="color:#374151; margin:0 0 12px;">To accept this invitation:</p>
              <ol style="color:#374151; margin:0; padding-left:20px;">
                <li>Click the button below or open the ShopTracker app</li>
                <li>Sign up using this email: <strong>${escape(email)}</strong></li>
                <li>You'll be linked to ${escape(shop_name)} automatically</li>
              </ol>
              ${safeJoinUrl ? `<div style="text-align:center; margin-top:20px;">
                <a href="${escape(safeJoinUrl)}" style="display:inline-block; background:#0ea5e9; color:#fff; padding:12px 32px; border-radius:8px; text-decoration:none; font-weight:bold;">Accept Invitation</a>
              </div>` : ""}
            </div>
            <hr style="border:none; border-top:1px solid #e5e7eb; margin:32px 0;">
            <p style="color:#9ca3af; font-size:12px; text-align:center;">If you didn't expect this invitation, you can safely ignore this email.</p>
            <p style="color:#9ca3af; font-size:12px; text-align:center;">Powered by ShopTracker • Developed by Serviotech Solutions</p>
          </div>
        </body></html>
      `,
    });

    if (emailResponse.error) {
      throw new Error(`Failed to send email: ${emailResponse.error.message}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in send-user-invitation:", error?.message || error);
    return new Response(
      JSON.stringify({ error: "Failed to send invitation" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  }
};

serve(handler);
