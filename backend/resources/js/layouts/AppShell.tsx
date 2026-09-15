import {
    useState,
    type PropsWithChildren,
} from 'react';

import { CommandRail } from '@/components/navigation/CommandRail';
import { ContextBar } from '@/components/navigation/ContextBar';

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

    return (
        <div className="relative min-h-dvh min-w-0 overflow-x-clip bg-[var(--ac-bg)] text-[var(--ac-text)]">
            <div
                aria-hidden="true"
                className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
            >
                <div className="absolute -left-24 top-16 size-80 rounded-full bg-[var(--ac-accent)]/[0.055] blur-[100px] motion-safe:animate-pulse" />

                <div className="absolute right-[-10rem] top-[30%] size-[28rem] rounded-full bg-[var(--ac-info)]/[0.035] blur-[120px]" />
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
                        ? 'md:pl-[248px]'
                        : 'md:pl-[84px]',
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