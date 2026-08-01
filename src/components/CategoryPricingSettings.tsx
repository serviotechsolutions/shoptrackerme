import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Layers, Save, Trash2 } from "lucide-react";
import {
  PRICING_STRATEGIES, strategyLabel, strategySuggests,
  type CategoryPricingRule, type PricingStrategy,
} from "@/lib/pricing";

export const PRODUCT_CATEGORIES = [
  "Groceries",
  "Beverages",
  "Electronics",
  "Cosmetics & Beauty",
  "Household Items",
  "Stationery",
  "Snacks",
  "Hardware Tools",
  "Others",
];

interface Props {
  tenantId: string;
  shopStrategy: PricingStrategy;
}

type Draft = CategoryPricingRule & { dirty?: boolean };

export default function CategoryPricingSettings({ tenantId, shopStrategy }: Props) {
  const [rules, setRules] = useState<Record<string, Draft>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const load = async () => {
    if (!tenantId) return;
    const { data } = await (supabase as any)
      .from("category_pricing_rules").select("*").eq("tenant_id", tenantId);
    const map: Record<string, Draft> = {};
    for (const r of data || []) map[r.category] = r;
    setRules(map);
  };

  useEffect(() => { load(); }, [tenantId]);

  const setField = (cat: string, field: keyof Draft, value: any) => {
    setRules((prev) => ({
      ...prev,
      [cat]: {
        ...(prev[cat] || { category: cat, pricing_strategy: shopStrategy }),
        [field]: value,
        dirty: true,
      },
    }));
  };

  const save = async (cat: string) => {
    const r = rules[cat];
    if (!r) return;
    setSaving(cat);
    const payload = {
      tenant_id: tenantId,
      category: cat,
      pricing_strategy: r.pricing_strategy || shopStrategy,
      min_profit_margin: r.min_profit_margin === null || r.min_profit_margin === undefined || (r.min_profit_margin as any) === "" ? null : Number(r.min_profit_margin),
      markup_pct: r.markup_pct === null || r.markup_pct === undefined || (r.markup_pct as any) === "" ? null : Number(r.markup_pct),
      fixed_profit: r.fixed_profit === null || r.fixed_profit === undefined || (r.fixed_profit as any) === "" ? null : Number(r.fixed_profit),
    };
    const { error } = await (supabase as any)
      .from("category_pricing_rules")
      .upsert(payload, { onConflict: "tenant_id,category" });
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success(`${cat} pricing rule saved`);
    load();
  };

  const remove = async (cat: string) => {
    const r = rules[cat];
    if (r?.id) {
      const { error } = await (supabase as any)
        .from("category_pricing_rules").delete().eq("id", r.id);
      if (error) { toast.error(error.message); return; }
    }
    setRules((prev) => { const n = { ...prev }; delete n[cat]; return n; });
    toast.success(`${cat} now follows the shop default`);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Layers className="h-4 w-4" /> Category Pricing Rules
      </div>
      <p className="text-xs text-muted-foreground">
        Optional. A category rule overrides the shop default; a product-level setting overrides both.
        Categories with no rule follow the shop default ({strategyLabel(shopStrategy)}).
      </p>

      <div className="space-y-2">
        {PRODUCT_CATEGORIES.map((cat) => {
          const r = rules[cat];
          const strat = (r?.pricing_strategy || "") as string;
          return (
            <div key={cat} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{cat}</span>
                {r ? (
                  <Badge variant="secondary" className="text-[10px]">{strategyLabel(strat)}</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">Shop default</Badge>
                )}
              </div>

              <div className="grid gap-2 sm:grid-cols-4">
                <div className="sm:col-span-2">
                  <Label className="text-xs">Strategy</Label>
                  <Select
                    value={strat || "__default"}
                    onValueChange={(v) =>
                      v === "__default" ? remove(cat) : setField(cat, "pricing_strategy", v)
                    }
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__default">Follow shop default</SelectItem>
                      {PRICING_STRATEGIES.filter((s) => s.available).map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {strat === "suggested" && (
                  <div>
                    <Label className="text-xs">Min margin (%)</Label>
                    <Input type="number" min={0} max={99}
                      value={r?.min_profit_margin ?? ""}
                      placeholder="shop default"
                      onChange={(e) => setField(cat, "min_profit_margin", e.target.value)} />
                  </div>
                )}
                {strat === "fixed_markup" && (
                  <div>
                    <Label className="text-xs">Markup (%)</Label>
                    <Input type="number" min={0}
                      value={r?.markup_pct ?? ""}
                      placeholder="shop default"
                      onChange={(e) => setField(cat, "markup_pct", e.target.value)} />
                  </div>
                )}
                {strat === "fixed_profit" && (
                  <div>
                    <Label className="text-xs">Profit / unit (UGX)</Label>
                    <Input type="number" min={0}
                      value={r?.fixed_profit ?? ""}
                      placeholder="shop default"
                      onChange={(e) => setField(cat, "fixed_profit", e.target.value)} />
                  </div>
                )}

                {r && (
                  <div className="flex items-end gap-2">
                    <Button size="sm" onClick={() => save(cat)} disabled={saving === cat}>
                      <Save className="h-3 w-3 mr-1" />
                      {saving === cat ? "Saving…" : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(cat)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>

              {r && !strategySuggests(strat) && (
                <p className="text-[11px] text-muted-foreground">
                  Manual: costs still update, but no price suggestions or margin warnings for this category.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
