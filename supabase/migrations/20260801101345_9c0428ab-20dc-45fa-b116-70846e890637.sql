ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS default_pricing_strategy text NOT NULL DEFAULT 'suggested',
  ADD COLUMN IF NOT EXISTS default_markup_pct numeric NOT NULL DEFAULT 25,
  ADD COLUMN IF NOT EXISTS default_fixed_profit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS enable_price_advisor boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_low_margin_alerts boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS enable_below_cost_warnings boolean NOT NULL DEFAULT true;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pricing_strategy text,
  ADD COLUMN IF NOT EXISTS target_profit_margin numeric,
  ADD COLUMN IF NOT EXISTS markup_pct numeric,
  ADD COLUMN IF NOT EXISTS fixed_profit numeric,
  ADD COLUMN IF NOT EXISTS suggested_selling_price numeric,
  ADD COLUMN IF NOT EXISTS last_suggested_price numeric,
  ADD COLUMN IF NOT EXISTS last_price_review_at timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.category_pricing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  category text NOT NULL,
  pricing_strategy text NOT NULL DEFAULT 'suggested',
  min_profit_margin numeric,
  markup_pct numeric,
  fixed_profit numeric,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, category)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.category_pricing_rules TO authenticated;
GRANT ALL ON public.category_pricing_rules TO service_role;

ALTER TABLE public.category_pricing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view category pricing rules"
  ON public.category_pricing_rules FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can insert category pricing rules"
  ON public.category_pricing_rules FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can update category pricing rules"
  ON public.category_pricing_rules FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can delete category pricing rules"
  ON public.category_pricing_rules FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE TRIGGER update_category_pricing_rules_updated_at
  BEFORE UPDATE ON public.category_pricing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();