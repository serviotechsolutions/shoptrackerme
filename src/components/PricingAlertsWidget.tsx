import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, PackageSearch, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  formatUGX, loadPricingContext, resolvePricing, evaluatePricing,
  type PricingContext, type PricingReview,
} from "@/lib/pricing";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SellingPriceAdvisorDialog from "./SellingPriceAdvisorDialog";

export default function PricingAlertsWidget() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PricingReview[]>([]);
  const [ctx, setCtx] = useState<PricingContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [advisorOpen, setAdvisorOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
    if (!profile?.tenant_id) { setLoading(false); return; }

    const context = await loadPricingContext(profile.tenant_id);
    setCtx(context);

    const { data: products } = await (supabase as any).from("products")
      .select("id,name,selling_price,average_cost,buying_price,last_purchase_price,stock,category,pricing_strategy,target_profit_margin,markup_pct,fixed_profit")
      .eq("tenant_id", profile.tenant_id);

    const t = context.tenant;
    const evaluated: PricingReview[] = (products || [])
      .filter((p: any) => Number(p.selling_price || 0) > 0)
      .map((p: any) => {
        const cost = Number(p.average_cost || p.last_purchase_price || p.buying_price || 0);
        return evaluatePricing({
          productId: p.id,
          productName: p.name,
          previousAverageCost: cost,
          newAverageCost: cost,
          currentSellingPrice: Number(p.selling_price || 0),
          settings: t,
          resolved: resolvePricing(context, p),
        });
      })
      .filter((r) => r.showsSuggestion && (r.case === "below_cost" || r.case === "low_margin"))
      .filter((r) => (r.case === "low_margin" ? t.enable_low_margin_alerts : t.enable_below_cost_warnings));

    setReviews(evaluated);
    setLoading(false);
  };

  useEffect(() => { load(); }, [user]);
  useEffect(() => {
    const ch = supabase.channel("pricing-alerts")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const belowCost = useMemo(() => reviews.filter(r => r.case === "below_cost"), [reviews]);
  const lowMargin = useMemo(() => reviews.filter(r => r.case === "low_margin"), [reviews]);
  const alertsOff = ctx ? !ctx.tenant.enable_low_margin_alerts && !ctx.tenant.enable_below_cost_warnings : false;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PackageSearch className="h-4 w-4" /> Pricing Alerts
        </CardTitle>
        {reviews.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => setAdvisorOpen(true)}>Review</Button>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : alertsOff ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Lock className="h-3 w-3" /> Pricing alerts are turned off in Settings.
          </p>
        ) : reviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">✅ All prices look healthy.</p>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {belowCost.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" /> {belowCost.length} below cost
                </Badge>
              )}
              {lowMargin.length > 0 && (
                <Badge variant="secondary" className="gap-1">
                  <TrendingDown className="h-3 w-3" /> {lowMargin.length} low margin
                </Badge>
              )}
            </div>
            <ul className="text-xs space-y-1 max-h-32 overflow-y-auto">
              {reviews.slice(0, 5).map(r => (
                <li key={r.productId} className="flex justify-between gap-2">
                  <span className="truncate">{r.productName}</span>
                  <span className={r.case === "below_cost" ? "text-destructive" : "text-amber-600"}>
                    {r.case === "below_cost"
                      ? `-${formatUGX(Math.abs(r.currentProfit))}/item`
                      : `${r.currentMarginPct.toFixed(0)}%`}
                  </span>
                </li>
              ))}
            </ul>
            <Link to="/products" className="text-xs text-primary hover:underline">Manage products →</Link>
          </div>
        )}
      </CardContent>
      <SellingPriceAdvisorDialog
        open={advisorOpen}
        reviews={reviews}
        onClose={() => setAdvisorOpen(false)}
        onUpdated={load}
      />
    </Card>
  );
}
