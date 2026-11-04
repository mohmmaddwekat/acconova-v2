import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { useToast } from '../components/ui/Toast';
import { api } from './api';
import { useAuth } from './AuthContext';

interface NotificationsContextValue {
  unread: number;
  /** Re-reads the unread counter right away (after reading or acting on notifications). */
  refresh: () => Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({ unread: 0, refresh: async () => {} });

const POLL_MS = 45000;

/**
 * Keeps the unread counter in step with the website: both read the same notification table,
 * so anything created from either side shows up here within one polling interval.
 */
export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const toast = useToast();
  const [unread, setUnread] = useState(0);
  const latest = useRef<number | null>(null);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const { data } = await api.get('/notifications/count');
      const count = Number(data?.count ?? 0);
      const latestId = data?.latest_id != null ? Number(data.latest_id) : null;
      if (latest.current !== null && latestId !== null && latestId > latest.current && count > 0) {
        toast('لديك إشعار جديد');
      }
      if (latestId !== null) latest.current = latestId;
      setUnread(count);
    } catch {
      // Keep the last known value; the next poll will retry.
    }
  }, [user, toast]);

  useEffect(() => {
    if (!user) {
      setUnread(0);
      latest.current = null;
      return;
    }
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [user, refresh]);

  return <NotificationsContext.Provider value={{ unread, refresh }}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  return useContext(NotificationsContext);
}
