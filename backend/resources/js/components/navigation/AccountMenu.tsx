import {
    router,
    usePage,
} from '@inertiajs/react';
import {
    ChevronDown,
    LogOut,
    UserRound,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
} from 'react';

import {
    useToast,
} from '@/components/feedback/ToastProvider';
import {
    logout,
} from '@/features/auth/api';
import {
    normalizeApiError,
} from '@/lib/error-feedback';
import {
    t,
    useLocale,
} from '@/lib/i18n';
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
        .split(
            /\s+/,
        )
        .slice(
            0,
            2,
        )
        .map(
            (
                part,
            ) =>
                part.charAt(
                    0,
                ),
        )
        .join(
            '',
        )
        .toUpperCase();
}

/**
 * Render account identity and session controls.
 *
 * Locale selection intentionally lives outside this menu so the account menu
 * remains focused on identity and authentication actions.
 */
export function AccountMenu() {
    useLocale();

    const {
        showToast,
    } = useToast();

    const {
        auth,
    } =
        usePage<AppPageProps>().props;

    const user =
        auth.user;

    const [
        open,
        setOpen,
    ] =
        useState(
            false,
        );

    const [
        busy,
        setBusy,
    ] =
        useState(
            false,
        );

    const containerRef =
        useRef<HTMLDivElement>(
            null,
        );

    useEffect(() => {
        if (! open) {
            return;
        }

        /**
         * Close the account surface when pointer interaction leaves it.
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
                setOpen(
                    false,
                );
            }
        }

        /**
         * Keep keyboard dismissal consistent with the rest of the shell.
         */
        function handleKeyDown(
            event: KeyboardEvent,
        ): void {
            if (
                event.key ===
                'Escape'
            ) {
                setOpen(
                    false,
                );
            }
        }

        document.addEventListener(
            'mousedown',
            handlePointerDown,
        );

        window.addEventListener(
            'keydown',
            handleKeyDown,
        );

        return () => {
            document.removeEventListener(
                'mousedown',
                handlePointerDown,
            );

            window.removeEventListener(
                'keydown',
                handleKeyDown,
            );
        };
    }, [
        open,
    ]);

    /**
     * End the authenticated session and safely return to sign in.
     */
    async function handleLogout(): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(
            true,
        );

        try {
            await logout();

            router.visit(
                '/login',
                {
                    replace:
                        true,
                },
            );
        } catch (
            error
        ) {
            showToast(
                normalizeApiError(
                    error,
                )
                    .generalMessage,
                'error',
            );
        } finally {
            setBusy(
                false,
            );

            setOpen(
                false,
            );
        }
    }

    if (! user) {
        return null;
    }

    return (
        <div
            ref={
                containerRef
            }
            className="relative"
        >
            <button
                type="button"
                aria-expanded={
                    open
                }
                aria-haspopup="menu"
                aria-label={t(
                    'ui.open_account_menu',
                )}
                onClick={() =>
                    setOpen(
                        (
                            current,
                        ) =>
                            ! current,
                    )
                }
                className={[
                    'group flex h-10 min-w-10 items-center justify-center gap-2 rounded-[14px] border bg-white px-1.5 shadow-[var(--ac-shadow-soft)] transition duration-200 hover:-translate-y-px active:translate-y-0 motion-reduce:transform-none sm:px-2',
                    open
                        ? 'border-[var(--ac-accent)] ring-4 ring-[var(--ac-accent-soft)]'
                        : 'border-[var(--ac-line)] hover:border-[var(--ac-line-strong)]',
                ].join(
                    ' ',
                )}
            >
                <span className="relative flex size-7 items-center justify-center rounded-[10px] bg-[var(--ac-text)] text-[9px] font-bold text-white">
                    {userInitials(
                        user.name,
                    )}

                    <span className="absolute -end-0.5 -top-0.5 size-2 rounded-full border-2 border-white bg-[var(--ac-accent)]" />
                </span>

                <span className="hidden max-w-32 truncate pe-0.5 text-xs font-semibold text-[var(--ac-text)] xl:block">
                    {
                        user.name
                    }
                </span>

                <ChevronDown
                    size={
                        13
                    }
                    className={[
                        'hidden text-[var(--ac-text-muted)] transition-transform duration-200 sm:block',
                        open
                            ? 'rotate-180'
                            : '',
                    ].join(
                        ' ',
                    )}
                />
            </button>

            {open && (
                <div
                    role="menu"
                    className="absolute end-0 top-[calc(100%+0.65rem)] z-[90] w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-white p-2 shadow-[var(--ac-shadow-panel)] motion-safe:animate-[fadeIn_160ms_ease-out]"
                >
                    <div className="rounded-[17px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3.5">
                        <div className="flex items-center gap-3">
                            <div className="flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <UserRound
                                    size={
                                        18
                                    }
                                />
                            </div>

                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold tracking-[-0.02em] text-[var(--ac-text)]">
                                    {
                                        user.name
                                    }
                                </p>

                                <p className="mt-1 truncate text-[11px] text-[var(--ac-text-muted)]">
                                    {
                                        user.email
                                    }
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="my-2 h-px bg-[var(--ac-line)]" />

                    <button
                        type="button"
                        role="menuitem"
                        disabled={
                            busy
                        }
                        onClick={() =>
                            void handleLogout()
                        }
                        className="group flex min-h-11 w-full items-center gap-3 rounded-[15px] px-3 py-2.5 text-start text-sm font-semibold text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-danger)]/8 hover:text-[var(--ac-danger)] disabled:opacity-50"
                    >
                        <span className="flex size-8 items-center justify-center rounded-[11px] bg-[var(--ac-bg-soft)] transition group-hover:bg-white">
                            <LogOut
                                size={
                                    15
                                }
                            />
                        </span>

                        <span>
                            {busy
                                ? t(
                                      'ui.signing_out',
                                  )
                                : t(
                                      'ui.sign_out',
                                  )}
                        </span>
                    </button>
                </div>
            )}
        </div>
    );
}
