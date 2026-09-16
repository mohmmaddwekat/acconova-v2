export const locales = {
    en: { label: 'English', direction: 'ltr' },
    ar: { label: 'العربية', direction: 'rtl' },
} as const;

export type Locale = keyof typeof locales;
const listeners = new Set<() => void>();
let locale: Locale = 'en';

/** Read only a supported preference; storage availability never blocks the UI. */
export function initializeLocale(): void {
    try {
        const saved = localStorage.getItem('acconova.locale');
        if (saved && saved in locales) locale = saved as Locale;
    } catch { /* Private browsing can disable preference storage. */ }
    applyDirection();
}

/** Keep document language and logical layout aligned with the selected dictionary. */
function applyDirection(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = locale;
    document.documentElement.dir = locales[locale].direction;
    document.cookie = `acconova_locale=${locale}; Path=/; SameSite=Lax`;
}

/** Return the current preference without coupling it to workspace business data. */
export function getLocale(): Locale { return locale; }

/** Persist a supported locale and notify mounted translated components. */
export function setLocale(next: Locale): void {
    if (!(next in locales)) return;
    locale = next;
    try { localStorage.setItem('acconova.locale', next); } catch { /* Use the in-memory preference. */ }
    applyDirection();
    listeners.forEach((listener) => listener());
}

/** Subscribe without remounting forms, preserving unsaved input on language changes. */
export function subscribeLocale(listener: () => void): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
