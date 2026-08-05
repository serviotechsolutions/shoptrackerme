import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { generateReceiptBlob } from "@/lib/receiptPdf";
import { generatePurchaseOrderPdf } from "@/lib/purchaseOrderPdf";
import { generateBusinessDoc, money, type DocShop } from "@/lib/businessDocs";

export type DocumentKind = "receipt" | "invoice" | "purchase_order" | "statement" | "account_balance";

export const DOCUMENT_LABELS: Record<DocumentKind, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  purchase_order: "Purchase order",
  statement: "Customer statement",
  account_balance: "Account balance",
};

export interface DocumentRecordOption {
  id: string;
  label: string;
  sublabel: string;
}

export interface GeneratedDocument {
  blob: Blob;
  filename: string;
  caption: string;
}

async function loadShop(tenantId: string): Promise<DocShop> {
  const { data } = await supabase.from("tenants")
    .select("name, logo_url, address, phone, email").eq("id", tenantId).maybeSingle();
  return {
    name: data?.name || "Shop",
    logo_url: data?.logo_url,
    address: data?.address,
    phone: data?.phone,
    email: data?.email,
  };
}

/** Lists the records that can be attached for a given document kind. */
export async function listDocumentRecords(
  kind: DocumentKind,
  opts: { tenantId: string; customerId?: string | null },
): Promise<DocumentRecordOption[]> {
  if (kind === "receipt" || kind === "invoice") {
    let q = supabase.from("sales")
      .select("id, created_at, total_amount, customer_name, customer_id")
      .eq("tenant_id", opts.tenantId)
      .order("created_at", { ascending: false })
      .limit(40);
    if (opts.customerId) q = q.eq("customer_id", opts.customerId);
    const { data } = await q;
    return (data || []).map((s: any) => ({
      id: s.id,
      label: `${money(s.total_amount)} — ${s.customer_name || "Walk-in"}`,
      sublabel: format(new Date(s.created_at), "dd MMM yyyy HH:mm"),
    }));
  }
  if (kind === "purchase_order") {
    const { data } = await supabase.from("purchase_orders")
      .select("id, po_number, total_amount, ordered_at, status")
      .eq("tenant_id", opts.tenantId)
      .order("ordered_at", { ascending: false })
      .limit(40);
    return (data || []).map((p: any) => ({
      id: p.id,
      label: `${p.po_number} — ${money(p.total_amount)}`,
      sublabel: `${p.status} · ${format(new Date(p.ordered_at), "dd MMM yyyy")}`,
    }));
  }
  // statement / account balance work on the linked customer
  if (!opts.customerId) return [];
  const { data } = await supabase.from("customers")
    .select("id, name, lifetime_value").eq("id", opts.customerId).maybeSingle();
  return data ? [{ id: data.id, label: data.name, sublabel: "Linked customer" }] : [];
}

/** Builds the PDF for the chosen document + record. */
export async function buildDocument(
  kind: DocumentKind,
  recordId: string,
  opts: { tenantId: string; periodDays?: number },
): Promise<GeneratedDocument> {
  const shop = await loadShop(opts.tenantId);

  if (kind === "receipt" || kind === "invoice") {
    const { data: sale } = await supabase.from("sales")
      .select("id, created_at, subtotal, discount_amount, total_amount, payment_method, customer_name, customer_id")
      .eq("id", recordId).maybeSingle();
    if (!sale) throw new Error("Sale not found");
    const { data: items } = await supabase.from("transactions")
      .select("product_name, quantity, unit_price, total_amount").eq("sale_id", recordId);
    const lines = (items || []).map((t: any) => ({
      name: t.product_name,
      quantity: Number(t.quantity),
      unit_price: Number(t.unit_price),
      total: Number(t.total_amount),
    }));
    const ref = `${kind === "invoice" ? "INV" : "RCP"}-${String(sale.id).slice(0, 8).toUpperCase()}`;

    if (kind === "receipt") {
      const blob = await generateReceiptBlob({
        shop,
        invoiceNumber: ref,
        date: sale.created_at,
        paymentMethod: sale.payment_method || "cash",
        customerName: sale.customer_name,
        items: lines,
        subtotal: Number(sale.subtotal || 0),
        discount: Number(sale.discount_amount || 0),
        total: Number(sale.total_amount || 0),
      });
      return { blob, filename: `${ref}.pdf`, caption: `Here is your receipt ${ref} from ${shop.name}.` };
    }

    const blob = await generateBusinessDoc({
      shop,
      title: "Invoice",
      reference: ref,
      date: sale.created_at,
      partyLabel: "Bill to",
      party: { name: sale.customer_name || "Walk-in customer" },
      meta: [{ label: "Payment", value: String(sale.payment_method || "cash").replace("_", " ") }],
      sections: [{
        columns: [
          { label: "Item", x: 0 },
          { label: "Qty", x: 0.62, align: "right" },
          { label: "Unit price", x: 0.8, align: "right" },
          { label: "Total", x: 1, align: "right" },
        ],
        rows: lines.map((l) => [l.name, String(l.quantity), money(l.unit_price), money(l.total)]),
      }],
      summary: [
        { label: "Subtotal", value: money(Number(sale.subtotal || 0)) },
        ...(Number(sale.discount_amount) > 0 ? [{ label: "Discount", value: `- ${money(Number(sale.discount_amount))}` }] : []),
        { label: "Total due", value: money(Number(sale.total_amount || 0)), emphasize: true },
      ],
      notes: "Thank you for your business.",
    });
    return { blob, filename: `${ref}.pdf`, caption: `Invoice ${ref} from ${shop.name}.` };
  }

  if (kind === "purchase_order") {
    const { data: po } = await supabase.from("purchase_orders")
      .select("id, po_number, ordered_at, total_amount, notes, supplier_id").eq("id", recordId).maybeSingle();
    if (!po) throw new Error("Purchase order not found");
    const { data: supplier } = po.supplier_id
      ? await supabase.from("suppliers").select("name, contact_person, phone, email, address").eq("id", po.supplier_id).maybeSingle()
      : { data: null as any };
    const { data: items } = await supabase.from("purchase_order_items")
      .select("product_name, category, unit, quantity, unit_cost, total_cost").eq("purchase_order_id", recordId);
    const blob = await generatePurchaseOrderPdf({
      shop,
      supplier: {
        name: supplier?.name || "Supplier",
        contact_person: supplier?.contact_person,
        phone: supplier?.phone,
        email: supplier?.email,
        address: supplier?.address,
      },
      poNumber: po.po_number,
      date: po.ordered_at,
      items: (items || []).map((i: any) => ({
        product_name: i.product_name,
        category: i.category,
        unit: i.unit,
        quantity: Number(i.quantity),
        unit_cost: Number(i.unit_cost),
        total_cost: Number(i.total_cost),
      })),
      total: Number(po.total_amount || 0),
      notes: po.notes,
    });
    return { blob, filename: `${po.po_number}.pdf`, caption: `Purchase order ${po.po_number} from ${shop.name}.` };
  }

  // Statement & account balance
  const { data: customer } = await supabase.from("customers")
    .select("id, name, phone, email, address, credit_limit, lifetime_value, loyalty_points, loyalty_tier")
    .eq("id", recordId).maybeSingle();
  if (!customer) throw new Error("Customer not found");

  const days = opts.periodDays ?? 90;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: sales } = await supabase.from("sales")
    .select("id, created_at, total_amount, payment_method")
    .eq("customer_id", recordId).gte("created_at", since).order("created_at", { ascending: true });
  const { data: payments } = await supabase.from("payments")
    .select("id, payment_date, amount, payment_method, payment_status, reference_number")
    .eq("customer_id", recordId).gte("payment_date", since).order("payment_date", { ascending: true });

  const billed = (sales || []).reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0);
  const paid = (payments || [])
    .filter((p: any) => String(p.payment_status || "").toLowerCase() !== "failed")
    .reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
  const balance = billed - paid;

  if (kind === "account_balance") {
    const blob = await generateBusinessDoc({
      shop,
      title: "Account balance",
      reference: `BAL-${String(customer.id).slice(0, 8).toUpperCase()}`,
      date: new Date(),
      partyLabel: "Account holder",
      party: { name: customer.name, phone: customer.phone, email: customer.email, address: customer.address },
      meta: [{ label: "Period", value: `Last ${days} days` }],
      sections: [{
        title: "Account overview",
        columns: [{ label: "Detail", x: 0 }, { label: "Value", x: 1, align: "right" }],
        rows: [
          ["Total billed", money(billed)],
          ["Total paid", money(paid)],
          ["Credit limit", money(Number(customer.credit_limit || 0))],
          ["Lifetime value", money(Number(customer.lifetime_value || 0))],
          ["Loyalty", `${customer.loyalty_points || 0} pts (${customer.loyalty_tier || "standard"})`],
        ],
      }],
      summary: [
        { label: balance > 0 ? "Balance due" : "Credit on account", value: money(Math.abs(balance)), emphasize: true },
      ],
      notes: balance > 0 ? "Kindly settle the outstanding balance at your earliest convenience." : "Your account is fully settled. Thank you.",
    });
    return {
      blob,
      filename: `account-balance-${customer.name.replace(/\W+/g, "-").toLowerCase()}.pdf`,
      caption: `Your account balance with ${shop.name}: ${money(Math.abs(balance))} ${balance > 0 ? "due" : "in credit"}.`,
    };
  }

  const blob = await generateBusinessDoc({
    shop,
    title: "Statement of account",
    reference: `STM-${String(customer.id).slice(0, 8).toUpperCase()}`,
    date: new Date(),
    partyLabel: "Statement for",
    party: { name: customer.name, phone: customer.phone, email: customer.email, address: customer.address },
    meta: [{ label: "Period", value: `${format(new Date(since), "dd MMM yyyy")} – ${format(new Date(), "dd MMM yyyy")}` }],
    sections: [
      {
        title: "Purchases",
        columns: [
          { label: "Date", x: 0 },
          { label: "Reference", x: 0.32 },
          { label: "Method", x: 0.62 },
          { label: "Amount", x: 1, align: "right" },
        ],
        rows: (sales || []).map((s: any) => [
          format(new Date(s.created_at), "dd MMM yyyy"),
          String(s.id).slice(0, 8).toUpperCase(),
          String(s.payment_method || "").replace("_", " "),
          money(Number(s.total_amount || 0)),
        ]),
      },
      {
        title: "Payments received",
        columns: [
          { label: "Date", x: 0 },
          { label: "Reference", x: 0.32 },
          { label: "Method", x: 0.62 },
          { label: "Amount", x: 1, align: "right" },
        ],
        rows: (payments || []).map((p: any) => [
          format(new Date(p.payment_date), "dd MMM yyyy"),
          p.reference_number || String(p.id).slice(0, 8).toUpperCase(),
          String(p.payment_method || "").replace("_", " "),
          money(Number(p.amount || 0)),
        ]),
      },
    ],
    summary: [
      { label: "Total billed", value: money(billed) },
      { label: "Total paid", value: money(paid) },
      { label: balance > 0 ? "Balance due" : "Credit on account", value: money(Math.abs(balance)), emphasize: true },
    ],
  });
  return {
    blob,
    filename: `statement-${customer.name.replace(/\W+/g, "-").toLowerCase()}.pdf`,
    caption: `Statement of account from ${shop.name} covering the last ${days} days.`,
  };
}
