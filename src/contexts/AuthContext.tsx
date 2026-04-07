import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

// 🔧 DEVELOPMENT MODE FLAG - Set to false to restore full authentication
export const isDevelopmentMode = true;

const MOCK_USER = {
  id: 'dev-mock-user-id',
  email: 'dev@shoptracker.test',
  user_metadata: { full_name: 'Test User', shop_name: 'Dev Shop' },
  app_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
} as unknown as User;

const MOCK_SESSION = {
  access_token: 'dev-mock-token',
  refresh_token: 'dev-mock-refresh',
  user: MOCK_USER,
  expires_in: 999999,
  token_type: 'bearer',
} as unknown as Session;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(isDevelopmentMode ? MOCK_USER : null);
  const [session, setSession] = useState<Session | null>(isDevelopmentMode ? MOCK_SESSION : null);
  const [loading, setLoading] = useState(isDevelopmentMode ? false : true);
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
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
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
