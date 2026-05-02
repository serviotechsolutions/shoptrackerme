
-- Restrict customer access to admin/staff roles only
DROP POLICY IF EXISTS "Users can view customers in their tenant" ON public.customers;
DROP POLICY IF EXISTS "Users can create customers in their tenant" ON public.customers;
DROP POLICY IF EXISTS "Users can update customers in their tenant" ON public.customers;
DROP POLICY IF EXISTS "Users can delete customers in their tenant" ON public.customers;

CREATE POLICY "Staff and admins can view customers in their tenant"
ON public.customers FOR SELECT
TO authenticated
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Staff and admins can create customers in their tenant"
ON public.customers FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Staff and admins can update customers in their tenant"
ON public.customers FOR UPDATE
TO authenticated
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);

CREATE POLICY "Admins can delete customers in their tenant"
ON public.customers FOR DELETE
TO authenticated
USING (
  tenant_id = get_user_tenant_id(auth.uid())
  AND has_role(auth.uid(), 'admin')
);

-- Restrict notification creation to admin/staff (edge functions use service role and bypass RLS)
DROP POLICY IF EXISTS "Users can create notifications in their tenant" ON public.notifications;

CREATE POLICY "Staff and admins can create notifications in their tenant"
ON public.notifications FOR INSERT
TO authenticated
WITH CHECK (
  tenant_id = get_user_tenant_id(auth.uid())
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'staff'))
);
