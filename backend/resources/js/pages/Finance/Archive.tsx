import { apiRequest } from '@/lib/http';
import { AppShell } from '@/layouts/AppShell';
import { useLocale } from '@/lib/i18n';
import {
    Head,
    Link,
} from '@inertiajs/react';
import {
    Archive as ArchiveIcon,
    Trash2,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type ArchiveRow = {
    type: 'document' | 'movement' | 'adjustment';
    party_id?: number;
    id: number;
    kind: 'sale_invoice' | 'purchase_invoice' | 'incoming' | 'outgoing' | 'adjustment';
    number: string;
    external_number: string | null;
    party: string | null;
    date: string | null;
    amount: string;
    status: 'superseded' | 'voided' | 'reversed';
    replaced_by: string | null;
    reason: string | null;
    archived_at: string | null;
};

type ArchiveResponse = {
    data: {
        documents: ArchiveRow[];
        movements: ArchiveRow[];
        adjustments?: ArchiveRow[];
    };
    auto_purge: boolean;
    can_delete: boolean;
};

type Filter = 'all' | 'sale_invoice' | 'purchase_invoice' | 'incoming' | 'outgoing' | 'adjustment';

/**
 * Old versions of invoices, receipts and payments: replaced by a correction,
 * voided or reversed. They are kept out of the normal lists and can be deleted here.
 */
export default function FinanceArchive() {
    const ar = useLocale() === 'ar';
    const text = (arabic: string, english: string): string => (ar ? arabic : english);

    const [rows, setRows] = useState<ArchiveRow[]>([]);
    const [autoPurge, setAutoPurge] = useState(false);
    const [canDelete, setCanDelete] = useState(false);
    const [filter, setFilter] = useState<Filter>('all');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const keyOf = (row: ArchiveRow): string => row.type + ':' + String(row.id);

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const response = await apiRequest<ArchiveResponse>('/api/finance/archive');
            setRows([...response.data.documents, ...response.data.movements, ...(response.data.adjustments ?? [])]);
            setAutoPurge(response.auto_purge);
            setCanDelete(response.can_delete);
            setSelected(new Set());
        } catch {
            setError(text('تعذر تحميل الأرشيف.', 'The archive could not be loaded.'));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    const visible = useMemo(
        () => rows.filter((row) => filter === 'all' || row.kind === filter),
        [rows, filter],
    );

    const counts = useMemo(() => {
        const result: Record<Filter, number> = { all: rows.length, sale_invoice: 0, purchase_invoice: 0, incoming: 0, outgoing: 0, adjustment: 0 };
        rows.forEach((row) => {
            result[row.kind] += 1;
        });

        return result;
    }, [rows]);

    const allVisibleSelected = visible.length > 0 && visible.every((row) => selected.has(keyOf(row)));

    function toggle(row: ArchiveRow): void {
        setSelected((current) => {
            const next = new Set(current);
            const key = keyOf(row);

            if (next.has(key)) {
                next.delete(key);
            } else {
                next.add(key);
            }

            return next;
        });
    }

    function toggleAllVisible(): void {
        setSelected((current) => {
            const next = new Set(current);
            visible.forEach((row) => (allVisibleSelected ? next.delete(keyOf(row)) : next.add(keyOf(row))));

            return next;
        });
    }

    async function deleteSelected(): Promise<void> {
        if (busy || selected.size === 0) {
            return;
        }

        if (! window.confirm(text(
            'حذف ' + String(selected.size) + ' سجل من الأرشيف نهائياً؟ لا يمكن التراجع عن الحذف. الأرصدة لا تتغير لأن هذه نسخ قديمة.',
            'Permanently delete ' + String(selected.size) + ' archived record(s)? This cannot be undone. Balances do not change because these are old versions.',
        ))) {
            return;
        }

        const chosen = rows.filter((row) => selected.has(keyOf(row)));
        setBusy(true);
        setError('');
        setNotice('');

        try {
            const response = await apiRequest<{ data: { documents: number; movements: number; adjustments?: number } }>('/api/finance/archive/delete', {
                method: 'POST',
                body: JSON.stringify({
                    documents: chosen.filter((row) => row.type === 'document').map((row) => row.id),
                    movements: chosen.filter((row) => row.type === 'movement').map((row) => row.id),
                    adjustments: chosen.filter((row) => row.type === 'adjustment').map((row) => row.id),
                }),
            });

            setNotice(text(
                'تم حذف ' + String(response.data.documents) + ' فاتورة و' + String(response.data.movements) + ' سند و' + String(response.data.adjustments ?? 0) + ' قيد فروقات.',
                'Deleted ' + String(response.data.documents) + ' invoice(s) and ' + String(response.data.movements) + ' cash record(s) and ' + String(response.data.adjustments ?? 0) + ' difference entr(ies).',
            ));
            await load();
        } catch (failure) {
            setError(failure instanceof Error && failure.message ? failure.message : text('تعذر الحذف.', 'Could not delete.'));
        } finally {
            setBusy(false);
        }
    }

    async function changeAutoPurge(enabled: boolean): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{ auto_purge: boolean }>('/api/finance/archive/settings', {
                method: 'PATCH',
                body: JSON.stringify({ auto_purge: enabled }),
            });
            setAutoPurge(response.auto_purge);
        } catch {
            setError(text('تعذر حفظ الإعداد.', 'The setting could not be saved.'));
        } finally {
            setBusy(false);
        }
    }

    const typeLabel = (row: ArchiveRow): string => ({
        sale_invoice: text('فاتورة بيع', 'Sales invoice'),
        purchase_invoice: text('فاتورة شراء', 'Purchase invoice'),
        incoming: text('مقبوض', 'Receipt'),
        outgoing: text('مدفوع', 'Payment'),
        adjustment: text('قيد فروقات', 'Difference entry'),
    })[row.kind];

    const statusLabel = (row: ArchiveRow): string => ({
        superseded: text('مستبدلة بتصحيح', 'Replaced by correction'),
        voided: text('ملغاة', 'Voided'),
        reversed: text('معكوسة بتصحيح', 'Reversed by correction'),
    })[row.status];

    const hrefOf = (row: ArchiveRow): string => row.type === 'adjustment'
        ? '/app/parties/' + String(row.party_id ?? '') + '/statement'
        : ({
        sale_invoice: '/app/invoices/sales/',
        purchase_invoice: '/app/invoices/purchases/',
        incoming: '/app/receipts/',
        outgoing: '/app/payments/',
        adjustment: '',
    })[row.kind] + String(row.id);

    const money = (value: string): string =>
        Number(value).toLocaleString(ar ? 'ar' : 'en', { maximumFractionDigits: 2 });

    const filters: Array<{ key: Filter; label: string }> = [
        { key: 'all', label: text('الكل', 'All') },
        { key: 'sale_invoice', label: text('فواتير البيع', 'Sales invoices') },
        { key: 'purchase_invoice', label: text('فواتير الشراء', 'Purchase invoices') },
        { key: 'incoming', label: text('المقبوضات', 'Receipts') },
        { key: 'outgoing', label: text('المدفوعات', 'Payments') },
        { key: 'adjustment', label: text('قيود الفروقات', 'Difference entries') },
    ];

    return (
        <AppShell>
            <Head title={text('الأرشيف المالي — AccoNova', 'Finance archive — AccoNova')} />

            <main className="mx-auto w-full max-w-[1500px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <ArchiveIcon size={18} />
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                                {text('الأرشيف المالي', 'Finance archive')}
                            </h1>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-soft)]">
                                {text(
                                    'لما تصحح فاتورة أو سند، النسخة القديمة بتنتقل لهون تلقائياً وبتختفي من القوائم. حذفها ما بيغيّر أي رصيد.',
                                    'When you correct an invoice or a cash record, the old version moves here and leaves the normal lists. Deleting it does not change any balance.',
                                )}
                            </p>
                        </div>
                    </div>

                    {canDelete && (
                        <label className="flex max-w-sm cursor-pointer items-start gap-3 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]">
                            <input
                                type="checkbox"
                                checked={autoPurge}
                                disabled={busy}
                                onChange={(event) => void changeAutoPurge(event.target.checked)}
                                className="mt-1 size-4 accent-[var(--ac-accent-strong)]"
                            />
                            <span>
                                <span className="block text-sm font-semibold">
                                    {text('حذف تلقائي كل شهر', 'Delete automatically every month')}
                                </span>
                                <span className="mt-1 block text-xs leading-5 text-[var(--ac-text-muted)]">
                                    {text(
                                        'مرة بالشهر بينحذف كل سجل صار له أكثر من شهر بالأرشيف.',
                                        'Once a month, records that have been archived for more than a month are deleted.',
                                    )}
                                </span>
                            </span>
                        </label>
                    )}
                </div>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</div>
                )}

                {notice && (
                    <div className="mt-4 rounded-[14px] border border-[var(--ac-success)]/30 bg-[var(--ac-success)]/10 px-4 py-3 text-xs text-[var(--ac-success)]">{notice}</div>
                )}

                <section className="mt-6 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]">
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ac-line)] p-4">
                        <div className="flex flex-wrap gap-1.5" role="tablist">
                            {filters.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    role="tab"
                                    aria-selected={filter === item.key}
                                    onClick={() => setFilter(item.key)}
                                    className={[
                                        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition',
                                        filter === item.key
                                            ? 'border-transparent bg-[var(--ac-text)] text-[var(--ac-surface)]'
                                            : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
                                    ].join(' ')}
                                >
                                    {item.label}
                                    <span className="tabular-nums opacity-70">{counts[item.key]}</span>
                                </button>
                            ))}
                        </div>

                        {canDelete && (
                            <button
                                type="button"
                                disabled={busy || selected.size === 0}
                                onClick={() => void deleteSelected()}
                                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-red-200 bg-red-50 px-4 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <Trash2 size={14} />
                                {text('حذف المحدد', 'Delete selected')}
                                {selected.size > 0 && <span className="tabular-nums">({selected.size})</span>}
                            </button>
                        )}
                    </div>

                    {loading ? (
                        <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">{text('جارٍ التحميل...', 'Loading...')}</div>
                    ) : visible.length === 0 ? (
                        <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {text('الأرشيف فاضي.', 'The archive is empty.')}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px] text-sm">
                                <thead>
                                    <tr className="text-start text-[11px] font-semibold text-[var(--ac-text-muted)]">
                                        <th className="w-10 px-4 py-3 text-start">
                                            {canDelete && (
                                                <input
                                                    type="checkbox"
                                                    checked={allVisibleSelected}
                                                    onChange={toggleAllVisible}
                                                    aria-label={text('تحديد الكل', 'Select all')}
                                                    className="size-4 accent-[var(--ac-accent-strong)]"
                                                />
                                            )}
                                        </th>
                                        <th className="px-3 py-3 text-start">{text('الرقم', 'Number')}</th>
                                        <th className="px-3 py-3 text-start">{text('النوع', 'Type')}</th>
                                        <th className="px-3 py-3 text-start">{text('الطرف', 'Party')}</th>
                                        <th className="px-3 py-3 text-start">{text('التاريخ', 'Date')}</th>
                                        <th className="px-3 py-3 text-end">{text('المبلغ', 'Amount')}</th>
                                        <th className="px-3 py-3 text-start">{text('الحالة', 'Status')}</th>
                                        <th className="px-3 py-3 text-start">{text('النسخة الجديدة', 'New version')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {visible.map((row) => (
                                        <tr
                                            key={keyOf(row)}
                                            className={[
                                                'border-t border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]',
                                                selected.has(keyOf(row)) ? 'bg-[var(--ac-accent-soft)]' : '',
                                            ].join(' ')}
                                        >
                                            <td className="px-4 py-3">
                                                {canDelete && (
                                                    <input
                                                        type="checkbox"
                                                        checked={selected.has(keyOf(row))}
                                                        onChange={() => toggle(row)}
                                                        aria-label={text('تحديد ', 'Select ') + row.number}
                                                        className="size-4 accent-[var(--ac-accent-strong)]"
                                                    />
                                                )}
                                            </td>
                                            <td className="px-3 py-3">
                                                <Link href={hrefOf(row)} className="font-semibold text-[var(--ac-accent)] hover:underline">
                                                    {row.number}
                                                </Link>
                                                {row.reason && (
                                                    <span className="mt-0.5 block max-w-[220px] truncate text-[11px] text-[var(--ac-text-muted)]" title={row.reason}>
                                                        {row.reason}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-3 py-3 text-xs">{typeLabel(row)}</td>
                                            <td className="px-3 py-3">{row.party ?? '—'}</td>
                                            <td className="px-3 py-3 tabular-nums">{row.date ?? '—'}</td>
                                            <td className="px-3 py-3 text-end font-semibold tabular-nums">{money(row.amount)}</td>
                                            <td className="px-3 py-3">
                                                <span className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-2 py-1 text-[10px] font-semibold">
                                                    {statusLabel(row)}
                                                </span>
                                            </td>
                                            <td className="px-3 py-3 text-xs">{row.replaced_by ?? '—'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </main>
        </AppShell>
    );
}
