import { isAxiosError } from 'axios';
import { api, AuthStorage } from './api';

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

export interface Organization {
  id: number;
  name: string;
  role: string;
}

/** Keeps the stored workspace valid for this user, defaulting to their first one. */
async function syncActiveOrganization(organizations: Organization[]): Promise<number | null> {
  const stored = await AuthStorage.getOrganizationId();
  const active = organizations.find((o) => o.id === stored) ?? organizations[0];
  if (!active) return null;
  if (active.id !== stored) await AuthStorage.saveOrganizationId(active.id);
  return active.id;
}

export async function login(email: string, password: string): Promise<{ user: User; organizations: Organization[] }> {
  const { data } = await api.post('/mobile/login', { email, password });
  await AuthStorage.saveToken(data.token);
  const organizations: Organization[] = data.organizations ?? [];
  await syncActiveOrganization(organizations);
  return { user: data.user, organizations };
}

export async function logout(): Promise<void> {
  try {
    await api.post('/mobile/logout');
  } catch (error) {
    if (!isAxiosError(error) || error.response?.status !== 401) {
      // ignore errors on logout — we clear the token regardless
    }
  }
  await AuthStorage.clearToken();
}

export async function getSession(): Promise<{ user: User; organizations: Organization[] } | null> {
  const token = await AuthStorage.getToken();
  if (!token) {
    return null;
  }
  try {
    const { data } = await api.get('/mobile/user');
    if (!data.user) return null;
    const organizations: Organization[] = data.organizations ?? [];
    await syncActiveOrganization(organizations);
    return { user: data.user, organizations };
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) {
      await AuthStorage.clearToken();
    }
    // Return null on ANY error (network down, timeout, server error)
    // so the app shows login instead of crashing
    return null;
  }
}

export async function getUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

export async function switchOrganization(id: number): Promise<void> {
  await AuthStorage.saveOrganizationId(id);
}
