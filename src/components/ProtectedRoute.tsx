import { ReactNode, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface ProtectedRouteProps {
  children: ReactNode;
}

const ProtectedRoute = ({ children }: ProtectedRouteProps) => {
  const { user, loading, isDevelopmentMode } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isDevelopmentMode && !loading && !user) {
      navigate('/auth', { replace: true });
    }
  }, [user, loading, navigate, isDevelopmentMode]);

  if (!isDevelopmentMode && loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isDevelopmentMode && !user) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
