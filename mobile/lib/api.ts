import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

export const API_BASE = (process.env.EXPO_PUBLIC_API_URL || 'https://acconova.net').replace(/\/+$/, '');
const TOKEN_KEY = 'mobile_access_token';
const ORG_KEY = 'mobile_organization_id';
const SESSION_KEY = 'mobile_session_cache';

/** Token of a sign-in that must not outlive the app ("keep me signed in" switched off). */
let memoryToken: string | null = null;
/** Last known user and workspaces, so a dropped connection never looks like a signed-out user. */
let memorySession: string | null = null;

export const api = axios.create({
  baseURL: `${API_BASE}/api`,
  timeout: 15000,
  headers: {
    'Accept': 'application/json',
    // Hosting firewalls often answer 403 to the default "okhttp" agent that React Native sends on Android.
    'User-Agent': 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36 AccoNovaMobile/1.0',
    'Content-Type': 'application/json',
  },
});

// Attach Bearer token to every request
api.interceptors.request.use(async (config) => {
  // The login route is guest-only: a stale token or workspace header from an earlier session must not reach it.
  if (config.url === '/mobile/login') return config;
  // A body-less POST/PATCH is sent without a Content-Type and some servers then treat it as a bare browser form post.
  if (['post', 'put', 'patch'].includes(config.method ?? '') && config.data === undefined) config.data = {};
  const token = await AuthStorage.getToken();
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
  /** With `remember` the token survives closing the app; without it it lives in memory only. */
  async saveToken(token: string, remember = true): Promise<void> {
    memoryToken = token;
    if (remember) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  },
  async getToken(): Promise<string | null> {
    return memoryToken ?? (await SecureStore.getItemAsync(TOKEN_KEY));
  },
  async clearToken(): Promise<void> {
    memoryToken = null;
    memorySession = null;
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(ORG_KEY);
    await AsyncStorage.removeItem(SESSION_KEY).catch(() => undefined);
  },
  /** Remembers who is signed in; kept on the device only when the token itself is kept. */
  async saveSession(session: unknown): Promise<void> {
    memorySession = JSON.stringify(session);
    if (await SecureStore.getItemAsync(TOKEN_KEY)) await AsyncStorage.setItem(SESSION_KEY, memorySession).catch(() => undefined);
  },
  async getCachedSession<T>(): Promise<T | null> {
    try {
      const raw = memorySession ?? (await AsyncStorage.getItem(SESSION_KEY));
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  async saveOrganizationId(id: number): Promise<void> {
    await SecureStore.setItemAsync(ORG_KEY, String(id));
  },
  async getOrganizationId(): Promise<number | null> {
    const raw = await SecureStore.getItemAsync(ORG_KEY);
    return raw ? Number(raw) : null;
  },
};
