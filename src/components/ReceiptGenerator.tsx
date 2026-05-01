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

  const handleDownloadPDF = () => {
    // Dynamic-height thermal receipt PDF (80mm wide)
    const lineHeight = 4;
    const baseHeight = 80; // header + footer baseline
    const itemsHeight = data.items.length * (lineHeight + 2);
    const totalHeight = Math.max(120, baseHeight + itemsHeight + 40);
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, totalHeight] });
    const w = 80;
    let y = 8;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(data.shop.name || 'Shop', w / 2, y, { align: 'center' }); y += 5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    if (data.shop.address) { doc.text(data.shop.address, w / 2, y, { align: 'center' }); y += 4; }
    if (data.shop.phone) { doc.text(`Tel: ${data.shop.phone}`, w / 2, y, { align: 'center' }); y += 4; }

    y += 1;
    doc.setLineDashPattern([1, 1], 0);
    doc.line(4, y, w - 4, y); y += 4;

    doc.setFontSize(8);
    doc.text(`Date: ${format(new Date(data.payment_date), 'MMM dd, yyyy HH:mm')}`, 4, y); y += 4;
    if (data.reference_number) { doc.text(`Ref: ${data.reference_number}`, 4, y); y += 4; }
    doc.text(`Pay: ${data.payment_method.replace('_', ' ')}`, 4, y); y += 4;
    if (data.customer_name) { doc.text(`Customer: ${data.customer_name}`, 4, y); y += 4; }

    doc.line(4, y, w - 4, y); y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Item', 4, y);
    doc.text('Qty', 42, y);
    doc.text('Price', 52, y);
    doc.text('Total', w - 4, y, { align: 'right' });
    y += 3;
    doc.line(4, y, w - 4, y); y += 4;

    doc.setFont('helvetica', 'normal');
    data.items.forEach((it) => {
      const name = it.product_name.length > 16 ? it.product_name.substring(0, 16) + '…' : it.product_name;
      doc.text(name, 4, y);
      doc.text(String(it.quantity), 42, y);
      doc.text(fmtMoney(it.price), 52, y);
      doc.text(fmtMoney(it.total_price), w - 4, y, { align: 'right' });
      y += lineHeight + 1;
    });

    y += 2;
    doc.line(4, y, w - 4, y); y += 5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('TOTAL', 4, y);
    doc.text(`UGX ${fmtMoney(data.total_amount)}`, w - 4, y, { align: 'right' });
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('Thank you for your business!', w / 2, y, { align: 'center' });

    doc.save(`receipt-${data.reference_number || data.payment_id}.pdf`);
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

            <table className="w-full text-[11px]">
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
                  <tr key={it.id}>
                    <td className="text-left pr-1 align-top">{it.product_name}</td>
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

            <div className="flex justify-between font-bold text-sm">
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
