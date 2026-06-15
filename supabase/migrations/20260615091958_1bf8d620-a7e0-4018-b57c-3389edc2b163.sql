
-- GRN tables
CREATE TABLE public.goods_received_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  grn_number TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','reversed')),
  received_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  received_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reversed_at TIMESTAMPTZ,
  reversal_reason TEXT,
  total_value NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  delivery_note_ref TEXT,
  invoice_ref TEXT,
  documents JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_grn_tenant ON public.goods_received_notes(tenant_id);
CREATE INDEX idx_grn_po ON public.goods_received_notes(purchase_order_id);
CREATE INDEX idx_grn_supplier ON public.goods_received_notes(supplier_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.goods_received_notes TO authenticated;
GRANT ALL ON public.goods_received_notes TO service_role;
ALTER TABLE public.goods_received_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view GRNs" ON public.goods_received_notes FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Staff create GRNs" ON public.goods_received_notes FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')));
CREATE POLICY "Staff update draft GRNs, admins update all" ON public.goods_received_notes FOR UPDATE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')))
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Admins delete GRNs" ON public.goods_received_notes FOR DELETE TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()) AND public.has_role(auth.uid(),'admin'));

CREATE TRIGGER update_grn_updated_at BEFORE UPDATE ON public.goods_received_notes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.grn_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  purchase_order_item_id UUID REFERENCES public.purchase_order_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  ordered_quantity INTEGER NOT NULL DEFAULT 0,
  received_quantity INTEGER NOT NULL DEFAULT 0,
  previously_received INTEGER NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  excess_accepted BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_grn_items_grn ON public.grn_items(grn_id);
CREATE INDEX idx_grn_items_product ON public.grn_items(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.grn_items TO authenticated;
GRANT ALL ON public.grn_items TO service_role;
ALTER TABLE public.grn_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View GRN items via parent" ON public.grn_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_received_notes g WHERE g.id = grn_items.grn_id AND g.tenant_id = public.get_user_tenant_id(auth.uid())));
CREATE POLICY "Staff manage GRN items" ON public.grn_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.goods_received_notes g WHERE g.id = grn_items.grn_id AND g.tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.goods_received_notes g WHERE g.id = grn_items.grn_id AND g.tenant_id = public.get_user_tenant_id(auth.uid())));

CREATE TABLE public.grn_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grn_id UUID NOT NULL REFERENCES public.goods_received_notes(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_grn_audit_grn ON public.grn_audit_log(grn_id);

GRANT SELECT, INSERT ON public.grn_audit_log TO authenticated;
GRANT ALL ON public.grn_audit_log TO service_role;
ALTER TABLE public.grn_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members view GRN audit" ON public.grn_audit_log FOR SELECT TO authenticated
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));
CREATE POLICY "Staff insert GRN audit" ON public.grn_audit_log FOR INSERT TO authenticated
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff')));
