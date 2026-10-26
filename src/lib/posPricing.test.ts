import { describe, expect, test } from "bun:test";
import { getPOSUnitPrice } from "./posPricing";

describe("POS product and cart price consistency", () => {
  const product = { selling_price: 0, buying_price: 250000.32, average_cost: 50000 };

  test("uses the displayed product cost, not average inventory cost, when no selling price is set", () => {
    expect(getPOSUnitPrice(product)).toBe(250000.32);
  });

  test("increases the total with each copy without changing the unit price", () => {
    const price = getPOSUnitPrice(product);
    expect(price * 1).toBe(250000.32);
    expect(price * 2).toBe(500000.64);
    expect(price * 3).toBe(750000.96);
  });

  test("preserves an existing selling price", () => {
    expect(getPOSUnitPrice({ ...product, selling_price: 300000 })).toBe(300000);
  });
});