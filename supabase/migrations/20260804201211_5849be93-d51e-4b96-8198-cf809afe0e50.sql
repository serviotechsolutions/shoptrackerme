
-- Conversations
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  phone text NOT NULL,
  display_name text,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  last_message_direction text NOT NULL DEFAULT 'out',
  unread_count integer NOT NULL DEFAULT 0,
  is_pinned boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,
  is_blocked boolean NOT NULL DEFAULT false,
  labels jsonb NOT NULL DEFAULT '[]'::jsonb,
  assigned_to uuid,
  greeted_at timestamptz,
  last_auto_reply_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_conversations TO authenticated;
GRANT ALL ON public.whatsapp_conversations TO service_role;
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view conversations" ON public.whatsapp_conversations
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant members can create conversations" ON public.whatsapp_conversations
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant members can update conversations" ON public.whatsapp_conversations
  FOR UPDATE TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins can delete conversations" ON public.whatsapp_conversations
  FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_whatsapp_conversations_updated_at BEFORE UPDATE ON public.whatsapp_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS idx_wa_conv_tenant_last ON public.whatsapp_conversations (tenant_id, last_message_at DESC);

-- Message columns for two-way threading
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS conversation_id uuid REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'out',
  ADD COLUMN IF NOT EXISTS is_starred boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS media_id text,
  ADD COLUMN IF NOT EXISTS media_mime text,
  ADD COLUMN IF NOT EXISTS media_filename text,
  ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE INDEX IF NOT EXISTS idx_wa_msg_conv ON public.whatsapp_messages (conversation_id, created_at DESC);

-- Internal notes (never sent to customers)
CREATE TABLE IF NOT EXISTS public.whatsapp_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  author_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_notes TO authenticated;
GRANT ALL ON public.whatsapp_notes TO service_role;
ALTER TABLE public.whatsapp_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members can view notes" ON public.whatsapp_notes
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant members can add notes" ON public.whatsapp_notes
  FOR INSERT TO authenticated WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Authors can delete notes" ON public.whatsapp_notes
  FOR DELETE TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Quick replies
CREATE TABLE IF NOT EXISTS public.whatsapp_quick_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shortcut text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, shortcut)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_quick_replies TO authenticated;
GRANT ALL ON public.whatsapp_quick_replies TO service_role;
ALTER TABLE public.whatsapp_quick_replies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant members can view quick replies" ON public.whatsapp_quick_replies
  FOR SELECT TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Tenant members can manage quick replies" ON public.whatsapp_quick_replies
  FOR ALL TO authenticated USING (tenant_id = public.get_user_tenant_id(auth.uid()))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE TRIGGER trg_whatsapp_quick_replies_updated_at BEFORE UPDATE ON public.whatsapp_quick_replies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-reply / business hours settings
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS app_secret text,
  ADD COLUMN IF NOT EXISTS greeting_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS greeting_message text,
  ADD COLUMN IF NOT EXISTS away_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS away_message text,
  ADD COLUMN IF NOT EXISTS instant_reply_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS instant_reply_message text,
  ADD COLUMN IF NOT EXISTS holiday_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS holiday_message text,
  ADD COLUMN IF NOT EXISTS business_open_time text NOT NULL DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS business_close_time text NOT NULL DEFAULT '18:00',
  ADD COLUMN IF NOT EXISTS closed_days jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_create_customers boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_on_incoming boolean NOT NULL DEFAULT true;

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_conversations;
