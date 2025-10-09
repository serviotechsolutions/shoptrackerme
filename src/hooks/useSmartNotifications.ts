import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Hook to automatically trigger smart notifications in the background
 * Runs every 5 minutes to check for:
 * - Low stock products
 * - Stale products (not selling)
 * - Fast-selling products
 * - High profit alerts
 */
export const useSmartNotifications = () => {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSmartNotifications = async () => {
    try {
      console.log('[Smart Notifications] Triggering automated check...');
      
      const { data, error } = await supabase.functions.invoke('smart-notifications', {
        body: {}
      });

      if (error) {
        console.error('[Smart Notifications] Error:', error);
      } else {
        console.log('[Smart Notifications] Success:', data);
      }
    } catch (error) {
      console.error('[Smart Notifications] Failed to trigger:', error);
    }
  };

  useEffect(() => {
    // Trigger immediately on mount
    triggerSmartNotifications();

    // Then trigger every 5 minutes (300000ms)
    intervalRef.current = setInterval(triggerSmartNotifications, 5 * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return { triggerSmartNotifications };
};
