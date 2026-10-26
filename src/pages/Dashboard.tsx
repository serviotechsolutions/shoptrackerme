import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { Link } from 'react-router-dom';
import {
  Package, DollarSign, CircleDollarSign, ClipboardList, AlertTriangle, Star, ArrowUp, ArrowDown, ChevronRight,
  TrendingUp, Receipt, BarChart3, PieChart as PieIcon, Sparkles, Bell, ShoppingCart, Wallet, Users, Activity,
  CalendarDays, Percent, CheckCircle2,
} from 'lucide-react';
import { XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell } from 'recharts';
import PricingAlertsWidget from '@/components/PricingAlertsWidget';
import WhatsAppActivityWidget from '@/components/WhatsAppActivityWidget';
import { InventoryIntelligenceWidget } from '@/components/InventoryIntelligenceWidget';

type Tx = { created_at: string; total_amount: number; profit: number; quantity: number; product_name: string; sale_id: string | null };
type Prod = { id: string; name: string; stock: number; low_stock_threshold: number; image_url: string | null; created_at: string };
type Sale = { id: string; created_at: string; customer_name: string | null; total_amount: number; payment_method: string };
type Notif = { id: string; title: string; message: string; type: string; created_at: string; link: string | null };
type Range = '7D' | '30D' | '12M';

const tones = {
  blue: { card: 'from-primary/25 to-primary/5 border-primary/40', icon: 'bg-primary text-primary-foreground', stroke: 'hsl(var(--primary))' },
  green: { card: 'from-success/25 to-success/5 border-success/40', icon: 'bg-success text-success-foreground', stroke: 'hsl(var(--success))' },
  violet: { card: 'from-violet/25 to-violet/5 border-violet/40', icon: 'bg-violet text-primary-foreground', stroke: 'hsl(var(--violet))' },
  amber: { card: 'from-warning/25 to-warning/5 border-warning/40', icon: 'bg-warning text-primary-foreground', stroke: 'hsl(var(--warning))' },
  red: { card: 'from-destructive/25 to-destructive/5 border-destructive/40', icon: 'bg-destructive text-destructive-foreground', stroke: 'hsl(var(--destructive))' },
  teal: { card: 'from-teal/25 to-teal/5 border-teal/40', icon: 'bg-teal text-primary-foreground', stroke: 'hsl(var(--teal))' },
};

const fmt = (n: number) => `UGX ${Math.round(n).toLocaleString('en-US')}`;
const short = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : `${Math.round(n)}`);
const pct = (c: number, p: number) => (p === 0 ? (c > 0 ? 100 : 0) : ((c - p) / p) * 100);
const ago = (iso: string) => {
  const m = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (m < 60) return `${m} min${m === 1 ? '' : 's'} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const Change = ({ value, suffix = '' }: { value: number; suffix?: string }) => (
  <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${value >= 0 ? 'text-success' : 'text-destructive'}`}>
    {value >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
    {Math.abs(value).toFixed(1)}%{suffix}
  </span>
);

const Spark = ({ data, color }: { data: number[]; color: string }) => (
  <div className="h-10 w-24 shrink-0" aria-hidden>
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data.map((v, i) => ({ i, v }))}>
        <Area type="monotone" dataKey="v" stroke={color} fill={color} fillOpacity={0.2} strokeWidth={2} dot={false} isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

const Panel = ({ icon: Icon, title, extra, action, children, className = '' }: any) => (
  <Card className={`min-w-0 p-3 sm:p-4 bg-card/80 ${className}`}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 shrink-0 text-primary" /> <span className="truncate">{title}</span>
        {extra && <span className="font-normal text-muted-foreground">{extra}</span>}
      </h2>
      {action}
    </div>
    {children}
  </Card>
);

const ViewAll = ({ to }: { to: string }) => (
  <Button asChild size="sm" variant="secondary" className="h-7 px-3 text-xs"><Link to={to}>View all</Link></Button>
);

const Dashboard = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<Prod[]>([]);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [name, setName] = useState('');
  const [range, setRange] = useState<Range>('7D');

  useEffect(() => {
    const load = async () => {
      try {
        const since = new Date(); since.setFullYear(since.getFullYear() - 1);
        const [p, t, s, n, prof] = await Promise.all([
          supabase.from('products').select('id, name, stock, low_stock_threshold, image_url, created_at').order('stock', { ascending: true }),
          supabase.from('transactions').select('created_at, total_amount, profit, quantity, product_name, sale_id').gte('created_at', since.toISOString()).order('created_at', { ascending: true }),
          supabase.from('sales').select('id, created_at, customer_name, total_amount, payment_method').order('created_at', { ascending: false }).limit(5),
          supabase.from('notifications').select('id, title, message, type, created_at, link').order('created_at', { ascending: false }).limit(4),
          user ? supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle() : Promise.resolve({ data: null } as any),
        ]);
        setProducts((p.data as Prod[]) || []);
        setTxs((t.data as Tx[]) || []);
        setSales((s.data as Sale[]) || []);
        setNotifs((n.data as Notif[]) || []);
        setName(((prof as any).data?.full_name || user?.email || '').split(/[\s@]/)[0]);
      } catch (e) {
        console.error('Error fetching dashboard data:', e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user?.id]);

  const d = useMemo(() => {
    const now = new Date();
    const today = new Date(now); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const weekStart = new Date(now.getTime() - 7 * 86400000);
    const lastWeekStart = new Date(now.getTime() - 14 * 86400000);
    const inR = (t: Tx, a: Date, b: Date = new Date(8.64e15)) => { const x = new Date(t.created_at); return x >= a && x < b; };
    const sum = (a: Tx[], k: 'total_amount' | 'profit') => a.reduce((s, t) => s + Number(t[k]), 0);
    const orders = (a: Tx[]) => new Set(a.map(t => t.sale_id || t.created_at)).size;

    const todayTx = txs.filter(t => inR(t, today));
    const yTx = txs.filter(t => inR(t, yesterday, today));
    const wTx = txs.filter(t => inR(t, weekStart));
    const lwTx = txs.filter(t => inR(t, lastWeekStart, weekStart));

    const low = products.filter(p => p.stock > 0 && p.stock <= p.low_stock_threshold);
    const out = products.filter(p => p.stock <= 0);
    const needs = products.filter(p => p.stock <= p.low_stock_threshold);
    const total = products.length || 1;
    const good = products.length - low.length - out.length;

    const topToday = new Map<string, number>();
    todayTx.forEach(t => topToday.set(t.product_name, (topToday.get(t.product_name) || 0) + t.quantity));
    const top = [...topToday.entries()].sort((a, b) => b[1] - a[1])[0];

    const weekMap = new Map<string, { q: number; r: number }>();
    wTx.forEach(t => { const e = weekMap.get(t.product_name) || { q: 0, r: 0 }; e.q += t.quantity; e.r += Number(t.total_amount); weekMap.set(t.product_name, e); });
    const topSelling = [...weekMap.entries()].map(([n, v]) => ({ name: n, ...v })).sort((a, b) => b.r - a.r).slice(0, 5);

    // last 7 days sparkline
    const daily = (k: 'total_amount' | 'profit' | 'orders') => Array.from({ length: 7 }, (_, i) => {
      const a = new Date(today); a.setDate(a.getDate() - (6 - i));
      const b = new Date(a); b.setDate(b.getDate() + 1);
      const arr = txs.filter(t => inR(t, a, b));
      return k === 'orders' ? orders(arr) : sum(arr, k);
    });

    const wRev = sum(wTx, 'total_amount'), wProfit = sum(wTx, 'profit');
    const lwRev = sum(lwTx, 'total_amount'), lwProfit = sum(lwTx, 'profit');
    const margin = wRev ? (wProfit / wRev) * 100 : 0, lwMargin = lwRev ? (lwProfit / lwRev) * 100 : 0;

    // Weekday insight
    const byDay = Array(7).fill(0);
    txs.forEach(t => { byDay[new Date(t.created_at).getDay()] += Number(t.total_amount); });
    const days = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
    const best = byDay.indexOf(Math.max(...byDay));
    const avg = byDay.reduce((a, b) => a + b, 0) / 7;
    const insight = avg > 0
      ? { head: `${days[best]} bring ${Math.round(pct(byDay[best], avg))}% more sales than average.`, sub: `Consider stocking up before ${days[(best + 6) % 7]} to avoid running out.` }
      : { head: 'Start recording sales to unlock insights.', sub: 'Patterns appear after a few days of sales.' };

    const healthPct = Math.round((good / total) * 100);
    const salesUp = pct(sum(wTx, 'total_amount'), lwRev) >= 0;
    const score = Math.round(Math.min(100, healthPct * 0.4 + Math.min(margin, 40) / 40 * 30 + (salesUp ? 30 : 15)));

    return {
      todaySales: sum(todayTx, 'total_amount'), todayProfit: sum(todayTx, 'profit'),
      ySales: sum(yTx, 'total_amount'), yProfit: sum(yTx, 'profit'),
      ordersToday: orders(todayTx), ordersDiff: orders(todayTx) - orders(yTx),
      newThisMonth: products.filter(p => new Date(p.created_at) >= monthStart).length,
      low, out, needs, good, total: products.length, top,
      topImage: top ? products.find(p => p.name === top[0])?.image_url : null,
      topSelling, spark: { sales: daily('total_amount'), profit: daily('profit'), orders: daily('orders') },
      wRev, wProfit, lwRev, lwProfit, margin, lwMargin, insight, healthPct, score, salesUp,
      images: new Map(products.map(p => [p.name, p.image_url])),
    };
  }, [products, txs]);

  const chart = useMemo(() => {
    const now = new Date();
    const buckets: { name: string; a: Date; b: Date }[] = [];
    if (range === '12M') {
      for (let i = 11; i >= 0; i--) {
        const a = new Date(now.getFullYear(), now.getMonth() - i, 1);
        buckets.push({ name: a.toLocaleDateString('en-US', { month: 'short' }), a, b: new Date(a.getFullYear(), a.getMonth() + 1, 1) });
      }
    } else {
      const n = range === '7D' ? 7 : 30;
      const t = new Date(now); t.setHours(0, 0, 0, 0);
      for (let i = n - 1; i >= 0; i--) {
        const a = new Date(t); a.setDate(a.getDate() - i);
        const b = new Date(a); b.setDate(b.getDate() + 1);
        buckets.push({ name: a.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), a, b });
      }
    }
    return buckets.map(({ name, a, b }) => {
      const arr = txs.filter(t => { const x = new Date(t.created_at); return x >= a && x < b; });
      return {
        name,
        sales: arr.reduce((s, t) => s + Number(t.total_amount), 0),
        profit: arr.reduce((s, t) => s + Number(t.profit), 0),
        orders: new Set(arr.map(t => t.sale_id || t.created_at)).size,
      };
    });
  }, [txs, range]);

  if (loading) {
    return <DashboardLayout><div className="flex h-64 items-center justify-center"><div className="h-12 w-12 animate-spin rounded-full border-b-2 border-primary" /></div></DashboardLayout>;
  }

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const stats = [
    { tone: 'blue', icon: Package, title: 'Total Products', value: String(d.total), sub: <span className="text-sm font-medium text-success"><ArrowUp className="inline h-3.5 w-3.5" /> {d.newThisMonth} new this month</span>, to: '/products', link: 'View all' },
    { tone: 'green', icon: DollarSign, title: "Today's Sales", value: fmt(d.todaySales), sub: <><Change value={pct(d.todaySales, d.ySales)} /> <span className="text-xs text-muted-foreground">vs yesterday</span></>, to: '/sales', link: 'View details', spark: d.spark.sales },
    { tone: 'violet', icon: CircleDollarSign, title: "Today's Profit", value: fmt(d.todayProfit), sub: <><Change value={pct(d.todayProfit, d.yProfit)} /> <span className="text-xs text-muted-foreground">vs yesterday</span></>, to: '/reports', link: 'View details', spark: d.spark.profit },
    { tone: 'amber', icon: ClipboardList, title: 'Orders Today', value: String(d.ordersToday), sub: <span className="text-xs text-muted-foreground"><span className={d.ordersDiff >= 0 ? 'text-warning' : 'text-destructive'}>{d.ordersDiff >= 0 ? '↑' : '↓'} {Math.abs(d.ordersDiff)}</span> vs yesterday</span>, to: '/sales', link: 'View orders', spark: d.spark.orders },
    { tone: 'red', icon: AlertTriangle, title: 'Low Stock Alerts', value: String(d.needs.length), sub: <span className="text-xs text-muted-foreground">Items need restocking</span>, to: '/stock-predictions', link: 'View items' },
    { tone: 'teal', icon: Star, title: 'Top Product', value: d.top?.[0] || '—', sub: <span className="text-xs text-info">{d.top ? `${d.top[1]} sold today` : 'No sales yet today'}</span>, to: '/products', link: 'View products', image: d.topImage, small: true },
  ] as const;

  const inv = [
    { name: 'Good', value: d.good, color: 'hsl(var(--success))', dot: 'bg-success' },
    { name: 'Low Stock', value: d.low.length, color: 'hsl(var(--warning))', dot: 'bg-warning' },
    { name: 'Out of Stock', value: d.out.length, color: 'hsl(var(--destructive))', dot: 'bg-destructive' },
  ];

  const summary = [
    { icon: Receipt, label: 'Revenue', value: fmt(d.wRev), color: 'text-primary', bg: 'bg-primary/15 text-primary', ch: pct(d.wRev, d.lwRev) },
    { icon: Wallet, label: 'Cost', value: fmt(d.wRev - d.wProfit), color: 'text-destructive', bg: 'bg-destructive/15 text-destructive', ch: pct(d.wRev - d.wProfit, d.lwRev - d.lwProfit) },
    { icon: TrendingUp, label: 'Profit', value: fmt(d.wProfit), color: 'text-success', bg: 'bg-success/15 text-success', ch: pct(d.wProfit, d.lwProfit) },
    { icon: Percent, label: 'Profit Margin', value: `${d.margin.toFixed(1)}%`, color: 'text-success', bg: 'bg-success/15 text-success', ch: d.margin - d.lwMargin },
  ];

  const actions = [
    { to: '/pos', icon: ShoppingCart, title: 'Record Sale', sub: 'Start a new sale', cls: 'bg-primary/90 border-primary' },
    { to: '/products', icon: Package, title: 'Add Product', sub: 'Add to inventory', cls: 'bg-success/80 border-success' },
    { to: '/payments', icon: Wallet, title: 'Add Expense', sub: 'Track payments', cls: 'bg-warning/80 border-warning' },
    { to: '/products', icon: CircleDollarSign, title: 'Manage Products', sub: 'Edit & organize', cls: 'bg-violet/80 border-violet' },
    { to: '/reports', icon: BarChart3, title: 'View Reports', sub: 'Detailed analytics', cls: 'bg-info/80 border-info' },
    { to: '/customers', icon: Users, title: 'Customers', sub: 'Manage customers', cls: 'bg-teal/80 border-teal' },
  ];

  const notifIcon = (t: string) => t.includes('stock') ? <AlertTriangle className="h-4 w-4 text-warning" /> : t.includes('sale') ? <TrendingUp className="h-4 w-4 text-success" /> : t.includes('payment') ? <CircleDollarSign className="h-4 w-4 text-success" /> : <Bell className="h-4 w-4 text-info" />;

  return (
    <DashboardLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold sm:text-2xl">{greeting}{name ? `, ${name}` : ''}! 👋</h1>
            <p className="text-sm text-muted-foreground">Here's what's happening with your shop today.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-success/40 bg-success/15 px-3 py-1.5 text-xs font-semibold text-success">
              <span className="h-2 w-2 rounded-full bg-success" /> Shop is Open
            </span>
            <span className="inline-flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-xs">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
          {stats.map(s => {
            const t = tones[s.tone];
            return (
              <Link key={s.title} to={s.to} className="group min-w-0">
                <Card className={`relative h-full overflow-hidden border bg-gradient-to-br p-3 transition-transform hover:-translate-y-0.5 ${t.card}`}>
                  <div className="flex items-center gap-2">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${t.icon}`}><s.icon className="h-5 w-5" /></span>
                    <span className="truncate text-sm font-semibold">{s.title}</span>
                    <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground 2xl:hidden" />
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <div className={`truncate font-bold ${'small' in s ? 'text-lg' : 'text-xl sm:text-2xl'}`}>{s.value}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1">{s.sub}</div>
                    </div>
                    {'spark' in s && <div className="hidden sm:block"><Spark data={s.spark} color={t.stroke} /></div>}
                    {'image' in s && s.image && <img src={s.image} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />}
                  </div>
                  <span className="mt-2 hidden items-center gap-1 text-xs text-muted-foreground group-hover:text-foreground 2xl:flex">{s.link} →</span>
                </Card>
              </Link>
            );
          })}
        </div>

        {/* Low stock banner */}
        {d.needs.length > 0 && (
          <Card className="flex flex-wrap items-center gap-3 border-destructive/50 bg-destructive/10 p-3">
            <AlertTriangle className="h-7 w-7 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-destructive">{d.needs.length} product{d.needs.length > 1 ? 's are' : ' is'} running low on stock</p>
              <p className="truncate text-xs">{d.needs.slice(0, 8).map(p => p.name).join(', ')}</p>
            </div>
            <Button asChild variant="destructive" size="sm"><Link to="/stock-predictions">View Low Stock <ChevronRight className="h-4 w-4" /></Link></Button>
          </Card>
        )}

        {/* Main grid */}
        <div className="grid gap-4 lg:grid-cols-12">
          {/* Chart */}
          <Panel icon={Activity} title="Sales, Profit & Orders Trend" className="lg:col-span-12 xl:col-span-6"
            action={
              <div className="flex rounded-lg border bg-muted/40 p-0.5">
                {(['7D', '30D', '12M'] as Range[]).map(r => (
                  <button key={r} onClick={() => setRange(r)} aria-pressed={range === r}
                    className={`rounded-md px-3 py-1 text-xs font-medium ${range === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}>{r}</button>
                ))}
              </div>
            }>
            <div className="mb-2 flex justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" />Sales (UGX)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" />Profit (UGX)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet" />Orders</span>
            </div>
            <div className="h-56 sm:h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart} margin={{ left: -10, right: 4 }}>
                  <defs>
                    <linearGradient id="gSales" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} minTickGap={16} />
                  <YAxis yAxisId="m" tickFormatter={short} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="o" orientation="right" hide />
                  <Tooltip formatter={(v: number, k: string) => (k === 'Orders' ? v : fmt(v))} contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }} />
                  <Area yAxisId="m" type="monotone" dataKey="sales" name="Sales" stroke="hsl(var(--primary))" fill="url(#gSales)" strokeWidth={2.5} dot={range === '7D'} />
                  <Area yAxisId="m" type="monotone" dataKey="profit" name="Profit" stroke="hsl(var(--success))" fill="transparent" strokeWidth={2.5} dot={range === '7D'} />
                  <Area yAxisId="o" type="monotone" dataKey="orders" name="Orders" stroke="hsl(var(--violet))" fill="transparent" strokeWidth={2.5} dot={range === '7D'} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          {/* Profit summary */}
          <Panel icon={Receipt} title="Profit Summary" extra="(This Week)" className="md:col-span-1 lg:col-span-6 xl:col-span-3">
            <div className="divide-y">
              {summary.map(s => (
                <div key={s.label} className="flex items-center gap-3 py-2.5">
                  <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${s.bg}`}><s.icon className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                    <p className={`truncate font-semibold ${s.color}`}>{s.value}</p>
                  </div>
                  <Change value={s.ch} />
                </div>
              ))}
            </div>
          </Panel>

          {/* Inventory health + AI */}
          <div className="grid min-w-0 gap-4 lg:col-span-6 xl:col-span-3">
            <Panel icon={PieIcon} title="Inventory Health">
              <div className="flex items-center gap-4">
                <div className="relative h-28 w-28 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={d.total ? inv : [{ name: 'None', value: 1, color: 'hsl(var(--muted))' }]} dataKey="value" innerRadius={40} outerRadius={54} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
                        {(d.total ? inv : [{ color: 'hsl(var(--muted))' }]).map((e, i) => <Cell key={i} fill={e.color} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 grid place-items-center text-center">
                    <div><div className="text-xl font-bold">{d.healthPct}%</div><div className="text-xs text-muted-foreground">Good</div></div>
                  </div>
                </div>
                <ul className="min-w-0 space-y-2 text-xs">
                  {inv.map(i => (
                    <li key={i.name} className="flex items-start gap-2">
                      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${i.dot}`} />
                      <span><strong className="text-sm">{Math.round((i.value / (d.total || 1)) * 100)}%</strong> {i.name}<br /><span className="text-muted-foreground">({i.value} items)</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </Panel>
            <Card className="relative overflow-hidden border-violet/50 bg-gradient-to-br from-violet/30 to-primary/10 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet" /> AI Insight</h2>
                <span className="rounded-md bg-violet/30 px-2 py-0.5 text-xs">AI Powered</span>
              </div>
              <p className="text-sm font-medium">{d.insight.head}</p>
              <p className="mt-1 text-xs text-muted-foreground">{d.insight.sub}</p>
              <Button asChild size="sm" variant="outline" className="mt-3 h-7 rounded-full text-xs"><Link to="/ai-insights">View more insights →</Link></Button>
            </Card>
          </div>

          {/* Top selling */}
          <Panel icon={BarChart3} title="Top Selling Products" action={<ViewAll to="/reports" />} className="md:col-span-1 lg:col-span-6 xl:col-span-3">
            {d.topSelling.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No sales this week</p> : (
              <table className="w-full text-sm">
                <thead><tr className="text-left text-xs text-muted-foreground"><th className="pb-2 font-normal">#</th><th className="pb-2 font-normal">Product</th><th className="pb-2 text-right font-normal">Sold</th><th className="pb-2 text-right font-normal">Revenue</th></tr></thead>
                <tbody className="divide-y">
                  {d.topSelling.map((p, i) => (
                    <tr key={p.name}>
                      <td className="py-2"><span className="grid h-5 w-5 place-items-center rounded-full bg-muted text-xs">{i + 1}</span></td>
                      <td className="py-2"><div className="flex min-w-0 items-center gap-2">
                        {d.images.get(p.name) ? <img src={d.images.get(p.name)!} alt="" className="h-7 w-7 shrink-0 rounded object-cover" /> : <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-muted"><Package className="h-3.5 w-3.5" /></span>}
                        <span className="truncate">{p.name}</span></div></td>
                      <td className="py-2 text-right">{p.q}</td>
                      <td className="whitespace-nowrap py-2 text-right text-xs">{fmt(p.r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Panel>

          {/* Recent sales */}
          <Panel icon={ShoppingCart} title="Recent Sales" action={<ViewAll to="/sales" />} className="lg:col-span-6 xl:col-span-3">
            {sales.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No sales yet</p> : (
              <ul className="divide-y">
                {sales.map(s => (
                  <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">{(s.customer_name || 'W').charAt(0).toUpperCase()}</span>
                    <div className="min-w-0 flex-1"><p className="truncate">{s.customer_name || 'Walk-in'}</p><p className="text-xs capitalize text-muted-foreground">{s.payment_method}</p></div>
                    <div className="text-right"><p className="whitespace-nowrap text-xs font-medium">{fmt(Number(s.total_amount))}</p><p className="text-xs text-muted-foreground">{ago(s.created_at)}</p></div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Low stock items */}
          <Panel icon={AlertTriangle} title="Low Stock Items" action={<ViewAll to="/stock-predictions" />} className="lg:col-span-6 xl:col-span-3">
            {d.needs.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">All stock levels healthy</p> : (
              <ul className="divide-y">
                {d.needs.slice(0, 5).map(p => (
                  <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    <span className="whitespace-nowrap text-xs text-destructive">{p.stock} left</span>
                    <Button asChild size="sm" variant="outline" className="h-7 border-destructive/50 px-2 text-xs text-destructive"><Link to="/purchase-orders">Restock</Link></Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Notifications */}
          <Panel icon={Bell} title="Notifications" className="lg:col-span-6 xl:col-span-3">
            {notifs.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">No notifications</p> : (
              <ul className="divide-y">
                {notifs.map(n => (
                  <li key={n.id}>
                    <Link to={n.link || '#'} className="flex items-center gap-2 py-2 text-sm hover:text-primary">
                      {notifIcon(`${n.type} ${n.title}`.toLowerCase())}
                      <span className="min-w-0 flex-1 truncate">{n.title}</span>
                      <span className="whitespace-nowrap text-xs text-muted-foreground">{ago(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Quick actions */}
          <Panel icon={Sparkles} title="Quick Actions" className="lg:col-span-12 xl:col-span-9">
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {actions.map(a => (
                <Link key={a.title} to={a.to} className={`flex min-w-0 flex-col items-center gap-1 rounded-lg border p-2 text-center text-primary-foreground transition-transform active:scale-95 hover:-translate-y-0.5 lg:flex-row lg:gap-3 lg:p-3 lg:text-left ${a.cls}`}>
                  <a.icon className="h-6 w-6 shrink-0" />
                  <div className="min-w-0"><p className="text-xs font-semibold lg:text-sm">{a.title}</p><p className="hidden text-xs opacity-80 lg:block">{a.sub}</p></div>
                </Link>
              ))}
            </div>
          </Panel>

          {/* Shop health */}
          <Panel icon={CheckCircle2} title="Shop Health Score" className="lg:col-span-12 xl:col-span-3">
            <div className="flex items-center gap-4">
              <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full border-[6px] border-success">
                <span className="text-lg font-bold">{d.score}<span className="text-xs text-muted-foreground">/100</span></span>
              </div>
              <ul className="space-y-1 text-xs">
                <li className="flex items-center gap-1.5"><CheckCircle2 className={`h-3.5 w-3.5 ${d.salesUp ? 'text-success' : 'text-warning'}`} />{d.salesUp ? 'Good sales' : 'Sales slowing'}</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className={`h-3.5 w-3.5 ${d.needs.length ? 'text-warning' : 'text-success'}`} />{d.needs.length ? 'Low inventory' : 'Healthy inventory'}</li>
                <li className="flex items-center gap-1.5"><CheckCircle2 className={`h-3.5 w-3.5 ${d.margin >= 20 ? 'text-success' : 'text-warning'}`} />{d.margin >= 20 ? 'Strong profit' : 'Thin profit'}</li>
              </ul>
            </div>
          </Panel>
        </div>

        {/* Existing widgets kept */}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <InventoryIntelligenceWidget />
          <PricingAlertsWidget />
          <WhatsAppActivityWidget />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;
