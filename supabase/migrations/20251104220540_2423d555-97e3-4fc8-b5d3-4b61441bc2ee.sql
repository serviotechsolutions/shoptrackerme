-- Create storage bucket for product images
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true);

-- RLS policies for product images bucket
CREATE POLICY "Users can view product images in their tenant"
ON storage.objects FOR SELECT
USING (bucket_id = 'product-images');

CREATE POLICY "Users can upload product images in their tenant"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'product-images' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can update product images in their tenant"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'product-images' 
  AND auth.uid() IS NOT NULL
);

CREATE POLICY "Users can delete product images in their tenant"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'product-images' 
  AND auth.uid() IS NOT NULL
);

-- Add image_url column to products table
ALTER TABLE public.products 
ADD COLUMN image_url TEXT;