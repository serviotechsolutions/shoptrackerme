-- Drop existing foreign key constraint and recreate with ON DELETE SET NULL
ALTER TABLE public.transactions 
DROP CONSTRAINT IF EXISTS transactions_product_id_fkey;

ALTER TABLE public.transactions
ADD CONSTRAINT transactions_product_id_fkey 
FOREIGN KEY (product_id) REFERENCES public.products(id) 
ON DELETE SET NULL;

-- Also update payment_items foreign key for consistency
ALTER TABLE public.payment_items
DROP CONSTRAINT IF EXISTS payment_items_product_id_fkey;

ALTER TABLE public.payment_items
ADD CONSTRAINT payment_items_product_id_fkey
FOREIGN KEY (product_id) REFERENCES public.products(id)
ON DELETE SET NULL;