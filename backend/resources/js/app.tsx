import { initializeLocale } from '@/lib/locale';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import type { ResolvedComponent } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

/**
 * Describe one lazily loaded Inertia page module.
 */
type InertiaPageModule = {
    default: ResolvedComponent;
};

/*
 * Keep pages lazy so public authentication screens do not execute the entire
 * protected application graph before they can render.
 */
const pages = import.meta.glob<InertiaPageModule>(
    './pages/**/*.tsx',
);

const pageReloadKey =
    'acconova:inertia-page-import-reload';

/**
 * Resolve an Inertia page and recover once from a stale Vite/HMR module.
 *
 * A development rebuild can invalidate a page module while the persistent
 * browser session still references the older graph. One hard reload gives
 * Vite a fresh entry document without creating an infinite reload loop.
 */
async function resolvePage(
    name: string,
): Promise<ResolvedComponent> {
    const loadPage =
        pages[`./pages/${name}.tsx`];

    if (! loadPage) {
        throw new Error(
            `Unknown Inertia page: ${name}`,
        );
    }

    try {
        const module =
            await loadPage();

        if (
            typeof window !==
            'undefined'
        ) {
            window.sessionStorage
                .removeItem(
                    pageReloadKey,
                );
        }

        return module.default;
    } catch (error) {
        if (
            typeof window !==
            'undefined'
        ) {
            const alreadyReloaded =
                window.sessionStorage
                    .getItem(
                        pageReloadKey,
                    ) ===
                window.location.pathname;

            if (! alreadyReloaded) {
                window.sessionStorage
                    .setItem(
                        pageReloadKey,
                        window.location.pathname,
                    );

                window.location.reload();

                return await new Promise<
                    ResolvedComponent
                >(
                    () =>
                        undefined,
                );
            }

            window.sessionStorage
                .removeItem(
                    pageReloadKey,
                );
        }

        throw error;
    }
}

/**
 * Boot the AccoNova React application.
 */
initializeLocale();

void createInertiaApp({
    resolve: resolvePage,

    /**
     * Mount React inside the Inertia root element.
     */
    setup({ el, App, props }) {
        createRoot(el).render(
            <ToastProvider>
                <App {...props} />
            </ToastProvider>,
        );
    },
});
