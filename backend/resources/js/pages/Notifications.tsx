import { SmartEmptyState } from '@/components/data/SmartEmptyState';
import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { t, useLocale } from '@/lib/i18n';
import { getLocale } from '@/lib/locale';
import type { AppPageProps } from '@/types/app';
import { Head, router, usePage } from '@inertiajs/react';
import {
    ArrowUpRight,
    Bell,
    CalendarClock,
    Check,
    CheckCheck,
    CircleCheck,
    Layers3,
    Package,
} from 'lucide-react';
import { useEffect, useState } from 'react';

type Notice = {
    id: number;
    kind: string;
    category: 'stock' | 'payments' | 'activity' | 'messages';
    data: {
        name: string;
        detail?: string;
        amount?: string;
    };
    url: string;
    read_at: string | null;
    created_at: string;
};

type Digest = {
    total_unread: number;
    groups: Array<{
        category: Notice['category'];
        count: number;
        kinds: Array<{
            kind: string;
            count: number;
        }>;
        latest: Array<{
            id: number;
            kind: string;
            data: Notice['data'];
            url: string;
            created_at: string;
        }>;
    }>;
    generated_at: string;
};

const button =
    'rounded-xl border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 py-2 text-xs text-[var(--ac-text)] transition hover:bg-[var(--ac-surface-soft)] focus-visible:outline-2 focus-visible:outline-[var(--ac-accent)] disabled:opacity-50';

function noticeTitle(
    notice: Pick<Notice, 'kind'>,
    ar: boolean,
): string {
    const titles: Record<
        string,
        [string, string]
    > = {
        mention: ['تم ذكرك في سجل داخلي', 'You were mentioned'],
        follow_up_due: ['موعد متابعة مستحق', 'Follow-up reminder due'],
        approval_required: ['موافقة مطلوبة', 'Approval required'],
        approval_approved: ['تمت الموافقة', 'Approval approved'],
        approval_rejected: ['تم رفض الموافقة', 'Approval rejected'],
        approval_progress: ['تقدم في الموافقة', 'Approval progress'],
        inventory_expiry: ['تنبيه صلاحية مخزون', 'Inventory expiry alert'],
        contract_expiry: ['تنبيه انتهاء عقد', 'Contract expiry alert'],
        document_expiry: ['تنبيه انتهاء وثيقة', 'Document expiry alert'],
        scheduled_report_ready: ['تقرير مجدول جاهز', 'Scheduled report ready'],
        low_stock: ['مخزون منخفض', 'Low stock'],
        out_of_stock: ['نفاد مخزون', 'Out of stock'],
        payment_due: ['دفعة مستحقة', 'Payment due'],
        payment_soon: ['دفعة قريبة', 'Payment due soon'],
        payment_recorded: ['تم تسجيل دفعة', 'Payment recorded'],
    };

    if (titles[notice.kind]) {
        return ar
            ? titles[notice.kind][0]
            : titles[notice.kind][1];
    }

    const translated =
        t(
            `notifications.kind.${notice.kind}`,
        );

    return translated ===
        `notifications.kind.${notice.kind}`
        ? notice.kind.replaceAll('_', ' ')
        : translated;
}

function categoryTitle(
    category: Notice['category'],
    ar: boolean,
): string {
    const values: Record<
        Notice['category'],
        [string, string]
    > = {
        stock: ['المخزون', 'Stock'],
        payments: ['المدفوعات', 'Payments'],
        activity: ['النشاط والقرارات', 'Activity & decisions'],
        messages: ['الرسائل', 'Messages'],
    };

    return ar
        ? values[category][0]
        : values[category][1];
}

function categoryIcon(
    category: Notice['category'],
) {
    if (category === 'stock') {
        return Package;
    }

    if (category === 'payments') {
        return CalendarClock;
    }

    if (category === 'messages') {
        return Bell;
    }

    return CircleCheck;
}

export default function Notifications() {
    const { workspace } =
        usePage<AppPageProps>().props;

    return (
        <NotificationWorkspace
            key={
                workspace
                    .activeOrganization
                    ?.id
                ?? 'none'
            }
        />
    );
}

function NotificationWorkspace() {
    const locale = useLocale();
    const ar = locale === 'ar';
    const [unread, setUnread] =
        useState(false);
    const [category, setCategory] =
        useState('');
    const [page, setPage] =
        useState(1);
    const [revision, setRevision] =
        useState(0);
    const [result, setResult] =
        useState<{
            data: Notice[];
            meta: {
                last_page: number;
                total: number;
            };
        } | null>(null);
    const [digest, setDigest] =
        useState<Digest | null>(null);
    const [showIndividual, setShowIndividual] =
        useState(false);
    const [loading, setLoading] =
        useState(true);
    const [busy, setBusy] =
        useState(false);
    const [error, setError] =
        useState('');

    useEffect(() => {
        const controller =
            new AbortController();

        setLoading(true);
        setError('');

        Promise.all([
            apiRequest<NonNullable<typeof result>>(
                `/api/notifications?page=${page}&unread=${unread ? 1 : 0}${category ? `&category=${category}` : ''}`,
                {
                    signal:
                        controller.signal,
                },
            ),
            apiRequest<{
                data: Digest;
            }>(
                '/api/notifications/digest',
                {
                    signal:
                        controller.signal,
                },
            ),
        ])
            .then(
                ([
                    notifications,
                    digestResponse,
                ]) => {
                    setResult(
                        notifications,
                    );
                    setDigest(
                        digestResponse.data,
                    );
                },
            )
            .catch(
                (
                    failure: unknown,
                ) => {
                    if (
                        ! controller
                            .signal
                            .aborted
                    ) {
                        setError(
                            failure instanceof ApiError
                                ? failure.message
                                : t(
                                    'catalog.operations.failed',
                                ),
                        );
                    }
                },
            )
            .finally(() => {
                if (
                    ! controller
                        .signal
                        .aborted
                ) {
                    setLoading(false);
                }
            });

        return () =>
            controller.abort();
    }, [
        unread,
        category,
        page,
        revision,
    ]);

    async function openDigest(
        id: number,
        url: string,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                `/api/notifications/${id}/read`,
                {
                    method: 'PATCH',
                },
            );
            window.dispatchEvent(
                new Event(
                    'notifications-changed',
                ),
            );
            router.visit(url);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'catalog.operations.failed',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function read(
        notice?: Notice,
        open = false,
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                notice
                    ? `/api/notifications/${notice.id}/read`
                    : '/api/notifications/read-all',
                {
                    method:
                        notice
                            ? 'PATCH'
                            : 'POST',
                },
            );

            window.dispatchEvent(
                new Event(
                    'notifications-changed',
                ),
            );

            if (
                open
                && notice
            ) {
                router.visit(
                    notice.url,
                );
            } else {
                setRevision(
                    value =>
                        value + 1,
                );
            }
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : t(
                        'catalog.operations.failed',
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <Head
                title={
                    t(
                        'notifications.title',
                    )
                }
            />

            <main className="mx-auto min-h-[calc(100dvh-72px)] max-w-6xl bg-[var(--ac-bg)] px-4 py-8 text-[var(--ac-text)] sm:px-8">
                <header className="flex flex-wrap items-center justify-between gap-6 rounded-[28px] border border-[var(--ac-line)] bg-gradient-to-br from-[var(--ac-surface)] via-[var(--ac-surface)] to-[var(--ac-accent-soft)] p-6 shadow-sm sm:p-9">
                    <div className="flex items-center gap-4">
                        <div className="flex size-14 items-center justify-center rounded-2xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <Bell
                                size={25}
                            />
                        </div>

                        <div>
                            <h1 className="text-3xl font-semibold tracking-tight">
                                {t(
                                    'notifications.title',
                                )}
                            </h1>
                            <p className="mt-2 text-xs leading-6 text-[var(--ac-text-muted)]">
                                {t(
                                    'notifications.help',
                                )}
                            </p>
                        </div>
                    </div>

                    <button
                        disabled={
                            busy
                            || loading
                            || ! digest
                                ?.total_unread
                        }
                        onClick={() =>
                            void read()
                        }
                        className={
                            button
                            + ' flex items-center gap-2'
                        }
                    >
                        <CheckCheck
                            size={15}
                        />
                        {t(
                            'notifications.readAll',
                        )}
                    </button>
                </header>

                {digest
                && digest.total_unread
                    > 0 && (
                    <section className="mt-6 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2">
                                    <Layers3
                                        size={15}
                                        className="text-[var(--ac-accent)]"
                                    />
                                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                        Smart Digest
                                    </p>
                                </div>
                                <h2 className="mt-1 text-lg font-bold text-[var(--ac-text)]">
                                    {ar
                                        ? `${digest.total_unread} تنبيه غير مقروء، مجمّعة بدل عرضها كضجيج منفصل`
                                        : `${digest.total_unread} unread alerts, grouped instead of shown as separate noise`}
                                </h2>
                                <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'ملخص آخر 7 أيام غير المقروءة حسب المجال والنوع.'
                                        : 'A digest of unread notifications from the last 7 days, grouped by category and kind.'}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={() =>
                                    setShowIndividual(
                                        value =>
                                            ! value,
                                    )
                                }
                                className={button}
                            >
                                {showIndividual
                                    ? (
                                        ar
                                            ? 'إخفاء التفاصيل'
                                            : 'Hide individual alerts'
                                    )
                                    : (
                                        ar
                                            ? 'عرض الإشعارات الفردية'
                                            : 'Show individual alerts'
                                    )}
                            </button>
                        </div>

                        <div className="mt-4 grid items-start gap-3 md:grid-cols-2">
                            {digest.groups.map(
                                group => {
                                    const Icon =
                                        categoryIcon(
                                            group.category,
                                        );

                                    return (
                                        <article
                                            key={
                                                group.category
                                            }
                                            className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4"
                                        >
                                            <div className="flex items-center justify-between gap-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--ac-line)] text-[var(--ac-accent)]">
                                                        <Icon
                                                            size={14}
                                                        />
                                                    </span>
                                                    <strong className="text-xs text-[var(--ac-text)]">
                                                        {categoryTitle(
                                                            group.category,
                                                            ar,
                                                        )}
                                                    </strong>
                                                </div>
                                                <strong className="text-xl text-[var(--ac-accent)]">
                                                    {
                                                        group.count
                                                    }
                                                </strong>
                                            </div>

                                            <div className="mt-3 flex flex-wrap gap-1.5">
                                                {group.kinds.map(
                                                    item => (
                                                        <span
                                                            key={
                                                                item.kind
                                                            }
                                                            className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 py-1 text-[8px] text-[var(--ac-text-soft)]"
                                                        >
                                                            {noticeTitle(
                                                                {
                                                                    kind:
                                                                        item.kind,
                                                                },
                                                                ar,
                                                            )}
                                                            {' · '}
                                                            {
                                                                item.count
                                                            }
                                                        </span>
                                                    ),
                                                )}
                                            </div>

                                            {group.latest.length
                                                > 0 && (
                                                <div className="mt-3 divide-y divide-[var(--ac-line)] overflow-hidden rounded-[12px] border border-[var(--ac-line)]">
                                                    {group.latest.map(
                                                        item => (
                                                            <button
                                                                key={
                                                                    item.id
                                                                }
                                                                type="button"
                                                                disabled={busy}
                                                                onClick={() =>
                                                                    void openDigest(
                                                                        item.id,
                                                                        item.url,
                                                                    )
                                                                }
                                                                className="flex w-full items-start justify-between gap-3 bg-[var(--ac-surface)] px-3 py-2.5 text-start transition hover:bg-[var(--ac-bg)]"
                                                            >
                                                                <span className="min-w-0">
                                                                    <strong className="block truncate text-[9px] text-[var(--ac-text)]">
                                                                        {
                                                                            item.data
                                                                                .name
                                                                        }
                                                                    </strong>
                                                                    <span className="mt-0.5 block truncate text-[8px] text-[var(--ac-text-muted)]">
                                                                        {noticeTitle(
                                                                            {
                                                                                kind:
                                                                                    item.kind,
                                                                            },
                                                                            ar,
                                                                        )}
                                                                    </span>
                                                                </span>
                                                                <ArrowUpRight
                                                                    size={12}
                                                                    className="shrink-0 text-[var(--ac-text-muted)]"
                                                                />
                                                            </button>
                                                        ),
                                                    )}
                                                </div>
                                            )}
                                        </article>
                                    );
                                },
                            )}
                        </div>
                    </section>
                )}

                {(showIndividual
                    || ! digest
                    || digest.total_unread === 0) && (
                    <>
                    <div className="my-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                        <div className="flex gap-1 rounded-xl bg-[var(--ac-surface-soft)] p-1">
                            {[
                                false,
                                true,
                            ].map(
                                value => (
                                    <button
                                        key={
                                            String(
                                                value,
                                            )
                                        }
                                        aria-pressed={
                                            unread
                                            === value
                                        }
                                        onClick={() => {
                                            setUnread(
                                                value,
                                            );
                                            setPage(
                                                1,
                                            );
                                        }}
                                        className={[
                                            'rounded-lg px-4 py-2 text-sm',
                                            unread
                                            === value
                                                ? 'bg-[var(--ac-text)] font-semibold text-[var(--ac-bg)] shadow-sm'
                                                : 'text-[var(--ac-text-muted)]',
                                        ].join(' ')}
                                    >
                                        {t(
                                            value
                                                ? 'notifications.unread'
                                                : 'notifications.all',
                                        )}
                                    </button>
                                ),
                            )}
                        </div>
    
                        <div className="flex flex-wrap gap-2">
                            {([
                                '',
                                'stock',
                                'payments',
                                'activity',
                                'messages',
                            ] as const).map(
                                value => {
                                    const Icon =
                                        value
                                        === 'stock'
                                            ? Package
                                            : value
                                            === 'payments'
                                                ? CalendarClock
                                                : value
                                                === 'activity'
                                                    ? CircleCheck
                                                    : Bell;
    
                                    return (
                                        <button
                                            key={
                                                value
                                            }
                                            aria-pressed={
                                                category
                                                === value
                                            }
                                            onClick={() => {
                                                setCategory(
                                                    value,
                                                );
                                                setPage(
                                                    1,
                                                );
                                            }}
                                            className={[
                                                'flex items-center gap-2 rounded-full border px-4 py-2.5 text-xs transition',
                                                category
                                                === value
                                                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] font-semibold text-[var(--ac-accent-strong)]'
                                                    : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]',
                                            ].join(' ')}
                                        >
                                            <Icon
                                                size={14}
                                            />
                                            {t(
                                                value
                                                    ? `notifications.${value}`
                                                    : 'notifications.all',
                                            )}
                                        </button>
                                    );
                                },
                            )}
                        </div>
                    </div>
    
                    {error && (
                        <div
                            role="alert"
                            className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-300"
                        >
                            <span>
                                {error}
                            </span>
                            <button
                                className={button}
                                onClick={() =>
                                    setRevision(
                                        value =>
                                            value
                                            + 1,
                                    )
                                }
                            >
                                {t(
                                    'catalog.operations.retry',
                                )}
                            </button>
                        </div>
                    )}
    
                    {loading ? (
                        <p
                            role="status"
                            className="py-12 text-center text-sm text-[var(--ac-text-muted)]"
                        >
                            {t(
                                'catalog.operations.loading',
                            )}
                        </p>
                    ) : error ? null : ! result
                        ?.data.length ? (
                        <SmartEmptyState
                            icon={
                                CircleCheck
                            }
                            title={
                                t(
                                    'notifications.empty',
                                )
                            }
                            description={
                                t(
                                    'notifications.emptyHelp',
                                )
                            }
                            secondary={
                                unread
                                || category
                                    ? (
                                        <button
                                            type="button"
                                            className={
                                                button
                                            }
                                            onClick={() => {
                                                setUnread(
                                                    false,
                                                );
                                                setCategory(
                                                    '',
                                                );
                                                setPage(
                                                    1,
                                                );
                                            }}
                                        >
                                            {ar
                                                ? 'عرض كل الإشعارات'
                                                : 'Show all notifications'}
                                        </button>
                                    )
                                    : undefined
                            }
                        />
                    ) : (
                        <ul className="space-y-3">
                            {result.data.map(
                                notice => {
                                    const Icon =
                                        categoryIcon(
                                            notice.category,
                                        );
    
                                    return (
                                        <li
                                            key={
                                                notice.id
                                            }
                                            className={[
                                                'rounded-2xl border bg-[var(--ac-surface)] p-5 transition hover:bg-[var(--ac-surface-soft)] hover:shadow-md sm:p-6',
                                                notice.read_at
                                                    ? 'border-[var(--ac-line)]'
                                                    : 'border-[var(--ac-accent)]/35 shadow-sm',
                                            ].join(' ')}
                                        >
                                            <div className="flex items-start gap-3 sm:gap-4">
                                                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                                    <Icon
                                                        size={19}
                                                    />
                                                </span>
    
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <h2 className="flex items-center gap-2 text-sm font-semibold">
                                                            {! notice
                                                                .read_at && (
                                                                <span className="size-2 shrink-0 rounded-full bg-[var(--ac-accent)]" />
                                                            )}
                                                            {noticeTitle(
                                                                notice,
                                                                ar,
                                                            )}
                                                        </h2>
                                                        <time
                                                            dateTime={
                                                                notice.created_at
                                                            }
                                                            className="text-[11px] text-[var(--ac-text-muted)]"
                                                        >
                                                            {new Date(
                                                                notice.created_at,
                                                            ).toLocaleString(
                                                                getLocale(),
                                                            )}
                                                        </time>
                                                    </div>
    
                                                    <p className="mt-2 break-words text-sm">
                                                        {
                                                            notice.data
                                                                .name
                                                        }
                                                    </p>
    
                                                    {notice.data
                                                        .detail && (
                                                        <p className="mt-1 break-words text-xs text-[var(--ac-text-muted)]">
                                                            {
                                                                notice.data
                                                                    .detail
                                                            }
                                                        </p>
                                                    )}
    
                                                    {notice.data
                                                        .amount && (
                                                        <p className="mt-2 text-sm font-medium">
                                                            <bdi>
                                                                {
                                                                    notice.data
                                                                        .amount
                                                                }
                                                            </bdi>
                                                        </p>
                                                    )}
    
                                                    <div className="mt-4 flex flex-wrap gap-2">
                                                        <button
                                                            disabled={
                                                                busy
                                                            }
                                                            className={
                                                                button
                                                                + ' flex items-center gap-1'
                                                            }
                                                            onClick={() =>
                                                                void read(
                                                                    notice,
                                                                    true,
                                                                )
                                                            }
                                                        >
                                                            {t(
                                                                'notifications.open',
                                                            )}
                                                            <ArrowUpRight
                                                                size={14}
                                                            />
                                                        </button>
    
                                                        {! notice
                                                            .read_at && (
                                                            <button
                                                                disabled={
                                                                    busy
                                                                }
                                                                className={
                                                                    button
                                                                    + ' flex items-center gap-1'
                                                                }
                                                                onClick={() =>
                                                                    void read(
                                                                        notice,
                                                                    )
                                                                }
                                                            >
                                                                <Check
                                                                    size={14}
                                                                />
                                                                {t(
                                                                    'notifications.read',
                                                                )}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                },
                            )}
                        </ul>
                    )}
    
                    {! error
                    && result
                    && result.meta
                        .last_page > 1 && (
                        <div className="mt-6 flex items-center justify-between">
                            <button
                                className={
                                    button
                                }
                                disabled={
                                    loading
                                    || page <= 1
                                }
                                onClick={() =>
                                    setPage(
                                        value =>
                                            value - 1,
                                    )
                                }
                            >
                                {t(
                                    'catalog.operations.previous',
                                )}
                            </button>
                            <span className="text-xs">
                                {page}
                                {' / '}
                                {
                                    result.meta
                                        .last_page
                                }
                            </span>
                            <button
                                className={
                                    button
                                }
                                disabled={
                                    loading
                                    || page
                                    >= result.meta
                                        .last_page
                                }
                                onClick={() =>
                                    setPage(
                                        value =>
                                            value + 1,
                                    )
                                }
                            >
                                {t(
                                    'catalog.operations.next',
                                )}
                            </button>
                        </div>
                    )}
                    </>
                )}
            </main>
        </AppShell>
    );
}
