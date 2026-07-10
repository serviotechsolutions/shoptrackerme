
ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS graph_http_status integer,
  ADD COLUMN IF NOT EXISTS graph_response_json jsonb,
  ADD COLUMN IF NOT EXISTS meta_message_id text,
  ADD COLUMN IF NOT EXISTS meta_error_code text,
  ADD COLUMN IF NOT EXISTS meta_error_message text;

CREATE INDEX IF NOT EXISTS whatsapp_messages_meta_message_id_idx
  ON public.whatsapp_messages (meta_message_id);
