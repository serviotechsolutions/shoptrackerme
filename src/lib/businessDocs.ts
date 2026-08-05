import { jsPDF } from "jspdf";
import { format } from "date-fns";

/** Shared A4 business-document generator used for invoices, statements and account balances. */

export interface DocShop {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  logo_url?: string | null;
}

export interface DocParty {
  name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
}

export interface DocColumn {
  label: string;
  /** 0-1 fraction of the content width where the column starts. */
  x: number;
  align?: "left" | "right";
}

export interface DocSection {
  title?: string;
  columns: DocColumn[];
  rows: string[][];
}

export interface DocSummaryLine {
  label: string;
  value: string;
  emphasize?: boolean;
}

export interface BusinessDocData {
  shop: DocShop;
  title: string;
  reference?: string | null;
  date: Date | string;
  party?: DocParty | null;
  partyLabel?: string;
  meta?: { label: string; value: string }[];
  sections: DocSection[];
  summary?: DocSummaryLine[];
  notes?: string | null;
  footer?: string | null;
}

export const money = (n: number, currency = "UGX") =>
  `${currency} ${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(n) || 0)}`;

async function loadImageDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string | null>((resolve) => {
      const fr = new FileReader();
      fr.onloadend = () => resolve(fr.result as string);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateBusinessDoc(data: BusinessDocData): Promise<Blob> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210;
  const H = 297;
  const M = 15;
  const CW = W - 2 * M;
  let y = 16;

  if (data.shop.logo_url) {
    const img = await loadImageDataUrl(data.shop.logo_url);
    if (img) {
      try { doc.addImage(img, "PNG", M, y - 4, 20, 20); } catch { /* ignore */ }
    }
  }
  const textLeft = data.shop.logo_url ? M + 24 : M;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(data.shop.name, textLeft, y + 3);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const shopLines = [data.shop.address, data.shop.phone, data.shop.email].filter(Boolean) as string[];
  shopLines.forEach((l, i) => doc.text(l, textLeft, y + 9 + i * 4.5));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text(data.title.toUpperCase(), W - M, y + 3, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let metaY = y + 9;
  if (data.reference) { doc.text(`Ref: ${data.reference}`, W - M, metaY, { align: "right" }); metaY += 4.5; }
  doc.text(`Date: ${format(new Date(data.date), "dd MMM yyyy")}`, W - M, metaY, { align: "right" });
  metaY += 4.5;
  (data.meta || []).forEach((m) => {
    doc.text(`${m.label}: ${m.value}`, W - M, metaY, { align: "right" });
    metaY += 4.5;
  });

  y = Math.max(y + 26 + Math.max(0, (shopLines.length - 2) * 4.5), metaY + 2);
  doc.setDrawColor(210);
  doc.line(M, y, W - M, y);
  y += 8;

  if (data.party) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(data.partyLabel || "Bill to", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    y += 5;
    [data.party.name, data.party.phone, data.party.email, data.party.address]
      .filter(Boolean)
      .forEach((l) => { doc.text(String(l), M, y); y += 4.5; });
    y += 4;
  }

  const pageBreak = (needed = 10) => {
    if (y + needed > H - 25) { doc.addPage(); y = 20; }
  };

  for (const section of data.sections) {
    pageBreak(20);
    if (section.title) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(section.title, M, y);
      y += 6;
    }
    doc.setFillColor(242, 242, 242);
    doc.rect(M, y - 5, CW, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    section.columns.forEach((c) => {
      const x = M + c.x * CW;
      doc.text(c.label, c.align === "right" ? x : x, y, c.align === "right" ? { align: "right" } : undefined);
    });
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    if (section.rows.length === 0) {
      doc.setTextColor(130);
      doc.text("No records for this period.", M, y);
      doc.setTextColor(0);
      y += 6;
    }
    section.rows.forEach((row) => {
      pageBreak(8);
      section.columns.forEach((c, i) => {
        const x = M + c.x * CW;
        const value = String(row[i] ?? "");
        if (c.align === "right") doc.text(value, x, y, { align: "right" });
        else {
          const nextX = section.columns[i + 1] ? M + section.columns[i + 1].x * CW : W - M;
          const maxW = Math.max(12, nextX - x - 2);
          doc.text(doc.splitTextToSize(value, maxW)[0] ?? "", x, y);
        }
      });
      y += 6;
    });
    doc.setDrawColor(220);
    doc.line(M, y - 1, W - M, y - 1);
    y += 6;
  }

  if (data.summary?.length) {
    pageBreak(10 + data.summary.length * 6);
    data.summary.forEach((s) => {
      doc.setFont("helvetica", s.emphasize ? "bold" : "normal");
      doc.setFontSize(s.emphasize ? 11 : 9.5);
      doc.text(s.label, W - M - 55, y, { align: "right" });
      doc.text(s.value, W - M, y, { align: "right" });
      y += s.emphasize ? 7 : 5.5;
    });
    y += 4;
  }

  if (data.notes) {
    pageBreak(20);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Notes", M, y);
    doc.setFont("helvetica", "normal");
    y += 5;
    doc.splitTextToSize(data.notes, CW).forEach((l: string) => { pageBreak(6); doc.text(l, M, y); y += 4.5; });
  }

  pageBreak(14);
  y += 8;
  doc.setFontSize(8);
  doc.setTextColor(120);
  doc.text(data.footer || `Generated by ${data.shop.name}`, M, y);

  return doc.output("blob");
}
