import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, ShoppingCart, TrendingUp, TrendingDown, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface DashboardStats {
  totalProducts: number;
  lowStockCount: number;
  todaySales: number;
  todayProfit: number;
  totalStock: number;
  yesterdaySales: number;
  yesterdayProfit: number;
  thisWeekSales: number;
  lastWeekSales: number;
}

interface LowStockProduct {
  id: string;
  name: string;
  stock: number;
  low_stock_threshold: number;
}

interface ChartData {
  name: string;
  sales: number;
  profit: number;
}

interface TopProduct {
  name: string;
  quantity: number;
  revenue: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalProducts: 0, lowStockCount: 0, todaySales: 0, todayProfit: 0,
    totalStock: 0, yesterdaySales: 0, yesterdayProfit: 0, thisWeekSales: 0, lastWeekSales: 0,
  });
  const [lowStockProducts, setLowStockProducts] = useState<LowStockProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

  useEffect(() => { fetchDashboardData(); }, []);

  const fetchDashboardData = async () => {
    try {
      const { data: products } = await supabase.from('products').select('stock, low_stock_threshold');
      const totalProducts = products?.length || 0;
      const totalStock = products?.reduce((sum, p) => sum + p.stock, 0) || 0;
      const lowStock = products?.filter(p => p.stock <= p.low_stock_threshold) || [];

      const { data: allProducts } = await supabase.from('products')
        .select('id, name, stock, low_stock_threshold').order('stock', { ascending: true });
      setLowStockProducts(allProducts?.filter(p => p.stock <= p.low_stock_threshold).slice(0, 5) || []);

      const now = new Date();
      const today = new Date(now); today.setHours(0, 0, 0, 0);
      const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
      const thisWeekStart = new Date(now.getTime() - 7 * 86400000);
      const lastWeekStart = new Date(now.getTime() - 14 * 86400000);

      const { data: allTx } = await supabase.from('transactions')
        .select('created_at, total_amount, profit, quantity, product_name')
        .gte('created_at', lastWeekStart.toISOString())
        .order('created_at', { ascending: true });

      const txs = allTx || [];
      const todayTx = txs.filter(t => new Date(t.created_at) >= today);
      const yesterdayTx = txs.filter(t => { const d = new Date(t.created_at); return d >= yesterday && d < today; });
      const thisWeekTx = txs.filter(t => new Date(t.created_at) >= thisWeekStart);
      const lastWeekTx = txs.filter(t => { const d = new Date(t.created_at); return d >= lastWeekStart && d < thisWeekStart; });

      const sum = (arr: any[], key: string) => arr.reduce((s, t) => s + Number(t[key]), 0);

      // Chart data - last 14 days
      const dailyData: Record<string, { sales: number; profit: number }> = {};
      for (let i = 13; i >= 0; i--) {
        const d = new Date(now); d.setDate(d.getDate() - i);
        const key = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        dailyData[key] = { sales: 0, profit: 0 };
      }
      txs.forEach(t => {
        const key = new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (dailyData[key]) {
          dailyData[key].sales += Number(t.total_amount);
          dailyData[key].profit += Number(t.profit);
        }
      });
      setChartData(Object.entries(dailyData).map(([name, d]) => ({ name, ...d })));

      // Top products this week
      const productMap = new Map<string, { quantity: number; revenue: number }>();
      thisWeekTx.forEach(t => {
        const e = productMap.get(t.product_name) || { quantity: 0, revenue: 0 };
        e.quantity += t.quantity; e.revenue += Number(t.total_amount);
        productMap.set(t.product_name, e);
      });
      setTopProducts(
        Array.from(productMap.entries())
          .map(([name, d]) => ({ name, ...d }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5)
      );

      setStats({
        totalProducts, lowStockCount: lowStock.length, totalStock,
        todaySales: sum(todayTx, 'total_amount'), todayProfit: sum(todayTx, 'profit'),
        yesterdaySales: sum(yesterdayTx, 'total_amount'), yesterdayProfit: sum(yesterdayTx, 'profit'),
        thisWeekSales: sum(thisWeekTx, 'total_amount'), lastWeekSales: sum(lastWeekTx, 'total_amount'),
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-UG', { style: 'currency', currency: 'UGX', minimumFractionDigits: 0 }).format(amount);

  const getChange = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous) * 100;
  };

  const ChangeIndicator = ({ current, previous }: { current: number; previous: number }) => {
    const change = getChange(current, previous);
    const isUp = change >= 0;
    return (
      <span className={`flex items-center gap-1 text-xs font-medium ${isUp ? 'text-success' : 'text-destructive'}`}>
        {isUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
        {Math.abs(change).toFixed(0)}%
      </span>
    );
  };

  if (loading) {
    return <DashboardLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" /></div></DashboardLayout>;
  }

  const weekChange = getChange(stats.thisWeekSales, stats.lastWeekSales);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="tracking-tight text-center text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground text-center text-sm">Welcome back! Here's your shop overview.</p>
        </div>

        {/* Week comparison banner */}
        {stats.lastWeekSales > 0 && (
          <Card className={`border-l-4 ${weekChange >= 0 ? 'border-l-success' : 'border-l-destructive'}`}>
            <CardContent className="py-3 flex items-center gap-3">
              {weekChange >= 0 ? <TrendingUp className="h-5 w-5 text-success" /> : <TrendingDown className="h-5 w-5 text-destructive" />}
              <p className="text-sm">
                This week's sales are <strong className={weekChange >= 0 ? 'text-success' : 'text-destructive'}>{Math.abs(weekChange).toFixed(0)}% {weekChange >= 0 ? 'up' : 'down'}</strong> compared to last week
                ({formatCurrency(stats.thisWeekSales)} vs {formatCurrency(stats.lastWeekSales)})
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Products</CardTitle>
              <Package className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{stats.totalProducts}</div>
              <p className="text-xs text-muted-foreground">{stats.totalStock} items in stock</p>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Sales</CardTitle>
              <ShoppingCart className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold">{formatCurrency(stats.todaySales)}</div>
              <div className="flex items-center gap-1">
                <ChangeIndicator current={stats.todaySales} previous={stats.yesterdaySales} />
                <span className="text-xs text-muted-foreground">vs yesterday</span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Profit</CardTitle>
              <TrendingUp className="h-4 w-4 text-success" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-success">{formatCurrency(stats.todayProfit)}</div>
              <div className="flex items-center gap-1">
                <ChangeIndicator current={stats.todayProfit} previous={stats.yesterdayProfit} />
                <span className="text-xs text-muted-foreground">vs yesterday</span>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Low Stock</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-lg font-bold text-destructive">{stats.lowStockCount}</div>
              <p className="text-xs text-muted-foreground">Items need restocking</p>
            </CardContent>
          </Card>
        </div>

        {/* Low Stock Alert */}
        {lowStockProducts.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-2">{lowStockProducts.length} product(s) running low</div>
              <div className="space-y-1">
                {lowStockProducts.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <Badge variant="destructive">{p.stock} left</Badge>
                  </div>
                ))}
              </div>
              <Link to="/products" className="text-sm underline mt-2 inline-block">View all →</Link>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {/* Sales Chart */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Sales & Profit (Last 14 Days)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" className="text-xs" tick={{ fontSize: 10 }} />
                  <YAxis className="text-xs" tick={{ fontSize: 10 }} />
                  <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '6px' }} />
                  <Area type="monotone" dataKey="sales" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.1} strokeWidth={2} name="Sales" />
                  <Area type="monotone" dataKey="profit" stroke="hsl(var(--success, 142 76% 36%))" fill="hsl(var(--success, 142 76% 36%))" fillOpacity={0.1} strokeWidth={2} name="Profit" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Top Products */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Top Products (This Week)</CardTitle>
            </CardHeader>
            <CardContent>
              {topProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No sales this week</p>
              ) : (
                <div className="space-y-3">
                  {topProducts.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-muted-foreground w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{p.quantity} sold</p>
                      </div>
                      <span className="text-sm font-semibold text-primary">{formatCurrency(p.revenue)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-3">
          <Link to="/pos" className="group">
            <Card className="h-full cursor-pointer bg-card/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/20 hover:border-primary hover:bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-foreground group-hover:text-primary transition-colors">
                  <ShoppingCart className="h-5 w-5 text-primary" />
                  Point of Sale
                </CardTitle>
              </CardHeader>
              <CardContent><p className="text-xs text-muted-foreground">Process sales quickly</p></CardContent>
            </Card>
          </Link>
          <Link to="/products" className="group">
            <Card className="h-full cursor-pointer bg-card/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/20 hover:border-primary hover:bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-foreground group-hover:text-primary transition-colors">
                  <Package className="h-5 w-5 text-primary" />
                  Manage Products
                </CardTitle>
              </CardHeader>
              <CardContent><p className="text-xs text-muted-foreground">Add or edit inventory</p></CardContent>
            </Card>
          </Link>
          <Link to="/reports" className="group">
            <Card className="h-full cursor-pointer bg-card/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/20 hover:border-primary hover:bg-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm text-foreground group-hover:text-primary transition-colors">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  View Reports
                </CardTitle>
              </CardHeader>
              <CardContent><p className="text-xs text-muted-foreground">Analyze trends & profits</p></CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
