import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { getPOSUnitPrice } from "./posPricing";

describe("POS product and cart price consistency", () => {
  const product = { selling_price: 0, buying_price: 250000.32, average_cost: 50000 };

  test("uses the displayed product cost, not average inventory cost, when no selling price is set", () => {
    assert.equal(getPOSUnitPrice(product), 250000.32);
  });

  test("increases the total with each copy without changing the unit price", () => {
    const price = getPOSUnitPrice(product);
    assert.equal(price * 1, 250000.32);
    assert.equal(price * 2, 500000.64);
    assert.equal(price * 3, 750000.96);
  });

  test("preserves an existing selling price", () => {
    assert.equal(getPOSUnitPrice({ ...product, selling_price: 300000 }), 300000);
  });
});