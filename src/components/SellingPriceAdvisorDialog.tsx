import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, TrendingUp, CheckCircle2, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { PricingReview } from "@/lib/pricing";
import { formatUGX, strategyLabel } from "@/lib/pricing";

interface Props {
  open: boolean;
  reviews: PricingReview[];
  onClose: () => void;
  onUpdated?: () => void;
}

const caseMeta = {
  healthy: { icon: CheckCircle2, color: "text-green-600", label: "✅ Selling price remains profitable", variant: "default" as const },
  low_margin: { icon: AlertTriangle, color: "text-amber-600", label: "⚠️ Profit Margin Warning", variant: "secondary" as const },
  below_cost: { icon: AlertTriangle, color: "text-red-600", label: "🚨 Selling Below Cost", variant: "destructive" as const },
  cost_decreased: { icon: TrendingDown, color: "text-blue-600", label: "📉 Cost Price Decreased", variant: "outline" as const },
  manual: { icon: Lock, color: "text-muted-foreground", label: "Manual pricing — cost updated only", variant: "outline" as const },
};

export default function SellingPriceAdvisorDialog({ open, reviews, onClose, onUpdated }: Props) {
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});

  // Only show items that need attention. Healthy/manual items are collapsed to a summary.
  const attention = reviews.filter(
    (r) => r.case !== "healthy" && r.case !== "manual" && r.showsSuggestion && !dismissed[r.productId],
  );
  const healthyCount = reviews.length - attention.length;

  const updatePrice = async (r: PricingReview) => {
    const raw = overrides[r.productId] ?? String(r.suggestedSellingPrice);
    const price = Number(raw);
    if (!isFinite(price) || price < 0) { toast.error("Invalid price"); return; }
    setSaving(r.productId);
    const { error } = await supabase.from("products").update({
      selling_price: price,
      last_suggested_price: r.suggestedSellingPrice,
      last_price_review_at: new Date().toISOString(),
    } as any).eq("id", r.productId);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`Updated ${r.productName} to ${formatUGX(price)}`);
    setDismissed((d) => ({ ...d, [r.productId]: true }));
    onUpdated?.();
  };

  const keepPrice = async (r: PricingReview) => {
    await (supabase as any).from("products").update({
      last_suggested_price: r.suggestedSellingPrice,
      last_price_review_at: new Date().toISOString(),
    }).eq("id", r.productId);
    setDismissed((d) => ({ ...d, [r.productId]: true }));
    toast.success(`Kept current price for ${r.productName}`);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" /> Selling Price Advisor
          </DialogTitle>
          <DialogDescription>
            Inventory cost was recalculated. Review recommended selling prices. You remain in full control — no prices change automatically.
          </DialogDescription>
        </DialogHeader>

        {healthyCount > 0 && (
          <div className="flex items-center gap-2 rounded-md border p-3 bg-muted/40">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <span className="text-sm">
              {healthyCount} product{healthyCount === 1 ? "" : "s"} need no action — cost updated.
            </span>
          </div>
        )}

        {attention.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">All products are healthy. 🎉</p>
        ) : (
          <div className="space-y-3">
            {attention.map((r) => {
              const meta = caseMeta[r.case];
              const Icon = meta.icon;
              return (
                <div key={r.productId} className="rounded-lg border p-3 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{r.productName}</p>
                      <p className={`text-xs ${meta.color} font-medium`}>
                        <Icon className="h-3 w-3 inline mr-1" />
                        {meta.label}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {strategyLabel(r.strategy)} · {r.strategySource} level
                      </p>
                    </div>
                    <Badge variant={meta.variant}>
                      {r.case === "below_cost" && `Loss ${formatUGX(Math.abs(r.currentProfit))}/item`}
                      {r.case === "low_margin" && `${r.currentMarginPct.toFixed(1)}% margin`}
                      {r.case === "cost_decreased" && `Cost -${formatUGX(r.previousAverageCost - r.newAverageCost)}`}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Prev. Avg Cost:</span> {formatUGX(r.previousAverageCost)}</div>
                    <div><span className="text-muted-foreground">New Avg Cost:</span> {formatUGX(r.newAverageCost)}</div>
                    <div><span className="text-muted-foreground">Current Price:</span> {formatUGX(r.currentSellingPrice)}</div>
                    <div><span className="text-muted-foreground">Target Margin:</span> {r.requiredMinMarginPct}%</div>
                  </div>

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1 min-w-[140px]">
                      <label className="text-xs text-muted-foreground">Suggested Selling Price</label>
                      <Input
                        type="number"
                        value={overrides[r.productId] ?? String(r.suggestedSellingPrice)}
                        onChange={(e) => setOverrides({ ...overrides, [r.productId]: e.target.value })}
                      />
                    </div>
                    <Button size="sm" onClick={() => updatePrice(r)} disabled={saving === r.productId}>
                      {saving === r.productId ? "Saving…" : "Update Price"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => keepPrice(r)}>
                      Keep current
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
