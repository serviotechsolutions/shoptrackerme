import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, Minus, Package, AlertTriangle, Download, Search, RefreshCw, Brain, Zap, Snowflake, Truck } from "lucide-react";
import {
  fetchStockPredictions,
  ProductPrediction,
  PredictionSummary,
  riskBadgeClass,
  riskLabel,
  formatDays,
} from "@/lib/stockPredictions";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const PERIODS = [7, 14, 30, 60] as const;
type Period = typeof PERIODS[number];

const TrendIcon = ({ t }: { t: ProductPrediction["trend"] }) => {
  if (t === "up") return <TrendingUp className="h-3.5 w-3.5 text-green-600" />;
  if (t === "down") return <TrendingDown className="h-3.5 w-3.5 text-red-600" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
};

const StockPredictions = () => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ProductPrediction[]>([]);
  const [summary, setSummary] = useState<PredictionSummary | null>(null);
  const [period, setPeriod] = useState<Period>(14);
  const [search, setSearch] = useState("");
  const [riskFilter, setRiskFilter] = useState<"all" | "critical" | "warning" | "monitor" | "healthy">("all");
  const [supplierMap, setSupplierMap] = useState<Record<string, { id: string; name: string }>>({});

  const loadSuppliers = async () => {
    const { data: prods } = await (supabase as any)
      .from("products")
      .select("id, preferred_supplier_id, suppliers(id, name)");
    const map: Record<string, { id: string; name: string }> = {};
    (prods || []).forEach((p: any) => {
      if (p.suppliers) map[p.id] = { id: p.suppliers.id, name: p.suppliers.name };
    });
    setSupplierMap(map);
  };

  const load = async () => {
    setLoading(true);
    try {
      const { predictions, summary } = await fetchStockPredictions();
      setData(predictions);
      setSummary(summary);
    } catch (e: any) {
      toast.error("Failed to load predictions", { description: e?.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    loadSuppliers();
    // Live updates: refresh forecasts when sales or stock change
    let debounce: ReturnType<typeof setTimeout> | null = null;
    const scheduleReload = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => load(), 800);
    };
    const channel = supabase
      .channel("stock-predictions-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, scheduleReload)
      .subscribe();
    return () => {
      if (debounce) clearTimeout(debounce);
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(() => {
    return data
      .filter(p => riskFilter === "all" || p.risk === riskFilter)
      .filter(p => p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.daysUntilStockout - b.daysUntilStockout);
  }, [data, riskFilter, search]);

  const reorderList = useMemo(
    () => data
      .map(p => ({ p, qty: p.recommendedReorder(period) }))
      .filter(x => x.qty > 0)
      .sort((a, b) => a.p.daysUntilStockout - b.p.daysUntilStockout),
    [data, period]
  );

  const fastest = useMemo(() => [...data].sort((a, b) => b.avgDaily - a.avgDaily).slice(0, 5), [data]);
  const slowest = useMemo(
    () => data.filter(p => p.stock > 0).sort((a, b) => a.avgDaily - b.avgDaily).slice(0, 5),
    [data]
  );
  const overstocked = useMemo(
    () => data.filter(p => p.avgDaily > 0 && p.daysUntilStockout > 90).sort((a, b) => b.daysUntilStockout - a.daysUntilStockout).slice(0, 5),
    [data]
  );

  const downloadReorderCSV = () => {
    if (reorderList.length === 0) {
      toast.info("Nothing to reorder for this period");
      return;
    }
    const header = ["Product", "Current Stock", "Avg Daily Sales", `Projected Demand (${period}d)`, "Suggested Reorder Qty", "Days Until Stockout", "Risk"];
    const rows = reorderList.map(({ p, qty }) => [
      `"${p.name.replace(/"/g, '""')}"`,
      p.stock,
      p.avgDaily.toFixed(2),
      Math.ceil(p.avgDaily * period),
      qty,
      isFinite(p.daysUntilStockout) ? p.daysUntilStockout.toFixed(1) : "N/A",
      p.risk,
    ]);
    const csv = [header, ...rows].map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reorder-list-${period}days-${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Reorder list downloaded");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Brain className="h-6 w-6 text-primary" />
              Smart Stock Predictions
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Forecasted stock-outs, demand trends, and reorder recommendations.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" onClick={downloadReorderCSV}>
              <Download className="h-4 w-4 mr-2" />
              Generate Reorder List
            </Button>
          </div>
        </div>

        {/* Risk Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { key: "critical", label: "Critical", count: summary?.critical ?? 0, cls: "border-red-500/40", icon: AlertTriangle, color: "text-red-600" },
            { key: "warning",  label: "Warning",  count: summary?.warning ?? 0,  cls: "border-orange-500/40", icon: AlertTriangle, color: "text-orange-600" },
            { key: "monitor",  label: "Monitor",  count: summary?.monitor ?? 0,  cls: "border-yellow-500/40", icon: Package, color: "text-yellow-700" },
            { key: "healthy",  label: "Healthy",  count: summary?.healthy ?? 0,  cls: "border-green-500/40", icon: Package, color: "text-green-600" },
          ].map(c => (
            <Card
              key={c.key}
              className={`cursor-pointer transition-all border ${c.cls} ${riskFilter === c.key ? "ring-2 ring-primary" : ""}`}
              onClick={() => setRiskFilter(riskFilter === c.key ? "all" : (c.key as any))}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{c.label}</p>
                    <p className="text-2xl font-bold mt-1">{c.count}</p>
                  </div>
                  <c.icon className={`h-5 w-5 ${c.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Inventory Intelligence */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-primary" /> Fastest Selling
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {fastest.length === 0 ? <p className="text-xs text-muted-foreground">No data yet.</p> :
                fastest.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-2">{p.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{p.avgDaily.toFixed(1)}/day</span>
                  </div>
                ))
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Snowflake className="h-4 w-4 text-blue-500" /> Slowest Movers
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {slowest.length === 0 ? <p className="text-xs text-muted-foreground">No data yet.</p> :
                slowest.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-2">{p.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{p.avgDaily.toFixed(2)}/day</span>
                  </div>
                ))
              }
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4 text-amber-600" /> Overstocked
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {overstocked.length === 0 ? <p className="text-xs text-muted-foreground">No overstock detected.</p> :
                overstocked.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate mr-2">{p.name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round(p.daysUntilStockout)}d cover</span>
                  </div>
                ))
              }
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search product..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Tabs value={String(period)} onValueChange={v => setPeriod(Number(v) as Period)}>
            <TabsList>
              {PERIODS.map(d => <TabsTrigger key={d} value={String(d)}>{d}d</TabsTrigger>)}
            </TabsList>
          </Tabs>
        </div>

        {/* Predictions list */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Forecast — covering the next {period} days
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">No products match the current filter.</p>
            ) : (
              <div className="space-y-3">
                {filtered.map(p => {
                  const reorder = p.recommendedReorder(period);
                  return (
                    <div key={p.id} className="border rounded-lg p-3 sm:p-4 bg-card/50">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} className="h-12 w-12 rounded-md object-cover border shrink-0" />
                          ) : (
                            <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center shrink-0">
                              <Package className="h-5 w-5 text-muted-foreground" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium truncate">{p.name}</p>
                              <Badge variant="outline" className={`text-xs ${riskBadgeClass(p.risk)}`}>{riskLabel(p.risk)}</Badge>
                              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                <TrendIcon t={p.trend} />
                                {p.trend === "stable" ? "Stable" : `${p.trendChangePct > 0 ? "+" : ""}${p.trendChangePct.toFixed(0)}%`}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Stock: <span className="font-medium text-foreground">{p.stock}</span> · Sells ~{p.avgDaily.toFixed(1)}/day · {formatDays(p.daysUntilStockout)} until stock-out
                            </p>
                            {supplierMap[p.id] && (
                              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <Truck className="h-3 w-3" /> Supplier:{" "}
                                <Link to={`/suppliers/${supplierMap[p.id].id}`} className="text-primary hover:underline">
                                  {supplierMap[p.id].name}
                                </Link>
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex sm:flex-col sm:items-end gap-2 sm:gap-1 sm:text-right">
                          {reorder > 0 ? (
                            <>
                              <p className="text-xs text-muted-foreground">Reorder</p>
                              <p className="text-lg font-bold text-primary">{reorder} <span className="text-xs font-normal text-muted-foreground">units</span></p>
                              <Button size="sm" variant="outline" asChild className="mt-1">
                                <Link to={`/purchase-orders?product=${p.id}&qty=${reorder}${supplierMap[p.id] ? `&supplier=${supplierMap[p.id].id}` : ""}`}>
                                  Create PO
                                </Link>
                              </Button>
                            </>
                          ) : (
                            <Badge variant="secondary" className="text-xs">No reorder needed</Badge>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default StockPredictions;
