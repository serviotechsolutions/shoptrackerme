import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { FileText, Printer, X } from 'lucide-react';
import { format } from 'date-fns';
import { jsPDF } from 'jspdf';

interface PaymentItem {
  id: string;
  product_name: string;
  quantity: number;
  price: number;
  total_price: number;
}

interface ShopInfo {
  name: string;
  logo_url?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

interface ReceiptData {
  payment_id: string;
  reference_number: string | null;
  payment_date: string;
  payment_method: string;
  total_amount: number;
  customer_name: string | null;
  items: PaymentItem[];
  shop: ShopInfo;
}

interface ReceiptGeneratorProps {
  data: ReceiptData;
}

const fmtMoney = (n: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n || 0);

const ReceiptGenerator = ({ data }: ReceiptGeneratorProps) => {
  const [open, setOpen] = useState(false);

  const handlePrint = () => {
    setOpen(true);
    // Wait a tick for the dialog DOM to render before triggering print
    setTimeout(() => {
      window.print();
    }, 250);
  };

  // Auto-fit scaling: shrink fonts when item lists get long to keep receipts compact
  const itemCount = data.items.length;
  const scale = itemCount > 30 ? 0.7 : itemCount > 20 ? 0.8 : itemCount > 12 ? 0.9 : 1;

  const handleDownloadPDF = () => {
    // Dynamic-height thermal receipt PDF (80mm wide) with auto-fit
    const w = 80;
    const baseFontSize = 8 * scale;
    const headerFontSize = 13 * scale;
    const totalFontSize = 11 * scale;
    const lineHeight = 3.5 * scale;
    const nameMaxChars = scale < 1 ? 22 : 18;

    // Pre-compute wrapped item lines for accurate height
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 200] });
    const wrappedItems = data.items.map((it) => {
      const lines = doc.splitTextToSize(it.product_name, 36 * scale + 2);
      return { it, lines: lines.slice(0, 3) }; // cap at 3 lines per item
    });
    const itemsHeight = wrappedItems.reduce(
      (sum, w) => sum + Math.max(lineHeight + 1, w.lines.length * lineHeight + 1),
      0
    );
    const baseHeight = 60 + (data.shop.address ? 4 : 0) + (data.shop.phone ? 4 : 0) + (data.customer_name ? 4 : 0);
    const totalHeight = Math.max(110, baseHeight + itemsHeight + 35);

    // Recreate doc with correct height
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, totalHeight] });
    let y = 8;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(headerFontSize);
    pdf.text(data.shop.name || 'Shop', w / 2, y, { align: 'center' }); y += 5;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(baseFontSize);
    if (data.shop.address) { pdf.text(data.shop.address, w / 2, y, { align: 'center' }); y += 4; }
    if (data.shop.phone) { pdf.text(`Tel: ${data.shop.phone}`, w / 2, y, { align: 'center' }); y += 4; }

    y += 1;
    pdf.setLineDashPattern([1, 1], 0);
    pdf.line(4, y, w - 4, y); y += 4;

    pdf.setFontSize(baseFontSize);
    pdf.text(`Date: ${format(new Date(data.payment_date), 'MMM dd, yyyy HH:mm')}`, 4, y); y += 4;
    if (data.reference_number) { pdf.text(`Ref: ${data.reference_number}`, 4, y); y += 4; }
    pdf.text(`Pay: ${data.payment_method.replace('_', ' ')}`, 4, y); y += 4;
    if (data.customer_name) { pdf.text(`Customer: ${data.customer_name}`, 4, y); y += 4; }

    pdf.line(4, y, w - 4, y); y += 4;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Item', 4, y);
    pdf.text('Qty', 42, y);
    pdf.text('Price', 52, y);
    pdf.text('Total', w - 4, y, { align: 'right' });
    y += 3;
    pdf.line(4, y, w - 4, y); y += 4;

    pdf.setFont('helvetica', 'normal');
    wrappedItems.forEach(({ it, lines }) => {
      const startY = y;
      lines.forEach((ln: string, idx: number) => {
        pdf.text(ln, 4, y + idx * lineHeight);
      });
      pdf.text(String(it.quantity), 42, startY);
      pdf.text(fmtMoney(it.price), 52, startY);
      pdf.text(fmtMoney(it.total_price), w - 4, startY, { align: 'right' });
      y += Math.max(lineHeight + 1, lines.length * lineHeight + 1);
    });

    y += 2;
    pdf.line(4, y, w - 4, y); y += 5;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(totalFontSize);
    pdf.text('TOTAL', 4, y);
    pdf.text(`UGX ${fmtMoney(data.total_amount)}`, w - 4, y, { align: 'right' });
    y += 6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(baseFontSize);
    pdf.text('Thank you for your business!', w / 2, y, { align: 'center' });

    pdf.save(`receipt-${data.reference_number || data.payment_id}.pdf`);
  };

  // Tailwind-friendly auto-fit classes for the on-screen / print preview
  const itemFontClass = itemCount > 30 ? 'text-[8px]' : itemCount > 20 ? 'text-[9px]' : itemCount > 12 ? 'text-[10px]' : 'text-[11px]';
  const totalFontClass = itemCount > 20 ? 'text-xs' : 'text-sm';
  const rowPadClass = itemCount > 20 ? 'leading-tight' : '';

  return (
    <>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
          <FileText className="mr-2 h-4 w-4" />
          Download
        </Button>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          Print
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm p-0 print:shadow-none print:max-w-none print:p-0 print:border-0">
          {/* Print-only styles: hide everything except the receipt area */}
          <style>{`
            @media print {
              @page { size: 80mm auto; margin: 0; }
              html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }
              body * { visibility: hidden !important; }
              #receipt-print-area, #receipt-print-area * { visibility: visible !important; }
              #receipt-print-area {
                position: absolute !important;
                left: 0 !important; top: 0 !important;
                width: 80mm !important;
                padding: 4mm !important;
                box-shadow: none !important;
                border: 0 !important;
              }
              .no-print { display: none !important; }
            }
          `}</style>

          <div className="flex justify-end p-2 no-print border-b">
            <Button variant="ghost" size="sm" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div
            id="receipt-print-area"
            className="mx-auto bg-white text-black font-mono text-[12px] leading-tight p-4"
            style={{ width: '300px' }}
          >
            <div className="text-center mb-2">
              {data.shop.logo_url && (
                <img src={data.shop.logo_url} alt="" className="h-12 mx-auto mb-1 object-contain" />
              )}
              <div className="font-bold text-base">{data.shop.name}</div>
              {data.shop.address && <div className="text-[10px]">{data.shop.address}</div>}
              {data.shop.phone && <div className="text-[10px]">Tel: {data.shop.phone}</div>}
              {data.shop.email && <div className="text-[10px]">{data.shop.email}</div>}
            </div>

            <div className="border-t border-dashed border-black my-2" />

            <div className="text-center font-bold mb-1">RECEIPT</div>

            <div className="text-[11px] space-y-0.5">
              <div>Date: {format(new Date(data.payment_date), 'MMM dd, yyyy HH:mm')}</div>
              {data.reference_number && <div>Ref: {data.reference_number}</div>}
              <div>Payment: {data.payment_method.replace('_', ' ')}</div>
              {data.customer_name && <div>Customer: {data.customer_name}</div>}
            </div>

            <div className="border-t border-dashed border-black my-2" />

            <table className={`w-full ${itemFontClass}`}>
              <thead>
                <tr className="font-bold">
                  <th className="text-left">Item</th>
                  <th className="text-center w-8">Qty</th>
                  <th className="text-right w-14">Price</th>
                  <th className="text-right w-16">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className={rowPadClass}>
                    <td
                      className="text-left pr-1 align-top"
                      style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
                    >
                      {it.product_name}
                    </td>
                    <td className="text-center align-top">{it.quantity}</td>
                    <td className="text-right align-top">{fmtMoney(it.price)}</td>
                    <td className="text-right align-top">{fmtMoney(it.total_price)}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-2">No items</td></tr>
                )}
              </tbody>
            </table>

            <div className="border-t border-dashed border-black my-2" />

            <div className={`flex justify-between font-bold ${totalFontClass}`}>
              <span>TOTAL</span>
              <span>UGX {fmtMoney(data.total_amount)}</span>
            </div>

            <div className="border-t border-dashed border-black my-2" />

            <div className="text-center text-[10px] mt-2">
              <div>Thank you for your business!</div>
              <div>Please come again</div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ReceiptGenerator;
