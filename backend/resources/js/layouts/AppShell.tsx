import {
    useEffect,
    useState,
    type PropsWithChildren,
} from 'react';

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

                        unbindSystemTheme();

                        applyProfilePreferences(
                            preferences,
                        );

                        unbindSystemTheme =
                            bindSystemTheme(
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
        <div className="relative min-h-dvh min-w-0 overflow-x-clip bg-[var(--ac-bg)] text-[var(--ac-text)]">
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
