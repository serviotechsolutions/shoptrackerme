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
  customer_company?: string | null;
  customer_address?: string | null;
  items: PaymentItem[];
  shop: ShopInfo;
}

interface ReceiptGeneratorProps {
  data: ReceiptData;
}

const ReceiptGenerator = ({ data }: ReceiptGeneratorProps) => {
  const PRIMARY_BLUE: [number, number, number] = [0, 153, 204]; // Bright blue from image
  const WHITE: [number, number, number] = [255, 255, 255];
  const DARK_TEXT: [number, number, number] = [51, 51, 51];
  const GRAY_TEXT: [number, number, number] = [128, 128, 128];

  const generateReceiptContent = async (doc: jsPDF): Promise<jsPDF> => {
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 20;
    let yPos = 25;

    // ============ TOP LEFT CORNER - Diagonal stripes ============
    doc.setFillColor(...PRIMARY_BLUE);
    // Main large diagonal
    doc.triangle(0, 0, 70, 0, 0, 70, 'F');
    // Second stripe
    doc.setFillColor(0, 170, 220);
    doc.triangle(25, 0, 55, 0, 0, 55, 'F');
    doc.triangle(0, 25, 35, 0, 0, 35, 'F');
    // Third stripe (white gap effect)
    doc.setFillColor(...WHITE);
    doc.triangle(15, 0, 40, 0, 0, 40, 'F');
    doc.triangle(0, 15, 25, 0, 0, 25, 'F');
    // Inner blue
    doc.setFillColor(...PRIMARY_BLUE);
    doc.triangle(0, 0, 20, 0, 0, 20, 'F');

    // ============ TOP RIGHT CORNER - Single diagonal stripe ============
    doc.setFillColor(...PRIMARY_BLUE);
    doc.triangle(pageWidth, 0, pageWidth - 35, 0, pageWidth, 45, 'F');
    doc.setFillColor(0, 170, 220);
    doc.triangle(pageWidth, 0, pageWidth - 25, 0, pageWidth, 35, 'F');

    // ============ BOTTOM RIGHT CORNER - Diagonal stripes ============
    doc.setFillColor(...PRIMARY_BLUE);
    doc.triangle(pageWidth, pageHeight, pageWidth - 70, pageHeight, pageWidth, pageHeight - 70, 'F');
    doc.setFillColor(0, 170, 220);
    doc.triangle(pageWidth, pageHeight - 25, pageWidth - 55, pageHeight, pageWidth, pageHeight, 'F');
    doc.triangle(pageWidth, pageHeight - 35, pageWidth - 35, pageHeight, pageWidth - 25, pageHeight, 'F');
    doc.setFillColor(...WHITE);
    doc.triangle(pageWidth, pageHeight - 15, pageWidth - 40, pageHeight, pageWidth, pageHeight, 'F');
    doc.setFillColor(...PRIMARY_BLUE);
    doc.triangle(pageWidth, pageHeight, pageWidth - 20, pageHeight, pageWidth, pageHeight - 20, 'F');

    // ============ LOGO AND SHOP NAME ============
    const centerX = pageWidth / 2;
    
    // Draw diamond logo shape
    const logoY = yPos + 5;
    const logoSize = 12;
    doc.setFillColor(...PRIMARY_BLUE);
    // Diamond shape (rotated square)
    const diamondCenterX = centerX - 25;
    doc.moveTo(diamondCenterX, logoY);
    doc.lineTo(diamondCenterX + logoSize, logoY + logoSize);
    doc.lineTo(diamondCenterX, logoY + logoSize * 2);
    doc.lineTo(diamondCenterX - logoSize, logoY + logoSize);
    doc.lineTo(diamondCenterX, logoY);
    doc.fill();
    
    // White checkmark inside diamond
    doc.setDrawColor(...WHITE);
    doc.setLineWidth(2);
    doc.line(diamondCenterX - 4, logoY + logoSize, diamondCenterX - 1, logoY + logoSize + 4);
    doc.line(diamondCenterX - 1, logoY + logoSize + 4, diamondCenterX + 5, logoY + logoSize - 3);

    // If shop has actual logo, overlay it
    if (data.shop.logo_url) {
      try {
        const response = await fetch(data.shop.logo_url);
        const blob = await response.blob();
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        const actualLogoSize = 20;
        doc.addImage(base64, 'PNG', centerX - 35, yPos, actualLogoSize, actualLogoSize);
      } catch (error) {
        console.error('Failed to load logo:', error);
      }
    }

    // Shop Name in italic
    doc.setTextColor(...PRIMARY_BLUE);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bolditalic');
    doc.text(data.shop.name || 'shop name', centerX + 5, yPos + 18);
    
    yPos += 45;

    // ============ ISSUED TO SECTION (Left) ============
    doc.setTextColor(...GRAY_TEXT);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('ISSUED TO:', margin, yPos);
    
    yPos += 5;
    doc.setTextColor(...DARK_TEXT);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(data.customer_name || 'Customer Name', margin, yPos);
    
    // ============ REF NO & DATE (Right) ============
    const rightX = pageWidth - margin;
    doc.setTextColor(...PRIMARY_BLUE);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('REF NO:', rightX - 50, yPos - 5);
    doc.setTextColor(...DARK_TEXT);
    doc.setFont('helvetica', 'normal');
    doc.text(data.reference_number || '01234', rightX, yPos - 5, { align: 'right' });
    
    doc.setTextColor(...PRIMARY_BLUE);
    doc.setFont('helvetica', 'bold');
    doc.text('DUE DATE:', rightX - 50, yPos + 2);
    doc.setTextColor(...DARK_TEXT);
    doc.setFont('helvetica', 'normal');
    doc.text(format(new Date(data.payment_date), 'dd.MM.yyyy'), rightX, yPos + 2, { align: 'right' });

    yPos += 5;
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    if (data.customer_company) {
      doc.text(data.customer_company, margin, yPos);
      yPos += 4;
    }
    if (data.customer_address) {
      doc.text(data.customer_address, margin, yPos);
      yPos += 4;
    }

    yPos += 15;

    // ============ TABLE ============
    const tableLeft = margin;
    const tableWidth = pageWidth - 2 * margin;
    const colWidths = [90, 30, 25, 25]; // Description, MRP, QTY, TOTAL
    const headerHeight = 10;

    // Table Header
    doc.setFillColor(...PRIMARY_BLUE);
    doc.rect(tableLeft, yPos, tableWidth, headerHeight, 'F');
    
    doc.setTextColor(...WHITE);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    let colX = tableLeft + 5;
    doc.text('DESCRIPTION', colX, yPos + 7);
    colX += colWidths[0];
    doc.text('MRP', colX, yPos + 7);
    colX += colWidths[1];
    doc.text('QTY', colX, yPos + 7);
    colX += colWidths[2];
    doc.text('TOTAL', colX, yPos + 7);
    
    yPos += headerHeight;

    // Table Rows
    const rowHeight = 10;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    data.items.forEach((item) => {
      // Light border line
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.3);
      doc.line(tableLeft, yPos + rowHeight, tableLeft + tableWidth, yPos + rowHeight);

      doc.setTextColor(...DARK_TEXT);
      colX = tableLeft + 5;
      
      const itemName = item.product_name.length > 40 
        ? item.product_name.substring(0, 40) + '...' 
        : item.product_name;
      doc.text(itemName, colX, yPos + 7);
      colX += colWidths[0];
      doc.text(item.price.toFixed(0), colX, yPos + 7);
      colX += colWidths[1];
      doc.text(item.quantity.toString(), colX, yPos + 7);
      colX += colWidths[2];
      doc.text('$' + item.total_price.toFixed(0), colX, yPos + 7);
      
      yPos += rowHeight;
    });

    yPos += 8;

    // ============ TOTAL ROW ============
    const totalRowWidth = colWidths[1] + colWidths[2] + colWidths[3];
    const totalRowX = tableLeft + colWidths[0];
    
    doc.setFillColor(...PRIMARY_BLUE);
    doc.rect(totalRowX, yPos, totalRowWidth, 10, 'F');
    
    doc.setTextColor(...WHITE);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('TOTAL', totalRowX + 5, yPos + 7);
    doc.text('$' + data.total_amount.toFixed(0), totalRowX + totalRowWidth - 5, yPos + 7, { align: 'right' });

    yPos += 25;

    // ============ THANK YOU MESSAGE ============
    doc.setTextColor(...DARK_TEXT);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`THANK YOU FOR SHOPPING WITH "${data.shop.name?.toUpperCase() || 'SHOP NAME'}"`, margin, yPos);
    
    // Signature area on right
    doc.setFontSize(9);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...GRAY_TEXT);
    doc.text('signature', rightX - 20, yPos, { align: 'right' });

    yPos += 15;

    // ============ COME BACK AGAIN ============
    doc.setTextColor(...DARK_TEXT);
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
