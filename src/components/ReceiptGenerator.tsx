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
  subtotal?: number;
  discount?: number;
  served_by?: string | null;
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

  const subtotal = data.subtotal ?? data.items.reduce((s, i) => s + i.total_price, 0);
  const discount = data.discount ?? Math.max(0, subtotal - data.total_amount);

  const handlePrint = () => {
    setOpen(true);
    setTimeout(() => window.print(), 250);
  };

  const handleDownloadPDF = () => {
    // 80mm thermal width. Compute exact height from measured content, then draw a rounded border around it.
    const W = 80;
    const M = 4;           // outer margin from page edge to border
    const PAD = 3;         // padding inside the border
    const innerLeft = M + PAD;
    const innerRight = W - M - PAD;
    const innerWidth = innerRight - innerLeft;

    // Font sizes
    const FS_SHOP = 12;
    const FS_META = 8;
    const FS_HEAD = 8.5;
    const FS_ITEM = 8;
    const FS_TOTAL = 11;
    const FS_FOOT = 8;

    // Line-height helpers
    const LH = (fs: number) => fs * 0.42; // mm per line at ~1.2 leading

    // Prepare a scratch doc just for text measuring
    const scratch = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, 400] });
    const wrap = (text: string, fs: number, width = innerWidth) => {
      scratch.setFontSize(fs);
      return scratch.splitTextToSize(text, width) as string[];
    };

    // Pre-wrap dynamic content
    const shopNameLines = wrap(data.shop.name || 'Shop', FS_SHOP);
    const addrLines = data.shop.address ? wrap(data.shop.address, FS_META) : [];
    const phoneLines = data.shop.phone ? wrap(`Tel: ${data.shop.phone}`, FS_META) : [];
    const emailLines = data.shop.email ? wrap(data.shop.email, FS_META) : [];

    const nameColW = innerWidth - 30; // Qty(6) + Price(10) + Total(14) approx
    const wrappedItems = data.items.map((it) => ({
      it,
      lines: wrap(it.product_name, FS_ITEM, nameColW).slice(0, 3),
    }));

    // Measure total height precisely
    let h = M + PAD; // top border+pad
    h += shopNameLines.length * LH(FS_SHOP) + 1.5;
    h += addrLines.length * LH(FS_META);
    h += phoneLines.length * LH(FS_META);
    h += emailLines.length * LH(FS_META);
    h += 2.5 + 1;                       // divider
    h += LH(FS_HEAD) + 1;               // RECEIPT label
    h += LH(FS_META) + 0.5;             // Date
    if (data.reference_number) h += LH(FS_META) + 0.5;
    h += LH(FS_META) + 0.5;             // Payment
    if (data.customer_name) h += LH(FS_META) + 0.5;
    h += 2.5 + 1;                       // divider
    h += LH(FS_HEAD) + 1;               // table header
    h += 1.2;                           // header rule
    wrappedItems.forEach(({ lines }) => {
      h += Math.max(LH(FS_ITEM) + 0.8, lines.length * LH(FS_ITEM) + 0.8);
    });
    h += 2.5 + 1;                       // divider
    h += LH(FS_META) + 0.8;             // Subtotal
    if (discount > 0) h += LH(FS_META) + 0.8;
    h += LH(FS_TOTAL) + 1.5;            // TOTAL
    h += 2.5 + 1;                       // divider
    if (data.served_by) h += LH(FS_META) + 0.8;
    h += LH(FS_FOOT) + 0.5 + LH(FS_FOOT); // footer 2 lines
    h += PAD + M;                       // bottom pad+border

    const totalHeight = Math.max(70, Math.round(h * 10) / 10);
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [W, totalHeight] });

    // Outer rounded border
    pdf.setDrawColor(0);
    pdf.setLineWidth(0.35);
    pdf.roundedRect(M, M, W - 2 * M, totalHeight - 2 * M, 2, 2, 'S');

    const center = W / 2;
    let y = M + PAD + LH(FS_SHOP) * 0.8;

    // Shop name
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS_SHOP);
    shopNameLines.forEach((ln) => { pdf.text(ln, center, y, { align: 'center' }); y += LH(FS_SHOP); });
    y += 0.5;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS_META);
    addrLines.forEach((ln) => { pdf.text(ln, center, y, { align: 'center' }); y += LH(FS_META); });
    phoneLines.forEach((ln) => { pdf.text(ln, center, y, { align: 'center' }); y += LH(FS_META); });
    emailLines.forEach((ln) => { pdf.text(ln, center, y, { align: 'center' }); y += LH(FS_META); });

    const divider = () => {
      y += 1.5;
      pdf.setLineDashPattern([0.6, 0.6], 0);
      pdf.setLineWidth(0.2);
      pdf.line(innerLeft, y, innerRight, y);
      pdf.setLineDashPattern([], 0);
      y += 2;
    };
    divider();

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS_HEAD);
    pdf.text('RECEIPT', center, y, { align: 'center' }); y += LH(FS_HEAD) + 1;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS_META);
    pdf.text(`Date: ${format(new Date(data.payment_date), 'MMM dd, yyyy HH:mm')}`, innerLeft, y); y += LH(FS_META) + 0.5;
    if (data.reference_number) { pdf.text(`Ref: ${data.reference_number}`, innerLeft, y); y += LH(FS_META) + 0.5; }
    pdf.text(`Payment: ${data.payment_method.replace('_', ' ')}`, innerLeft, y); y += LH(FS_META) + 0.5;
    if (data.customer_name) { pdf.text(`Customer: ${data.customer_name}`, innerLeft, y); y += LH(FS_META) + 0.5; }

    divider();

    // Table header
    const qtyX = innerLeft + nameColW + 2;
    const priceX = qtyX + 8;
    const totalX = innerRight;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS_HEAD);
    pdf.text('Item', innerLeft, y);
    pdf.text('Qty', qtyX, y);
    pdf.text('Price', priceX, y);
    pdf.text('Total', totalX, y, { align: 'right' });
    y += LH(FS_HEAD) + 0.6;
    pdf.setLineWidth(0.15);
    pdf.line(innerLeft, y, innerRight, y); y += 1.6;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS_ITEM);
    wrappedItems.forEach(({ it, lines }) => {
      const rowH = Math.max(LH(FS_ITEM) + 0.8, lines.length * LH(FS_ITEM) + 0.8);
      lines.forEach((ln, i) => pdf.text(ln, innerLeft, y + i * LH(FS_ITEM)));
      pdf.text(String(it.quantity), qtyX, y);
      pdf.text(fmtMoney(it.price), priceX, y);
      pdf.text(fmtMoney(it.total_price), totalX, y, { align: 'right' });
      y += rowH;
    });

    divider();

    pdf.setFontSize(FS_META);
    pdf.text('Subtotal:', innerLeft, y);
    pdf.text(`UGX ${fmtMoney(subtotal)}`, totalX, y, { align: 'right' }); y += LH(FS_META) + 0.8;
    if (discount > 0) {
      pdf.text('Discount:', innerLeft, y);
      pdf.text(`- UGX ${fmtMoney(discount)}`, totalX, y, { align: 'right' }); y += LH(FS_META) + 0.8;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(FS_TOTAL);
    pdf.text('TOTAL:', innerLeft, y);
    pdf.text(`UGX ${fmtMoney(data.total_amount)}`, totalX, y, { align: 'right' });
    y += LH(FS_TOTAL) + 1.2;

    divider();

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(FS_META);
    if (data.served_by) { pdf.text(`Served by: ${data.served_by}`, innerLeft, y); y += LH(FS_META) + 0.6; }
    pdf.setFontSize(FS_FOOT);
    pdf.text('Thank you for your business!', center, y, { align: 'center' }); y += LH(FS_FOOT) + 0.4;
    pdf.text('Please come again', center, y, { align: 'center' });

    pdf.save(`receipt-${data.reference_number || data.payment_id}.pdf`);
  };

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
        <DialogContent className="max-w-sm p-0 bg-transparent border-0 shadow-none print:shadow-none print:max-w-none print:p-0 print:border-0">
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
                margin: 0 !important;
                box-shadow: none !important;
              }
              .no-print { display: none !important; }
            }
          `}</style>

          <div className="flex justify-end gap-1 p-2 no-print">
            <Button variant="ghost" size="sm" onClick={() => window.print()} className="text-white hover:text-white hover:bg-white/10">
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-white hover:text-white hover:bg-white/10">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div
            id="receipt-print-area"
            className="mx-auto bg-white text-black font-sans border-2 border-black rounded-xl p-5 print:rounded-none"
            style={{ width: '320px' }}
          >
            <div className="text-center">
              {data.shop.logo_url && (
                <img src={data.shop.logo_url} alt="" className="h-16 mx-auto mb-2 object-contain" />
              )}
              <div className="font-extrabold text-xl tracking-tight leading-tight uppercase">{data.shop.name}</div>
              {data.shop.address && <div className="text-[12px] mt-1">{data.shop.address}</div>}
              {data.shop.phone && <div className="text-[12px]">Tel: {data.shop.phone}</div>}
              {data.shop.email && <div className="text-[12px]">{data.shop.email}</div>}
            </div>

            <div className="border-t border-black my-3" />

            <div className="text-center font-bold text-base mb-2">RECEIPT</div>

            <div className="text-[12px] space-y-1">
              <div>Invoice: {data.reference_number || data.payment_id}</div>
              <div>Date: {format(new Date(data.payment_date), 'MMM dd, yyyy HH:mm')}</div>
              <div>Payment: {data.payment_method.replace('_', ' ')}</div>
              {data.customer_name && <div>Customer: {data.customer_name}</div>}
            </div>

            <table className="w-full text-[12px] mt-3">
              <thead>
                <tr className="bg-gray-100 font-bold">
                  <th className="text-left px-1 py-1">Item</th>
                  <th className="text-center px-1 py-1 w-10">Qty</th>
                  <th className="text-right px-1 py-1 w-14">Price</th>
                  <th className="text-right px-1 py-1 w-16">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it) => (
                  <tr key={it.id} className="border-b border-gray-200 last:border-0">
                    <td className="text-left px-1 py-1 align-top break-words">{it.product_name}</td>
                    <td className="text-center px-1 py-1 align-top">{it.quantity}</td>
                    <td className="text-right px-1 py-1 align-top">{fmtMoney(it.price)}</td>
                    <td className="text-right px-1 py-1 align-top">{fmtMoney(it.total_price)}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-2">No items</td></tr>
                )}
              </tbody>
            </table>

            <div className="mt-3 text-[12px] space-y-1">
              <div className="flex justify-between"><span>Subtotal:</span><span>UGX {fmtMoney(subtotal)}</span></div>
              {discount > 0 && (
                <div className="flex justify-between"><span>Discount:</span><span>-UGX {fmtMoney(discount)}</span></div>
              )}
              <div className="flex justify-between font-bold text-sm pt-1">
                <span>TOTAL:</span><span>UGX {fmtMoney(data.total_amount)}</span>
              </div>
            </div>

            <div className="border-t border-black my-3" />

            {data.served_by && (
              <div className="text-[12px] mb-2">Served by: {data.served_by}.</div>
            )}
            <div className="border-t border-dashed border-black my-2" />
            <div className="text-center text-[12px]">
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
