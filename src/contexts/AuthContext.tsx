import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

// ============================================
// 🔧 DEVELOPMENT MODE FLAG
// Set to true to bypass all authentication
// Set to false to restore full auth system
// ============================================
const isDevelopmentMode = true;

const DEV_MOCK_USER = {
  id: '00000000-0000-0000-0000-000000000000',
  email: 'dev@shoptracker.local',
  user_metadata: {
    full_name: 'Test User',
    shop_name: 'Dev Shop',
  },
  app_metadata: { role: 'admin' },
  aud: 'authenticated',
  role: 'authenticated',
  created_at: new Date().toISOString(),
} as unknown as User;

const DEV_MOCK_SESSION = {
  access_token: 'dev-token',
  refresh_token: 'dev-refresh',
  expires_in: 99999,
  token_type: 'bearer',
  user: DEV_MOCK_USER,
} as unknown as Session;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isDevelopmentMode: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(isDevelopmentMode ? DEV_MOCK_USER : null);
  const [session, setSession] = useState<Session | null>(isDevelopmentMode ? DEV_MOCK_SESSION : null);
  const [loading, setLoading] = useState(!isDevelopmentMode);
  const navigate = useNavigate();

  useEffect(() => {
    if (isDevelopmentMode) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    if (isDevelopmentMode) return;
    await supabase.auth.signOut();
    navigate('/auth');
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, isDevelopmentMode }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
