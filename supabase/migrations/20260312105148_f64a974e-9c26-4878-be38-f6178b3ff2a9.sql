-- Add date_of_birth to customers
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS date_of_birth date;

-- Create promotion types enum
CREATE TYPE public.promotion_type AS ENUM ('birthday', 'flash_sale', 'ai_suggested', 'manual', 'automated');
CREATE TYPE public.promotion_status AS ENUM ('draft', 'active', 'paused', 'expired', 'completed');

-- Create promotions table
CREATE TABLE public.promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  type promotion_type NOT NULL DEFAULT 'manual',
  status promotion_status NOT NULL DEFAULT 'draft',
  discount_type text NOT NULL DEFAULT 'percentage',
  discount_value numeric NOT NULL DEFAULT 0,
  promo_code text,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  target_products jsonb,
  target_customers jsonb,
  max_redemptions integer,
  current_redemptions integer NOT NULL DEFAULT 0,
  ai_reasoning text,
  trigger_type text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create promotion redemptions table
CREATE TABLE public.promotion_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_id uuid NOT NULL REFERENCES public.promotions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id),
  transaction_id uuid REFERENCES public.transactions(id),
  discount_amount numeric NOT NULL DEFAULT 0,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;

-- RLS policies for promotions
CREATE POLICY "Users can view promotions in their tenant" ON public.promotions
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create promotions in their tenant" ON public.promotions
  FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update promotions in their tenant" ON public.promotions
  FOR UPDATE TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete promotions in their tenant" ON public.promotions
  FOR DELETE TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()));

-- RLS policies for promotion_redemptions
CREATE POLICY "Users can view redemptions in their tenant" ON public.promotion_redemptions
  FOR SELECT TO authenticated USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create redemptions in their tenant" ON public.promotion_redemptions
  FOR INSERT TO authenticated WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

-- Updated_at trigger
CREATE TRIGGER update_promotions_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable realtime for promotions
ALTER PUBLICATION supabase_realtime ADD TABLE public.promotions;