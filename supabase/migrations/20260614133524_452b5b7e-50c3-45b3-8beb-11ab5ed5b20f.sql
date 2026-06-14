
-- Extend customers table with full CRM fields
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS alt_phone text,
  ADD COLUMN IF NOT EXISTS gender text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS district text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS credit_limit numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_points integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_tier text NOT NULL DEFAULT 'bronze',
  ADD COLUMN IF NOT EXISTS referral_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS referred_by uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lifetime_value numeric NOT NULL DEFAULT 0;

-- Backfill first/last name from existing name where possible
UPDATE public.customers
  SET first_name = COALESCE(first_name, split_part(name, ' ', 1)),
      last_name  = COALESCE(last_name,  NULLIF(substring(name from position(' ' in name)+1), name))
  WHERE first_name IS NULL OR last_name IS NULL;

-- Index for fast phone lookup (primary identifier)
CREATE INDEX IF NOT EXISTS customers_tenant_phone_idx ON public.customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS customers_tenant_status_idx ON public.customers(tenant_id, status);

-- Status check trigger (use trigger instead of CHECK for safety with existing rows)
CREATE OR REPLACE FUNCTION public.validate_customer_status()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.status NOT IN ('active','inactive','blocked') THEN
    RAISE EXCEPTION 'Invalid customer status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validate_customer_status ON public.customers;
CREATE TRIGGER trg_validate_customer_status
  BEFORE INSERT OR UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_status();
