ALTER TABLE public.suppliers ADD COLUMN IF NOT EXISTS whatsapp_number text;
ALTER TABLE public.suppliers DROP CONSTRAINT IF EXISTS suppliers_status_check;
ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_status_check CHECK (status = ANY (ARRAY['active'::text,'inactive'::text,'archived'::text]));

ALTER TABLE public.purchase_order_items ADD COLUMN IF NOT EXISTS category text;

ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS whatsapp_status text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS whatsapp_error text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS email_status text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS email_error text;
ALTER TABLE public.purchase_orders ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS link text;

CREATE TABLE IF NOT EXISTS public.purchase_order_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text,
  status text,
  detail text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.purchase_order_events TO authenticated;
GRANT ALL ON public.purchase_order_events TO service_role;
ALTER TABLE public.purchase_order_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant can view PO events" ON public.purchase_order_events
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant can insert PO events" ON public.purchase_order_events
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE INDEX IF NOT EXISTS idx_po_events_po ON public.purchase_order_events(purchase_order_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.custom_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_units TO authenticated;
GRANT ALL ON public.custom_units TO service_role;
ALTER TABLE public.custom_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant can view custom units" ON public.custom_units
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant can add custom units" ON public.custom_units
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant can delete custom units" ON public.custom_units
  FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));