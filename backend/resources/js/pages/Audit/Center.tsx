import { AppShell } from '@/layouts/AppShell';
import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    ArrowRight,
    RefreshCcw,
    Search,
    ShieldCheck,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type Diff = {
    field: string;
    before: unknown;
    after: unknown;
};

type AuditRow = {
    id: number;
    auditable_type: string;
    auditable_id: number;
    record_label: string;
    action: string;
    reason: string | null;
    created_by: number | null;
    created_by_name: string | null;
    created_at: string;
    url: string | null;
    diff: Diff[];
};

type AuditResponse = {
    data: AuditRow[];
    filters: {
        users: Array<{
            id: number;
            name: string;
        }>;
        types: string[];
        actions: string[];
    };
};

function valueText(
    value: unknown,
): string {
    if (
        value === null
        || value === undefined
        || value === ''
    ) {
        return '—';
    }

    return String(value);
}

export default function AuditCenter() {
    const ar =
        useLocale() === 'ar';

    const [
        rows,
        setRows,
    ] = useState<AuditRow[]>([]);
    const [
        users,
        setUsers,
    ] = useState<
        AuditResponse['filters']['users']
    >([]);
    const [
        userId,
        setUserId,
    ] = useState('');
    const [
        search,
        setSearch,
    ] = useState('');
    const [
        from,
        setFrom,
    ] = useState('');
    const [
        to,
        setTo,
    ] = useState('');
    const [
        loading,
        setLoading,
    ] = useState(true);
    const [
        error,
        setError,
    ] = useState('');

    const load =
        async (): Promise<void> => {
            setLoading(true);
            setError('');

            const params =
                new URLSearchParams();

            if (userId) {
                params.set(
                    'user_id',
                    userId,
                );
            }

            if (search.trim()) {
                params.set(
                    'search',
                    search.trim(),
                );
            }

            if (from) {
                params.set(
                    'from',
                    from,
                );
            }

            if (to) {
                params.set(
                    'to',
                    to,
                );
            }

            try {
                const response =
                    await apiRequest<AuditResponse>(
                        '/api/audit-center'
                        + (
                            params.size
                                ? '?'
                                    + params.toString()
                                : ''
                        ),
                    );

                setRows(
                    response.data,
                );
                setUsers(
                    response.filters.users,
                );
            } catch (failure) {
                setError(
                    failure instanceof ApiError
                        ? failure.message
                        : (
                            ar
                                ? 'تعذر تحميل سجل التدقيق.'
                                : 'Could not load the audit trail.'
                        ),
                );
            } finally {
                setLoading(false);
            }
        };

    useEffect(() => {
        void load();
    }, []);

    const changedFields =
        useMemo(
            () =>
                rows.reduce(
                    (sum, row) =>
                        sum
                        + row.diff.length,
                    0,
                ),
            [rows],
        );

    return (
        <AppShell>
            <Head
                title={
                    ar
                        ? 'مركز التدقيق'
                        : 'Audit center'
                }
            />

            <main
                dir={
                    ar
                        ? 'rtl'
                        : 'ltr'
                }
                className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 lg:px-8"
            >
                <section className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                Audit
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {ar
                                    ? 'مركز التدقيق — من غيّر ماذا؟'
                                    : 'Audit center — who changed what?'}
                            </h1>
                            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'يعرض التغييرات المدققة مع القيمة قبل وبعد، المستخدم، الوقت، والسبب عندما يكون موجوداً.'
                                    : 'Review audited changes with before/after values, actor, time and reason when available.'}
                            </p>
                        </div>

                        <div className="flex flex-wrap gap-2">
                            <Link
                                href="/app/audit/bulk-actions"
                                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                            >
                                {ar
                                    ? 'العمليات الجماعية'
                                    : 'Bulk actions'}
                                <ArrowRight
                                    size={13}
                                    className={
                                        ar
                                            ? 'rotate-180'
                                            : ''
                                    }
                                />
                            </Link>

                            <button
                                type="button"
                                onClick={() =>
                                    void load()
                                }
                                disabled={loading}
                                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-50"
                            >
                                <RefreshCcw
                                    size={14}
                                />
                                {ar
                                    ? 'تحديث'
                                    : 'Refresh'}
                            </button>
                        </div>
                    </div>
                </section>

                <section className="mt-4 grid gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto]">
                    <label className="relative">
                        <Search
                            size={14}
                            className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                        />
                        <input
                            value={search}
                            onChange={
                                event =>
                                    setSearch(
                                        event.target.value,
                                    )
                            }
                            onKeyDown={
                                event => {
                                    if (
                                        event.key
                                        === 'Enter'
                                    ) {
                                        void load();
                                    }
                                }
                            }
                            placeholder={
                                ar
                                    ? 'ابحث بالإجراء أو السبب أو اسم المستخدم...'
                                    : 'Search action, reason or user...'
                            }
                            className="h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] ps-9 pe-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />
                    </label>

                    <select
                        value={userId}
                        onChange={
                            event =>
                                setUserId(
                                    event.target.value,
                                )
                        }
                        className="h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    >
                        <option value="">
                            {ar
                                ? 'كل المستخدمين'
                                : 'All users'}
                        </option>
                        {users.map(
                            user => (
                                <option
                                    key={
                                        user.id
                                    }
                                    value={
                                        user.id
                                    }
                                >
                                    {
                                        user.name
                                    }
                                </option>
                            ),
                        )}
                    </select>

                    <input
                        type="date"
                        value={from}
                        onChange={
                            event =>
                                setFrom(
                                    event.target.value,
                                )
                        }
                        className="h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        title={
                            ar
                                ? 'من تاريخ'
                                : 'From date'
                        }
                    />

                    <input
                        type="date"
                        value={to}
                        onChange={
                            event =>
                                setTo(
                                    event.target.value,
                                )
                        }
                        className="h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        title={
                            ar
                                ? 'إلى تاريخ'
                                : 'To date'
                        }
                    />

                    <button
                        type="button"
                        onClick={() =>
                            void load()
                        }
                        disabled={loading}
                        className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[var(--ac-accent)] px-4 text-xs font-bold text-[var(--ac-accent)] disabled:opacity-50"
                    >
                        {ar
                            ? 'تطبيق'
                            : 'Apply'}
                    </button>
                </section>

                {error && (
                    <div
                        role="alert"
                        className="mt-4 rounded-[14px] border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-300"
                    >
                        {error}
                    </div>
                )}

                {! loading
                    && (
                        <section className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'أحداث التدقيق'
                                        : 'Audit events'}
                                </p>
                                <p className="mt-2 text-xl font-bold text-[var(--ac-text)]">
                                    {rows.length}
                                </p>
                            </div>
                            <div className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                    {ar
                                        ? 'حقول تغيرت'
                                        : 'Changed fields'}
                                </p>
                                <p className="mt-2 text-xl font-bold text-[var(--ac-text)]">
                                    {changedFields}
                                </p>
                            </div>
                        </section>
                    )}

                <section className="mt-5 space-y-3">
                    {loading ? (
                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar
                                ? 'جارٍ التحميل…'
                                : 'Loading…'}
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar
                                ? 'لا توجد أحداث مطابقة.'
                                : 'No matching audit events.'}
                        </div>
                    ) : (
                        rows.map(
                            row => (
                                <article
                                    key={
                                        row.id
                                    }
                                    className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div>
                                            <div className="flex flex-wrap items-center gap-2">
                                                <ShieldCheck
                                                    size={15}
                                                    className="text-[var(--ac-accent)]"
                                                />
                                                <strong className="text-sm text-[var(--ac-text)]">
                                                    {
                                                        row.action
                                                    }
                                                </strong>
                                                <span className="rounded-full border border-[var(--ac-line)] px-2 py-0.5 text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                                    {
                                                        row.auditable_type
                                                    }
                                                    {' · '}
                                                    {
                                                        row.record_label
                                                    }
                                                </span>
                                            </div>
                                            <p className="mt-2 text-[10px] text-[var(--ac-text-muted)]">
                                                {row.created_by_name
                                                    || (
                                                        ar
                                                            ? 'النظام'
                                                            : 'System'
                                                    )}
                                                {' · '}
                                                {
                                                    row.created_at
                                                }
                                            </p>
                                            {row.reason && (
                                                <p className="mt-2 text-xs leading-5 text-[var(--ac-text-soft)]">
                                                    {
                                                        row.reason
                                                    }
                                                </p>
                                            )}
                                        </div>

                                        {row.url && (
                                            <Link
                                                href={
                                                    row.url
                                                }
                                                className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                                            >
                                                <ArrowRight
                                                    size={12}
                                                />
                                                {ar
                                                    ? 'فتح السجل'
                                                    : 'Open record'}
                                            </Link>
                                        )}
                                    </div>

                                    {row.diff.length > 0 && (
                                        <div className="mt-4 overflow-x-auto">
                                            <table className="w-full min-w-[680px] border-separate border-spacing-y-1 text-start text-[10px]">
                                                <thead>
                                                    <tr className="text-[var(--ac-text-muted)]">
                                                        <th className="px-3 py-2 text-start">
                                                            {ar
                                                                ? 'الحقل'
                                                                : 'Field'}
                                                        </th>
                                                        <th className="px-3 py-2 text-start">
                                                            {ar
                                                                ? 'قبل'
                                                                : 'Before'}
                                                        </th>
                                                        <th className="px-3 py-2 text-start">
                                                            {ar
                                                                ? 'بعد'
                                                                : 'After'}
                                                        </th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {row.diff.map(
                                                        (
                                                            diff,
                                                            index,
                                                        ) => (
                                                            <tr
                                                                key={
                                                                    diff.field
                                                                    + index
                                                                }
                                                                className="bg-[var(--ac-surface-soft)]"
                                                            >
                                                                <td className="rounded-s-[10px] px-3 py-2 font-semibold text-[var(--ac-text)]">
                                                                    {
                                                                        diff.field
                                                                    }
                                                                </td>
                                                                <td className="max-w-[420px] whitespace-pre-wrap break-all px-3 py-2 text-red-300">
                                                                    {
                                                                        valueText(
                                                                            diff.before,
                                                                        )
                                                                    }
                                                                </td>
                                                                <td className="max-w-[420px] whitespace-pre-wrap break-all rounded-e-[10px] px-3 py-2 text-emerald-300">
                                                                    {
                                                                        valueText(
                                                                            diff.after,
                                                                        )
                                                                    }
                                                                </td>
                                                            </tr>
                                                        ),
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </article>
                            ),
                        )
                    )}
                </section>
            </main>
        </AppShell>
    );
}
