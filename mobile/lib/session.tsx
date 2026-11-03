import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { getUser, login, logout, type User } from './auth';

type Session = {
  user: User | null;
  loading: boolean;
  error: string | null;
  restore: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const restore = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setUser(await getUser()); }
    catch { setError('تعذّر استعادة الجلسة. تحقق من الاتصال وحاول مرة أخرى.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void restore(); }, [restore]);

  return <SessionContext.Provider value={{ user, loading, error, restore,
    signIn: async (email, password) => { setUser(await login(email.trim(), password)); },
    signOut: async () => {
      await logout();
      setUser(null);
    },
  }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error('SessionProvider is required');
  return session;
}
