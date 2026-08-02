// Sends a professional Purchase Order email to a supplier, with the PO PDF attached.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const isEmail = (v: unknown) =>
  typeof v === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && v.length <= 255;

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const money = (n: unknown) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n) || 0);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await userClient.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims?.sub) return json({ error: "Unauthorized" }, 401);

    const apiKey = Deno.env.get("RESEND_API_KEY");
    if (!apiKey) return json({ error: "Email is not configured" }, 500);

    const body = await req.json();
    const { to, supplier_name, po_number, date, notes, total, items, shop, pdf_base64 } = body || {};

    if (!isEmail(to)) return json({ error: "Invalid supplier email address" }, 400);
    if (!po_number || typeof po_number !== "string") return json({ error: "Missing PO number" }, 400);
    if (!Array.isArray(items) || items.length === 0) return json({ error: "No order items" }, 400);

    const shopName = esc(shop?.name || "Our Shop");
    const rows = items.slice(0, 200).map((i: any) => `
      <tr>
        <td style="padding:8px 6px;border-bottom:1px solid #eee">${esc(i.product_name)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;color:#666">${esc(i.category || "—")}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee">${esc(i.unit || "piece")}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right">${esc(i.quantity)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right">${money(i.unit_cost)}</td>
        <td style="padding:8px 6px;border-bottom:1px solid #eee;text-align:right">${money(i.total_cost)}</td>
      </tr>`).join("");

    const logo = shop?.logo_url
      ? `<img src="${esc(shop.logo_url)}" alt="${shopName}" style="height:52px;margin-bottom:8px" />`
      : "";

    const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:680px;margin:0 auto;color:#111">
    <div style="border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px">
      ${logo}
      <h2 style="margin:0;font-size:20px">${shopName}</h2>
      <p style="margin:2px 0;color:#666;font-size:12px">
        ${esc(shop?.address || "")} ${shop?.phone ? "· " + esc(shop.phone) : ""} ${shop?.email ? "· " + esc(shop.email) : ""}
      </p>
    </div>

    <h3 style="margin:0 0 4px">Purchase Order ${esc(po_number)}</h3>
    <p style="margin:0 0 14px;color:#555;font-size:13px">
      Date: ${esc(new Date(date || Date.now()).toDateString())}<br/>
      Supplier: <strong>${esc(supplier_name || "")}</strong>
    </p>

    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f4f4f4;text-align:left">
          <th style="padding:8px 6px">Product</th>
          <th style="padding:8px 6px">Category</th>
          <th style="padding:8px 6px">Unit</th>
          <th style="padding:8px 6px;text-align:right">Qty</th>
          <th style="padding:8px 6px;text-align:right">Unit Cost</th>
          <th style="padding:8px 6px;text-align:right">Total</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <p style="text-align:right;font-size:16px;font-weight:bold;margin:14px 0">
      Total: ${money(total)}
    </p>

    ${notes ? `<div style="background:#fafafa;border-left:3px solid #ddd;padding:10px;font-size:13px">
      <strong>Notes:</strong><br/>${esc(notes)}</div>` : ""}

    <p style="font-size:13px;color:#444;margin-top:18px">
      Please confirm receipt of this order. The full purchase order is attached as a PDF.
    </p>
    <p style="font-size:11px;color:#999;margin-top:22px">Sent automatically by ShopTracker on behalf of ${shopName}.</p>
  </div>`;

    const resend = new Resend(apiKey);
    const attachments = pdf_base64
      ? [{ filename: `${po_number}.pdf`, content: pdf_base64 }]
      : undefined;

    const { data, error } = await resend.emails.send({
      from: "ShopTracker <onboarding@resend.dev>",
      to: [to],
      subject: `Purchase Order ${po_number} from ${shop?.name || "Our Shop"}`,
      html,
      attachments,
    });

    if (error) {
      console.error("[send-purchase-order-email] Resend error", error);
      return json({ error: (error as any).message || "Email send failed" }, 502);
    }

    return json({ ok: true, id: (data as any)?.id ?? null });
  } catch (e) {
    console.error("[send-purchase-order-email] error", e);
    return json({ error: (e as Error).message }, 500);
  }
});
