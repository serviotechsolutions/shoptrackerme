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

  const handleDownloadPDF = async () => {
    const { generateReceiptDoc } = await import('@/lib/receiptPdf');
    const doc = await generateReceiptDoc({
      shop: {
        name: data.shop.name,
        address: data.shop.address,
        phone: data.shop.phone,
        email: data.shop.email,
        logo_url: data.shop.logo_url,
      },
      invoiceNumber: data.reference_number || data.payment_id,
      date: data.payment_date,
      paymentMethod: data.payment_method,
      customerName: data.customer_name,
      servedBy: data.served_by,
      items: data.items.map(i => ({
        name: i.product_name,
        quantity: i.quantity,
        unit_price: i.price,
        total: i.total_price,
      })),
      subtotal,
      discount,
      total: data.total_amount,
    });
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
