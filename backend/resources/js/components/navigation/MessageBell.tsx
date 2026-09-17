import {
    fetchConversations,
} from '@/features/team-space/api';
import type {
    Conversation,
} from '@/features/team-space/types';
import {
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Link,
    usePage,
} from '@inertiajs/react';
import {
    Image as ImageIcon,
    MessageCircle,
    MessageSquareMore,
    Users,
    X,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
} from 'react';

/**
 * Render the global messages trigger with unread counts and a compact inbox.
 */
export function MessageBell() {
    const locale =
        useLocale();

    const ar =
        locale ===
        'ar';

    const {
        workspace,
    } =
        usePage<AppPageProps>().props;

    const organizationId =
        workspace
            .activeOrganization
            ?.id;

    const rootRef =
        useRef<HTMLDivElement>(
            null,
        );

    const [
        open,
        setOpen,
    ] =
        useState(
            false,
        );

    const [
        unread,
        setUnread,
    ] =
        useState(
            0,
        );

    const [
        conversations,
        setConversations,
    ] =
        useState<
            Conversation[]
        >([]);

    const [
        loading,
        setLoading,
    ] =
        useState(
            false,
        );

    /**
     * Refresh the lightweight inbox.
     */
    function refresh(): void {
        if (
            ! organizationId
        ) {
            return;
        }

        setLoading(
            true,
        );

        fetchConversations(
            '',
            8,
        )
            .then(
                (
                    response,
                ) => {
                    setUnread(
                        response
                            .unread_total,
                    );

                    setConversations(
                        response
                            .data
                            .data,
                    );
                },
            )
            .catch(
                () => undefined,
            )
            .finally(
                () => {
                    setLoading(
                        false,
                    );
                },
            );
    }

    /**
     * Keep global unread state reasonably fresh without requiring WebSockets.
     */
    useEffect(
        () => {
            if (
                ! organizationId
            ) {
                setUnread(
                    0,
                );

                setConversations(
                    [],
                );

                return;
            }

            refresh();

            const timer =
                window.setInterval(
                    refresh,
                    8000,
                );

            window.addEventListener(
                'team-space-changed',
                refresh,
            );

            return () => {
                window.clearInterval(
                    timer,
                );

                window.removeEventListener(
                    'team-space-changed',
                    refresh,
                );
            };
        },
        [
            organizationId,
        ],
    );

    /**
     * Close the inbox when clicking outside or pressing Escape.
     */
    useEffect(
        () => {
            if (
                ! open
            ) {
                return;
            }

            /**
             * Close after outside pointer interaction.
             */
            function handleOutside(
                event:
                    MouseEvent,
            ): void {
                if (
                    rootRef.current
                    && ! rootRef.current.contains(
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
             * Close the inbox from the Escape key.
             */
            function handleEscape(
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
                handleOutside,
            );

            window.addEventListener(
                'keydown',
                handleEscape,
            );

            return () => {
                document.removeEventListener(
                    'mousedown',
                    handleOutside,
                );

                window.removeEventListener(
                    'keydown',
                    handleEscape,
                );
            };
        },
        [
            open,
        ],
    );

    if (
        ! organizationId
    ) {
        return null;
    }

    return (
        <div
            ref={
                rootRef
            }
            className="relative"
        >
            <button
                type="button"
                aria-label={ar
                    ? 'الرسائل'
                    : 'Messages'}
                onClick={() => {
                    setOpen(
                        (
                            current,
                        ) =>
                            ! current,
                    );

                    if (
                        ! open
                    ) {
                        refresh();
                    }
                }}
                className={[
                    'relative flex size-10 items-center justify-center rounded-[13px] border bg-white transition',
                    open
                        ? 'border-[var(--ac-accent)] text-[var(--ac-accent-strong)] ring-4 ring-[var(--ac-accent-soft)]'
                        : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-accent-soft)]',
                ].join(
                    ' ',
                )}
            >
                <MessageCircle
                    size={
                        18
                    }
                />

                {unread >
                    0 && (
                    <span className="absolute -end-1.5 -top-1.5 min-w-5 rounded-full border-2 border-white bg-[var(--ac-accent-strong)] px-1 text-center text-[9px] font-bold leading-4 text-white">
                        {unread >
                        99
                            ? '99+'
                            : unread}
                    </span>
                )}
            </button>

            {open && (
                <div className="fixed inset-x-3 top-[4.6rem] z-[120] overflow-hidden rounded-[24px] border border-[var(--ac-line)] bg-white shadow-[0_24px_70px_rgba(15,35,30,.18)] sm:absolute sm:inset-x-auto sm:end-0 sm:top-[calc(100%+0.75rem)] sm:w-[410px]">
                    <div className="flex items-center justify-between gap-4 border-b border-[var(--ac-line)] p-4">
                        <div className="flex items-center gap-3">
                            <div className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <MessageSquareMore
                                    size={
                                        18
                                    }
                                />
                            </div>

                            <div>
                                <div className="flex items-center gap-2">
                                    <strong className="text-sm">
                                        {ar
                                            ? 'الرسائل'
                                            : 'Messages'}
                                    </strong>

                                    {unread >
                                        0 && (
                                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-0.5 text-[9px] font-bold text-[var(--ac-accent-strong)]">
                                            {
                                                unread
                                            }
                                        </span>
                                    )}
                                </div>

                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'آخر المحادثات في مساحة العمل'
                                        : 'Recent workspace conversations'}
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                setOpen(
                                    false,
                                )
                            }
                            className="flex size-8 items-center justify-center rounded-[11px] bg-[var(--ac-bg-soft)]"
                        >
                            <X
                                size={
                                    14
                                }
                            />
                        </button>
                    </div>

                    <div className="max-h-[430px] overflow-y-auto p-2">
                        {loading
                            && conversations.length ===
                                0 && (
                                <div className="p-10 text-center text-xs text-[var(--ac-text-muted)]">
                                    …
                                </div>
                            )}

                        {! loading
                            && conversations.length ===
                                0 && (
                                <div className="p-10 text-center">
                                    <div className="mx-auto flex size-14 items-center justify-center rounded-[18px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                        <MessageCircle
                                            size={
                                                22
                                            }
                                        />
                                    </div>

                                    <p className="mt-3 text-xs font-semibold">
                                        {ar
                                            ? 'لا توجد محادثات بعد'
                                            : 'No conversations yet'}
                                    </p>
                                </div>
                            )}

                        {conversations.map(
                            (
                                conversation,
                            ) => (
                                <Link
                                    key={
                                        conversation.id
                                    }
                                    href={`/app/team-space?conversation=${conversation.id}`}
                                    onClick={() =>
                                        setOpen(
                                            false,
                                        )
                                    }
                                    className="flex items-center gap-3 rounded-[17px] p-3 transition hover:bg-[var(--ac-surface-soft)]"
                                >
                                    <div className="relative flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-xs font-bold text-[var(--ac-accent-strong)]">
                                        {conversation.kind ===
                                        'group' ? (
                                            <Users
                                                size={
                                                    17
                                                }
                                            />
                                        ) : (
                                            conversation
                                                .display_name
                                                .trim()
                                                .charAt(
                                                    0,
                                                )
                                                .toUpperCase()
                                        )}

                                        {conversation.unread_count >
                                            0 && (
                                            <span className="absolute -end-0.5 -top-0.5 size-3 rounded-full border-2 border-white bg-[var(--ac-accent-strong)]" />
                                        )}
                                    </div>

                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center justify-between gap-3">
                                            <strong
                                                className={[
                                                    'truncate text-xs',
                                                    conversation.unread_count >
                                                    0
                                                        ? 'font-bold'
                                                        : 'font-semibold',
                                                ].join(
                                                    ' ',
                                                )}
                                            >
                                                {
                                                    conversation.display_name
                                                }
                                            </strong>

                                            {conversation.unread_count >
                                                0 && (
                                                <span className="min-w-5 rounded-full bg-[var(--ac-accent-strong)] px-1.5 text-center text-[9px] font-bold leading-5 text-white">
                                                    {
                                                        conversation.unread_count
                                                    }
                                                </span>
                                            )}
                                        </div>

                                        <p className="mt-1 truncate text-[10px] text-[var(--ac-text-muted)]">
                                            {conversation.latest_preview
                                                || (
                                                    conversation.latest_has_attachments
                                                        ? ar
                                                            ? 'مرفق وسائط'
                                                            : 'Media attachment'
                                                        : ar
                                                          ? 'ابدأ المحادثة'
                                                          : 'Start conversation'
                                                )}
                                        </p>

                                        {conversation.latest_has_attachments
                                            && (
                                            <div className="mt-1 flex items-center gap-1 text-[9px] text-[var(--ac-text-muted)]">
                                                <ImageIcon
                                                    size={
                                                        10
                                                    }
                                                />

                                                {ar
                                                    ? 'وسائط'
                                                    : 'Media'}
                                            </div>
                                        )}
                                    </div>
                                </Link>
                            ),
                        )}
                    </div>

                    <div className="border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
                        <Link
                            href="/app/team-space"
                            onClick={() =>
                                setOpen(
                                    false,
                                )
                            }
                            className="flex h-11 items-center justify-center rounded-[14px] bg-[var(--ac-text)] text-xs font-semibold text-white transition hover:-translate-y-px"
                        >
                            {ar
                                ? 'فتح مركز الرسائل'
                                : 'Open Messages'}
                        </Link>
                    </div>
                </div>
            )}
        </div>
    );
}