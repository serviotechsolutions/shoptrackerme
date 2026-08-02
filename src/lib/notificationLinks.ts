import type { Notification } from "@/hooks/useNotifications";

/**
 * Resolves the in-app destination for a notification so clicking it always
 * opens the record it came from instead of just dismissing it.
 */
export function notificationLink(n: Pick<Notification, "type" | "metadata"> & { link?: string | null }): string {
  if (n.link) return n.link;

  const m = (n.metadata || {}) as Record<string, any>;
  const type = String(n.type || "");

  if (m.purchase_order_id) return `/purchase-orders?po=${m.purchase_order_id}`;
  if (m.grn_id) return `/grn?grn=${m.grn_id}`;
  if (m.supplier_id) return `/suppliers/${m.supplier_id}`;
  if (m.customer_id) return `/customers/${m.customer_id}`;
  if (m.payment_id) return `/payments?payment=${m.payment_id}`;
  if (m.sale_id) return `/sales?sale=${m.sale_id}`;
  if (m.promotion_id) return `/promotions?promotion=${m.promotion_id}`;
  if (m.product_id) return `/products?product=${m.product_id}`;

  if (type.includes("purchase_order") || type.includes("po_")) return "/purchase-orders";
  if (type.includes("grn") || type.includes("goods")) return "/grn";
  if (type.includes("supplier")) return "/suppliers";
  if (type.includes("whatsapp")) return "/whatsapp";
  if (type.includes("payment")) return "/payments";
  if (type.includes("promotion") || type.includes("promo")) return "/promotions";
  if (type.includes("customer")) return "/customers";
  if (type === "sales_summary" || type.includes("report")) return "/reports";
  if (type === "high_profit" || type === "fast_selling" || type.includes("sale")) return "/sales";
  if (type === "low_stock" || type === "reorder" || type === "stale_product" || type.includes("stock") || type.includes("inventory")) {
    return "/products";
  }
  return "/dashboard";
}
