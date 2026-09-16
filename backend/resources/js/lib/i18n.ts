import { useSyncExternalStore } from 'react';
import en from './locales/en';
import ar from './locales/ar';
import { getLocale, subscribeLocale } from './locale';

export type TranslationKey = keyof typeof en;
const dictionaries = { en, ar };

/** Resolve trusted copy and interpolate data as text, never HTML. */
export function t(key: TranslationKey, values: Record<string, string | number> = {}): string {
    const template = dictionaries[getLocale()][key] ?? en[key];
    return template.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}

/** Subscribe a component to locale changes while retaining its form and dialog state. */
export function useLocale() {
    return useSyncExternalStore(subscribeLocale, getLocale, () => 'en' as const);
}
