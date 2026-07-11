
-- 1. supplier_products catalogue
CREATE TABLE IF NOT EXISTS public.supplier_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  sku text,
  unit text NOT NULL DEFAULT 'piece',
  unit_cost numeric NOT NULL CHECK (unit_cost > 0),
  min_order_qty numeric CHECK (min_order_qty IS NULL OR min_order_qty >= 0),
  available_qty numeric CHECK (available_qty IS NULL OR available_qty >= 0),
  brand text,
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_products_unique_name
  ON public.supplier_products (supplier_id, lower(name));
CREATE INDEX IF NOT EXISTS supplier_products_tenant_idx
  ON public.supplier_products (tenant_id);
CREATE INDEX IF NOT EXISTS supplier_products_supplier_idx
  ON public.supplier_products (supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_products TO authenticated;
GRANT ALL ON public.supplier_products TO service_role;

ALTER TABLE public.supplier_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant users can view their supplier products"
  ON public.supplier_products FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can insert their supplier products"
  ON public.supplier_products FOR INSERT
  TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can update their supplier products"
  ON public.supplier_products FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant users can delete their supplier products"
  ON public.supplier_products FOR DELETE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE TRIGGER supplier_products_updated_at
  BEFORE UPDATE ON public.supplier_products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Extend purchase_order_items with catalogue link + custom flag + unit snapshot
ALTER TABLE public.purchase_order_items
  ADD COLUMN IF NOT EXISTS supplier_product_id uuid REFERENCES public.supplier_products(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_custom_item boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unit text;

-- 3. Backfill supplier_products from existing supplied_items JSON
INSERT INTO public.supplier_products (tenant_id, supplier_id, name, unit, unit_cost, status)
SELECT
  s.tenant_id,
  s.id,
  trim(item->>'name'),
  COALESCE(NULLIF(trim(item->>'unit'), ''), 'piece'),
  GREATEST(COALESCE((item->>'price')::numeric, 0), 0.01),
  'active'
FROM public.suppliers s,
     LATERAL jsonb_array_elements(COALESCE(s.supplied_items, '[]'::jsonb)) AS item
WHERE (item->>'name') IS NOT NULL
  AND length(trim(item->>'name')) > 0
ON CONFLICT (supplier_id, lower(name)) DO NOTHING;
