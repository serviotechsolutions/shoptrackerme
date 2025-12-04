import { jsPDF } from 'jspdf';
import { Button } from '@/components/ui/button';
import { FileText, Printer } from 'lucide-react';
import { format } from 'date-fns';

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

const ReceiptGenerator = ({ data }: ReceiptGeneratorProps) => {
  const generateReceiptContent = async (doc: jsPDF): Promise<jsPDF> => {
    const pageWidth = 80;
    let yPos = 10;

    // Draw subtle thin border around the receipt
    doc.setDrawColor(200, 200, 200); // Light gray color
    doc.setLineWidth(0.2); // Very thin line
    doc.rect(2, 2, pageWidth - 4, 196); // Border with small margin

    // Header - Shop Logo (if available)
    if (data.shop.logo_url) {
      try {
        const response = await fetch(data.shop.logo_url);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        const logoWidth = 20;
        const logoHeight = 20;
        const logoX = (pageWidth - logoWidth) / 2;
        doc.addImage(base64, 'PNG', logoX, yPos, logoWidth, logoHeight);
        yPos += logoHeight + 4;
      } catch (error) {
        console.error('Failed to load logo:', error);
      }
    }

    // Header - Shop Name
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(data.shop.name || 'Shop Name', pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;

    // Shop Address
    if (data.shop.address) {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      const addressLines = doc.splitTextToSize(data.shop.address, pageWidth - 10);
      addressLines.forEach((line: string) => {
        doc.text(line, pageWidth / 2, yPos, { align: 'center' });
        yPos += 4;
      });
    }

    // Shop Phone
    if (data.shop.phone) {
      doc.setFontSize(8);
      doc.text(`Tel: ${data.shop.phone}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 4;
    }

    // Shop Email
    if (data.shop.email) {
      doc.setFontSize(8);
      doc.text(`Email: ${data.shop.email}`, pageWidth / 2, yPos, { align: 'center' });
      yPos += 4;
    }

    // Divider
    yPos += 2;
    doc.setLineWidth(0.5);
    doc.line(5, yPos, pageWidth - 5, yPos);
    yPos += 6;

    // Receipt Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RECEIPT', pageWidth / 2, yPos, { align: 'center' });
    yPos += 6;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date: ${format(new Date(data.payment_date), 'MMM dd, yyyy HH:mm')}`, 5, yPos);
    yPos += 4;

    if (data.reference_number) {
      doc.text(`Ref: ${data.reference_number}`, 5, yPos);
      yPos += 4;
    }

    doc.text(`Payment: ${data.payment_method.replace('_', ' ')}`, 5, yPos);
    yPos += 4;

    if (data.customer_name) {
      doc.text(`Customer: ${data.customer_name}`, 5, yPos);
      yPos += 4;
    }

    // Divider
    yPos += 2;
    doc.line(5, yPos, pageWidth - 5, yPos);
    yPos += 4;

    // Items Header
    doc.setFont('helvetica', 'bold');
    doc.text('Item', 5, yPos);
    doc.text('Qty', 40, yPos);
    doc.text('Price', 50, yPos);
    doc.text('Total', 65, yPos);
    yPos += 4;
    doc.line(5, yPos, pageWidth - 5, yPos);
    yPos += 4;

    // Items
    doc.setFont('helvetica', 'normal');
    data.items.forEach(item => {
      const itemName = item.product_name.length > 15 
        ? item.product_name.substring(0, 15) + '...' 
        : item.product_name;
      doc.text(itemName, 5, yPos);
      doc.text(item.quantity.toString(), 42, yPos);
      doc.text(item.price.toFixed(0), 50, yPos);
      doc.text(item.total_price.toFixed(0), 65, yPos);
      yPos += 4;
    });

    // Divider
    yPos += 2;
    doc.line(5, yPos, pageWidth - 5, yPos);
    yPos += 6;

    // Total
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 5, yPos);
    doc.text(`$${data.total_amount.toFixed(2)}`, pageWidth - 5, yPos, { align: 'right' });
    yPos += 8;

    // Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your business!', pageWidth / 2, yPos, { align: 'center' });
    yPos += 4;
    doc.text('Please come again', pageWidth / 2, yPos, { align: 'center' });

    return doc;
  };

  const generatePDF = async () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 200]
    });

    await generateReceiptContent(doc);
    doc.save(`receipt-${data.reference_number || data.payment_id}.pdf`);
  };

  const printReceipt = async () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [80, 200]
    });

    await generateReceiptContent(doc);
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={generatePDF}>
        <FileText className="mr-2 h-4 w-4" />
        Download
      </Button>
      <Button variant="outline" size="sm" onClick={printReceipt}>
        <Printer className="mr-2 h-4 w-4" />
        Print
      </Button>
    </div>
  );
};

export default ReceiptGenerator;
