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

interface CustomerInfo {
  name: string | null;
  company?: string | null;
  address?: string | null;
}

interface ReceiptData {
  payment_id: string;
  reference_number: string | null;
  payment_date: string;
  due_date?: string | null;
  payment_method: string;
  total_amount: number;
  customer_name: string | null;
  customer_company?: string | null;
  customer_address?: string | null;
  items: PaymentItem[];
  shop: ShopInfo;
}

interface ReceiptGeneratorProps {
  data: ReceiptData;
}

const ReceiptGenerator = ({ data }: ReceiptGeneratorProps) => {
  const PRIMARY_COLOR: [number, number, number] = [0, 136, 204]; // #0088CC blue
  const WHITE: [number, number, number] = [255, 255, 255];
  const DARK: [number, number, number] = [51, 51, 51];
  const LIGHT_GRAY: [number, number, number] = [245, 250, 255];

  const generateReceiptContent = async (doc: jsPDF): Promise<jsPDF> => {
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 20;
    let yPos = 20;

    // Draw diagonal corner decorations - Top Left
    doc.setFillColor(...PRIMARY_COLOR);
    doc.triangle(0, 0, 60, 0, 0, 60, 'F');
    doc.triangle(0, 0, 40, 0, 0, 40, 'F');
    
    // Top Right diagonal
    doc.triangle(pageWidth, 0, pageWidth - 50, 0, pageWidth, 50, 'F');
    doc.triangle(pageWidth, 30, pageWidth - 30, 0, pageWidth, 0, 'F');

    // Bottom Left diagonal
    doc.triangle(0, pageHeight, 50, pageHeight, 0, pageHeight - 50, 'F');
    doc.triangle(0, pageHeight, 30, pageHeight, 0, pageHeight - 30, 'F');

    // Bottom Right diagonal
    doc.triangle(pageWidth, pageHeight, pageWidth - 60, pageHeight, pageWidth, pageHeight - 60, 'F');
    doc.triangle(pageWidth, pageHeight, pageWidth - 40, pageHeight, pageWidth, pageHeight - 40, 'F');

    yPos = 30;

    // Logo and Shop Name
    const centerX = pageWidth / 2;
    
    if (data.shop.logo_url) {
      try {
        const response = await fetch(data.shop.logo_url);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        const logoSize = 25;
        const logoX = centerX - logoSize / 2;
        doc.addImage(base64, 'PNG', logoX, yPos, logoSize, logoSize);
        yPos += logoSize + 5;
      } catch (error) {
        console.error('Failed to load logo:', error);
        yPos += 10;
      }
    }

    // Shop Name
    doc.setTextColor(...PRIMARY_COLOR);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bolditalic');
    doc.text(data.shop.name || 'Shop Name', centerX, yPos, { align: 'center' });
    yPos += 20;

    // Customer Info Section (Left) and Reference Section (Right)
    doc.setTextColor(...DARK);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ISSUED TO:', margin, yPos);
    
    // Reference info on right
    const rightX = pageWidth - margin;
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text('REF NO:', rightX - 40, yPos);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'normal');
    doc.text(data.reference_number || 'N/A', rightX, yPos, { align: 'right' });
    
    yPos += 6;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...DARK);
    doc.text(data.customer_name || 'Walk-in Customer', margin, yPos);
    
    doc.setTextColor(...PRIMARY_COLOR);
    doc.text('DATE:', rightX - 40, yPos);
    doc.setTextColor(...DARK);
    doc.setFont('helvetica', 'normal');
    doc.text(format(new Date(data.payment_date), 'dd.MM.yyyy'), rightX, yPos, { align: 'right' });
    
    yPos += 5;
    doc.setFont('helvetica', 'normal');
    if (data.customer_company) {
      doc.text(data.customer_company, margin, yPos);
      yPos += 5;
    }
    if (data.customer_address) {
      const addressLines = doc.splitTextToSize(data.customer_address, 80);
      addressLines.forEach((line: string) => {
        doc.text(line, margin, yPos);
        yPos += 4;
      });
    }

    yPos = Math.max(yPos, 100) + 10;

    // Table Header
    const tableLeft = margin;
    const tableWidth = pageWidth - 2 * margin;
    const colWidths = [85, 30, 25, 30]; // Description, MRP, Qty, Total
    const tableHeaderHeight = 10;

    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(tableLeft, yPos, tableWidth, tableHeaderHeight, 'F');
    
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    
    let colX = tableLeft + 5;
    doc.text('DESCRIPTION', colX, yPos + 7);
    colX += colWidths[0];
    doc.text('MRP', colX, yPos + 7);
    colX += colWidths[1];
    doc.text('QTY', colX, yPos + 7);
    colX += colWidths[2];
    doc.text('TOTAL', colX, yPos + 7);
    
    yPos += tableHeaderHeight;

    // Table Rows
    const rowHeight = 10;
    doc.setTextColor(...DARK);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    data.items.forEach((item, index) => {
      // Alternating row background
      if (index % 2 === 0) {
        doc.setFillColor(...LIGHT_GRAY);
        doc.rect(tableLeft, yPos, tableWidth, rowHeight, 'F');
      }

      colX = tableLeft + 5;
      const itemName = item.product_name.length > 35 
        ? item.product_name.substring(0, 35) + '...' 
        : item.product_name;
      doc.text(itemName, colX, yPos + 7);
      colX += colWidths[0];
      doc.text(`$${item.price.toFixed(0)}`, colX, yPos + 7);
      colX += colWidths[1];
      doc.text(item.quantity.toString(), colX, yPos + 7);
      colX += colWidths[2];
      doc.text(`$${item.total_price.toFixed(0)}`, colX, yPos + 7);
      
      yPos += rowHeight;
    });

    // Total Row
    yPos += 5;
    doc.setFillColor(...PRIMARY_COLOR);
    doc.rect(tableLeft + colWidths[0] + colWidths[1], yPos, colWidths[2] + colWidths[3], 10, 'F');
    
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', tableLeft + colWidths[0] + colWidths[1] + 5, yPos + 7);
    doc.text(`$${data.total_amount.toFixed(0)}`, tableLeft + tableWidth - 5, yPos + 7, { align: 'right' });

    yPos += 25;

    // Thank you message
    doc.setTextColor(...DARK);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`THANK YOU FOR SHOPPING WITH "${data.shop.name?.toUpperCase() || 'US'}"`, margin, yPos);
    
    // Signature area
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.text('signature', pageWidth - margin - 30, yPos);
    doc.setLineWidth(0.5);
    doc.line(pageWidth - margin - 50, yPos + 3, pageWidth - margin, yPos + 3);

    yPos += 15;

    // Come back again
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('COME BACK AGAIN', margin, yPos);

    return doc;
  };

  const generatePDF = async () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    await generateReceiptContent(doc);
    doc.save(`receipt-${data.reference_number || data.payment_id}.pdf`);
  };

  const printReceipt = async () => {
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
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
