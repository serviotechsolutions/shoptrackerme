-- Create promo_codes table
CREATE TABLE public.promo_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  code TEXT NOT NULL UNIQUE,
  discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value NUMERIC NOT NULL CHECK (discount_value > 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  valid_until TIMESTAMP WITH TIME ZONE,
  usage_limit INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Create policies for promo codes
CREATE POLICY "Users can view promo codes in their tenant"
ON public.promo_codes
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can create promo codes in their tenant"
ON public.promo_codes
FOR INSERT
WITH CHECK (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update promo codes in their tenant"
ON public.promo_codes
FOR UPDATE
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can delete promo codes in their tenant"
ON public.promo_codes
FOR DELETE
USING (tenant_id = get_user_tenant_id(auth.uid()));

-- Add discount fields to transactions table
ALTER TABLE public.transactions
ADD COLUMN discount_type TEXT CHECK (discount_type IN ('percentage', 'fixed', 'promo')),
ADD COLUMN discount_value NUMERIC DEFAULT 0,
ADD COLUMN promo_code TEXT,
ADD COLUMN discount_amount NUMERIC DEFAULT 0;

-- Create trigger for updated_at
CREATE TRIGGER update_promo_codes_updated_at
BEFORE UPDATE ON public.promo_codes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();