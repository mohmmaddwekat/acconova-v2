import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { applyTheme, type ThemeMode } from '../constants/theme';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => void;
}

const STORAGE_KEY = 'mobile_theme_preference';
const ThemeContext = createContext<ThemeContextValue>({ mode: 'light', preference: 'system', setPreference: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreferenceState] = useState<ThemePreference>('system');

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'light' || saved === 'dark' || saved === 'system') setPreferenceState(saved);
      })
      .catch(() => {});
  }, []);

  const mode: ThemeMode = preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;

  // Applied during render so children created in this pass already read the new palette.
  applyTheme(mode);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      preference,
      setPreference: (next) => {
        setPreferenceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    }),
    [mode, preference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Builds a screen's styles from the active palette; rebuilt only when the theme changes. */
export function useStyles<T>(factory: () => T): T {
  const { mode } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [mode]);
}
