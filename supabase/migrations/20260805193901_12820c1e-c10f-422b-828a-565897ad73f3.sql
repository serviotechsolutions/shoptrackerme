ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS retry_of_message_id uuid REFERENCES public.whatsapp_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retried_at timestamptz;

ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_signature_ok boolean,
  ADD COLUMN IF NOT EXISTS last_webhook_error text;

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conv_created
  ON public.whatsapp_messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_tenant_sort
  ON public.whatsapp_conversations (tenant_id, is_archived, is_pinned DESC, last_message_at DESC);