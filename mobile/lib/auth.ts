import { api, AuthStorage } from './api';
import { isAxiosError } from 'axios';

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
    if (!isAxiosError(error) || error.response?.status !== 401) throw error;
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
    return data.user;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 401) {
      await AuthStorage.clearToken();
      return null;
    }
    throw error;
  }
}
