import { locales, setLocale } from '@/lib/locale';
import { useLocale } from '@/lib/i18n';
import { useToast } from '@/components/feedback/ToastProvider';
import { normalizeApiError } from '@/lib/error-feedback';
import { t } from '@/lib/i18n';
import {
    router,
    usePage,
} from '@inertiajs/react';
import {
    LogOut,
    UserRound,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    logout,
} from '@/features/auth/api';
import type {
    AppPageProps,
} from '@/types/app';

/**
 * Build compact initials from the authenticated user's name.
 */
function userInitials(
    name: string,
): string {
    return name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map(
            (part) =>
                part.charAt(0),
        )
        .join('')
        .toUpperCase();
}

/**
 * Render the authenticated user's compact account control and sign-out menu.
 */
export function AccountMenu() {
    useLocale();
    const locale = useLocale();
    const { showToast } = useToast();
    const {
        auth,
    } = usePage<AppPageProps>().props;

    const user =
        auth.user;

    const [open, setOpen] =
        useState(false);

    const [busy, setBusy] =
        useState(false);

    const containerRef =
        useRef<HTMLDivElement>(
            null,
        );

    useEffect(() => {
        /**
         * Close the account menu when the user interacts outside it.
         */
        function handlePointerDown(
            event: MouseEvent,
        ): void {
            if (
                containerRef.current &&
                ! containerRef.current.contains(
                    event.target as Node,
                )
            ) {
                setOpen(false);
            }
        }

        document.addEventListener(
            'mousedown',
            handlePointerDown,
        );

        return () => {
            document.removeEventListener(
                'mousedown',
                handlePointerDown,
            );
        };
    }, []);

    /**
     * End the authenticated session and return to the login surface.
     */
    async function handleLogout(): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);

        try {
            await logout();

            router.visit(
                '/login',
                {
                    replace: true,
                },
            );
        } catch (error) {
            showToast(normalizeApiError(error).generalMessage, 'error');
        } finally {
            setBusy(false);
            setOpen(false);
        }
    }

    if (! user) {
        return null;
    }

    return (
        <div
            ref={containerRef}
            className="relative"
        >
            <button
                type="button"
                aria-expanded={open}
                aria-haspopup="menu"
                aria-label={t('ui.open_account_menu')}
                onClick={() =>
                    setOpen(
                        (current) =>
                            ! current,
                    )
                }
                className="flex h-10 min-w-10 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-white px-1.5 shadow-[var(--ac-shadow-soft)] transition hover:border-[var(--ac-line-strong)] sm:px-2"
            >
                <span className="flex size-7 items-center justify-center rounded-[10px] bg-[var(--ac-text)] text-[9px] font-bold text-white">
                    {userInitials(
                        user.name,
                    )}
                </span>

                <span className="hidden max-w-32 truncate pe-1 text-xs font-semibold text-[var(--ac-text)] lg:block">
                    {user.name}
                </span>
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute end-0 top-[calc(100%+0.6rem)] z-[80] w-[min(18rem,calc(100vw-1.5rem))] overflow-hidden rounded-[20px] border border-[var(--ac-line)] bg-white p-2 shadow-[var(--ac-shadow-panel)]"
                >
                    <div className="px-3 py-3">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-soft)]">
                                <UserRound
                                    size={17}
                                />
                            </div>

                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-[var(--ac-text)]">
                                    {user.name}
                                </p>

                                <p className="mt-0.5 truncate text-xs text-[var(--ac-text-muted)]">
                                    {user.email}
                                </p>
                            </div>
                        </div>
                    </div>

                    <label className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                        {t('common.language')}
                        <select value={locale} onChange={(event) => setLocale(event.target.value as keyof typeof locales)} className="min-h-11 rounded-xl border border-[var(--ac-line)] bg-white px-2">
                            {Object.entries(locales).map(([value, details]) => <option key={value} value={value}>{details.label}</option>)}
                        </select>
                    </label>
                    <div className="my-1 h-px bg-[var(--ac-line)]" />

                    <button
                        type="button"
                        role="menuitem"
                        disabled={busy}
                        onClick={() =>
                            void handleLogout()
                        }
                        className="flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-start text-sm font-medium text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)] disabled:opacity-50"
                    >
                        <LogOut size={16} />

                        {busy
                            ? t('ui.signing_out')
                            : t('ui.sign_out')}
                    </button>
                </div>
            )}
        </div>
    );
}