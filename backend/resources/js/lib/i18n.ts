import {
    useSyncExternalStore,
} from 'react';

import ar from './locales/ar';
import dataLifecycle from './locales/dataLifecycle';
import en from './locales/en';
import {
    getLocale,
    subscribeLocale,
} from './locale';

const dictionaries = {
    en: {
        ...en,
        ...dataLifecycle.en,
    },

    ar: {
        ...ar,
        ...dataLifecycle.ar,
    },
} as const;

export type TranslationKey =
    keyof typeof dictionaries.en;

/**
 * Resolve trusted translated copy and interpolate text values without
 * rendering HTML.
 */
export function t(
    key: TranslationKey,
    values:
        Record<
            string,
            string | number
        > = {},
): string {
    const selected =
        dictionaries[
            getLocale()
        ] as Record<
            TranslationKey,
            string
        >;

    const fallback =
        dictionaries.en as Record<
            TranslationKey,
            string
        >;

    const template =
        selected[
            key
        ] ??
        fallback[
            key
        ];

    return template.replace(
        /\{(\w+)\}/g,
        (
            match,
            name: string,
        ) =>
            String(
                values[
                    name
                ] ??
                    match,
            ),
    );
}

/**
 * Subscribe translated components to locale changes without remounting their
 * form or dialog state.
 */
export function useLocale() {
    return useSyncExternalStore(
        subscribeLocale,
        getLocale,
        () =>
            'en' as const,
    );
}
