
CREATE POLICY "Tenant members can view supplier docs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
  );

CREATE POLICY "Staff and admins can upload supplier docs"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  );

CREATE POLICY "Staff and admins can delete supplier docs"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'supplier-documents'
    AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  );
