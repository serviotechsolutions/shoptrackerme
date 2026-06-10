CREATE TABLE public.voice_sale_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  user_id uuid NOT NULL,
  transcript text NOT NULL,
  action_type text NOT NULL,
  product_id uuid,
  product_name text,
  quantity integer,
  original_price numeric,
  new_price numeric,
  discount_type text,
  discount_value numeric,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.voice_sale_logs TO authenticated;
GRANT ALL ON public.voice_sale_logs TO service_role;

ALTER TABLE public.voice_sale_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own voice logs"
ON public.voice_sale_logs FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members can view voice logs"
ON public.voice_sale_logs FOR SELECT TO authenticated
USING (tenant_id = public.get_user_tenant_id(auth.uid()));