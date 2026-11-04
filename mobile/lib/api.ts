import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://acconova.net').replace(/\/+$/, '');
const TOKEN_KEY = 'mobile_access_token';
const ORG_KEY = 'mobile_organization_id';

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
  },
});

// Attach Bearer token to every request
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const organizationId = await SecureStore.getItemAsync(ORG_KEY);
  if (organizationId) {
    config.headers['X-Organization-Id'] = organizationId;
  }
  return config;
});

export const AuthStorage = {
  async saveToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
  },
  async getToken(): Promise<string | null> {
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async clearToken(): Promise<void> {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(ORG_KEY);
  },
  async saveOrganizationId(id: number): Promise<void> {
    await SecureStore.setItemAsync(ORG_KEY, String(id));
  },
  async getOrganizationId(): Promise<number | null> {
    const raw = await SecureStore.getItemAsync(ORG_KEY);
    return raw ? Number(raw) : null;
  },
};
