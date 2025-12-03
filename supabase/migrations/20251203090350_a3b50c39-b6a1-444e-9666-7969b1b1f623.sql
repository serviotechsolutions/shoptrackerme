-- Create storage policies for shop-logos folder in profile-images bucket
-- Allow authenticated users to upload shop logos
CREATE POLICY "Authenticated users can upload shop logos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = 'shop-logos');

-- Allow authenticated users to update their shop logos
CREATE POLICY "Authenticated users can update shop logos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = 'shop-logos');

-- Allow authenticated users to delete shop logos
CREATE POLICY "Authenticated users can delete shop logos"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = 'shop-logos');

-- Allow public read access to shop logos
CREATE POLICY "Public can view shop logos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'profile-images' AND (storage.foldername(name))[1] = 'shop-logos');