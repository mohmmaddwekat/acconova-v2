import {
    Link,
    router,
    usePage,
} from '@inertiajs/react';
import {
    ChevronDown,
    LogOut,
    MessageCircleMore,
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
 * Render account identity, profile shortcuts, Team Space and logout.
 */
export function AccountMenu() {
    const locale =
        useLocale();

    const ar =
        locale ===
        'ar';

    const {
        showToast,
    } =
        useToast();

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

    useEffect(
        () => {
            if (
                ! open
            ) {
                return;
            }

            /**
             * Close the menu when pointer interaction leaves the surface.
             */
            function handlePointerDown(
                event:
                    MouseEvent,
            ): void {
                if (
                    containerRef.current
                    && ! containerRef.current.contains(
                        event.target as
                            Node,
                    )
                ) {
                    setOpen(
                        false,
                    );
                }
            }

            /**
             * Close the menu from the Escape key.
             */
            function handleKeyDown(
                event:
                    KeyboardEvent,
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
        },
        [
            open,
        ],
    );

    /**
     * End the authenticated session and return to login.
     */
    async function handleLogout(): Promise<void> {
        if (
            busy
        ) {
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

    if (
        ! user
    ) {
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
                    'group flex h-10 min-w-10 items-center justify-center gap-2 rounded-[14px] border bg-[var(--ac-surface)] px-1.5 shadow-[var(--ac-shadow-soft)] transition duration-200 hover:-translate-y-px sm:px-2',
                    open
                        ? 'border-[var(--ac-accent)] ring-4 ring-[var(--ac-accent-soft)]'
                        : 'border-[var(--ac-line)]',
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

                <span className="hidden max-w-32 truncate pe-0.5 text-xs font-semibold xl:block">
                    {
                        user.name
                    }
                </span>

                <ChevronDown
                    size={
                        13
                    }
                    className={[
                        'hidden text-[var(--ac-text-muted)] transition sm:block',
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
                    className="absolute end-0 top-[calc(100%+0.65rem)] z-[90] w-[min(20rem,calc(100vw-1.5rem))] overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-2 shadow-[var(--ac-shadow-panel)]"
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
                                <p className="truncate text-sm font-semibold">
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

                    <div className="mt-2 space-y-1">
                        <Link
                            href="/app/profile"
                            role="menuitem"
                            onClick={() =>
                                setOpen(
                                    false,
                                )
                            }
                            className="flex min-h-11 items-center gap-3 rounded-[15px] px-3 py-2.5 text-sm font-semibold transition hover:bg-[var(--ac-accent-soft)]"
                        >
                            <span className="flex size-8 items-center justify-center rounded-[11px] bg-[var(--ac-bg-soft)]">
                                <UserRound
                                    size={
                                        15
                                    }
                                />
                            </span>

                            {ar
                                ? 'الملف الشخصي'
                                : 'Profile'}
                        </Link>

                        <Link
                            href="/app/team-space"
                            role="menuitem"
                            onClick={() =>
                                setOpen(
                                    false,
                                )
                            }
                            className="flex min-h-11 items-center gap-3 rounded-[15px] px-3 py-2.5 text-sm font-semibold transition hover:bg-[var(--ac-accent-soft)]"
                        >
                            <span className="flex size-8 items-center justify-center rounded-[11px] bg-[var(--ac-bg-soft)]">
                                <MessageCircleMore
                                    size={
                                        15
                                    }
                                />
                            </span>

                            {ar
                                ? 'مساحة الفريق'
                                : 'Team Space'}
                        </Link>
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
                        className="group flex min-h-11 w-full items-center gap-3 rounded-[15px] px-3 py-2.5 text-start text-sm font-semibold text-[var(--ac-text-soft)] transition hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                    >
                        <span className="flex size-8 items-center justify-center rounded-[11px] bg-[var(--ac-bg-soft)]">
                            <LogOut
                                size={
                                    15
                                }
                            />
                        </span>

                        {busy
                            ? t(
                                  'ui.signing_out',
                              )
                            : t(
                                  'ui.sign_out',
                              )}
                    </button>
                </div>
            )}
        </div>
    );
}