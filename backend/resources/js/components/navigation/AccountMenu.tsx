import { usePage } from '@inertiajs/react';
import {
    LogOut,
    UserRound,
} from 'lucide-react';
import { useState } from 'react';

import { logout } from '@/features/auth/api';
import type { AppPageProps } from '@/types/app';

/**
 * Render the authenticated user's compact account control.
 */
export function AccountMenu() {
    const { auth } =
        usePage<AppPageProps>().props;

    const [open, setOpen] =
        useState(false);

    const [busy, setBusy] =
        useState(false);

    const initial =
        auth.user?.name
            .trim()
            .charAt(0)
            .toUpperCase() ?? '?';

    /**
     * End the Laravel session and return the browser to login.
     */
    async function handleLogout(): Promise<void> {
        setBusy(true);

        try {
            await logout();

            window.location.assign('/login');
        } finally {
            setBusy(false);
        }
    }

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() =>
                    setOpen(
                        (value) => ! value,
                    )
                }
                className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-text)] text-xs font-semibold text-white"
                title={
                    auth.user?.name ?? ''
                }
            >
                {initial}
            </button>

            {open && (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-64 rounded-[20px] border border-[var(--ac-line)] bg-white p-2 shadow-[var(--ac-shadow-panel)]">
                    <div className="flex items-center gap-3 px-3 py-3">
                        <div className="flex size-9 items-center justify-center rounded-[13px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-soft)]">
                            <UserRound
                                size={16}
                            />
                        </div>

                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[var(--ac-text)]">
                                {auth.user?.name}
                            </p>

                            <p className="mt-0.5 truncate text-xs text-[var(--ac-text-muted)]">
                                {auth.user?.email}
                            </p>
                        </div>
                    </div>

                    <div className="my-1 border-t border-[var(--ac-line)]" />

                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            void handleLogout()
                        }
                        className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-medium text-[var(--ac-danger)] transition hover:bg-[var(--ac-danger)]/5 disabled:opacity-50"
                    >
                        <LogOut size={16} />

                        {busy
                            ? 'Signing out…'
                            : 'Sign out'}
                    </button>
                </div>
            )}
        </div>
    );
}
