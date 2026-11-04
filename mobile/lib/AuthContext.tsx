import { createContext, useContext, useEffect, useState } from 'react';
import { AuthStorage } from './api';
import {
  getSession,
  login as apiLogin,
  logout as apiLogout,
  Organization,
  switchOrganization as apiSwitchOrganization,
  User,
} from './auth';

interface AuthContextValue {
  user: User | null;
  organizations: Organization[];
  activeOrganizationId: number | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  switchOrganization: (id: number) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [activeOrganizationId, setActiveOrganizationId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const session = await getSession();
    setUser(session?.user ?? null);
    setOrganizations(session?.organizations ?? []);
    setActiveOrganizationId(session ? await AuthStorage.getOrganizationId() : null);
  }

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const session = await apiLogin(email, password);
    setUser(session.user);
    setOrganizations(session.organizations);
    setActiveOrganizationId(await AuthStorage.getOrganizationId());
  }

  async function logout() {
    await apiLogout();
    setUser(null);
    setOrganizations([]);
    setActiveOrganizationId(null);
  }

  async function switchOrganization(id: number) {
    await apiSwitchOrganization(id);
    setActiveOrganizationId(id);
  }

  return (
    <AuthContext.Provider
      value={{ user, organizations, activeOrganizationId, loading, login, logout, refresh, switchOrganization }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
