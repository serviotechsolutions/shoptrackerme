-- Allow users to delete payments in their tenant
CREATE POLICY "Users can delete payments in their tenant"
ON public.payments
FOR DELETE
USING (tenant_id = get_user_tenant_id(auth.uid()));