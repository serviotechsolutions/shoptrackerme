// Weighted-average inventory costing + selling price advisor helpers

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
  const raw = averageCost * (1 + (minMarginPct || 0) / 100);
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

export type PricingCase = "healthy" | "low_margin" | "below_cost" | "cost_decreased";

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
};

export function evaluatePricing(input: {
  productId: string;
  productName: string;
  previousAverageCost: number;
  newAverageCost: number;
  currentSellingPrice: number;
  settings: PricingSettings;
}): PricingReview {
  const { previousAverageCost, newAverageCost, currentSellingPrice, settings } = input;
  const profit = currentSellingPrice - newAverageCost;
  const marginPct = currentSellingPrice > 0 ? (profit / currentSellingPrice) * 100 : 0;
  const suggested = suggestedSellingPrice(newAverageCost, settings.min_profit_margin, settings.price_rounding);

  let c: PricingCase = "healthy";
  if (currentSellingPrice > 0 && currentSellingPrice < newAverageCost) c = "below_cost";
  else if (currentSellingPrice > 0 && marginPct < settings.min_profit_margin) c = "low_margin";
  else if (newAverageCost < previousAverageCost && previousAverageCost > 0) c = "cost_decreased";

  return {
    productId: input.productId,
    productName: input.productName,
    previousAverageCost,
    newAverageCost,
    currentSellingPrice,
    currentProfit: profit,
    currentMarginPct: marginPct,
    suggestedSellingPrice: suggested,
    requiredMinMarginPct: settings.min_profit_margin,
    case: c,
  };
}

export function formatUGX(n: number): string {
  return new Intl.NumberFormat("en-UG", {
    style: "currency",
    currency: "UGX",
    maximumFractionDigits: 0,
  }).format(Math.round(n || 0));
}
