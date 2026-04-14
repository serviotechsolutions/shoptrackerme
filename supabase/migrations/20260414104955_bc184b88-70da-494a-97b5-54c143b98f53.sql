CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_by UUID NOT NULL,
  customer_id UUID,
  customer_name TEXT,
  payment_method TEXT NOT NULL,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  discount_amount NUMERIC NOT NULL DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  profit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view sales in their tenant"
ON public.sales
FOR SELECT
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create sales in their tenant"
ON public.sales
FOR INSERT
WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update sales in their tenant"
ON public.sales
FOR UPDATE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete sales in their tenant"
ON public.sales
FOR DELETE
USING (tenant_id = public.get_user_tenant_id(auth.uid()));

ALTER TABLE public.transactions
ADD COLUMN IF NOT EXISTS sale_id UUID;

ALTER TABLE public.payments
ADD COLUMN IF NOT EXISTS sale_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'transactions_sale_id_fkey'
      AND conrelid = 'public.transactions'::regclass
  ) THEN
    ALTER TABLE public.transactions
    ADD CONSTRAINT transactions_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'payments_sale_id_fkey'
      AND conrelid = 'public.payments'::regclass
  ) THEN
    ALTER TABLE public.payments
    ADD CONSTRAINT payments_sale_id_fkey
    FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;
  END IF;
END $$;

UPDATE public.payments
SET payment_status = CASE
  WHEN payment_status = 'completed' THEN 'completed'
  ELSE 'pending_customer'
END
WHERE payment_status IS DISTINCT FROM CASE
  WHEN payment_status = 'completed' THEN 'completed'
  ELSE 'pending_customer'
END;

ALTER TABLE public.payments
DROP CONSTRAINT IF EXISTS payments_payment_status_check;

ALTER TABLE public.payments
ADD CONSTRAINT payments_payment_status_check
CHECK (payment_status IN ('pending_customer', 'completed'));

ALTER TABLE public.payments
ALTER COLUMN payment_status SET DEFAULT 'pending_customer';

CREATE UNIQUE INDEX IF NOT EXISTS payments_unique_sale_id_idx
ON public.payments (tenant_id, sale_id)
WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS transactions_sale_id_idx
ON public.transactions (sale_id);

CREATE INDEX IF NOT EXISTS sales_tenant_created_at_idx
ON public.sales (tenant_id, created_at DESC);

CREATE OR REPLACE TRIGGER update_sales_updated_at
BEFORE UPDATE ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE TRIGGER update_payments_updated_at
BEFORE UPDATE ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();