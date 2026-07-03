
-- Weighted average cost columns
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS average_cost NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_purchase_date TIMESTAMPTZ;

-- Backfill average_cost from last_purchase_price or buying_price
UPDATE public.products
SET average_cost = COALESCE(NULLIF(last_purchase_price,0), NULLIF(buying_price,0), 0)
WHERE COALESCE(average_cost,0) = 0;

-- Tenant pricing settings
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS min_profit_margin NUMERIC NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS price_rounding NUMERIC NOT NULL DEFAULT 100;

-- Preserve avg cost at sale time on transactions for accurate historical profit
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS average_cost_at_sale NUMERIC;

-- Complete purchase history log (immutable)
CREATE TABLE IF NOT EXISTS public.product_purchase_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  product_id UUID NOT NULL,
  supplier_id UUID,
  grn_id UUID,
  purchase_order_id UUID,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL,
  previous_stock NUMERIC NOT NULL DEFAULT 0,
  previous_average_cost NUMERIC NOT NULL DEFAULT 0,
  new_stock NUMERIC NOT NULL DEFAULT 0,
  new_average_cost NUMERIC NOT NULL DEFAULT 0,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_purchase_history TO authenticated;
GRANT ALL ON public.product_purchase_history TO service_role;

ALTER TABLE public.product_purchase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant read purchase history"
ON public.product_purchase_history FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "tenant insert purchase history"
ON public.product_purchase_history FOR INSERT TO authenticated
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_pph_tenant_product ON public.product_purchase_history(tenant_id, product_id, received_at DESC);

-- Enable realtime on products so UIs auto-refresh when avg cost changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.product_purchase_history;
