-- Make product_id nullable so deleting a product doesn't violate the constraint
ALTER TABLE public.transactions ALTER COLUMN product_id DROP NOT NULL;

-- Drop existing FK if any, then add ON DELETE SET NULL
DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT conname INTO fk_name
  FROM pg_constraint
  WHERE conrelid = 'public.transactions'::regclass
    AND contype = 'f'
    AND conkey = (SELECT array_agg(attnum) FROM pg_attribute WHERE attrelid = 'public.transactions'::regclass AND attname = 'product_id');
  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.transactions DROP CONSTRAINT %I', fk_name);
  END IF;
END $$;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL;