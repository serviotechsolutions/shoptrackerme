
-- =========================================
-- Supplier Management System
-- =========================================

-- Suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_person text,
  phone text,
  alt_phone text,
  email text,
  address text,
  city text,
  country text,
  company_name text,
  tax_number text,
  business_reg_number text,
  products_supplied text,
  notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view suppliers"
  ON public.suppliers FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Staff and admins can insert suppliers"
  ON public.suppliers FOR INSERT TO authenticated
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  );

CREATE POLICY "Staff and admins can update suppliers"
  ON public.suppliers FOR UPDATE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  );

CREATE POLICY "Admins can delete suppliers"
  ON public.suppliers FOR DELETE TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND public.has_role(auth.uid(),'admin')
  );

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_suppliers_tenant ON public.suppliers(tenant_id);

-- Link products to preferred supplier
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS preferred_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS supplier_product_code text,
  ADD COLUMN IF NOT EXISTS last_purchase_price numeric;

CREATE INDEX IF NOT EXISTS idx_products_preferred_supplier ON public.products(preferred_supplier_id);

-- Purchase Orders
CREATE TABLE public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  po_number text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','received','cancelled')),
  total_amount numeric NOT NULL DEFAULT 0,
  amount_paid numeric NOT NULL DEFAULT 0,
  notes text,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_orders TO authenticated;
GRANT ALL ON public.purchase_orders TO service_role;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view POs"
  ON public.purchase_orders FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Staff and admins manage POs"
  ON public.purchase_orders FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  );

CREATE TRIGGER update_purchase_orders_updated_at
  BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_po_tenant ON public.purchase_orders(tenant_id);
CREATE INDEX idx_po_supplier ON public.purchase_orders(supplier_id);

-- Purchase Order Items
CREATE TABLE public.purchase_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id uuid NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_order_items TO authenticated;
GRANT ALL ON public.purchase_order_items TO service_role;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view PO items"
  ON public.purchase_order_items FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_id
      AND po.tenant_id = public.get_user_tenant_id(auth.uid())
  ));

CREATE POLICY "Staff and admins manage PO items"
  ON public.purchase_order_items FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_id
      AND po.tenant_id = public.get_user_tenant_id(auth.uid())
      AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.purchase_orders po
    WHERE po.id = purchase_order_id
      AND po.tenant_id = public.get_user_tenant_id(auth.uid())
      AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  ));

CREATE INDEX idx_po_items_po ON public.purchase_order_items(purchase_order_id);

-- Supplier Payments
CREATE TABLE public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  purchase_order_id uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  reference_number text,
  notes text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_payments TO authenticated;
GRANT ALL ON public.supplier_payments TO service_role;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view supplier payments"
  ON public.supplier_payments FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Staff and admins manage supplier payments"
  ON public.supplier_payments FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  );

CREATE INDEX idx_supplier_payments_tenant ON public.supplier_payments(tenant_id);
CREATE INDEX idx_supplier_payments_supplier ON public.supplier_payments(supplier_id);

-- Supplier Documents (metadata; files stored in supplier-documents bucket)
CREATE TABLE public.supplier_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  doc_type text,
  file_name text NOT NULL,
  file_path text NOT NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.supplier_documents TO authenticated;
GRANT ALL ON public.supplier_documents TO service_role;
ALTER TABLE public.supplier_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view supplier documents"
  ON public.supplier_documents FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Staff and admins manage supplier documents"
  ON public.supplier_documents FOR ALL TO authenticated
  USING (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  )
  WITH CHECK (
    tenant_id = public.get_user_tenant_id(auth.uid())
    AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))
  );

CREATE INDEX idx_supplier_docs_supplier ON public.supplier_documents(supplier_id);
