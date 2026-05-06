import { useEffect, useState, useMemo, useRef } from 'react';
import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { BarChart3, TrendingUp, Calendar as CalendarIcon, ArrowUpRight, ArrowDownRight, FileText, FileSpreadsheet, Download } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { format, startOfDay, startOfWeek, startOfMonth, startOfYear, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

type RangeKey = 'today' | 'week' | 'month' | 'year' | 'all' | 'custom';

const Reports = () => {
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [salesMap, setSalesMap] = useState<Record<string, string>>({});
  const [tenant, setTenant] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [rangeKey, setRangeKey] = useState<RangeKey>('month');
  const [customStart, setCustomStart] = useState<Date | undefined>();
  const [customEnd, setCustomEnd] = useState<Date | undefined>();
  const trendChartRef = useRef<HTMLDivElement>(null);
  const productsChartRef = useRef<HTMLDivElement>(null);
  const paymentsChartRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('tenant_id').eq('id', user.id).single();
        if (profile?.tenant_id) {
          const { data: t } = await supabase.from('tenants').select('*').eq('id', profile.tenant_id).single();
          setTenant(t);
        }
      }
      const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
      setAllTransactions(data || []);
      const { data: sales } = await supabase.from('sales').select('id, customer_name');
      const map: Record<string, string> = {};
      (sales || []).forEach((s: any) => { if (s.id) map[s.id] = s.customer_name || ''; });
      setSalesMap(map);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const { startDate, endDate } = useMemo(() => {
    const now = new Date();
    switch (rangeKey) {
      case 'today': return { startDate: startOfDay(now), endDate: endOfDay(now) };
      case 'week': return { startDate: startOfWeek(now), endDate: endOfDay(now) };
      case 'month': return { startDate: startOfMonth(now), endDate: endOfDay(now) };
      case 'year': return { startDate: startOfYear(now), endDate: endOfDay(now) };
      case 'custom': return { startDate: customStart ? startOfDay(customStart) : null, endDate: customEnd ? endOfDay(customEnd) : null };
      default: return { startDate: null, endDate: null };
    }
  }, [rangeKey, customStart, customEnd]);

  const filteredTx = useMemo(() => {
    return allTransactions.filter(t => {
      const d = new Date(t.created_at);
      if (startDate && d < startDate) return false;
      if (endDate && d > endDate) return false;
      return true;
    });
  }, [allTransactions, startDate, endDate]);

  const stats = useMemo(() => ({
    sales: filteredTx.reduce((s, t) => s + Number(t.total_amount), 0),
    profit: filteredTx.reduce((s, t) => s + Number(t.profit), 0),
    transactions: filteredTx.length,
  }), [filteredTx]);

  const productStats = useMemo(() => {
    const map = new Map<string, any>();
    filteredTx.forEach(t => {
      const e = map.get(t.product_name) || { product_name: t.product_name, total_quantity: 0, total_sales: 0, total_profit: 0 };
      e.total_quantity += t.quantity; e.total_sales += Number(t.total_amount); e.total_profit += Number(t.profit);
      map.set(t.product_name, e);
    });
    return Array.from(map.values()).sort((a, b) => b.total_sales - a.total_sales);
  }, [filteredTx]);

  const paymentMethods = useMemo(() => {
    const map = new Map<string, number>();
    filteredTx.forEach(t => map.set(t.payment_method, (map.get(t.payment_method) || 0) + Number(t.total_amount)));
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [filteredTx]);

  const dailyTrend = useMemo(() => {
    const map = new Map<string, { name: string; sales: number; profit: number }>();
    filteredTx.forEach(t => {
      const key = format(new Date(t.created_at), 'MMM dd');
      const e = map.get(key) || { name: key, sales: 0, profit: 0 };
      e.sales += Number(t.total_amount); e.profit += Number(t.profit);
      map.set(key, e);
    });
    return Array.from(map.values()).reverse();
  }, [filteredTx]);

  const fmt = (amount: number) => new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(amount);
  const rangeLabel = rangeKey === 'today' ? 'Today' : rangeKey === 'week' ? 'This Week' : rangeKey === 'month' ? 'This Month' : rangeKey === 'year' ? 'This Year' : rangeKey === 'all' ? 'All Time' : `${customStart ? format(customStart, 'PP') : '...'} - ${customEnd ? format(customEnd, 'PP') : '...'}`;

  const exportCSV = () => {
    if (filteredTx.length === 0) { toast({ title: 'No data', description: 'No data for selected period', variant: 'destructive' }); return; }
    const rows = filteredTx.map(t => ({
      Date: format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
      Product: t.product_name,
      Quantity: t.quantity,
      'Unit Price': Number(t.unit_price),
      'Discount': Number(t.discount_amount || 0),
      'Total': Number(t.total_amount),
      'Profit': Number(t.profit),
      'Payment Method': t.payment_method,
      'Promo Code': t.promo_code || '',
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `report-${rangeKey}-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    if (filteredTx.length === 0) { toast({ title: 'No data', description: 'No data for selected period', variant: 'destructive' }); return; }
    const wb = XLSX.utils.book_new();
    const summary = [
      ['Report', tenant?.name || 'Shop'],
      ['Period', rangeLabel],
      ['Generated', format(new Date(), 'PPpp')],
      [],
      ['Total Sales', stats.sales],
      ['Total Profit', stats.profit],
      ['Transactions', stats.transactions],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), 'Summary');
    const txRows = filteredTx.map(t => ({
      Date: format(new Date(t.created_at), 'yyyy-MM-dd HH:mm'),
      Product: t.product_name, Quantity: t.quantity,
      'Unit Price': Number(t.unit_price), Discount: Number(t.discount_amount || 0),
      Total: Number(t.total_amount), Profit: Number(t.profit),
      'Payment Method': t.payment_method, 'Promo Code': t.promo_code || '',
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(txRows), 'Transactions');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productStats), 'Products');
    XLSX.writeFile(wb, `report-${rangeKey}-${Date.now()}.xlsx`);
  };

  const exportPDF = async () => {
    if (filteredTx.length === 0) { toast({ title: 'No data', description: 'No data for selected period', variant: 'destructive' }); return; }
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();   // 210
    const pageH = doc.internal.pageSize.getHeight();  // 297
    const singlePage = rangeKey !== 'year' && rangeKey !== 'all';

    // ===== Header =====
    let y = 12;
    if (tenant?.logo_url) {
      try {
        const resp = await fetch(tenant.logo_url);
        const blob = await resp.blob();
        const dataUrl: string = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result as string); fr.readAsDataURL(blob); });
        doc.addImage(dataUrl, 'PNG', 10, y, 16, 16);
      } catch {}
    }
    doc.setFontSize(14).setFont('helvetica', 'bold');
    doc.text(tenant?.name || 'Shop Report', pageW / 2, y + 5, { align: 'center' });
    doc.setFontSize(8).setFont('helvetica', 'normal');
    doc.text('Business Report', pageW / 2, y + 10, { align: 'center' });
    doc.text(`Period: ${rangeLabel}`, pageW / 2, y + 14, { align: 'center' });
    doc.text(`Generated: ${format(new Date(), 'PPp')}`, pageW / 2, y + 18, { align: 'center' });
    y += 24;

    const captureChart = async (ref: React.RefObject<HTMLDivElement>) => {
      if (!ref.current) return null;
      try {
        const canvas = await html2canvas(ref.current, { backgroundColor: '#ffffff', scale: 2 });
        return canvas.toDataURL('image/png');
      } catch (e) { console.error('Chart capture failed', e); return null; }
    };

    if (singlePage) {
      // ===== Compact single A4 page layout =====
      // Summary metrics (compact 2 cols)
      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value', 'Metric', 'Value']],
        body: [
          ['Total Sales', fmt(stats.sales), 'Transactions', String(stats.transactions)],
          ['Total Profit', fmt(stats.profit), 'Avg Txn', stats.transactions ? fmt(stats.sales / stats.transactions) : fmt(0)],
          ['Profit Margin', stats.sales ? `${(stats.profit / stats.sales * 100).toFixed(1)}%` : '0%', 'Top Product', productStats[0]?.product_name?.slice(0, 18) || '—'],
        ],
        theme: 'grid', headStyles: { fillColor: [59, 130, 246], fontSize: 7 },
        styles: { fontSize: 7, cellPadding: 1.2 },
        margin: { left: 10, right: 10 },
      });
      y = (doc as any).lastAutoTable.finalY + 3;

      // Two charts side-by-side
      const chartW = (pageW - 20 - 4) / 2; // 93mm
      const chartH = 55;
      const trendImg = await captureChart(trendChartRef);
      const productsImg = await captureChart(productsChartRef);
      doc.setFontSize(8).setFont('helvetica', 'bold');
      doc.text('Sales Trend', 10, y + 3);
      doc.text('Top Products', 10 + chartW + 4, y + 3);
      if (trendImg) doc.addImage(trendImg, 'PNG', 10, y + 5, chartW, chartH);
      if (productsImg) doc.addImage(productsImg, 'PNG', 10 + chartW + 4, y + 5, chartW, chartH);
      y += 5 + chartH + 3;

      // Payments chart + Top products table side by side
      const paymentsImg = await captureChart(paymentsChartRef);
      const halfH = 50;
      doc.setFontSize(8).setFont('helvetica', 'bold');
      doc.text('Payment Methods', 10, y + 3);
      if (paymentsImg) doc.addImage(paymentsImg, 'PNG', 10, y + 5, chartW, halfH);

      autoTable(doc, {
        startY: y + 5,
        head: [['Top Products', 'Qty', 'Revenue', 'Profit']],
        body: productStats.slice(0, 8).map(p => [
          p.product_name.length > 18 ? p.product_name.slice(0, 17) + '…' : p.product_name,
          p.total_quantity, fmt(p.total_sales), fmt(p.total_profit),
        ]),
        theme: 'striped', headStyles: { fillColor: [16, 185, 129], fontSize: 7 },
        styles: { fontSize: 6.5, cellPadding: 1 },
        margin: { left: 10 + chartW + 4, right: 10 },
        tableWidth: chartW,
      });

      // Transactions table — include in full, allow page break instead of cutting off
      const afterChartsY = Math.max(y + halfH + 5, (doc as any).lastAutoTable.finalY + 5);
      autoTable(doc, {
        startY: afterChartsY,
        head: [['Date', 'Product', 'Qty', 'Total', 'Profit', 'Method']],
        body: filteredTx.map(t => [
          format(new Date(t.created_at), 'MM/dd HH:mm'),
          t.product_name, t.quantity, fmt(Number(t.total_amount)), fmt(Number(t.profit)), t.payment_method,
        ]),
        theme: 'striped', headStyles: { fillColor: [100, 100, 100], fontSize: 7 },
        styles: { fontSize: 6.5, cellPadding: 1 },
        margin: { left: 10, right: 10, bottom: 10 },
        showHead: 'everyPage',
      });

      // Footer on every page
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(6).setFont('helvetica', 'italic').setTextColor(120);
        doc.text(`${tenant?.name || 'Shop'} • ${filteredTx.length} transactions • Page ${i} of ${pageCount}`, pageW / 2, pageH - 6, { align: 'center' });
      }
    } else {
      // ===== Multi-page (Year / All Time) =====
      autoTable(doc, {
        startY: y,
        head: [['Metric', 'Value']],
        body: [
          ['Total Sales', fmt(stats.sales)],
          ['Total Profit', fmt(stats.profit)],
          ['Transactions', String(stats.transactions)],
          ['Avg Transaction', stats.transactions ? fmt(stats.sales / stats.transactions) : fmt(0)],
          ['Profit Margin', stats.sales ? `${(stats.profit / stats.sales * 100).toFixed(1)}%` : '0%'],
        ],
        theme: 'grid', headStyles: { fillColor: [59, 130, 246] }, styles: { fontSize: 9 },
      });

      const addChart = async (ref: React.RefObject<HTMLDivElement>, title: string) => {
        const img = await captureChart(ref);
        if (!img) return;
        const tmp = new Image(); tmp.src = img;
        await new Promise(r => { tmp.onload = r; });
        const imgW = pageW - 20;
        const imgH = (tmp.height * imgW) / tmp.width;
        let curY = (doc as any).lastAutoTable.finalY + 6;
        if (curY + imgH + 8 > pageH - 10) { doc.addPage(); curY = 15; }
        doc.setFontSize(11).setFont('helvetica', 'bold');
        doc.text(title, 10, curY);
        doc.addImage(img, 'PNG', 10, curY + 3, imgW, imgH);
        (doc as any).lastAutoTable = { finalY: curY + 3 + imgH };
      };
      await addChart(trendChartRef, 'Sales Trend');
      await addChart(productsChartRef, 'Top Products by Revenue');
      await addChart(paymentsChartRef, 'Payment Methods');

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [['Top Products', 'Qty', 'Revenue', 'Profit']],
        body: productStats.slice(0, 10).map(p => [p.product_name, p.total_quantity, fmt(p.total_sales), fmt(p.total_profit)]),
        theme: 'striped', headStyles: { fillColor: [16, 185, 129] }, styles: { fontSize: 9 },
      });

      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 8,
        head: [['Date', 'Product', 'Qty', 'Total', 'Profit', 'Method']],
        body: filteredTx.map(t => [
          format(new Date(t.created_at), 'MM/dd HH:mm'),
          t.product_name, t.quantity, fmt(Number(t.total_amount)), fmt(Number(t.profit)), t.payment_method,
        ]),
        theme: 'striped', styles: { fontSize: 8 }, headStyles: { fillColor: [100, 100, 100] },
      });
    }

    doc.save(`report-${rangeKey}-${Date.now()}.pdf`);
  };

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div></DashboardLayout>;
  }

  const hasData = filteredTx.length > 0;
  const lowPerformers = [...productStats].sort((a, b) => a.total_sales - b.total_sales).slice(0, 5);

  return (
    <DashboardLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-center">Reports & Analytics</h1>
          <p className="text-muted-foreground text-center text-sm">Filter, analyze and export your business data</p>
        </div>

        {/* Filters & exports */}
        <Card>
          <CardContent className="pt-4 space-y-3">
            <div className="flex flex-wrap gap-2">
              {([
                ['today', 'Today'], ['week', 'This Week'], ['month', 'This Month'],
                ['year', 'This Year'], ['all', 'All Time'], ['custom', 'Custom']
              ] as [RangeKey, string][]).map(([k, l]) => (
                <Button key={k} size="sm" variant={rangeKey === k ? 'default' : 'outline'} onClick={() => setRangeKey(k)} className="text-xs h-8">{l}</Button>
              ))}
            </div>
            {rangeKey === 'custom' && (
              <div className="flex flex-wrap gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('text-xs h-8', !customStart && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-3 w-3" />{customStart ? format(customStart, 'PP') : 'Start date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customStart} onSelect={setCustomStart} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('text-xs h-8', !customEnd && 'text-muted-foreground')}>
                      <CalendarIcon className="mr-2 h-3 w-3" />{customEnd ? format(customEnd, 'PP') : 'End date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={customEnd} onSelect={setCustomEnd} initialFocus className={cn('p-3 pointer-events-auto')} />
                  </PopoverContent>
                </Popover>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-2 border-t">
              <Button size="sm" variant="outline" disabled={!hasData} onClick={exportPDF} className="text-xs h-8"><FileText className="h-3 w-3 mr-1" />PDF</Button>
              <Button size="sm" variant="outline" disabled={!hasData} onClick={exportCSV} className="text-xs h-8"><Download className="h-3 w-3 mr-1" />CSV</Button>
              <Button size="sm" variant="outline" disabled={!hasData} onClick={exportExcel} className="text-xs h-8"><FileSpreadsheet className="h-3 w-3 mr-1" />Excel</Button>
              <span className="text-xs text-muted-foreground ml-auto self-center">{rangeLabel} • {filteredTx.length} txns</span>
            </div>
          </CardContent>
        </Card>

        {!hasData ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">No data for selected period</CardContent></Card>
        ) : (
        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Total Sales</CardTitle></CardHeader><CardContent><div className="text-base font-bold text-primary">{fmt(stats.sales)}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Total Profit</CardTitle></CardHeader><CardContent><div className="text-base font-bold text-success">{fmt(stats.profit)}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Transactions</CardTitle></CardHeader><CardContent><div className="text-base font-bold">{stats.transactions}</div></CardContent></Card>
              <Card><CardHeader className="pb-2"><CardTitle className="text-xs">Avg Transaction</CardTitle></CardHeader><CardContent><div className="text-base font-bold">{stats.transactions ? fmt(stats.sales / stats.transactions) : fmt(0)}</div></CardContent></Card>
            </div>
            <Card>
              <CardHeader><CardTitle className="text-base">Payment Methods</CardTitle></CardHeader>
              <CardContent>
                {paymentMethods.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={paymentMethods} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => fmt(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-muted-foreground py-8 text-sm">No data</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Sales Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} name="Sales" />
                    <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Top Products by Revenue</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={productStats.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis dataKey="product_name" type="category" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }} formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Bar dataKey="total_sales" fill="hsl(var(--primary))" name="Revenue" />
                    <Bar dataKey="total_profit" fill="#10b981" name="Profit" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">Detailed Product Table</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Product</TableHead><TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead><TableHead className="text-right">Profit</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {productStats.map(p => (
                      <TableRow key={p.product_name}>
                        <TableCell className="font-medium">{p.product_name}</TableCell>
                        <TableCell className="text-right">{p.total_quantity}</TableCell>
                        <TableCell className="text-right text-primary font-semibold">{fmt(p.total_sales)}</TableCell>
                        <TableCell className="text-right text-success font-semibold">{fmt(p.total_profit)}</TableCell>
                        <TableCell className="text-right">{p.total_sales > 0 ? `${(p.total_profit / p.total_sales * 100).toFixed(1)}%` : '0%'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        )}

        {/* Hidden offscreen charts for PDF export capture */}
        {hasData && (
          <div style={{ position: 'fixed', left: '-10000px', top: 0, width: '800px', background: '#fff', padding: '16px' }} aria-hidden>
            <div ref={trendChartRef} style={{ width: '768px', height: '320px', background: '#fff' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="name" stroke="#374151" />
                  <YAxis stroke="#374151" />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} name="Sales" isAnimationActive={false} />
                  <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit" isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div ref={productsChartRef} style={{ width: '768px', height: '380px', background: '#fff', marginTop: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productStats.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis type="number" stroke="#374151" />
                  <YAxis dataKey="product_name" type="category" width={140} stroke="#374151" />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="total_sales" fill="#3b82f6" name="Revenue" isAnimationActive={false} />
                  <Bar dataKey="total_profit" fill="#10b981" name="Profit" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div ref={paymentsChartRef} style={{ width: '768px', height: '320px', background: '#fff', marginTop: 16 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={paymentMethods} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={110} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} isAnimationActive={false}>
                    {paymentMethods.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Reports;
