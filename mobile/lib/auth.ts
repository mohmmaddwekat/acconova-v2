import { isAxiosError } from 'axios';
import { api, AuthStorage } from './api';

export interface User {
  id: number;
  name: string;
  email: string;
  avatar?: string;
}

export async function login(email: string, password: string): Promise<User> {
  const { data } = await api.post('/mobile/login', { email, password });
  await AuthStorage.saveToken(data.token);
  return data.user;
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

export async function getUser(): Promise<User | null> {
  const token = await AuthStorage.getToken();
  if (!token) {
    return null;
  }
  try {
    const { data } = await api.get('/mobile/user');
    return data.user ?? null;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) {
      await AuthStorage.clearToken();
    }
    // Return null on ANY error (network down, timeout, server error)
    // so the app shows login instead of crashing
    return null;
  }
}
