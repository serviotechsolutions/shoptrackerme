
ALTER TABLE public.whatsapp_settings
  ADD COLUMN IF NOT EXISTS access_token text,
  ADD COLUMN IF NOT EXISTS phone_number_id text,
  ADD COLUMN IF NOT EXISTS business_account_id text,
  ADD COLUMN IF NOT EXISTS verify_token text,
  ADD COLUMN IF NOT EXISTS api_version text NOT NULL DEFAULT 'v20.0';

ALTER TABLE public.whatsapp_settings ALTER COLUMN provider SET DEFAULT 'meta';
UPDATE public.whatsapp_settings SET provider = 'meta' WHERE provider IS NULL OR provider = 'twilio';

ALTER TABLE public.whatsapp_messages
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'meta';
