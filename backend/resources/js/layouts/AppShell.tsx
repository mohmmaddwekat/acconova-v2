import type { ReactNode } from 'react';

import { CommandRail } from '@/components/navigation/CommandRail';
import { ContextBar } from '@/components/navigation/ContextBar';

type AppShellProps = {
    children: ReactNode;
};

/**
 * Provide the persistent AccoNova application frame around business pages.
 *
 * Global navigation and organization context live here once so individual
 * feature pages remain focused on their business responsibilities.
 */
export function AppShell({
    children,
}: AppShellProps) {
    return (
        <div className="flex min-h-screen text-[var(--ac-text)]">
            <CommandRail />

            <div className="min-w-0 flex-1">
                <ContextBar />

                <main className="min-h-[calc(100vh-78px)] p-7">
                    {children}
                </main>
            </div>
        </div>
    );
}
