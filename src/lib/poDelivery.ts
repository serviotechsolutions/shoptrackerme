import { supabase } from "@/integrations/supabase/client";
import { generatePurchaseOrderPdf, type POPdfItem } from "@/lib/purchaseOrderPdf";
import { sendWhatsapp, normalizePhone } from "@/lib/whatsapp";

export type POEventType =
  | "created" | "approved" | "cancelled"
  | "whatsapp_sent" | "whatsapp_delivered" | "whatsapp_failed"
  | "email_sent" | "email_delivered" | "email_failed"
  | "supplier_viewed";

export async function logPoEvent(
  tenantId: string,
  purchaseOrderId: string,
  eventType: POEventType,
  opts: { channel?: string; status?: string; detail?: string; userId?: string } = {}
) {
  await (supabase as any).from("purchase_order_events").insert({
    tenant_id: tenantId,
    purchase_order_id: purchaseOrderId,
    event_type: eventType,
    channel: opts.channel || null,
    status: opts.status || null,
    detail: opts.detail || null,
    user_id: opts.userId || null,
  });
}

export interface DeliverPOArgs {
  tenantId: string;
  userId?: string;
  poId: string;
  poNumber: string;
  orderedAt: string | Date;
  notes?: string | null;
  total: number;
  items: POPdfItem[];
  supplier: {
    id: string; name: string; email?: string | null;
    phone?: string | null; whatsapp_number?: string | null;
    contact_person?: string | null; address?: string | null;
  };
}

export interface DeliveryResult {
  whatsapp: { status: "sent" | "failed" | "skipped"; error?: string };
  email: { status: "sent" | "failed" | "skipped"; error?: string };
}

function buildPoMessage(shopName: string, a: DeliverPOArgs, currency = "UGX") {
  const fmt = (n: number) => `${currency} ${Number(n || 0).toLocaleString()}`;
  const totalQty = a.items.reduce((s, i) => s + Number(i.quantity || 0), 0);
  const lines = [
    `*PURCHASE ORDER — ${shopName}*`,
    ``,
    `PO Number: ${a.poNumber}`,
    `Date: ${new Date(a.orderedAt).toLocaleDateString()}`,
    `Supplier: ${a.supplier.name}`,
    ``,
    `*Ordered products:*`,
    ...a.items.map(i => `• ${i.product_name}${i.category ? ` (${i.category})` : ""} — ${i.quantity} ${i.unit || "piece"} @ ${fmt(i.unit_cost)}`),
    ``,
    `Total items: ${a.items.length}`,
    `Total quantity: ${totalQty}`,
    `Order value: ${fmt(a.total)}`,
  ];
  if (a.notes) lines.push(``, `Notes: ${a.notes}`);
  lines.push(``, `Please confirm receipt of this order. Thank you.`);
  return lines.join("\n");
}

/**
 * Generates the PO PDF and delivers it to the supplier over WhatsApp and Email,
 * recording the outcome on the purchase order and in its event history.
 */
export async function deliverPurchaseOrder(a: DeliverPOArgs): Promise<DeliveryResult> {
  const result: DeliveryResult = {
    whatsapp: { status: "skipped" },
    email: { status: "skipped" },
  };

  const { data: tenant } = await supabase
    .from("tenants")
    .select("name,logo_url,address,phone,email")
    .eq("id", a.tenantId)
    .maybeSingle();

  const shopName = tenant?.name || "Our Shop";

  // ---- PDF ----
  let pdfBlob: Blob | null = null;
  let pdfUrl: string | null = null;
  let pdfBase64: string | null = null;
  try {
    pdfBlob = await generatePurchaseOrderPdf({
      shop: {
        name: shopName,
        address: tenant?.address,
        phone: tenant?.phone,
        email: tenant?.email,
        logo_url: tenant?.logo_url,
      },
      supplier: a.supplier,
      poNumber: a.poNumber,
      date: a.orderedAt,
      items: a.items,
      total: a.total,
      notes: a.notes,
    });

    const path = `${a.tenantId}/purchase-orders/${a.poNumber.replace(/[^a-zA-Z0-9-_]/g, "_")}-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage
      .from("whatsapp-receipts")
      .upload(path, pdfBlob, { contentType: "application/pdf", upsert: true });
    if (!upErr) {
      const { data: signed } = await supabase.storage
        .from("whatsapp-receipts")
        .createSignedUrl(path, 60 * 60 * 24 * 30);
      pdfUrl = signed?.signedUrl || null;
    }

    pdfBase64 = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const r = String(reader.result || "");
        resolve(r.includes(",") ? r.split(",")[1] : null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(pdfBlob as Blob);
    });
  } catch (e: any) {
    console.error("[PO delivery] PDF generation failed", e);
  }

  const message = buildPoMessage(shopName, a);

  // ---- WhatsApp ----
  const waTarget = normalizePhone(a.supplier.whatsapp_number || a.supplier.phone);
  if (waTarget) {
    try {
      await sendWhatsapp({
        to: waTarget,
        body: message,
        media_url: pdfUrl || undefined,
        media_kind: pdfUrl ? "pdf" : null,
        message_type: "custom",
      });
      result.whatsapp = { status: "sent" };
    } catch (e: any) {
      result.whatsapp = { status: "failed", error: e?.message || "WhatsApp send failed" };
    }
  } else {
    result.whatsapp = { status: "skipped", error: "No WhatsApp number on supplier" };
  }

  // ---- Email ----
  if (a.supplier.email) {
    try {
      const { data, error } = await supabase.functions.invoke("send-purchase-order-email", {
        body: {
          to: a.supplier.email,
          supplier_name: a.supplier.name,
          po_number: a.poNumber,
          date: new Date(a.orderedAt).toISOString(),
          notes: a.notes || null,
          total: a.total,
          items: a.items,
          shop: {
            name: shopName,
            logo_url: tenant?.logo_url || null,
            address: tenant?.address || null,
            phone: tenant?.phone || null,
            email: tenant?.email || null,
          },
          pdf_base64: pdfBase64,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      result.email = { status: "sent" };
    } catch (e: any) {
      result.email = { status: "failed", error: e?.message || "Email send failed" };
    }
  } else {
    result.email = { status: "skipped", error: "No email address on supplier" };
  }

  // ---- Persist status + history ----
  const now = new Date().toISOString();
  await (supabase as any).from("purchase_orders").update({
    whatsapp_status: result.whatsapp.status,
    whatsapp_sent_at: result.whatsapp.status === "sent" ? now : null,
    whatsapp_error: result.whatsapp.error || null,
    email_status: result.email.status,
    email_sent_at: result.email.status === "sent" ? now : null,
    email_error: result.email.error || null,
  }).eq("id", a.poId);

  if (result.whatsapp.status !== "skipped") {
    await logPoEvent(a.tenantId, a.poId,
      result.whatsapp.status === "sent" ? "whatsapp_sent" : "whatsapp_failed",
      { channel: "whatsapp", status: result.whatsapp.status, detail: result.whatsapp.error, userId: a.userId });
  }
  if (result.email.status !== "skipped") {
    await logPoEvent(a.tenantId, a.poId,
      result.email.status === "sent" ? "email_sent" : "email_failed",
      { channel: "email", status: result.email.status, detail: result.email.error, userId: a.userId });
  }

  return result;
}
