import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Layout } from '../../constants/theme';
import { useStyles } from '../../lib/theme';
import { Text } from './/Text';

interface ToastOptions {
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface ToastState extends ToastOptions {
  message: string;
  id: number;
}

const ToastContext = createContext<(message: string, options?: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const styles = useStyles(createStyles);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [opacity] = useState(() => new Animated.Value(0));
  const insets = useSafeAreaInsets();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [opacity]);

  const show = useCallback(
    (message: string, options: ToastOptions = {}) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ message, id: Date.now(), ...options });
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, options.durationMs ?? (options.onAction ? 6000 : 2500));
    },
    [hide, opacity],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          accessibilityLiveRegion="polite"
          style={[styles.toast, { opacity, bottom: Layout.tabBarHeight + insets.bottom + 16 }]}
        >
          <Text style={styles.message}>{toast.message}</Text>
          {toast.onAction && (
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (timer.current) clearTimeout(timer.current);
                toast.onAction?.();
                hide();
              }}
              style={styles.action}
            >
              <Text style={styles.actionText}>{toast.actionLabel ?? 'تراجع'}</Text>
            </Pressable>
          )}
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const createStyles = () => StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 48,
    backgroundColor: '#0B2A44',
    borderRadius: 14,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  message: { flex: 1, color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'auto' },
  action: { minHeight: Layout.minTouch, justifyContent: 'center', paddingHorizontal: 8 },
  actionText: { color: '#7FC4FF', fontSize: 14, fontWeight: '800' },
});

export const ToastSpacer = View;
