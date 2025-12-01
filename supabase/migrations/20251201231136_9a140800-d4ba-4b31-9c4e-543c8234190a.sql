-- Create customers table
CREATE TABLE public.customers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on customers
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- RLS policies for customers
CREATE POLICY "Users can view customers in their tenant" ON public.customers
  FOR SELECT USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create customers in their tenant" ON public.customers
  FOR INSERT WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update customers in their tenant" ON public.customers
  FOR UPDATE USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete customers in their tenant" ON public.customers
  FOR DELETE USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Modify payments table: add customer_id and payment_date
ALTER TABLE public.payments 
  ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  ADD COLUMN payment_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();

-- Create payment_items table
CREATE TABLE public.payment_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_id UUID NOT NULL REFERENCES public.payments(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price NUMERIC NOT NULL,
  total_price NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on payment_items
ALTER TABLE public.payment_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_items (access through payment's tenant)
CREATE POLICY "Users can view payment items for their payments" ON public.payment_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payments p 
      WHERE p.id = payment_id AND p.tenant_id = get_user_tenant_id(auth.uid())
    )
  );

CREATE POLICY "Users can create payment items for their payments" ON public.payment_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.payments p 
      WHERE p.id = payment_id AND p.tenant_id = get_user_tenant_id(auth.uid())
    )
  );

CREATE POLICY "Users can update payment items for their payments" ON public.payment_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.payments p 
      WHERE p.id = payment_id AND p.tenant_id = get_user_tenant_id(auth.uid())
    )
  );

CREATE POLICY "Users can delete payment items for their payments" ON public.payment_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.payments p 
      WHERE p.id = payment_id AND p.tenant_id = get_user_tenant_id(auth.uid())
    )
  );

-- Add trigger for customers updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();