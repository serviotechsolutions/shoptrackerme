import { supabase } from "@/integrations/supabase/client";
import { generateReceiptBlob, type ReceiptDocData } from "@/lib/receiptPdf";

export function normalizePhone(input: string | null | undefined): string | null {
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

export function isValidPhone(input: string | null | undefined): boolean {
  return normalizePhone(input) !== null;
}

export interface ReceiptData {
  shopName: string;
  shopPhone?: string;
  shopAddress?: string;
  logoUrl?: string;
  invoiceNumber: string;
  date: string;
  servedBy?: string;
  customerName?: string;
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  subtotal: number;
  discount?: number;
  total: number;
  paid: number;
  change?: number;
  paymentMethod?: string;
  currency?: string;
}

export function generateReceiptPdf(data: ReceiptData): Blob {
  const doc = new jsPDF({ unit: "mm", format: [80, 200] });
  const currency = data.currency || "UGX";
  let y = 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(data.shopName, 40, y, { align: "center" });
  y += 5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  if (data.shopAddress) { doc.text(data.shopAddress, 40, y, { align: "center" }); y += 4; }
  if (data.shopPhone) { doc.text(data.shopPhone, 40, y, { align: "center" }); y += 4; }
  y += 2;
  doc.setLineWidth(0.2);
  doc.line(4, y, 76, y);
  y += 4;
  doc.setFontSize(8);
  doc.text(`Receipt: ${data.invoiceNumber}`, 4, y); y += 4;
  doc.text(`Date: ${data.date}`, 4, y); y += 4;
  if (data.customerName) { doc.text(`Customer: ${data.customerName}`, 4, y); y += 4; }
  if (data.servedBy) { doc.text(`Served by: ${data.servedBy}`, 4, y); y += 4; }
  doc.line(4, y, 76, y); y += 4;

  doc.setFont("helvetica", "bold");
  doc.text("Item", 4, y);
  doc.text("Qty", 46, y);
  doc.text("Total", 76, y, { align: "right" });
  y += 3;
  doc.setFont("helvetica", "normal");
  doc.line(4, y, 76, y); y += 3;

  const fmt = (n: number) => `${currency} ${Number(n).toLocaleString()}`;
  data.items.forEach((it) => {
    const nameLines = doc.splitTextToSize(it.name, 40);
    doc.text(nameLines, 4, y);
    doc.text(String(it.quantity), 46, y);
    doc.text(fmt(it.total), 76, y, { align: "right" });
    y += Math.max(4, nameLines.length * 3.5);
    doc.setTextColor(120);
    doc.text(`@ ${fmt(it.unitPrice)}`, 4, y);
    doc.setTextColor(0);
    y += 4;
  });

  doc.line(4, y, 76, y); y += 4;
  doc.text("Subtotal", 4, y); doc.text(fmt(data.subtotal), 76, y, { align: "right" }); y += 4;
  if (data.discount && data.discount > 0) {
    doc.text("Discount", 4, y); doc.text(`- ${fmt(data.discount)}`, 76, y, { align: "right" }); y += 4;
  }
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL", 4, y); doc.text(fmt(data.total), 76, y, { align: "right" }); y += 4;
  doc.setFont("helvetica", "normal");
  doc.text("Paid", 4, y); doc.text(fmt(data.paid), 76, y, { align: "right" }); y += 4;
  if (typeof data.change === "number" && data.change > 0) {
    doc.text("Change", 4, y); doc.text(fmt(data.change), 76, y, { align: "right" }); y += 4;
  }
  if (data.paymentMethod) {
    doc.text(`Method: ${data.paymentMethod}`, 4, y); y += 4;
  }
  y += 3;
  doc.line(4, y, 76, y); y += 4;
  doc.setFontSize(8);
  doc.text("Thank you for your business.", 40, y, { align: "center" });

  return doc.output("blob");
}

export async function uploadReceiptPdf(tenantId: string, invoiceNumber: string, blob: Blob): Promise<string> {
  const safe = invoiceNumber.replace(/[^a-zA-Z0-9-_]/g, "_");
  const path = `${tenantId}/receipts/${safe}-${Date.now()}.pdf`;
  const { error } = await supabase.storage.from("whatsapp-receipts").upload(path, blob, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (error) throw error;
  // 30-day signed URL — Twilio fetches within seconds; long expiry helps re-sends.
  const { data, error: signErr } = await supabase.storage
    .from("whatsapp-receipts").createSignedUrl(path, 60 * 60 * 24 * 30);
  if (signErr || !data?.signedUrl) throw signErr || new Error("Failed to sign URL");
  return data.signedUrl;
}

export interface SendArgs {
  to: string;
  body?: string;
  media_url?: string;
  media_kind?: "pdf" | "image" | null;
  message_type?: "receipt" | "payment" | "promotion" | "reminder" | "custom" | "test";
  customer_id?: string | null;
  related_sale_id?: string | null;
  related_payment_id?: string | null;
  related_promotion_id?: string | null;
  test?: boolean;
}

export async function sendWhatsapp(args: SendArgs) {
  const { data, error } = await supabase.functions.invoke("whatsapp-send", { body: args });
  if (error) {
    // Try to unwrap edge error
    const ctxText = typeof (error as any).context?.text === "function"
      ? await (error as any).context.text().catch(() => null) : null;
    let msg = error.message;
    try {
      const j = ctxText ? JSON.parse(ctxText) : null;
      if (j?.error) msg = j.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as { ok: true; message_id: string; provider_sid: string };
}

export function buildReceiptMessage(shopName: string, r: ReceiptData): string {
  const currency = r.currency || "UGX";
  const fmt = (n: number) => `${currency} ${Number(n).toLocaleString()}`;
  const lines = [
    `Thank you for shopping at *${shopName}*.`,
    ``,
    `Receipt: ${r.invoiceNumber}`,
    `Date: ${r.date}`,
    ``,
    `Items:`,
    ...r.items.map(i => `• ${i.name} x${i.quantity} — ${fmt(i.total)}`),
    ``,
    `Total: ${fmt(r.total)}`,
    `Paid: ${fmt(r.paid)}`,
  ];
  if (r.change && r.change > 0) lines.push(`Change: ${fmt(r.change)}`);
  if (r.servedBy) lines.push(`Served by: ${r.servedBy}`);
  lines.push("", "Thank you for your business.");
  return lines.join("\n");
}
