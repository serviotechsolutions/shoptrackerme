
CREATE POLICY "Tenant members upload whatsapp receipts"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'whatsapp-receipts'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

CREATE POLICY "Tenant members read whatsapp receipts"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'whatsapp-receipts'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);

CREATE POLICY "Tenant members delete whatsapp receipts"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'whatsapp-receipts'
  AND (storage.foldername(name))[1] = public.get_user_tenant_id(auth.uid())::text
);
