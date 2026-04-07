import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export type AppRole = 'admin' | 'staff' | 'viewer' | 'user';

export const useUserRole = () => {
  const { user, isDevelopmentMode } = useAuth();
  const [role, setRole] = useState<AppRole>(isDevelopmentMode ? 'admin' : 'user');
  const [loading, setLoading] = useState(!isDevelopmentMode);

  useEffect(() => {
    if (isDevelopmentMode) return;

    const fetchRole = async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id);
        
        if (data && data.length > 0) {
          if (data.some(r => r.role === 'admin')) setRole('admin');
          else if (data.some(r => r.role === 'staff')) setRole('staff');
          else if (data.some(r => r.role === 'viewer')) setRole('viewer');
          else setRole('user');
        }
      } catch (error) {
        console.error('Error fetching role:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRole();
  }, [user, isDevelopmentMode]);

  const isAdmin = role === 'admin';
  const isStaff = role === 'staff' || role === 'admin';
  const isViewer = role === 'viewer';
  const canManageProducts = isAdmin || isStaff;
  const canMakeSales = isAdmin || isStaff;
  const canViewReports = isAdmin || isStaff || isViewer;
  const canManageTeam = isAdmin;
  const canManageSettings = isAdmin;
  const canManagePromotions = isAdmin || isStaff;

  return {
    role,
    loading,
    isAdmin,
    isStaff,
    isViewer,
    canManageProducts,
    canMakeSales,
    canViewReports,
    canManageTeam,
    canManageSettings,
    canManagePromotions,
  };
};
