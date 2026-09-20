import {
    useEffect,
    useState,
    type PropsWithChildren,
} from 'react';
import {
    router,
    usePage,
} from '@inertiajs/react';

import { CommandRail } from '@/components/navigation/CommandRail';
import { ContextBar } from '@/components/navigation/ContextBar';
import {
    apiRequest,
} from '@/lib/http';
import {
    applyProfilePreferences,
    bindSystemTheme,
    cachedProfilePreferences,
    defaultProfilePreferences,
    type ProfilePreferences,
} from '@/lib/profilePreferences';

/**
 * Provide AccoNova's responsive authenticated application shell.
 *
 * Desktop and tablet screens use a collapsible command rail while phones use
 * a slide-in navigation drawer. The application content follows the rail
 * width smoothly instead of jumping between layouts.
 */
export function AppShell({
    children,
}: PropsWithChildren) {
    const [
        railExpanded,
        setRailExpanded,
    ] = useState(false);

    const [
        mobileNavigationOpen,
        setMobileNavigationOpen,
    ] = useState(false);

    const page =
        usePage();

    /*
     * Global fallback form guard.
     *
     * Feature-rich editors use their own precise dirty-state hooks. This
     * delegated guard covers every other authenticated HTML form so smaller
     * modules cannot silently discard typed values. Auto-save Settings is
     * intentionally excluded.
     */
    useEffect(() => {
        if (
            page.url.split('?')[0]
                === '/app/settings'
        ) {
            return;
        }

        const dirtyForms =
            new Set<HTMLFormElement>();

        const resolveForm = (
            event: Event,
        ): HTMLFormElement | null => {
            const target =
                event.target;

            if (! (
                target instanceof
                    HTMLElement
            )) {
                return null;
            }

            const form =
                target.closest(
                    'form',
                );

            if (
                ! form
                || form.dataset
                    .acManagedDirty ===
                    'true'
                || form.dataset
                    .acUnsavedGuard ===
                    'off'
            ) {
                return null;
            }

            return form;
        };

        const markDirty = (
            event: Event,
        ): void => {
            const form =
                resolveForm(
                    event,
                );

            if (form) {
                dirtyForms.add(
                    form,
                );
            }
        };

        const clearForm = (
            event: Event,
        ): void => {
            const form =
                event.target instanceof
                    HTMLFormElement
                    ? event.target
                    : resolveForm(
                        event,
                    );

            if (form) {
                dirtyForms.delete(
                    form,
                );
            }
        };

        const beforeUnload = (
            event: BeforeUnloadEvent,
        ): void => {
            if (
                dirtyForms.size ===
                0
            ) {
                return;
            }

            event.preventDefault();
            event.returnValue =
                '';
        };

        const removeBefore =
            router.on(
                'before',
                (
                    event,
                ) => {
                    if (
                        dirtyForms.size ===
                        0
                    ) {
                        return;
                    }

                    if (
                        ! window.confirm(
                            document.documentElement
                                .lang ===
                                'ar'
                                ? 'لديك تغييرات غير محفوظة. هل تريد المغادرة بدون حفظ؟'
                                : 'You have unsaved changes. Leave without saving?',
                        )
                    ) {
                        event.preventDefault();
                    }
                },
            );

        document.addEventListener(
            'input',
            markDirty,
            true,
        );
        document.addEventListener(
            'change',
            markDirty,
            true,
        );
        document.addEventListener(
            'submit',
            clearForm,
            true,
        );
        document.addEventListener(
            'reset',
            clearForm,
            true,
        );
        window.addEventListener(
            'beforeunload',
            beforeUnload,
        );

        return () => {
            document.removeEventListener(
                'input',
                markDirty,
                true,
            );
            document.removeEventListener(
                'change',
                markDirty,
                true,
            );
            document.removeEventListener(
                'submit',
                clearForm,
                true,
            );
            document.removeEventListener(
                'reset',
                clearForm,
                true,
            );
            window.removeEventListener(
                'beforeunload',
                beforeUnload,
            );
            removeBefore();
        };
    }, [
        page.url,
    ]);

    useEffect(
        () => {
            const cached =
                cachedProfilePreferences()
                ?? defaultProfilePreferences();

            applyProfilePreferences(
                cached,
            );

            let unbindSystemTheme =
                bindSystemTheme(
                    cached,
                );

            const controller =
                new AbortController();

            apiRequest<{
                settings: Partial<ProfilePreferences> | null;
            }>(
                '/api/profile/preferences',
                {
                    signal:
                        controller.signal,
                },
            )
                .then(
                    (
                        response,
                    ) => {
                        const preferences = {
                            ...defaultProfilePreferences(),
                            ...response.settings,
                        };

                        applyProfilePreferences(
                            preferences,
                        );
                    },
                )
                .catch(
                    () => undefined,
                );

            const handlePreferences =
                (
                    event: Event,
                ): void => {
                    const preferences =
                        (
                            event as CustomEvent<ProfilePreferences>
                        ).detail;

                    if (! preferences) {
                        return;
                    }

                    unbindSystemTheme();

                    unbindSystemTheme =
                        bindSystemTheme(
                            preferences,
                        );
                };

            window.addEventListener(
                'acconova:profile-preferences',
                handlePreferences,
            );

            return () => {
                controller.abort();
                unbindSystemTheme();
                window.removeEventListener(
                    'acconova:profile-preferences',
                    handlePreferences,
                );
            };
        },
        [],
    );

    return (
        <div className="ac-app-shell relative min-h-dvh min-w-0 overflow-x-clip bg-[var(--ac-bg)] text-[var(--ac-text)]">
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
            >
                <div className="absolute -start-24 top-16 size-80 rounded-full bg-[var(--ac-accent)]/[0.055] blur-[100px] motion-safe:animate-pulse" />

                <div className="absolute end-[-10rem] top-[30%] size-[28rem] rounded-full bg-[var(--ac-info)]/[0.035] blur-[120px]" />
            </div>

            <CommandRail
                expanded={railExpanded}
                mobileOpen={
                    mobileNavigationOpen
                }
                onExpandedChange={
                    setRailExpanded
                }
                onMobileOpenChange={
                    setMobileNavigationOpen
                }
            />

            <div
                className={[
                    'min-h-dvh min-w-0 transition-[padding] duration-300 ease-out',
                    railExpanded
                        ? 'md:ps-[248px]'
                        : 'md:ps-[84px]',
                ].join(' ')}
            >
                <ContextBar
                    onOpenNavigation={() =>
                        setMobileNavigationOpen(
                            true,
                        )
                    }
                />

                <div className="min-w-0">
                    {children}
                </div>
            </div>
        </div>
    );
}
