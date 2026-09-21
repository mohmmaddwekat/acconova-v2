import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { Head } from '@inertiajs/react';
import { Boxes, RefreshCcw, UsersRound } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type BulkHistoryRow = {
    id: number;
    entity_type: 'party' | 'product';
    action: 'bulk_archive' | 'bulk_restore' | 'bulk_edit';
    record_count: number;
    record_ids: number[];
    changes: Record<string, unknown> | null;
    user_id: number | null;
    user_name: string | null;
    created_at: string;
};

type Response = {
    data: BulkHistoryRow[];
    filters: {
        users: Array<{
            id: number;
            name: string;
        }>;
    };
};

const control =
    'h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';

function actionLabel(
    action: BulkHistoryRow['action'],
    ar: boolean,
): string {
    if (action === 'bulk_archive') {
        return ar ? 'أرشفة جماعية' : 'Bulk archive';
    }

    if (action === 'bulk_restore') {
        return ar ? 'استعادة جماعية' : 'Bulk restore';
    }

    return ar ? 'تعديل جماعي' : 'Bulk edit';
}

export default function BulkActions() {
    const ar = useLocale() === 'ar';
    const [rows, setRows] = useState<BulkHistoryRow[]>([]);
    const [users, setUsers] = useState<Response['filters']['users']>([]);
    const [entityType, setEntityType] = useState('');
    const [action, setAction] = useState('');
    const [userId, setUserId] = useState('');
    const [from, setFrom] = useState('');
    const [to, setTo] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const load = async (): Promise<void> => {
        setLoading(true);
        setError('');

        const params = new URLSearchParams();

        if (entityType) {
            params.set('entity_type', entityType);
        }

        if (action) {
            params.set('action', action);
        }

        if (userId) {
            params.set('user_id', userId);
        }

        if (from) {
            params.set('from', from);
        }

        if (to) {
            params.set('to', to);
        }

        try {
            const response = await apiRequest<Response>(
                '/api/bulk-action-history'
                + (
                    params.size
                        ? '?' + params.toString()
                        : ''
                ),
            );

            setRows(response.data);
            setUsers(response.filters.users);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تحميل سجل العمليات الجماعية.'
                            : 'Could not load bulk action history.'
                    ),
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
    }, []);

    const touchedRecords = useMemo(
        () =>
            rows.reduce(
                (sum, row) =>
                    sum + row.record_count,
                0,
            ),
        [rows],
    );

    return (
        <AppShell>
            <Head
                title={
                    ar
                        ? 'سجل العمليات الجماعية'
                        : 'Bulk action history'
                }
            />

            <main
                dir={ar ? 'rtl' : 'ltr'}
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
                                    ? 'سجل العمليات الجماعية'
                                    : 'Bulk action history'}
                            </h1>
                            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'يعرض من نفذ الأرشفة أو الاستعادة أو التعديل الجماعي، متى حصل، وكم سجلاً تأثر.'
                                    : 'Track who performed bulk archive, restore or edit actions, when they happened and how many records were affected.'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading}
                            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40"
                        >
                            <RefreshCcw size={14} />
                            {ar ? 'تحديث' : 'Refresh'}
                        </button>
                    </div>
                </section>

                <section className="mt-4 grid gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
                    <select
                        value={entityType}
                        onChange={event => setEntityType(event.target.value)}
                        className={control}
                    >
                        <option value="">
                            {ar ? 'كل الأنواع' : 'All record types'}
                        </option>
                        <option value="party">
                            {ar ? 'العملاء والموردون' : 'Parties'}
                        </option>
                        <option value="product">
                            {ar ? 'المنتجات' : 'Products'}
                        </option>
                    </select>

                    <select
                        value={action}
                        onChange={event => setAction(event.target.value)}
                        className={control}
                    >
                        <option value="">
                            {ar ? 'كل العمليات' : 'All actions'}
                        </option>
                        <option value="bulk_archive">
                            {ar ? 'أرشفة جماعية' : 'Bulk archive'}
                        </option>
                        <option value="bulk_restore">
                            {ar ? 'استعادة جماعية' : 'Bulk restore'}
                        </option>
                        <option value="bulk_edit">
                            {ar ? 'تعديل جماعي' : 'Bulk edit'}
                        </option>
                    </select>

                    <select
                        value={userId}
                        onChange={event => setUserId(event.target.value)}
                        className={control}
                    >
                        <option value="">
                            {ar ? 'كل المستخدمين' : 'All users'}
                        </option>
                        {users.map(user => (
                            <option
                                key={user.id}
                                value={user.id}
                            >
                                {user.name}
                            </option>
                        ))}
                    </select>

                    <input
                        type="date"
                        value={from}
                        onChange={event => setFrom(event.target.value)}
                        className={control}
                        title={ar ? 'من تاريخ' : 'From date'}
                    />

                    <input
                        type="date"
                        value={to}
                        onChange={event => setTo(event.target.value)}
                        className={control}
                        title={ar ? 'إلى تاريخ' : 'To date'}
                    />

                    <button
                        type="button"
                        onClick={() => void load()}
                        disabled={loading}
                        className="inline-flex h-10 items-center justify-center rounded-[12px] border border-[var(--ac-accent)] px-4 text-xs font-bold text-[var(--ac-accent)] disabled:opacity-40"
                    >
                        {ar ? 'تطبيق' : 'Apply'}
                    </button>
                </section>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-300">
                        {error}
                    </div>
                )}

                {! loading && (
                    <section className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                            <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                {ar ? 'عمليات مسجلة' : 'Logged actions'}
                            </p>
                            <p className="mt-2 text-xl font-bold text-[var(--ac-text)]">
                                {rows.length}
                            </p>
                        </div>

                        <div className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
                            <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                {ar ? 'سجلات متأثرة' : 'Affected records'}
                            </p>
                            <p className="mt-2 text-xl font-bold text-[var(--ac-text)]">
                                {touchedRecords}
                            </p>
                        </div>
                    </section>
                )}

                <section className="mt-5 space-y-3">
                    {loading ? (
                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar ? 'جارٍ التحميل…' : 'Loading…'}
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar
                                ? 'لا توجد عمليات جماعية مطابقة.'
                                : 'No matching bulk actions.'}
                        </div>
                    ) : (
                        rows.map(row => {
                            const Icon =
                                row.entity_type === 'party'
                                    ? UsersRound
                                    : Boxes;

                            return (
                                <article
                                    key={row.id}
                                    className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]"
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div className="flex min-w-0 items-start gap-3">
                                            <span className="flex size-10 shrink-0 items-center justify-center rounded-[13px] border border-[var(--ac-line)] text-[var(--ac-accent)]">
                                                <Icon size={16} />
                                            </span>

                                            <div className="min-w-0">
                                                <strong className="text-sm text-[var(--ac-text)]">
                                                    {actionLabel(row.action, ar)}
                                                </strong>
                                                <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                                    {row.user_name ?? (ar ? 'مستخدم غير معروف' : 'Unknown user')}
                                                    {' · '}
                                                    {row.created_at}
                                                </p>
                                            </div>
                                        </div>

                                        <span className="rounded-full border border-[var(--ac-line)] px-3 py-1 text-[10px] font-semibold text-[var(--ac-text-soft)]">
                                            {row.record_count}
                                            {' '}
                                            {ar ? 'سجل' : 'records'}
                                        </span>
                                    </div>

                                    <div className="mt-4 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3">
                                        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                            {ar ? 'معرفات السجلات' : 'Record IDs'}
                                        </p>
                                        <p className="mt-1 break-words text-[10px] leading-5 text-[var(--ac-text-soft)]">
                                            {row.record_ids.join(', ') || '—'}
                                        </p>

                                        {row.changes && (
                                            <>
                                                <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                    {ar ? 'التغييرات' : 'Changes'}
                                                </p>
                                                <pre className="mt-1 overflow-auto text-[10px] leading-5 text-[var(--ac-text-soft)]">
                                                    {JSON.stringify(row.changes, null, 2)}
                                                </pre>
                                            </>
                                        )}
                                    </div>
                                </article>
                            );
                        })
                    )}
                </section>
            </main>
        </AppShell>
    );
}
