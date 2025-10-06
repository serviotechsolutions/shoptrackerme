-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  user_id UUID,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('low_stock', 'reorder', 'sales_summary', 'system')),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB
);

-- Enable Row Level Security
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Create policies for notifications
CREATE POLICY "Users can view notifications in their tenant"
ON public.notifications
FOR SELECT
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "Users can update notifications in their tenant"
ON public.notifications
FOR UPDATE
USING (tenant_id = get_user_tenant_id(auth.uid()));

CREATE POLICY "System can create notifications"
ON public.notifications
FOR INSERT
WITH CHECK (true);

-- Create function to check low stock and create notifications
CREATE OR REPLACE FUNCTION public.check_low_stock_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  product_record RECORD;
BEGIN
  -- Find products below threshold that don't have recent low stock notifications
  FOR product_record IN
    SELECT p.id, p.name, p.stock, p.low_stock_threshold, p.tenant_id
    FROM public.products p
    WHERE p.stock <= p.low_stock_threshold
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.tenant_id = p.tenant_id
      AND n.type = 'low_stock'
      AND n.metadata->>'product_id' = p.id::text
      AND n.created_at > now() - interval '24 hours'
    )
  LOOP
    -- Create notification
    INSERT INTO public.notifications (tenant_id, title, message, type, metadata)
    VALUES (
      product_record.tenant_id,
      'Low Stock Alert',
      format('Product "%s" is running low (Stock: %s, Threshold: %s)', 
        product_record.name, 
        product_record.stock, 
        product_record.low_stock_threshold),
      'low_stock',
      jsonb_build_object(
        'product_id', product_record.id,
        'product_name', product_record.name,
        'current_stock', product_record.stock,
        'threshold', product_record.low_stock_threshold
      )
    );
  END LOOP;
END;
$$;

-- Create index for better performance
CREATE INDEX idx_notifications_tenant_created ON public.notifications(tenant_id, created_at DESC);
CREATE INDEX idx_notifications_is_read ON public.notifications(tenant_id, is_read);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;