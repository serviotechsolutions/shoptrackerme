-- Create storage bucket for profile images
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', true);

-- RLS policies for profile images bucket
CREATE POLICY "Users can view all profile images"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-images');

CREATE POLICY "Users can upload their own profile image"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'profile-images'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can update their own profile image"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'profile-images'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can delete their own profile image"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'profile-images'
  AND auth.uid() IS NOT NULL
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Add avatar_url column to profiles table
ALTER TABLE public.profiles
ADD COLUMN avatar_url TEXT;