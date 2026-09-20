import {
    getLocale,
    setLocale,
    type Locale,
} from '@/lib/locale';

export type ProfilePreferences = {
    locale: Locale;
    timezone: string;
    date_format: 'numeric' | 'long';
    hour_cycle: 'h12' | 'h23';
    week_start: 'sunday' | 'monday' | 'saturday';
    density: 'comfortable' | 'compact';
    reduced_motion: boolean;
    page_size: number;
    theme: 'light' | 'dark' | 'system';
};

const storageKey = 'acconova.profile-preferences';

export function defaultProfilePreferences(): ProfilePreferences {
    return {
        locale: getLocale(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        date_format: 'numeric',
        hour_cycle: 'h12',
        week_start: 'sunday',
        density: 'comfortable',
        reduced_motion: false,
        page_size: 25,
        theme: 'light',
    };
}

function resolvedTheme(
    theme: ProfilePreferences['theme'],
): 'light' | 'dark' {
    if (
        theme ===
        'system'
    ) {
        return window.matchMedia(
            '(prefers-color-scheme: dark)',
        ).matches
            ? 'dark'
            : 'light';
    }

    return theme;
}

export function applyProfilePreferences(
    preferences: ProfilePreferences,
): void {
    if (
        typeof document ===
            'undefined'
        || typeof window ===
            'undefined'
    ) {
        return;
    }

    const root =
        document.documentElement;

    root.dataset.acTheme =
        preferences.theme;

    root.dataset.acResolvedTheme =
        resolvedTheme(
            preferences.theme,
        );

    root.dataset.acDensity =
        preferences.density;

    root.dataset.acReducedMotion =
        preferences.reduced_motion
            ? 'true'
            : 'false';

    root.style.colorScheme =
        root.dataset.acResolvedTheme;

    setLocale(
        preferences.locale,
    );

    try {
        localStorage.setItem(
            storageKey,
            JSON.stringify(
                preferences,
            ),
        );
    } catch {
        // Storage can be unavailable in private browsing. The DOM state still applies.
    }
}

export function cachedProfilePreferences(): ProfilePreferences | null {
    if (
        typeof window ===
        'undefined'
    ) {
        return null;
    }

    try {
        const raw =
            localStorage.getItem(
                storageKey,
            );

        if (! raw) {
            return null;
        }

        const parsed =
            JSON.parse(
                raw,
            ) as Partial<ProfilePreferences>;

        return {
            ...defaultProfilePreferences(),
            ...parsed,
        };
    } catch {
        return null;
    }
}

export function bindSystemTheme(
    preferences: ProfilePreferences,
): () => void {
    if (
        typeof window ===
            'undefined'
        || preferences.theme !==
            'system'
    ) {
        return () => undefined;
    }

    const media =
        window.matchMedia(
            '(prefers-color-scheme: dark)',
        );

    const listener =
        (): void => {
            const root =
                document.documentElement;

            root.dataset.acResolvedTheme =
                media.matches
                    ? 'dark'
                    : 'light';

            root.style.colorScheme =
                root.dataset.acResolvedTheme;
        };

    media.addEventListener(
        'change',
        listener,
    );

    return () => {
        media.removeEventListener(
            'change',
            listener,
        );
    };
}
