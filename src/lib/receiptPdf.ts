import { jsPDF } from "jspdf";
import { format } from "date-fns";

export interface ReceiptItemData {
  name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface ReceiptShopData {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
}

export interface ReceiptDocData {
  shop: ReceiptShopData;
  invoiceNumber: string;
  date: Date | string;
  paymentMethod: string;
  customerName?: string | null;
  servedBy?: string | null;
  items: ReceiptItemData[];
  subtotal?: number;
  discount?: number;
  total: number;
  amountReceived?: number | null;
  change?: number | null;
  currency?: string; // default UGX
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n || 0);

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result as string);
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * Generate a compact 80mm thermal-style receipt PDF whose height is measured
 * precisely from the actual content, with a rounded border and clean dividers.
 * Matches the on-screen ReceiptGenerator dialog layout.
 */
export async function generateReceiptDoc(data: ReceiptDocData): Promise<jsPDF> {
  const currency = data.currency || "UGX";
  const subtotal =
    data.subtotal ?? data.items.reduce((s, i) => s + i.total, 0);
  const discount = data.discount ?? Math.max(0, subtotal - data.total);
  const dateObj =
    typeof data.date === "string" ? new Date(data.date) : data.date;

  // Layout constants (mm)
  const W = 80;
  const M = 4;
  const PAD = 3;
  const innerLeft = M + PAD;
  const innerRight = W - M - PAD;
  const innerWidth = innerRight - innerLeft;

  const FS_SHOP = 12;
  const FS_META = 8;
  const FS_HEAD = 8.5;
  const FS_ITEM = 8;
  const FS_TOTAL = 11;
  const FS_FOOT = 8;
  const LH = (fs: number) => fs * 0.42;

  // Optional logo
  let logoDataUrl: string | null = null;
  let logoH = 0;
  if (data.shop.logo_url) {
    logoDataUrl = await loadImageDataUrl(data.shop.logo_url);
    if (logoDataUrl) logoH = 18; // 18mm tall block including small gap below
  }

  // Scratch doc for measuring wrapped text
  const scratch = new jsPDF({ orientation: "portrait", unit: "mm", format: [W, 400] });
  const wrap = (text: string, fs: number, width = innerWidth) => {
    scratch.setFontSize(fs);
    return scratch.splitTextToSize(text, width) as string[];
  };

  const shopNameLines = wrap(data.shop.name || "Shop", FS_SHOP);
  const addrLines = data.shop.address ? wrap(data.shop.address, FS_META) : [];
  const phoneLines = data.shop.phone ? wrap(`Tel: ${data.shop.phone}`, FS_META) : [];
  const emailLines = data.shop.email ? wrap(data.shop.email, FS_META) : [];

  // Item column widths (name column gets the rest)
  const qtyColW = 8;
  const priceColW = 12;
  const totalColW = 16;
  const nameColW = innerWidth - qtyColW - priceColW - totalColW;

  const wrappedItems = data.items.map((it) => ({
    it,
    lines: wrap(it.name, FS_ITEM, nameColW - 1).slice(0, 4),
  }));

  // Measure total height
  let h = M + PAD;
  if (logoH) h += logoH;
  h += shopNameLines.length * LH(FS_SHOP) + 1.5;
  h += addrLines.length * LH(FS_META);
  h += phoneLines.length * LH(FS_META);
  h += emailLines.length * LH(FS_META);
  h += 2.5 + 1;
  h += LH(FS_HEAD) + 1;
  h += LH(FS_META) + 0.5; // date
  h += LH(FS_META) + 0.5; // invoice
  h += LH(FS_META) + 0.5; // payment
  if (data.customerName) h += LH(FS_META) + 0.5;
  h += 2.5 + 1;
  h += LH(FS_HEAD) + 1; // table head
  h += 1.6;
  wrappedItems.forEach(({ lines }) => {
    h += Math.max(LH(FS_ITEM) + 1, lines.length * LH(FS_ITEM) + 1);
  });
  h += 2.5 + 1;
  h += LH(FS_META) + 0.8; // subtotal
  if (discount > 0) h += LH(FS_META) + 0.8;
  h += LH(FS_TOTAL) + 1.5; // TOTAL
  if (data.amountReceived != null) {
    h += LH(FS_META) + 0.8;
    if ((data.change ?? 0) > 0) h += LH(FS_META) + 0.8;
  }
  h += 2.5 + 1;
  if (data.servedBy) h += LH(FS_META) + 0.8;
  h += LH(FS_FOOT) + 0.5 + LH(FS_FOOT);
  h += PAD + M;

  const totalHeight = Math.max(70, Math.round(h * 10) / 10);
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [W, totalHeight] });

  // Border
  pdf.setDrawColor(0);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(M, M, W - 2 * M, totalHeight - 2 * M, 2, 2, "S");

  const center = W / 2;
  let y = M + PAD;

  // Logo
  if (logoDataUrl) {
    try {
      pdf.addImage(logoDataUrl, "PNG", center - 8, y, 16, 16);
    } catch { /* ignore */ }
    y += logoH;
  }

  y += LH(FS_SHOP) * 0.8;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(FS_SHOP);
  shopNameLines.forEach((ln) => { pdf.text(ln, center, y, { align: "center" }); y += LH(FS_SHOP); });
  y += 0.5;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(FS_META);
  addrLines.forEach((ln) => { pdf.text(ln, center, y, { align: "center" }); y += LH(FS_META); });
  phoneLines.forEach((ln) => { pdf.text(ln, center, y, { align: "center" }); y += LH(FS_META); });
  emailLines.forEach((ln) => { pdf.text(ln, center, y, { align: "center" }); y += LH(FS_META); });

  const divider = () => {
    y += 1.5;
    pdf.setLineDashPattern([0.6, 0.6], 0);
    pdf.setLineWidth(0.2);
    pdf.line(innerLeft, y, innerRight, y);
    pdf.setLineDashPattern([], 0);
    y += 2;
  };
  divider();

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(FS_HEAD);
  pdf.text("RECEIPT", center, y, { align: "center" });
  y += LH(FS_HEAD) + 1;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(FS_META);
  pdf.text(`Date: ${format(dateObj, "MMM dd, yyyy HH:mm")}`, innerLeft, y); y += LH(FS_META) + 0.5;
  pdf.text(`Invoice: ${data.invoiceNumber}`, innerLeft, y); y += LH(FS_META) + 0.5;
  pdf.text(`Payment: ${data.paymentMethod.replace("_", " ")}`, innerLeft, y); y += LH(FS_META) + 0.5;
  if (data.customerName) { pdf.text(`Customer: ${data.customerName}`, innerLeft, y); y += LH(FS_META) + 0.5; }

  divider();

  // Item table header
  const qtyX = innerLeft + nameColW;
  const priceX = qtyX + qtyColW;
  const totalX = innerRight;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(FS_HEAD);
  pdf.text("Item", innerLeft, y);
  pdf.text("Qty", qtyX, y);
  pdf.text("Price", priceX, y);
  pdf.text("Total", totalX, y, { align: "right" });
  y += LH(FS_HEAD) + 0.6;
  pdf.setLineWidth(0.15);
  pdf.line(innerLeft, y, innerRight, y);
  y += 1.6;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(FS_ITEM);
  wrappedItems.forEach(({ it, lines }) => {
    const rowH = Math.max(LH(FS_ITEM) + 1, lines.length * LH(FS_ITEM) + 1);
    lines.forEach((ln, i) => pdf.text(ln, innerLeft, y + i * LH(FS_ITEM)));
    pdf.text(String(it.quantity), qtyX, y);
    pdf.text(fmtMoney(it.unit_price), priceX, y);
    pdf.text(fmtMoney(it.total), totalX, y, { align: "right" });
    y += rowH;
  });

  divider();

  pdf.setFontSize(FS_META);
  pdf.text("Subtotal:", innerLeft, y);
  pdf.text(`${currency} ${fmtMoney(subtotal)}`, totalX, y, { align: "right" });
  y += LH(FS_META) + 0.8;
  if (discount > 0) {
    pdf.text("Discount:", innerLeft, y);
    pdf.text(`- ${currency} ${fmtMoney(discount)}`, totalX, y, { align: "right" });
    y += LH(FS_META) + 0.8;
  }
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(FS_TOTAL);
  pdf.text("TOTAL:", innerLeft, y);
  pdf.text(`${currency} ${fmtMoney(data.total)}`, totalX, y, { align: "right" });
  y += LH(FS_TOTAL) + 1.2;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(FS_META);
  if (data.amountReceived != null) {
    pdf.text("Paid:", innerLeft, y);
    pdf.text(`${currency} ${fmtMoney(data.amountReceived)}`, totalX, y, { align: "right" });
    y += LH(FS_META) + 0.8;
    if ((data.change ?? 0) > 0) {
      pdf.text("Change:", innerLeft, y);
      pdf.text(`${currency} ${fmtMoney(data.change || 0)}`, totalX, y, { align: "right" });
      y += LH(FS_META) + 0.8;
    }
  }

  divider();

  if (data.servedBy) {
    pdf.text(`Served by: ${data.servedBy}`, innerLeft, y);
    y += LH(FS_META) + 0.8;
  }
  pdf.setFontSize(FS_FOOT);
  pdf.text("Thank you for your business!", center, y, { align: "center" });
  y += LH(FS_FOOT) + 0.4;
  pdf.text("Please come again", center, y, { align: "center" });

  return pdf;
}

export function generateReceiptBlob(data: ReceiptDocData): Promise<Blob> {
  return generateReceiptDoc(data).then((doc) => doc.output("blob"));
}
