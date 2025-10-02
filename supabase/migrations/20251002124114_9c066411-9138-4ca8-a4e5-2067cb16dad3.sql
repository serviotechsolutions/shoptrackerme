-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create tenants table (shops)
CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create products table
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  buying_price DECIMAL(10, 2) NOT NULL,
  selling_price DECIMAL(10, 2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0,
  low_stock_threshold INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create transactions table
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  profit DECIMAL(10, 2) NOT NULL,
  payment_method TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create indexes
CREATE INDEX idx_profiles_tenant ON public.profiles(tenant_id);
CREATE INDEX idx_products_tenant ON public.products(tenant_id);
CREATE INDEX idx_transactions_tenant ON public.transactions(tenant_id);
CREATE INDEX idx_transactions_created_at ON public.transactions(created_at DESC);
CREATE INDEX idx_products_stock ON public.products(stock);

-- Security definer function for role checking
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Get user's tenant_id function
CREATE OR REPLACE FUNCTION public.get_user_tenant_id(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT tenant_id FROM public.profiles WHERE id = _user_id
$$;

-- RLS Policies for tenants
CREATE POLICY "Users can view their own tenant"
  ON public.tenants FOR SELECT
  USING (id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update their own tenant"
  ON public.tenants FOR UPDATE
  USING (id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid());

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (user_id = auth.uid());

-- RLS Policies for products
CREATE POLICY "Users can view products in their tenant"
  ON public.products FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create products in their tenant"
  ON public.products FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update products in their tenant"
  ON public.products FOR UPDATE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete products in their tenant"
  ON public.products FOR DELETE
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

-- RLS Policies for transactions
CREATE POLICY "Users can view transactions in their tenant"
  ON public.transactions FOR SELECT
  USING (tenant_id = public.get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create transactions in their tenant"
  ON public.transactions FOR INSERT
  WITH CHECK (tenant_id = public.get_user_tenant_id(auth.uid()));

-- Trigger function to update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_tenants_updated_at
  BEFORE UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_tenant_id UUID;
BEGIN
  -- Create a new tenant for the user
  INSERT INTO public.tenants (name)
  VALUES (COALESCE(NEW.raw_user_meta_data->>'shop_name', 'My Shop'))
  RETURNING id INTO new_tenant_id;

  -- Create profile for the user
  INSERT INTO public.profiles (id, tenant_id, full_name, email)
  VALUES (
    NEW.id,
    new_tenant_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );

  -- Assign admin role to the first user (shop owner)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'admin');

  RETURN NEW;
END;
$$;

-- Trigger to create tenant and profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();