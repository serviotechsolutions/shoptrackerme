// Weighted-average inventory costing (unchanged engine)
// + configurable selling-price strategy layer.
//
// IMPORTANT: inventory costing and selling price are two independent concerns.
// Receiving stock only ever updates cost. Selling prices are never changed
// automatically — the strategy layer only produces *recommendations*.

import { supabase } from "@/integrations/supabase/client";

/* ------------------------------------------------------------------ */
/* Costing (unchanged)                                                 */
/* ------------------------------------------------------------------ */

export type PricingSettings = {
  min_profit_margin: number; // percentage, e.g. 20 = 20%
  price_rounding: number; // e.g. 100 => round UGX to nearest 100
};

export const DEFAULT_PRICING: PricingSettings = {
  min_profit_margin: 20,
  price_rounding: 100,
};

export function roundPrice(value: number, step: number = 100): number {
  if (!step || step <= 0) return Math.round(value);
  return Math.round(value / step) * step;
}

export function suggestedSellingPrice(
  averageCost: number,
  minMarginPct: number,
  rounding: number = 100,
): number {
  const m = Math.min(Math.max(Number(minMarginPct || 0), 0), 99);
  const raw = averageCost / (1 - m / 100);
  return roundPrice(raw, rounding);
}

/**
 * Weighted-average cost update.
 * newAvg = (currentStock*currentAvg + receivedQty*unitCost) / (currentStock+receivedQty)
 */
export function weightedAverageCost(
  currentStock: number,
  currentAvg: number,
  receivedQty: number,
  unitCost: number,
): number {
  const totalQty = Number(currentStock || 0) + Number(receivedQty || 0);
  if (totalQty <= 0) return Number(unitCost || 0);
  const totalValue =
    Number(currentStock || 0) * Number(currentAvg || 0) +
    Number(receivedQty || 0) * Number(unitCost || 0);
  return totalValue / totalQty;
}

/* ------------------------------------------------------------------ */
/* Pricing strategies                                                  */
/* ------------------------------------------------------------------ */

export type PricingStrategy =
  | "manual"
  | "suggested"
  | "fixed_markup"
  | "fixed_profit"
  | "ai_smart"; // reserved — architecture only, not implemented yet

export const PRICING_STRATEGIES: {
  value: PricingStrategy;
  label: string;
  description: string;
  suggests: boolean;
  available: boolean;
}[] = [
  {
    value: "manual",
    label: "Manual Pricing",
    description:
      "Owner sets every selling price. Only average cost is updated. No suggestions, no warnings. Ideal for electronics, furniture, pharmacy, hardware, spare parts.",
    suggests: false,
    available: true,
  },
  {
    value: "suggested",
    label: "Suggested Pricing",
    description:
      "After cost changes, recommend a price that meets the minimum profit margin. Owner decides. Ideal for supermarkets, groceries, general retail.",
    suggests: true,
    available: true,
  },
  {
    value: "fixed_markup",
    label: "Fixed Markup",
    description: "Suggested price = Average Cost + Markup %. Owner still approves any change.",
    suggests: true,
    available: true,
  },
  {
    value: "fixed_profit",
    label: "Fixed Profit Amount",
    description: "Suggested price = Average Cost + a fixed profit amount per unit.",
    suggests: true,
    available: true,
  },
  {
    value: "ai_smart",
    label: "AI Smart Pricing (coming soon)",
    description:
      "Future: recommendations from sales trends, demand, stock levels, seasonality and profit targets.",
    suggests: false,
    available: false,
  },
];

export function strategyLabel(s?: string | null): string {
  return PRICING_STRATEGIES.find((x) => x.value === s)?.label ?? "Suggested Pricing";
}

export function strategySuggests(s?: string | null): boolean {
  return PRICING_STRATEGIES.find((x) => x.value === s)?.suggests ?? true;
}

export type TenantPricingSettings = PricingSettings & {
  default_pricing_strategy: PricingStrategy;
  default_markup_pct: number;
  default_fixed_profit: number;
  enable_price_advisor: boolean;
  enable_low_margin_alerts: boolean;
  enable_below_cost_warnings: boolean;
};

export const DEFAULT_TENANT_PRICING: TenantPricingSettings = {
  ...DEFAULT_PRICING,
  default_pricing_strategy: "suggested",
  default_markup_pct: 25,
  default_fixed_profit: 0,
  enable_price_advisor: true,
  enable_low_margin_alerts: true,
  enable_below_cost_warnings: true,
};

export type CategoryPricingRule = {
  id?: string;
  category: string;
  pricing_strategy: PricingStrategy;
  min_profit_margin?: number | null;
  markup_pct?: number | null;
  fixed_profit?: number | null;
};

export type ProductPricingOverride = {
  category?: string | null;
  pricing_strategy?: string | null;
  target_profit_margin?: number | null;
  markup_pct?: number | null;
  fixed_profit?: number | null;
};

export type ResolvedPricing = {
  strategy: PricingStrategy;
  source: "product" | "category" | "shop";
  minMarginPct: number;
  markupPct: number;
  fixedProfit: number;
  rounding: number;
  suggests: boolean;
};

export type PricingContext = {
  tenant: TenantPricingSettings;
  categoryRules: Record<string, CategoryPricingRule>;
};

const num = (v: any, fallback: number) =>
  v === null || v === undefined || v === "" || isNaN(Number(v)) ? fallback : Number(v);

/** Product override → category rule → shop default. */
export function resolvePricing(
  ctx: PricingContext,
  product?: ProductPricingOverride | null,
): ResolvedPricing {
  const t = ctx.tenant;
  const rule = product?.category ? ctx.categoryRules[product.category] : undefined;

  let strategy: PricingStrategy = t.default_pricing_strategy;
  let source: ResolvedPricing["source"] = "shop";
  if (rule?.pricing_strategy) {
    strategy = rule.pricing_strategy;
    source = "category";
  }
  if (product?.pricing_strategy) {
    strategy = product.pricing_strategy as PricingStrategy;
    source = "product";
  }

  return {
    strategy,
    source,
    minMarginPct: num(
      product?.target_profit_margin,
      num(rule?.min_profit_margin, t.min_profit_margin),
    ),
    markupPct: num(product?.markup_pct, num(rule?.markup_pct, t.default_markup_pct)),
    fixedProfit: num(product?.fixed_profit, num(rule?.fixed_profit, t.default_fixed_profit)),
    rounding: t.price_rounding,
    suggests: strategySuggests(strategy),
  };
}

/** Recommended selling price for a given average cost under a resolved strategy. */
export function computeSuggestedPrice(averageCost: number, r: ResolvedPricing): number {
  const cost = Number(averageCost || 0);
  switch (r.strategy) {
    case "fixed_markup":
      return roundPrice(cost * (1 + r.markupPct / 100), r.rounding);
    case "fixed_profit":
      return roundPrice(cost + r.fixedProfit, r.rounding);
    case "manual":
    case "ai_smart":
      return 0;
    case "suggested":
    default:
      return suggestedSellingPrice(cost, r.minMarginPct, r.rounding);
  }
}

/** Load tenant pricing settings + category rules in one go. */
export async function loadPricingContext(tenantId: string): Promise<PricingContext> {
  const [{ data: tenant }, { data: rules }] = await Promise.all([
    (supabase as any).from("tenants").select("*").eq("id", tenantId).maybeSingle(),
    (supabase as any).from("category_pricing_rules").select("*").eq("tenant_id", tenantId),
  ]);
  const t: TenantPricingSettings = {
    min_profit_margin: num(tenant?.min_profit_margin, DEFAULT_TENANT_PRICING.min_profit_margin),
    price_rounding: num(tenant?.price_rounding, DEFAULT_TENANT_PRICING.price_rounding),
    default_pricing_strategy: (tenant?.default_pricing_strategy ||
      DEFAULT_TENANT_PRICING.default_pricing_strategy) as PricingStrategy,
    default_markup_pct: num(tenant?.default_markup_pct, DEFAULT_TENANT_PRICING.default_markup_pct),
    default_fixed_profit: num(
      tenant?.default_fixed_profit,
      DEFAULT_TENANT_PRICING.default_fixed_profit,
    ),
    enable_price_advisor: tenant?.enable_price_advisor ?? true,
    enable_low_margin_alerts: tenant?.enable_low_margin_alerts ?? true,
    enable_below_cost_warnings: tenant?.enable_below_cost_warnings ?? true,
  };
  const categoryRules: Record<string, CategoryPricingRule> = {};
  for (const r of rules || []) categoryRules[r.category] = r as CategoryPricingRule;
  return { tenant: t, categoryRules };
}

/* ------------------------------------------------------------------ */
/* Review / advisor                                                    */
/* ------------------------------------------------------------------ */

export type PricingCase =
  | "healthy"
  | "low_margin"
  | "below_cost"
  | "cost_decreased"
  | "manual"; // manual pricing: cost updated, no action needed

export type PricingReview = {
  productId: string;
  productName: string;
  previousAverageCost: number;
  newAverageCost: number;
  currentSellingPrice: number;
  currentProfit: number;
  currentMarginPct: number;
  suggestedSellingPrice: number;
  requiredMinMarginPct: number;
  case: PricingCase;
  strategy: PricingStrategy;
  strategySource: ResolvedPricing["source"];
  showsSuggestion: boolean;
};

export function evaluatePricing(input: {
  productId: string;
  productName: string;
  previousAverageCost: number;
  newAverageCost: number;
  currentSellingPrice: number;
  settings: PricingSettings;
  resolved?: ResolvedPricing;
}): PricingReview {
  const { previousAverageCost, newAverageCost, currentSellingPrice, settings } = input;
  const resolved: ResolvedPricing =
    input.resolved ?? {
      strategy: "suggested",
      source: "shop",
      minMarginPct: settings.min_profit_margin,
      markupPct: 0,
      fixedProfit: 0,
      rounding: settings.price_rounding,
      suggests: true,
    };

  const profit = currentSellingPrice - newAverageCost;
  const marginPct = currentSellingPrice > 0 ? (profit / currentSellingPrice) * 100 : 0;
  const suggested = computeSuggestedPrice(newAverageCost, resolved);

  let c: PricingCase;
  if (!resolved.suggests) {
    // Manual (or future AI) pricing: cost updated silently, no pricing noise.
    c = "manual";
  } else if (currentSellingPrice > 0 && currentSellingPrice < newAverageCost) {
    c = "below_cost";
  } else if (currentSellingPrice > 0 && marginPct < resolved.minMarginPct) {
    c = "low_margin";
  } else if (newAverageCost < previousAverageCost && previousAverageCost > 0) {
    c = "cost_decreased";
  } else if (currentSellingPrice > 0 && newAverageCost > previousAverageCost && suggested > currentSellingPrice) {
    c = "cost_decreased" === c! ? "healthy" : "healthy";
  } else {
    c = "healthy";
  }

  return {
    productId: input.productId,
    productName: input.productName,
    previousAverageCost,
    newAverageCost,
    currentSellingPrice,
    currentProfit: profit,
    currentMarginPct: marginPct,
    suggestedSellingPrice: suggested,
    requiredMinMarginPct: resolved.minMarginPct,
    case: c,
    strategy: resolved.strategy,
    strategySource: resolved.source,
    showsSuggestion: resolved.suggests,
  };
}

export function formatUGX(n: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}
