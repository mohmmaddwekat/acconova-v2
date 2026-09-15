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
 * Register every React page so Vite can load it only when needed.
 */
const pages = import.meta.glob<InertiaPageModule>(
    './pages/**/*.tsx',
);

/**
 * Resolve an Inertia page name into its React component.
 *
 * @param name The page name sent by Laravel.
 * @returns The matching React page component.
 */
function resolvePage(
    name: string,
): Promise<ResolvedComponent> {
    const loadPage = pages[`./pages/${name}.tsx`];

    if (! loadPage) {
        throw new Error(
            `Unknown Inertia page: ${name}`,
        );
    }

    return loadPage().then(
        (module) => module.default,
    );
}

/**
 * Boot the AccoNova React application.
 */
void createInertiaApp({
    resolve: resolvePage,

    /**
     * Mount React inside the Inertia root element.
     */
    setup({ el, App, props }) {
        createRoot(el).render(
            <App {...props} />,
        );
    },
});