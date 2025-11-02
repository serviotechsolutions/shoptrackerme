import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart3, TrendingUp, Calendar } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

interface PeriodStats {
  sales: number;
  profit: number;
  transactions: number;
}

interface ProductStats {
  product_id?: string;
  product_name: string;
  total_quantity: number;
  total_sales: number;
  total_profit: number;
}

const Reports = () => {
  const [dayStats, setDayStats] = useState<PeriodStats>({ sales: 0, profit: 0, transactions: 0 });
  const [weekStats, setWeekStats] = useState<PeriodStats>({ sales: 0, profit: 0, transactions: 0 });
  const [monthStats, setMonthStats] = useState<PeriodStats>({ sales: 0, profit: 0, transactions: 0 });
  const [yearStats, setYearStats] = useState<PeriodStats>({ sales: 0, profit: 0, transactions: 0 });
  const [productStats, setProductStats] = useState<ProductStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const now = new Date();
      
      // Today
      const todayStart = new Date(now);
      todayStart.setHours(0, 0, 0, 0);
      
      // This week
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      
      // This month
      const monthStart = new Date(now);
      monthStart.setMonth(now.getMonth() - 1);
      
      // This year
      const yearStart = new Date(now);
      yearStart.setFullYear(now.getFullYear() - 1);

      // Fetch all transactions
      const { data: allTransactions } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false });

      if (allTransactions) {
        // Calculate stats for each period
        const calculateStats = (transactions: any[]): PeriodStats => ({
          sales: transactions.reduce((sum, t) => sum + Number(t.total_amount), 0),
          profit: transactions.reduce((sum, t) => sum + Number(t.profit), 0),
          transactions: transactions.length,
        });

        setDayStats(calculateStats(
          allTransactions.filter(t => new Date(t.created_at) >= todayStart)
        ));
        
        setWeekStats(calculateStats(
          allTransactions.filter(t => new Date(t.created_at) >= weekStart)
        ));
        
        setMonthStats(calculateStats(
          allTransactions.filter(t => new Date(t.created_at) >= monthStart)
        ));
        
        setYearStats(calculateStats(
          allTransactions.filter(t => new Date(t.created_at) >= yearStart)
        ));

        // Calculate product stats
        const productMap = new Map<string, ProductStats>();
        allTransactions.forEach(t => {
          const existing = productMap.get(t.product_name) || {
            product_name: t.product_name,
            total_quantity: 0,
            total_sales: 0,
            total_profit: 0,
          };
          
          productMap.set(t.product_name, {
            product_name: t.product_name,
            total_quantity: existing.total_quantity + t.quantity,
            total_sales: existing.total_sales + Number(t.total_amount),
            total_profit: existing.total_profit + Number(t.profit),
          });
        });

        setProductStats(
          Array.from(productMap.values())
            .sort((a, b) => b.total_sales - a.total_sales)
        );
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-UG', {
      style: 'currency',
      currency: 'UGX',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const PeriodCard = ({ title, stats, icon: Icon }: { title: string; stats: PeriodStats; icon: any }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div>
            <p className="text-xs text-muted-foreground">Sales</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(stats.sales)}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2 border-t">
            <div>
              <p className="text-xs text-muted-foreground">Profit</p>
              <p className="text-base font-semibold text-success">{formatCurrency(stats.profit)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Transactions</p>
              <p className="text-base font-semibold">{stats.transactions}</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Reports & Analytics</h1>
          <p className="text-muted-foreground">Track your business performance</p>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="products">By Product</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <PeriodCard title="Today" stats={dayStats} icon={Calendar} />
              <PeriodCard title="Last 7 Days" stats={weekStats} icon={TrendingUp} />
              <PeriodCard title="Last 30 Days" stats={monthStats} icon={BarChart3} />
              <PeriodCard title="Last 12 Months" stats={yearStats} icon={BarChart3} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Performance Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="text-center p-4 rounded-lg bg-primary/10">
                      <p className="text-sm text-muted-foreground">Avg Daily Sales</p>
                      <p className="text-lg font-bold text-primary">
                        {formatCurrency(weekStats.sales / 7)}
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-success/10">
                      <p className="text-sm text-muted-foreground">Avg Profit Margin</p>
                      <p className="text-lg font-bold text-success">
                        {monthStats.sales > 0 
                          ? `${((monthStats.profit / monthStats.sales) * 100).toFixed(1)}%`
                          : '0%'
                        }
                      </p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-accent/10">
                      <p className="text-sm text-muted-foreground">Total Transactions</p>
                      <p className="text-lg font-bold">{yearStats.transactions}</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-primary/10">
                      <p className="text-sm text-muted-foreground">Avg Transaction</p>
                      <p className="text-lg font-bold text-primary">
                        {yearStats.transactions > 0
                          ? formatCurrency(yearStats.sales / yearStats.transactions)
                          : formatCurrency(0)
                        }
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Sales by Product - Chart View</CardTitle>
              </CardHeader>
              <CardContent>
                {productStats.length > 0 ? (
                  <ResponsiveContainer width="100%" height={400}>
                    <BarChart data={productStats.slice(0, 10)}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="product_name" 
                        className="text-xs"
                        angle={-45}
                        textAnchor="end"
                        height={100}
                      />
                      <YAxis className="text-xs" />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="total_sales" fill="hsl(var(--primary))" name="Sales (UGX)" />
                      <Bar dataKey="total_profit" fill="hsl(var(--success))" name="Profit (UGX)" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-center text-muted-foreground py-8">
                    No sales data available
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sales by Product - Detailed Table</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Quantity Sold</TableHead>
                      <TableHead className="text-right">Total Sales</TableHead>
                      <TableHead className="text-right">Total Profit</TableHead>
                      <TableHead className="text-right">Avg Profit/Unit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productStats.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No sales data available
                        </TableCell>
                      </TableRow>
                    ) : (
                      productStats.map((product) => (
                        <TableRow key={product.product_name}>
                          <TableCell className="font-medium">{product.product_name}</TableCell>
                          <TableCell className="text-right">{product.total_quantity}</TableCell>
                          <TableCell className="text-right text-primary font-semibold">
                            {formatCurrency(product.total_sales)}
                          </TableCell>
                          <TableCell className="text-right text-success font-semibold">
                            {formatCurrency(product.total_profit)}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(product.total_profit / product.total_quantity)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Reports;
