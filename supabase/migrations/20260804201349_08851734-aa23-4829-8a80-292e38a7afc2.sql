
CREATE POLICY "Tenant members can read whatsapp media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

CREATE POLICY "Tenant members can upload whatsapp media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-media'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);
