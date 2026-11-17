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

/** `remember` keeps the user signed in across app restarts (a year); without it the sign-in lasts one day and is not stored. */
export async function login(email: string, password: string, remember = true): Promise<{ user: User; organizations: Organization[] }> {
  const { data } = await api.post('/mobile/login', { email, password, remember });
  await AuthStorage.saveToken(data.token, remember);
  const organizations: Organization[] = data.organizations ?? [];
  await syncActiveOrganization(organizations);
  await AuthStorage.saveSession({ user: data.user, organizations });
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
    await AuthStorage.saveSession({ user: data.user, organizations });
    return { user: data.user, organizations };
  } catch (error) {
    // Only a 401 means the token is really gone (expired or revoked): sign the user out.
    if (isAxiosError(error) && error.response?.status === 401) {
      await AuthStorage.clearToken();
      return null;
    }
    // Network down, timeout or a server hiccup: the token is still valid, so the user stays
    // signed in from the last known session instead of being sent back to the login screen.
    return AuthStorage.getCachedSession<{ user: User; organizations: Organization[] }>();
  }
}

export async function getUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

export async function switchOrganization(id: number): Promise<void> {
  await AuthStorage.saveOrganizationId(id);
}
