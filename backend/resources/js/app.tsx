import { initializeLocale } from '@/lib/locale';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import '../css/app.css';

import { createInertiaApp } from '@inertiajs/react';
import type { ResolvedComponent } from '@inertiajs/react';
import { createRoot } from 'react-dom/client';

/**
 * Describe one eagerly registered Inertia page module.
 */
type InertiaPageModule = {
    default: ResolvedComponent;
};

/*
 * Register application pages eagerly.
 *
 * AccoNova is frequently edited while the local Vite dev server is running.
 * Lazy page chunks can become stale across HMR/rebuild boundaries, leaving the
 * persistent application chrome visible while the newly selected page never
 * mounts. Keeping the Inertia page registry in the main bundle makes route
 * changes deterministic and removes that blank-content failure mode.
 */
const pages = import.meta.glob<InertiaPageModule>(
    './pages/**/*.tsx',
    {
        eager: true,
    },
);

/**
 * Resolve an Inertia page name into its already-loaded React component.
 *
 * @param name The page name sent by Laravel.
 * @returns The matching React page component.
 */
function resolvePage(
    name: string,
): ResolvedComponent {
    const page = pages[`./pages/${name}.tsx`];

    if (! page) {
        throw new Error(
            `Unknown Inertia page: ${name}`,
        );
    }

    return page.default;
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
            <ToastProvider><App {...props} /></ToastProvider>,
        );
    },
});
