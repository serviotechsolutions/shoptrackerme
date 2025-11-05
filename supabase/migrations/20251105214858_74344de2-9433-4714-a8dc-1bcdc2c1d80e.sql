-- Add DELETE policy for notifications so users can delete their own notifications
CREATE POLICY "Users can delete notifications in their tenant"
ON public.notifications
FOR DELETE
USING (tenant_id = get_user_tenant_id(auth.uid()));