-- Add category column to products table
ALTER TABLE public.products 
ADD COLUMN category TEXT DEFAULT 'Others';