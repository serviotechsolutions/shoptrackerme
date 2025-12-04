-- Set default selling_price to 0 for products
ALTER TABLE public.products ALTER COLUMN selling_price SET DEFAULT 0;