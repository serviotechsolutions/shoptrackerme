import { useEffect, useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, TrendingUp, PackageSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { formatUGX, DEFAULT_PRICING, evaluatePricing, type PricingSettings, type PricingReview } from "@/lib/pricing";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import SellingPriceAdvisorDialog from "./SellingPriceAdvisorDialog";

export default function PricingAlertsWidget() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PricingReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [advisorOpen, setAdvisorOpen] = useState(false);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", user.id).maybeSingle();
    if (!profile?.tenant_id) { setLoading(false); return; }
    const [{ data: tenant }, { data: products }] = await Promise.all([
      (supabase as any).from("tenants").select("min_profit_margin, price_rounding").eq("id", profile.tenant_id).maybeSingle(),
      supabase.from("products").select("id,name,selling_price,buying_price,last_purchase_price,stock").eq("tenant_id", profile.tenant_id),
    ]);
    const settings: PricingSettings = {
      min_profit_margin: Number(tenant?.min_profit_margin ?? DEFAULT_PRICING.min_profit_margin),
      price_rounding: Number(tenant?.price_rounding ?? DEFAULT_PRICING.price_rounding),
    };
    // We need average_cost — reselect with it (may fail on older cached type)
    const { data: withAvg } = await (supabase as any).from("products")
      .select("id,name,selling_price,average_cost,buying_price,last_purchase_price,stock")
      .eq("tenant_id", profile.tenant_id);
    const src = withAvg || products || [];
    const evaluated: PricingReview[] = src
      .filter((p: any) => Number(p.selling_price || 0) > 0)
      .map((p: any) => evaluatePricing({
        productId: p.id,
        productName: p.name,
        previousAverageCost: Number(p.average_cost || p.last_purchase_price || p.buying_price || 0),
        newAverageCost: Number(p.average_cost || p.last_purchase_price || p.buying_price || 0),
        currentSellingPrice: Number(p.selling_price || 0),
        settings,
      }))
      .filter((r) => r.case !== "healthy" && r.case !== "cost_decreased");
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
