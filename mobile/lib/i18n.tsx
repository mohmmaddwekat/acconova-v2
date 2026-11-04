import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { I18nManager } from 'react-native';
import { EN, EN_PATTERNS } from './en';

export type Language = 'ar' | 'en';
export type LanguagePreference = 'system' | Language;

const STORAGE_KEY = 'mobile_language_preference';

let currentLanguage: Language = 'ar';

/** Last direction asked of the native layer, so it is requested once per session. */
let requestedRTL: boolean | null = null;

/**
 * Translates a source (Arabic) string. Arabic is the source language, so it is returned as is;
 * English comes from the dictionary, then from the pattern list for strings with numbers.
 */
export function t(source: string): string {
  if (currentLanguage === 'ar' || !source) return source;
  const lead = source.match(/^\s*/)?.[0] ?? '';
  const trail = source.match(/\s*$/)?.[0] ?? '';
  const core = source.trim();
  if (!core) return source;
  const exact = EN[core];
  if (exact !== undefined) return lead + exact + trail;
  for (const [pattern, template] of EN_PATTERNS) {
    const m = core.match(pattern);
    if (m) return lead + template.replace(/\$(\d)/g, (_, i) => m[Number(i)] ?? '') + trail;
  }
  return source;
}

/** Locale tag for Intl date formatting that keeps Latin digits. */
export function dateLocale(): string {
  return currentLanguage === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US';
}

export function isArabic(): boolean {
  return currentLanguage === 'ar';
}

function deviceLanguage(): Language {
  try {
    const tag = Intl.DateTimeFormat().resolvedOptions().locale ?? 'ar';
    return tag.toLowerCase().startsWith('ar') ? 'ar' : 'en';
  } catch {
    return 'ar';
  }
}

interface I18nContextValue {
  language: Language;
  preference: LanguagePreference;
  setPreference: (preference: LanguagePreference) => void;
  /** True when the layout direction changed and the app must be reopened to apply it. */
  needsRestart: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'ar',
  preference: 'ar',
  setPreference: () => {},
  needsRestart: false,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<LanguagePreference>('ar');
  const [needsRestart, setNeedsRestart] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        if (saved === 'ar' || saved === 'en' || saved === 'system') setPreferenceState(saved);
      })
      .catch(() => {});
  }, []);

  const language: Language = preference === 'system' ? deviceLanguage() : preference;
  currentLanguage = language;

  useEffect(() => {
    const wantRTL = language === 'ar';
    I18nManager.allowRTL(true);
    if (I18nManager.isRTL !== wantRTL) {
      // The direction only changes after the app is reopened; never reload automatically,
      // since a device that ignores the request would reload forever.
      if (requestedRTL !== wantRTL) {
        I18nManager.forceRTL(wantRTL);
        requestedRTL = wantRTL;
      }
      setNeedsRestart(true);
    } else {
      setNeedsRestart(false);
    }
  }, [language]);

  const value = useMemo<I18nContextValue>(
    () => ({
      language,
      preference,
      needsRestart,
      setPreference: (next) => {
        setPreferenceState(next);
        AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
      },
    }),
    [language, preference, needsRestart],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
