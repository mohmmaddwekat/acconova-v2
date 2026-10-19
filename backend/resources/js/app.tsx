import { AdminManualPaymentReviewLauncher } from '@/components/billing/AdminManualPaymentReviewLauncher';
import { ManualPaymentRequestLauncher } from '@/components/billing/ManualPaymentRequestLauncher';
import { ToastProvider } from '@/components/feedback/ToastProvider';
import { useLiveRemountKey } from '@/lib/live';
import { initializeLocale } from '@/lib/locale';
import '../css/app.css';
import '../css/ai-sidekick.css';

import { createInertiaApp } from '@inertiajs/react';
import type { ResolvedComponent } from '@inertiajs/react';
import type { ComponentType } from 'react';
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

const liveWrappers = new WeakMap<object, ResolvedComponent>();

/**
 * Re-mount a page when the live watcher finds that its data went stale and the
 * page cannot refresh itself. The wrapper is cached so ordinary navigation and
 * Inertia state preservation behave exactly as before.
 */
function withLiveRemount(
    Page: ResolvedComponent,
): ResolvedComponent {
    if (typeof Page !== 'function') {
        return Page;
    }

    const cached = liveWrappers.get(Page);

    if (cached) {
        return cached;
    }

    const Wrapped = (props: Record<string, unknown>) => {
        const key = useLiveRemountKey();
        const Component = Page as ComponentType<Record<string, unknown>>;

        return <Component key={key} {...props} />;
    };

    liveWrappers.set(Page, Wrapped);

    return Wrapped;
}

const pageReloadKey =
    'acconova:inertia-page-import-reload';

function readReloadMarker(): string | null {
    try {
        return window.sessionStorage
            .getItem(
                pageReloadKey,
            );
    } catch {
        return null;
    }
}

function writeReloadMarker(
    value: string,
): void {
    try {
        window.sessionStorage
            .setItem(
                pageReloadKey,
                value,
            );
    } catch {
        // Storage restrictions must never block application boot.
    }
}

function clearReloadMarker(): void {
    try {
        window.sessionStorage
            .removeItem(
                pageReloadKey,
            );
    } catch {
        // Storage restrictions must never block application boot.
    }
}

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
    /*
     * TeamSpaceCompact keeps the established messaging behavior/API intact
     * while presenting the redesigned two-column UI and on-demand details
     * drawer. The server route can continue rendering the stable TeamSpace
     * Inertia page name.
     */
    const resolvedName =
        name === 'TeamSpace'
            ? 'TeamSpaceCompact'
            : name;

    const loadPage =
        pages[`./pages/${resolvedName}.tsx`];

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
            clearReloadMarker();
        }

        return withLiveRemount(module.default);
    } catch (error) {
        if (
            typeof window !==
            'undefined'
        ) {
            const alreadyReloaded =
                readReloadMarker() ===
                window.location.pathname;

            if (! alreadyReloaded) {
                writeReloadMarker(
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

            clearReloadMarker();
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
                <ManualPaymentRequestLauncher />
                <AdminManualPaymentReviewLauncher />
            </ToastProvider>,
        );
    },
});
