import { usePage } from '@inertiajs/react';
import { AccountMenu } from '@/components/navigation/AccountMenu';
import {
    Bell,
    Command,
    Search,
} from 'lucide-react';

import { WorkspaceSwitcher } from '@/components/navigation/WorkspaceSwitcher';
import type { AppPageProps } from '@/types/app';

/**
 * Render the authenticated user's current workspace context and global
 * application controls using server-provided Inertia shared data.
 */
export function ContextBar() {
    const { auth } = usePage<AppPageProps>().props;

    const initial =
        auth.user?.name.trim().charAt(0).toUpperCase() ?? '?';

    return (
        <header className="flex h-[78px] items-center gap-5 border-b border-[var(--ac-line)] bg-white/55 px-7 backdrop-blur-xl">
            <WorkspaceSwitcher />

            <div className="ml-auto flex items-center gap-2">
                <button
                    type="button"
                    className="flex h-10 items-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3.5 text-sm text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-soft)]"
                >
                    <Search size={16} />

                    <span className="hidden sm:inline">
                        Search anything
                    </span>

                    <span className="ml-2 hidden items-center gap-1 rounded-lg border border-[var(--ac-line)] bg-[var(--ac-bg-soft)] px-1.5 py-0.5 text-[10px] text-[var(--ac-text-muted)] lg:flex">
                        <Command size={10} />
                        K
                    </span>
                </button>

                <button
                    type="button"
                    className="flex size-10 items-center justify-center rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-soft)]"
                    aria-label="Notifications"
                >
                    <Bell size={17} />
                </button>

                <AccountMenu />
            </div>
        </header>
    );
}
