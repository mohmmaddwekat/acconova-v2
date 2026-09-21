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
    router,
} from '@inertiajs/react';
import {
    ArchiveRestore,
    RefreshCcw,
    Search,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type RestoreItem = {
    type:
        | 'party'
        | 'product'
        | 'warehouse';
    id: number;
    name: string;
    detail?: string | null;
    deleted_at: string | null;
    source_url: string;
};

export default function RestoreCenter() {
    const ar =
        useLocale() === 'ar';
    const [
        items,
        setItems,
    ] = useState<RestoreItem[]>([]);
    const [
        search,
        setSearch,
    ] = useState('');
    const [
        type,
        setType,
    ] = useState('');
    const [
        loading,
        setLoading,
    ] = useState(true);
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        error,
        setError,
    ] = useState('');

    const load =
        async (): Promise<void> => {
            setLoading(true);
            setError('');

            try {
                const response =
                    await apiRequest<{
                        data: RestoreItem[];
                    }>(
                        '/api/restore-center',
                    );

                setItems(
                    response.data,
                );
            } catch (failure) {
                setError(
                    failure instanceof ApiError
                        ? failure.message
                        : (
                            ar
                                ? 'تعذر تحميل السجلات المؤرشفة.'
                                : 'Could not load archived records.'
                        ),
                );
            } finally {
                setLoading(false);
            }
        };

    useEffect(() => {
        void load();
    }, []);

    const filtered =
        useMemo(
            () => {
                const needle =
                    search
                        .trim()
                        .toLowerCase();

                return items.filter(
                    item =>
                        (
                            ! type
                            || item.type
                                === type
                        )
                        && (
                            ! needle
                            || JSON.stringify(
                                item,
                            )
                                .toLowerCase()
                                .includes(
                                    needle,
                                )
                        ),
                );
            },
            [
                items,
                search,
                type,
            ],
        );

    async function restore(
        item: RestoreItem,
    ): Promise<void> {
        if (
            ! window.confirm(
                ar
                    ? 'استرجاع هذا السجل إلى النظام؟'
                    : 'Restore this record to the workspace?',
            )
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: {
                        url?: string;
                    };
                }>(
                    '/api/restore-center/'
                    + item.type
                    + '/'
                    + String(
                        item.id,
                    ),
                    {
                        method: 'POST',
                    },
                );

            await load();

            if (
                response.data.url
                && window.confirm(
                    ar
                        ? 'تم الاسترجاع. فتح السجل الآن؟'
                        : 'Restored. Open the record now?',
                )
            ) {
                router.visit(
                    response.data.url,
                );
            }
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر استرجاع السجل.'
                            : 'Could not restore the record.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    const typeLabel = (
        value: RestoreItem['type'],
    ): string => {
        const labels = {
            party: ar
                ? 'عميل / مورد'
                : 'Party',
            product: ar
                ? 'منتج'
                : 'Product',
            warehouse: ar
                ? 'مستودع'
                : 'Warehouse',
        };

        return labels[value];
    };

    return (
        <AppShell>
            <Head
                title={
                    ar
                        ? 'مركز الاسترجاع'
                        : 'Restore center'
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
                                Admin
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {ar
                                    ? 'Undo / Restore Center'
                                    : 'Undo / Restore Center'}
                            </h1>
                            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'استرجع العملاء والمنتجات والمستودعات المؤرشفة من شاشة واحدة. للتغييرات المالية استخدم مركز التدقيق والتصحيح بدلاً من حذف التاريخ.'
                                    : 'Restore archived parties, products and warehouses from one place. For finance changes, use the audit and correction workflow instead of deleting history.'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() =>
                                void load()
                            }
                            disabled={
                                loading
                                || busy
                            }
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
                </section>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-300">
                        {error}
                    </div>
                )}

                <section className="mt-4 flex flex-wrap items-center gap-2 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3">
                    <div className="relative min-w-[220px] flex-1">
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
                            placeholder={
                                ar
                                    ? 'ابحث في السجلات المؤرشفة...'
                                    : 'Search archived records...'
                            }
                            className="h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] ps-9 pe-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />
                    </div>

                    <select
                        value={type}
                        onChange={
                            event =>
                                setType(
                                    event.target.value,
                                )
                        }
                        className="h-10 min-w-40 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    >
                        <option value="">
                            {ar
                                ? 'كل الأنواع'
                                : 'All types'}
                        </option>
                        <option value="party">
                            {ar
                                ? 'عملاء / موردون'
                                : 'Parties'}
                        </option>
                        <option value="product">
                            {ar
                                ? 'منتجات'
                                : 'Products'}
                        </option>
                        <option value="warehouse">
                            {ar
                                ? 'مستودعات'
                                : 'Warehouses'}
                        </option>
                    </select>

                    <Link
                        href="/app/audit"
                        className="inline-flex h-10 items-center rounded-[12px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                    >
                        {ar
                            ? 'التغييرات والتدقيق'
                            : 'Changes & audit'}
                    </Link>
                </section>

                <section className="mt-5 space-y-3">
                    {loading ? (
                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar
                                ? 'جارٍ التحميل…'
                                : 'Loading…'}
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar
                                ? 'لا توجد سجلات مؤرشفة مطابقة.'
                                : 'No matching archived records.'}
                        </div>
                    ) : (
                        filtered.map(
                            item => (
                                <article
                                    key={
                                        item.type
                                        + ':'
                                        + item.id
                                    }
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]"
                                >
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <ArchiveRestore
                                                size={15}
                                                className="text-[var(--ac-accent)]"
                                            />
                                            <strong className="text-sm text-[var(--ac-text)]">
                                                {
                                                    item.name
                                                }
                                            </strong>
                                            <span className="rounded-full border border-[var(--ac-line)] px-2 py-0.5 text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                                {typeLabel(
                                                    item.type,
                                                )}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-[10px] text-[var(--ac-text-muted)]">
                                            {item.detail
                                                ? item.detail
                                                    + ' · '
                                                : ''}
                                            {ar
                                                ? 'أُرشف: '
                                                : 'Archived: '}
                                            {item.deleted_at
                                                || '—'}
                                        </p>
                                    </div>

                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() =>
                                            void restore(
                                                item,
                                            )
                                        }
                                        className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-3 text-[10px] font-semibold text-[var(--ac-accent)] disabled:opacity-40"
                                    >
                                        <ArchiveRestore
                                            size={12}
                                        />
                                        {ar
                                            ? 'استرجاع'
                                            : 'Restore'}
                                    </button>
                                </article>
                            ),
                        )
                    )}
                </section>
            </main>
        </AppShell>
    );
}
