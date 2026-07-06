
-- WhatsApp settings (per tenant)
CREATE TABLE public.whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'twilio',
  account_sid TEXT,
  auth_token TEXT,
  from_number TEXT,
  business_name TEXT,
  default_format TEXT NOT NULL DEFAULT 'pdf',
  max_per_minute INT NOT NULL DEFAULT 20,
  max_per_day INT NOT NULL DEFAULT 1000,
  max_bulk INT NOT NULL DEFAULT 200,
  webhook_secret TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  last_test_at TIMESTAMPTZ,
  last_test_status TEXT,
  last_test_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_settings TO authenticated;
GRANT ALL ON public.whatsapp_settings TO service_role;

ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view own tenant whatsapp settings"
  ON public.whatsapp_settings FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins insert own tenant whatsapp settings"
  ON public.whatsapp_settings FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins update own tenant whatsapp settings"
  ON public.whatsapp_settings FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(),'admin'))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE POLICY "Admins delete own tenant whatsapp settings"
  ON public.whatsapp_settings FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_whatsapp_settings_updated_at
  BEFORE UPDATE ON public.whatsapp_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- WhatsApp messages log
CREATE TABLE public.whatsapp_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  recipient_phone TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'receipt',
  body TEXT,
  media_url TEXT,
  media_kind TEXT,
  provider TEXT NOT NULL DEFAULT 'twilio',
  provider_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  error_code TEXT,
  error_message TEXT,
  related_sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  related_payment_id UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  related_promotion_id UUID,
  sent_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  retries INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_whatsapp_messages_tenant_created ON public.whatsapp_messages(tenant_id, created_at DESC);
CREATE INDEX idx_whatsapp_messages_customer ON public.whatsapp_messages(customer_id);
CREATE INDEX idx_whatsapp_messages_provider_msg ON public.whatsapp_messages(provider_message_id);
CREATE INDEX idx_whatsapp_messages_status ON public.whatsapp_messages(tenant_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view whatsapp messages"
  ON public.whatsapp_messages FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members create whatsapp messages"
  ON public.whatsapp_messages FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Tenant members update whatsapp messages"
  ON public.whatsapp_messages FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Admins delete whatsapp messages"
  ON public.whatsapp_messages FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_whatsapp_messages_updated_at
  BEFORE UPDATE ON public.whatsapp_messages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
