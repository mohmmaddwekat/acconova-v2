export const locales = {
    en: { label: 'English', direction: 'ltr' },
    ar: { label: 'العربية', direction: 'rtl' },
} as const;

export type Locale = keyof typeof locales;
const listeners = new Set<() => void>();
let locale: Locale = 'en';

function cookieLocale(): Locale | null {
    if (typeof document === 'undefined') return null;

    const match = document.cookie
        .split(';')
        .map((part) => part.trim())
        .find((part) => part.startsWith('acconova_locale='));

    if (! match) return null;

    const value = decodeURIComponent(match.slice('acconova_locale='.length));
    return value in locales ? value as Locale : null;
}

/**
 * Resolve the saved language across both the public Blade site and the Inertia
 * application. Local storage is preferred for existing app users; the shared
 * cookie lets a visitor choose Arabic on the marketing site and keep Arabic on
 * login, registration and the protected application without choosing it again.
 */
export function initializeLocale(): void {
    let saved: Locale | null = null;

    try {
        const stored = localStorage.getItem('acconova.locale');
        if (stored && stored in locales) saved = stored as Locale;
    } catch { /* Private browsing can disable preference storage. */ }

    locale = saved ?? cookieLocale() ?? 'en';

    if (! saved) {
        try { localStorage.setItem('acconova.locale', locale); } catch { /* Cookie remains the fallback. */ }
    }

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
