import {
    useSyncExternalStore,
} from 'react';

import ar from './locales/ar';
import catalog from './locales/catalog';
import dataLifecycle from './locales/dataLifecycle';
import en from './locales/en';
import inventory from './locales/inventory';
import notifications from './locales/notifications';
import payments from './locales/payments';
import production from './locales/production';
import settings from './locales/settings';
import {
    getLocale,
    subscribeLocale,
} from './locale';

const dictionaries = {
    en: {
        ...en,
        ...dataLifecycle.en,
        ...inventory.en,
        ...catalog.en,
        ...payments.en,
        ...notifications.en,
        ...settings.en,
        ...production.en,
    },

    ar: {
        ...ar,
        ...dataLifecycle.ar,
        ...inventory.ar,
        ...catalog.ar,
        ...payments.ar,
        ...notifications.ar,
        ...settings.ar,
        ...production.ar,
    },
} as const;

export type TranslationKey =
    keyof typeof dictionaries.en;

/**
 * Resolve trusted translated copy and interpolate plain-text values.
 *
 * Missing runtime translations fall back to the key itself instead of
 * crashing the React application. TypeScript remains responsible for catching
 * invalid keys during development.
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
        ] as Partial<
            Record<
                TranslationKey,
                string
            >
        >;

    const fallback =
        dictionaries.en as Partial<
            Record<
                TranslationKey,
                string
            >
        >;

    const template =
        selected[
            key
        ]
        ??
        fallback[
            key
        ]
        ??
        String(
            key,
        );

    return template.replace(
        /\{(\w+)\}/g,
        (
            match,
            name: string,
        ) =>
            String(
                values[
                    name
                ]
                ??
                match,
            ),
    );
}

/**
 * Subscribe translated components to locale changes without remounting their
 * current form, drawer, or dialog state.
 */
export function useLocale() {
    return useSyncExternalStore(
        subscribeLocale,
        getLocale,
        () =>
            'en' as const,
    );
}
