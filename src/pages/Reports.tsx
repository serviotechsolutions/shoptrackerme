import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, Calendar, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['hsl(var(--primary))', 'hsl(var(--accent))', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

const Reports = () => {
  const [dayStats, setDayStats] = useState({ sales: 0, profit: 0, transactions: 0 });
  const [weekStats, setWeekStats] = useState({ sales: 0, profit: 0, transactions: 0 });
  const [monthStats, setMonthStats] = useState({ sales: 0, profit: 0, transactions: 0 });
  const [yearStats, setYearStats] = useState({ sales: 0, profit: 0, transactions: 0 });
  const [prevWeekStats, setPrevWeekStats] = useState({ sales: 0, profit: 0, transactions: 0 });
  const [productStats, setProductStats] = useState<any[]>([]);
  const [categoryData, setCategoryData] = useState<any[]>([]);
  const [weeklyTrend, setWeeklyTrend] = useState<any[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchReports(); }, []);

  const fetchReports = async () => {
    try {
      const now = new Date();
      const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
      const weekStart = new Date(now.getTime() - 7 * 86400000);
      const prevWeekStart = new Date(now.getTime() - 14 * 86400000);
      const monthStart = new Date(now.getTime() - 30 * 86400000);

      const { data: allTransactions } = await supabase.from('transactions')
        .select('*').order('created_at', { ascending: false });

      if (!allTransactions) return;

      const calc = (txs: any[]) => ({
        sales: txs.reduce((s, t) => s + Number(t.total_amount), 0),
        profit: txs.reduce((s, t) => s + Number(t.profit), 0),
        transactions: txs.length,
      });

      const todayTx = allTransactions.filter(t => new Date(t.created_at) >= todayStart);
      const weekTx = allTransactions.filter(t => new Date(t.created_at) >= weekStart);
      const prevWeekTx = allTransactions.filter(t => { const d = new Date(t.created_at); return d >= prevWeekStart && d < weekStart; });
      const monthTx = allTransactions.filter(t => new Date(t.created_at) >= monthStart);

      setDayStats(calc(todayTx));
      setWeekStats(calc(weekTx));
      setPrevWeekStats(calc(prevWeekTx));
      setMonthStats(calc(monthTx));
      setYearStats(calc(allTransactions));

      // Product stats
      const productMap = new Map<string, any>();
      allTransactions.forEach(t => {
        const e = productMap.get(t.product_name) || { product_name: t.product_name, total_quantity: 0, total_sales: 0, total_profit: 0 };
        e.total_quantity += t.quantity; e.total_sales += Number(t.total_amount); e.total_profit += Number(t.profit);
        productMap.set(t.product_name, e);
      });
      const sorted = Array.from(productMap.values()).sort((a, b) => b.total_sales - a.total_sales);
      setProductStats(sorted);

      // Category breakdown from products
      const { data: products } = await supabase.from('products').select('category, selling_price, stock');
      const catMap = new Map<string, number>();
      products?.forEach(p => {
        const cat = p.category || 'Others';
        catMap.set(cat, (catMap.get(cat) || 0) + 1);
      });
      setCategoryData(Array.from(catMap.entries()).map(([name, value]) => ({ name, value })));

      // Weekly trend (last 8 weeks)
      const weekly: any[] = [];
      for (let i = 7; i >= 0; i--) {
        const start = new Date(now.getTime() - (i + 1) * 7 * 86400000);
        const end = new Date(now.getTime() - i * 7 * 86400000);
        const wxs = allTransactions.filter(t => { const d = new Date(t.created_at); return d >= start && d < end; });
        weekly.push({
          name: `W${8 - i}`,
          sales: wxs.reduce((s, t) => s + Number(t.total_amount), 0),
          profit: wxs.reduce((s, t) => s + Number(t.profit), 0),
        });
      }
      setWeeklyTrend(weekly);

      // Payment methods
      const pmMap = new Map<string, number>();
      allTransactions.forEach(t => {
        pmMap.set(t.payment_method, (pmMap.get(t.payment_method) || 0) + Number(t.total_amount));
      });
      setPaymentMethods(Array.from(pmMap.entries()).map(([name, value]) => ({ name, value })));

    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (amount: number) => new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(amount);

  const change = (curr: number, prev: number) => prev === 0 ? (curr > 0 ? 100 : 0) : ((curr - prev) / prev) * 100;

  const CompareCard = ({ title, current, previous, icon: Icon }: any) => {
    const ch = change(current.sales, previous.sales);
    const isUp = ch >= 0;
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-lg font-bold text-primary">{fmt(current.sales)}</div>
          <div className="flex items-center gap-1 mt-1">
            <span className={`flex items-center text-xs font-medium ${isUp ? 'text-success' : 'text-destructive'}`}>
              {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(ch).toFixed(0)}%
            </span>
            <span className="text-xs text-muted-foreground">vs previous</span>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 mt-2 border-t">
            <div><p className="text-xs text-muted-foreground">Profit</p><p className="text-sm font-semibold text-success">{fmt(current.profit)}</p></div>
            <div><p className="text-xs text-muted-foreground">Transactions</p><p className="text-sm font-semibold">{current.transactions}</p></div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div></DashboardLayout>;
  }

  const lowPerformers = [...productStats].sort((a, b) => a.total_sales - b.total_sales).slice(0, 5);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-center">Reports & Analytics</h1>
          <p className="text-muted-foreground text-center text-sm">Comprehensive business performance insights</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="grid grid-cols-4 w-full max-w-md mx-auto">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="trends">Trends</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="compare">Compare</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              <CompareCard title="Today" current={dayStats} previous={{ sales: 0, profit: 0, transactions: 0 }} icon={Calendar} />
              <CompareCard title="This Week" current={weekStats} previous={prevWeekStats} icon={TrendingUp} />
              <CompareCard title="Last 30 Days" current={monthStats} previous={weekStats} icon={BarChart3} />
              <CompareCard title="All Time" current={yearStats} previous={monthStats} icon={BarChart3} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base">Avg Performance</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 rounded-lg bg-primary/10">
                      <p className="text-xs text-muted-foreground">Avg Daily Sales</p>
                      <p className="text-base font-bold text-primary">{fmt(weekStats.sales / 7)}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-success/10">
                      <p className="text-xs text-muted-foreground">Profit Margin</p>
                      <p className="text-base font-bold text-success">{monthStats.sales > 0 ? `${(monthStats.profit / monthStats.sales * 100).toFixed(1)}%` : '0%'}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-accent/10">
                      <p className="text-xs text-muted-foreground">Total Txns</p>
                      <p className="text-base font-bold">{yearStats.transactions}</p>
                    </div>
                    <div className="text-center p-3 rounded-lg bg-primary/10">
                      <p className="text-xs text-muted-foreground">Avg Transaction</p>
                      <p className="text-base font-bold text-primary">{yearStats.transactions > 0 ? fmt(yearStats.sales / yearStats.transactions) : fmt(0)}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment methods pie */}
              <Card>
                <CardHeader><CardTitle className="text-base">Payment Methods</CardTitle></CardHeader>
                <CardContent>
                  {paymentMethods.length > 0 ? (
                    <ResponsiveContainer width="100%" height={200}>
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
            </div>
          </TabsContent>

          <TabsContent value="trends" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Weekly Sales Trend (Last 8 Weeks)</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={weeklyTrend}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis className="text-xs" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }} formatter={(v: number) => fmt(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="sales" stroke="hsl(var(--primary))" strokeWidth={2} name="Sales" />
                    <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} name="Profit" />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {categoryData.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Product Categories</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie data={categoryData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${name} (${value})`}>
                        {categoryData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Top 10 Products by Revenue</CardTitle></CardHeader>
              <CardContent>
                {productStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={productStats.slice(0, 10)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis dataKey="product_name" type="category" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }} formatter={(v: number) => fmt(v)} />
                      <Legend />
                      <Bar dataKey="total_sales" fill="hsl(var(--primary))" name="Revenue" />
                      <Bar dataKey="total_profit" fill="#10b981" name="Profit" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="text-center text-muted-foreground py-8 text-sm">No data</p>}
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-success" /> Top Sellers</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {productStats.slice(0, 5).map((p, i) => (
                      <div key={p.product_name} className="flex items-center gap-3">
                        <Badge variant="outline" className="w-6 h-6 rounded-full flex items-center justify-center p-0 text-xs">{i + 1}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.product_name}</p>
                          <p className="text-xs text-muted-foreground">{p.total_quantity} units</p>
                        </div>
                        <span className="text-sm font-semibold text-primary">{fmt(p.total_sales)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-destructive rotate-180" /> Low Performers</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {lowPerformers.map((p, i) => (
                      <div key={p.product_name} className="flex items-center gap-3">
                        <Badge variant="outline" className="w-6 h-6 rounded-full flex items-center justify-center p-0 text-xs border-destructive text-destructive">{i + 1}</Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.product_name}</p>
                          <p className="text-xs text-muted-foreground">{p.total_quantity} units</p>
                        </div>
                        <span className="text-sm font-semibold text-muted-foreground">{fmt(p.total_sales)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader><CardTitle className="text-base">Detailed Product Table</CardTitle></CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Qty Sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                      <TableHead className="text-right">Profit</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productStats.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No data</TableCell></TableRow>
                    ) : productStats.map(p => (
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

          <TabsContent value="compare" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">This Week vs Last Week</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Metric</p>
                    <p className="text-sm font-medium">Revenue</p>
                    <p className="text-sm font-medium mt-2">Profit</p>
                    <p className="text-sm font-medium mt-2">Transactions</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">This Week</p>
                    <p className="text-sm font-bold text-primary">{fmt(weekStats.sales)}</p>
                    <p className="text-sm font-bold text-success mt-2">{fmt(weekStats.profit)}</p>
                    <p className="text-sm font-bold mt-2">{weekStats.transactions}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Last Week</p>
                    <p className="text-sm font-bold text-muted-foreground">{fmt(prevWeekStats.sales)}</p>
                    <p className="text-sm font-bold text-muted-foreground mt-2">{fmt(prevWeekStats.profit)}</p>
                    <p className="text-sm font-bold text-muted-foreground mt-2">{prevWeekStats.transactions}</p>
                  </div>
                </div>
                <div className="mt-4 pt-4 border-t grid grid-cols-3 gap-4">
                  {['Revenue', 'Profit', 'Transactions'].map((label, i) => {
                    const pairs = [
                      [weekStats.sales, prevWeekStats.sales],
                      [weekStats.profit, prevWeekStats.profit],
                      [weekStats.transactions, prevWeekStats.transactions],
                    ];
                    const ch = change(pairs[i][0], pairs[i][1]);
                    const isUp = ch >= 0;
                    return (
                      <div key={label} className="text-center">
                        <p className="text-xs text-muted-foreground">{label} Change</p>
                        <p className={`text-lg font-bold ${isUp ? 'text-success' : 'text-destructive'}`}>
                          {isUp ? '+' : ''}{ch.toFixed(0)}%
                        </p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
