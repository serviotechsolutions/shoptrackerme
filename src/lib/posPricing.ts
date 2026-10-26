export type POSPricedProduct = {
  selling_price: number;
  buying_price: number;
};

// The card and cart share a price; weighted-average cost is only for costing.
export function getPOSUnitPrice(product: POSPricedProduct): number {
  return Number(product.selling_price) > 0
    ? Number(product.selling_price)
    : Number(product.buying_price || 0);
}