import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Search, Receipt, Eye, Printer, Download, Calendar, TrendingUp, ShoppingBag, DollarSign, RotateCcw } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth } from 'date-fns';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { jsPDF } from 'jspdf';
import { DateRange } from 'react-day-picker';

interface Transaction {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_amount: number;
  profit: number;
  payment_method: string;
  created_at: string;
  created_by: string;
  discount_amount: number | null;
  discount_type: string | null;
  promo_code: string | null;
}

interface GroupedSale {
  invoiceId: string;
  date: string;
  items: Transaction[];
  totalAmount: number;
  totalProfit: number;
  paymentMethod: string;
  itemCount: number;
}

interface ShopInfo {
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
}

type FilterType = 'today' | 'week' | 'month' | 'custom' | 'all';

const Sales = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('today');
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedSale, setSelectedSale] = useState<GroupedSale | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [shopInfo, setShopInfo] = useState<ShopInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchUserData();
  }, []);

  useEffect(() => {
    if (tenantId) {
      fetchTransactions();
      fetchShopInfo();
    }
  }, [tenantId, activeFilter, dateRange]);

  const fetchUserData = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
      if (profile) setTenantId(profile.tenant_id);
    }
  };

  const fetchShopInfo = async () => {
    const { data } = await supabase.from('tenants').select('*').eq('id', tenantId).single();
    if (data) setShopInfo(data);
  };

  const fetchTransactions = async () => {
    setLoading(true);
    let query = supabase.from('transactions').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false });

    const now = new Date();
    if (activeFilter === 'today') {
      query = query.gte('created_at', startOfDay(now).toISOString()).lte('created_at', endOfDay(now).toISOString());
    } else if (activeFilter === 'week') {
      query = query.gte('created_at', startOfWeek(now, { weekStartsOn: 1 }).toISOString()).lte('created_at', endOfWeek(now, { weekStartsOn: 1 }).toISOString());
    } else if (activeFilter === 'month') {
      query = query.gte('created_at', startOfMonth(now).toISOString()).lte('created_at', endOfMonth(now).toISOString());
    } else if (activeFilter === 'custom' && dateRange?.from) {
      query = query.gte('created_at', startOfDay(dateRange.from).toISOString());
      if (dateRange.to) {
        query = query.lte('created_at', endOfDay(dateRange.to).toISOString());
      }
    }

    const { data } = await query;
    setTransactions(data || []);
    setLoading(false);
  };

  const buildGroup = (items: Transaction[]): GroupedSale => {
    const first = items[0];
    const dateStr = format(new Date(first.created_at), 'yyyyMMddHHmmss');
    const shortId = first.id.substring(0, 6).toUpperCase();
    return {
      invoiceId: `INV-${dateStr}-${shortId}`,
      date: first.created_at,
      items,
      totalAmount: items.reduce((s, t) => s + Number(t.total_amount), 0),
      totalProfit: items.reduce((s, t) => s + Number(t.profit), 0),
      paymentMethod: first.payment_method,
      itemCount: items.reduce((s, t) => s + t.quantity, 0),
    };
  };

  const groupedSales = useMemo(() => {
    if (!transactions.length) return [];
    const sorted = [...transactions].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const groups: GroupedSale[] = [];
    let current: Transaction[] = [];
    sorted.forEach((t, i) => {
      if (i === 0) { current = [t]; return; }
      const prev = sorted[i - 1];
      const timeDiff = Math.abs(new Date(t.created_at).getTime() - new Date(prev.created_at).getTime());
      if (t.created_by === prev.created_by && t.payment_method === prev.payment_method && timeDiff < 120000) {
        current.push(t);
      } else {
        groups.push(buildGroup(current));
        current = [t];
      }
    });
    if (current.length) groups.push(buildGroup(current));
    return groups.reverse();
  }, [transactions]);

  const filteredSales = useMemo(() => {
    if (!searchTerm) return groupedSales;
    const term = searchTerm.toLowerCase();
    return groupedSales.filter(sale =>
      sale.invoiceId.toLowerCase().includes(term) ||
      sale.items.some(i => i.product_name.toLowerCase().includes(term))
    );
  }, [groupedSales, searchTerm]);

  const totalRevenue = filteredSales.reduce((s, sale) => s + sale.totalAmount, 0);
  const totalProfit = filteredSales.reduce((s, sale) => s + sale.totalProfit, 0);
  const totalTransactions = filteredSales.length;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(amount);
  };

  const paymentMethodLabel = (method: string) => {
    const map: Record<string, string> = { cash: 'Cash', mobile_money: 'Mobile Money', card: 'Card', credit: 'Credit', other: 'Other' };
    return map[method] || method;
  };

  const generateReceiptPDF = async (sale: GroupedSale) => {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 200] });
    const pw = 80;
    let y = 10;

    if (shopInfo?.logo_url) {
      try {
        const res = await fetch(shopInfo.logo_url);
        const blob = await res.blob();
        const b64 = await new Promise<string>(r => { const fr = new FileReader(); fr.onloadend = () => r(fr.result as string); fr.readAsDataURL(blob); });
        doc.addImage(b64, 'PNG', (pw - 20) / 2, y, 20, 20);
        y += 24;
      } catch { /* skip */ }
    }

    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text(shopInfo?.name || 'Shop', pw / 2, y, { align: 'center' }); y += 6;

    if (shopInfo?.address) { doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.text(shopInfo.address, pw / 2, y, { align: 'center' }); y += 4; }
    if (shopInfo?.phone) { doc.setFontSize(8); doc.text(`Tel: ${shopInfo.phone}`, pw / 2, y, { align: 'center' }); y += 4; }

    y += 2; doc.line(5, y, pw - 5, y); y += 6;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('RECEIPT', pw / 2, y, { align: 'center' }); y += 6;

    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Invoice: ${sale.invoiceId}`, 5, y); y += 4;
    doc.text(`Date: ${format(new Date(sale.date), 'MMM dd, yyyy HH:mm')}`, 5, y); y += 4;
    doc.text(`Payment: ${paymentMethodLabel(sale.paymentMethod)}`, 5, y); y += 4;

    y += 2; doc.line(5, y, pw - 5, y); y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Item', 5, y); doc.text('Qty', 40, y); doc.text('Price', 50, y); doc.text('Total', 65, y); y += 4;
    doc.line(5, y, pw - 5, y); y += 4;

    doc.setFont('helvetica', 'normal');
    sale.items.forEach(item => {
      const name = item.product_name.length > 15 ? item.product_name.substring(0, 15) + '...' : item.product_name;
      doc.text(name, 5, y);
      doc.text(String(item.quantity), 42, y);
      doc.text(String(Math.round(item.unit_price)), 50, y);
      doc.text(String(Math.round(item.total_amount)), 65, y);
      y += 4;
    });

    y += 2; doc.line(5, y, pw - 5, y); y += 6;
    doc.setFontSize(10); doc.setFont('helvetica', 'bold');
    doc.text('TOTAL:', 5, y); doc.text(formatCurrency(sale.totalAmount), pw - 5, y, { align: 'right' }); y += 8;

    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text('Thank you for your business!', pw / 2, y, { align: 'center' });

    return doc;
  };

  const handleDownloadReceipt = async (sale: GroupedSale) => {
    const doc = await generateReceiptPDF(sale);
    doc.save(`receipt-${sale.invoiceId}.pdf`);
  };

  const handlePrintReceipt = async (sale: GroupedSale) => {
    const doc = await generateReceiptPDF(sale);
    doc.autoPrint();
    window.open(doc.output('bloburl'), '_blank');
  };

  const handleRefund = (sale: GroupedSale) => {
    toast({
      title: 'Refund Requested',
      description: `Refund for ${sale.invoiceId} (${formatCurrency(sale.totalAmount)}) — please contact your admin to process.`,
    });
  };

  const filterButtons: { label: string; value: FilterType }[] = [
    { label: 'Today', value: 'today' },
    { label: 'This Week', value: 'week' },
    { label: 'This Month', value: 'month' },
    { label: 'All Time', value: 'all' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sales History</h1>
          <p className="text-muted-foreground">View and manage completed transactions</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-primary/10 p-3">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Revenue</p>
                <p className="text-xl font-bold">{formatCurrency(totalRevenue)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-green-500/10 p-3">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Profit</p>
                <p className="text-xl font-bold">{formatCurrency(totalProfit)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-4 p-4">
              <div className="rounded-full bg-blue-500/10 p-3">
                <ShoppingBag className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Transactions</p>
                <p className="text-xl font-bold">{totalTransactions}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Search */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {filterButtons.map(fb => (
                <Button
                  key={fb.value}
                  variant={activeFilter === fb.value ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setActiveFilter(fb.value); setDateRange(undefined); }}
                >
                  {fb.label}
                </Button>
              ))}
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={activeFilter === 'custom' ? 'default' : 'outline'}
                    size="sm"
                    className="gap-2"
                  >
                    <Calendar className="h-4 w-4" />
                    {activeFilter === 'custom' && dateRange?.from
                      ? `${format(dateRange.from, 'MMM d')}${dateRange.to ? ` – ${format(dateRange.to, 'MMM d')}` : ''}`
                      : 'Custom Range'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => { setDateRange(range); setActiveFilter('custom'); }}
                    numberOfMonths={1}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by invoice number or product name..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Transactions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Transactions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading transactions...</div>
            ) : filteredSales.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Receipt className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium">No transactions found</p>
                <p className="text-sm">Try adjusting your filters or search term</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSales.map(sale => (
                      <TableRow key={sale.invoiceId} className="cursor-pointer hover:bg-muted/50" onClick={() => { setSelectedSale(sale); setDetailOpen(true); }}>
                        <TableCell className="font-mono text-xs font-medium">{sale.invoiceId}</TableCell>
                        <TableCell className="whitespace-nowrap text-sm">{format(new Date(sale.date), 'MMM dd, yyyy HH:mm')}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            {sale.items.slice(0, 2).map((item, i) => (
                              <span key={i} className="text-sm">{item.product_name} ×{item.quantity}</span>
                            ))}
                            {sale.items.length > 2 && <span className="text-xs text-muted-foreground">+{sale.items.length - 2} more</span>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(sale.totalAmount)}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs capitalize">
                            {paymentMethodLabel(sale.paymentMethod)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1" onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setSelectedSale(sale); setDetailOpen(true); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownloadReceipt(sale)}>
                              <Download className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handlePrintReceipt(sale)}>
                              <Printer className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Sale Detail Dialog */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              Transaction Details
            </DialogTitle>
            <DialogDescription>
              {selectedSale?.invoiceId}
            </DialogDescription>
          </DialogHeader>
          {selectedSale && (
            <div className="overflow-y-auto flex-1 space-y-4 pr-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground">Date</span>
                  <p className="font-medium">{format(new Date(selectedSale.date), 'MMM dd, yyyy HH:mm')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment Method</span>
                  <p className="font-medium">{paymentMethodLabel(selectedSale.paymentMethod)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Items</span>
                  <p className="font-medium">{selectedSale.itemCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Profit</span>
                  <p className="font-medium text-green-600">{formatCurrency(selectedSale.totalProfit)}</p>
                </div>
              </div>

              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSale.items.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm">{item.product_name}</TableCell>
                        <TableCell className="text-center">{item.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(item.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(item.total_amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {selectedSale.items.some(i => i.discount_amount && i.discount_amount > 0) && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Discount Applied</span>
                  <span>-{formatCurrency(selectedSale.items.reduce((s, i) => s + (Number(i.discount_amount) || 0), 0))}</span>
                </div>
              )}

              <div className="flex justify-between text-lg font-bold border-t pt-3">
                <span>Total</span>
                <span>{formatCurrency(selectedSale.totalAmount)}</span>
              </div>

              <div className="flex flex-wrap gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => handleDownloadReceipt(selectedSale)}>
                  <Download className="mr-2 h-4 w-4" /> Download Receipt
                </Button>
                <Button variant="outline" size="sm" onClick={() => handlePrintReceipt(selectedSale)}>
                  <Printer className="mr-2 h-4 w-4" /> Print Receipt
                </Button>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleRefund(selectedSale)}>
                  <RotateCcw className="mr-2 h-4 w-4" /> Refund
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

export default Sales;
