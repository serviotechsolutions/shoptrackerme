
-- 1. Restrict product UPDATE to admins only (price changes)
DROP POLICY IF EXISTS "Users can update products in their tenant" ON public.products;
CREATE POLICY "Admins can update products in their tenant"
  ON public.products FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- Allow staff to update non-price product fields (stock decrement etc happens via INSERT transactions; staff sometimes need stock edits)
CREATE POLICY "Staff can update product stock and metadata"
  ON public.products FOR UPDATE
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'staff'::public.app_role))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'staff'::public.app_role));

-- 2. Lock down user_roles writes: only admins of same tenant can manage roles
CREATE POLICY "Admins can insert user roles"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update user roles"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete user roles"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3. team_invitations: only admins can view invitation records (which contain tokens)
DROP POLICY IF EXISTS "Users can view invitations in their tenant" ON public.team_invitations;
CREATE POLICY "Admins can view invitations in their tenant"
  ON public.team_invitations FOR SELECT
  TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4. Storage: product-images — scope by tenant folder (first path segment)
DROP POLICY IF EXISTS "Users can upload product images in their tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can update product images in their tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete product images in their tenant" ON storage.objects;
DROP POLICY IF EXISTS "Users can view product images in their tenant" ON storage.objects;

CREATE POLICY "Tenant members can upload product images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

CREATE POLICY "Tenant members can update their product images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

CREATE POLICY "Tenant members can delete their product images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

-- Restrict listing/RLS-SELECT to tenant members (public URLs still work via CDN on public buckets)
CREATE POLICY "Tenant members can list their product images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

-- 5. Storage: shop-logos in profile-images — scope by tenant folder (second path segment)
DROP POLICY IF EXISTS "Authenticated users can delete shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Public can view shop logos" ON storage.objects;
DROP POLICY IF EXISTS "Users can view all profile images" ON storage.objects;

CREATE POLICY "Tenant members can upload their shop logo"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = 'shop-logos'
    AND (storage.foldername(name))[2] = public.get_user_tenant_id(auth.uid())::text
  );

CREATE POLICY "Tenant members can update their shop logo"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = 'shop-logos'
    AND (storage.foldername(name))[2] = public.get_user_tenant_id(auth.uid())::text
  );

CREATE POLICY "Tenant members can delete their shop logo"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-images'
    AND (storage.foldername(name))[1] = 'shop-logos'
    AND (storage.foldername(name))[2] = public.get_user_tenant_id(auth.uid())::text
  );

-- Restrict profile-images listing to authenticated tenant members; public URLs still serve via CDN
CREATE POLICY "Authenticated users can list profile images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'profile-images');
