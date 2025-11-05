-- Add barcode column to products table
ALTER TABLE products
ADD COLUMN barcode TEXT;

-- Create index for faster barcode lookups
CREATE INDEX idx_products_barcode ON products(barcode);

-- Add comment
COMMENT ON COLUMN products.barcode IS 'Product barcode for scanner lookup';