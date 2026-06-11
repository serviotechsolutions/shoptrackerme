import { supabase } from "@/integrations/supabase/client";

export type RiskLevel = "critical" | "warning" | "monitor" | "healthy";
export type TrendDirection = "up" | "down" | "stable";

export interface ProductPrediction {
  id: string;
  name: string;
  category: string | null;
  stock: number;
  low_stock_threshold: number;
  image_url: string | null;
  // velocities (units / day)
  avgDaily: number;
  avgWeekly: number;
  avgMonthly: number;
  // recent windows
  unitsLast7: number;
  unitsPrev7: number;
  unitsLast30: number;
  unitsPrev30: number;
  // forecast
  daysUntilStockout: number; // Infinity if no sales
  trend: TrendDirection;
  trendChangePct: number; // signed % change last7 vs prev7
  risk: RiskLevel;
  // reorder
  recommendedReorder: (days: number) => number;
}

export interface PredictionSummary {
  total: number;
  critical: number;
  warning: number;
  monitor: number;
  healthy: number;
  reorderCount: number;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

export const classifyRisk = (days: number, stock: number): RiskLevel => {
  if (stock <= 0) return "critical";
  if (days <= 3) return "critical";
  if (days <= 7) return "warning";
  if (days <= 14) return "monitor";
  return "healthy";
};

export const riskBadgeClass = (r: RiskLevel) => {
  switch (r) {
    case "critical": return "bg-red-500/15 text-red-600 border-red-500/30";
    case "warning":  return "bg-orange-500/15 text-orange-600 border-orange-500/30";
    case "monitor":  return "bg-yellow-500/15 text-yellow-700 border-yellow-500/30";
    case "healthy":  return "bg-green-500/15 text-green-600 border-green-500/30";
  }
};

export const riskLabel = (r: RiskLevel) => ({
  critical: "🔴 Critical",
  warning: "🟠 Warning",
  monitor: "🟡 Monitor",
  healthy: "🟢 Healthy",
}[r]);

export async function fetchStockPredictions(): Promise<{
  predictions: ProductPrediction[];
  summary: PredictionSummary;
}> {
  const [{ data: products }, { data: tx }] = await Promise.all([
    supabase.from("products").select("id, name, category, stock, low_stock_threshold, image_url"),
    supabase
      .from("transactions")
      .select("product_id, quantity, created_at")
      .gte("created_at", daysAgo(60).toISOString()),
  ]);

  const txByProduct = new Map<string, { qty: number; date: Date }[]>();
  (tx || []).forEach((t: any) => {
    if (!t.product_id) return;
    const arr = txByProduct.get(t.product_id) || [];
    arr.push({ qty: Number(t.quantity) || 0, date: new Date(t.created_at) });
    txByProduct.set(t.product_id, arr);
  });

  const now = Date.now();
  const ms = 24 * 60 * 60 * 1000;

  const predictions: ProductPrediction[] = (products || []).map((p: any) => {
    const sales = txByProduct.get(p.id) || [];
    let unitsLast7 = 0, unitsPrev7 = 0, unitsLast30 = 0, unitsPrev30 = 0, unitsLast60 = 0;
    sales.forEach(({ qty, date }) => {
      const ageDays = (now - date.getTime()) / ms;
      if (ageDays <= 7) unitsLast7 += qty;
      else if (ageDays <= 14) unitsPrev7 += qty;
      if (ageDays <= 30) unitsLast30 += qty;
      else if (ageDays <= 60) unitsPrev30 += qty;
      if (ageDays <= 60) unitsLast60 += qty;
    });

    // Weighted daily velocity: 60% recent week + 40% last 30 days
    const dailyLast7 = unitsLast7 / 7;
    const dailyLast30 = unitsLast30 / 30;
    const avgDaily = dailyLast7 * 0.6 + dailyLast30 * 0.4;
    const avgWeekly = avgDaily * 7;
    const avgMonthly = avgDaily * 30;

    const daysUntilStockout = avgDaily > 0 ? p.stock / avgDaily : Infinity;

    let trend: TrendDirection = "stable";
    let trendChangePct = 0;
    if (unitsPrev7 > 0) {
      trendChangePct = ((unitsLast7 - unitsPrev7) / unitsPrev7) * 100;
      if (trendChangePct >= 10) trend = "up";
      else if (trendChangePct <= -10) trend = "down";
    } else if (unitsLast7 > 0) {
      trend = "up";
      trendChangePct = 100;
    }

    const risk = classifyRisk(daysUntilStockout, p.stock);

    return {
      id: p.id,
      name: p.name,
      category: p.category,
      stock: p.stock,
      low_stock_threshold: p.low_stock_threshold,
      image_url: p.image_url,
      avgDaily,
      avgWeekly,
      avgMonthly,
      unitsLast7,
      unitsPrev7,
      unitsLast30,
      unitsPrev30,
      daysUntilStockout,
      trend,
      trendChangePct,
      risk,
      recommendedReorder: (days: number) => {
        const projected = Math.ceil(avgDaily * days);
        return Math.max(0, projected - p.stock);
      },
    };
  });

  const summary: PredictionSummary = {
    total: predictions.length,
    critical: predictions.filter(p => p.risk === "critical").length,
    warning: predictions.filter(p => p.risk === "warning").length,
    monitor: predictions.filter(p => p.risk === "monitor").length,
    healthy: predictions.filter(p => p.risk === "healthy").length,
    reorderCount: predictions.filter(p => p.recommendedReorder(14) > 0).length,
  };

  return { predictions, summary };
}

export const formatDays = (d: number) => {
  if (!isFinite(d)) return "No recent sales";
  if (d < 1) return "Less than a day";
  if (d < 30) return `${d.toFixed(1)} days`;
  return `${Math.round(d)} days`;
};
