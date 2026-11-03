import { apiRequest } from '@/lib/http';
import { DataPagination } from '@/components/data/DataPagination';
import {
    ColumnFilterRange,
    ColumnFilterSelect,
    ColumnFilterText,
    SortableTh,
    type TableSort,
} from '@/components/data/SortableHeader';
import { Link } from '@inertiajs/react';
import {
    CalendarDays,
    Download,
    Layers,
    Plus,
    Receipt,
    Trash2,
    Wallet,
} from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { FinanceNav } from './FinanceNav';
import {
    FinanceHeader,
    FPanel,
    Money,
    SummaryCard,
    apiErrorText,
    downloadCsv,
    financeButton,
    financeInput,
    financePrimary,
} from './shared';
import type { CashRow, FinanceLookups } from './types';
import { Select } from '@/components/ui/Select';

type Summary = {
    count: number;
    total: string;
    by_category: { category: string; count: number; total: string }[];
    by_month: {
        month: string;
        count: number;
        total: string;
        categories: Record<string, string>;
    }[];
};

type ListResponse = {
    data: CashRow[];
    meta: { current_page: number; last_page: number; per_page: number; total: number };
};

type Entry = { key: number; category: string; amount: string; notes: string };

const today = (): string => new Date().toISOString().slice(0, 10);

export function PettyExpenses({
    lookups,
    ar,
}: {
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const categories: [string, string][] = [
        ['operating_expense', text('مصروف تشغيلي', 'Operating expense')],
        ['utilities', text('خدمات (كهرباء، ماء…)', 'Utilities')],
        ['maintenance', text('صيانة', 'Maintenance')],
        ['shipping_customs', text('شحن وجمارك', 'Freight & customs')],
        ['rent', text('إيجار', 'Rent')],
        ['asset_purchase', text('شراء أصول', 'Asset purchase')],
        ['other', text('أخرى', 'Other')],
    ];
    const categoryLabel = (value: string): string =>
        categories.find(([key]) => key === value)?.[1] ?? value;

    const currency = lookups.currency;
    const canRecord = lookups.permissions.cash_pay;
    const canCorrect = lookups.permissions.cash_correct;

    const [summary, setSummary] = useState<Summary | null>(null);
    const [list, setList] = useState<ListResponse | null>(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [saving, setSaving] = useState(false);
    const [selected, setSelected] = useState<Set<number>>(new Set());
    const [editingId, setEditingId] = useState<number | null>(null);
    const [rowBusy, setRowBusy] = useState(false);

    const [search, setSearch] = useState('');
    const [category, setCategory] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [minAmount, setMinAmount] = useState('');
    const [maxAmount, setMaxAmount] = useState('');
    const [tableSort, setTableSort] = useState<TableSort>(null);
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(25);

    const [movementDate, setMovementDate] = useState(today());
    const [movementDateTo, setMovementDateTo] = useState('');
    const [nextKey, setNextKey] = useState(2);
    const [entries, setEntries] = useState<Entry[]>([
        { key: 1, category: 'operating_expense', amount: '', notes: '' },
    ]);

    const loadSummary = useCallback(() => {
        apiRequest<{ data: Summary }>('/api/finance/petty-expenses/summary')
            .then((response) => setSummary(response.data))
            .catch((failure) => setError(apiErrorText(failure)));
    }, []);

    const loadList = useCallback(
        (signal?: AbortSignal) => {
            const params = new URLSearchParams({
                direction: 'outgoing',
                petty: '1',
                page: String(page),
                per_page: String(perPage),
            });

            if (search.trim()) {
                params.set('search', search.trim());
            }

            if (category) {
                params.set('category', category);
            }

            if (dateFrom) {
                params.set('date_from', dateFrom);
            }

            if (dateTo) {
                params.set('date_to', dateTo);
            }

            if (minAmount) {
                params.set('min_amount', minAmount);
            }

            if (maxAmount) {
                params.set('max_amount', maxAmount);
            }

            if (tableSort) {
                params.set('sort', tableSort.key);
                params.set('sort_direction', tableSort.direction);
            }

            apiRequest<ListResponse>('/api/finance/cash-movements?' + params.toString(), { signal })
                .then(setList)
                .catch((failure) => {
                    if (! signal?.aborted) {
                        setError(apiErrorText(failure));
                    }
                });
        },
        [page, perPage, search, category, dateFrom, dateTo, minAmount, maxAmount, tableSort],
    );

    useEffect(loadSummary, [loadSummary]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(() => loadList(controller.signal), 250);

        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [loadList]);

    function addEntry(afterCategory?: string): void {
        setEntries((current) => [
            ...current,
            {
                key: nextKey,
                category: afterCategory ?? current[current.length - 1]?.category ?? 'operating_expense',
                amount: '',
                notes: '',
            },
        ]);
        setNextKey((key) => key + 1);
    }

    function updateEntry(key: number, patch: Partial<Entry>): void {
        setEntries((current) => current.map((entry) => entry.key === key ? { ...entry, ...patch } : entry));
    }

    const filledEntries = entries.filter((entry) => Number(entry.amount) > 0);
    const dayCount = movementDateTo && movementDateTo >= movementDate
        ? Math.round((Date.parse(movementDateTo) - Date.parse(movementDate)) / 86400000) + 1
        : 1;
    const entriesTotal = filledEntries.reduce((sum, entry) => sum + Number(entry.amount), 0) * dayCount;
    const itemCount = filledEntries.length * dayCount;

    async function save(): Promise<void> {
        setError('');
        setNotice('');

        if (filledEntries.length === 0) {
            setError(text('أدخل مبلغاً لبند واحد على الأقل.', 'Enter an amount for at least one item.'));

            return;
        }

        setSaving(true);

        try {
            const response = await apiRequest<{ data: { posted: number; awaiting_approval: number } }>(
                '/api/finance/petty-expenses',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        movement_date: movementDate,
                        movement_date_to: movementDateTo && movementDateTo > movementDate ? movementDateTo : null,
                        entries: filledEntries.map(({ category: entryCategory, amount, notes }) => ({
                            category: entryCategory,
                            amount,
                            notes: notes.trim() || null,
                        })),
                    }),
                },
            );

            setNotice(
                text(
                    'تم تسجيل ' + response.data.posted + ' بند.'
                    + (response.data.awaiting_approval > 0
                        ? ' و' + response.data.awaiting_approval + ' بانتظار الموافقة.'
                        : ''),
                    response.data.posted + ' item(s) recorded.'
                    + (response.data.awaiting_approval > 0
                        ? ' ' + response.data.awaiting_approval + ' awaiting approval.'
                        : ''),
                ),
            );
            setMovementDateTo('');
            setEntries([{ key: nextKey, category: 'operating_expense', amount: '', notes: '' }]);
            setNextKey((key) => key + 1);
            setPage(1);
            loadSummary();
            loadList();
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setSaving(false);
        }
    }

    function toggleRow(id: number): void {
        setSelected((current) => {
            const next = new Set(current);

            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }

            return next;
        });
    }

    function togglePage(): void {
        const rows = list?.data ?? [];
        const allOnPage = rows.length > 0 && rows.every((row) => selected.has(row.id));

        setSelected((current) => {
            const next = new Set(current);

            rows.forEach((row) => {
                if (allOnPage) {
                    next.delete(row.id);
                } else {
                    next.add(row.id);
                }
            });

            return next;
        });
    }

    async function deleteRows(ids: number[]): Promise<void> {
        if (ids.length === 0 || rowBusy) {
            return;
        }

        if (! window.confirm(text(
            'حذف ' + ids.length + ' بند؟ يُلغى أثرها على الصندوق ويبقى في سجل التدقيق.',
            'Delete ' + ids.length + ' item(s)? Their cash effect is reversed and kept in the audit trail.',
        ))) {
            return;
        }

        setRowBusy(true);
        setError('');
        setNotice('');

        try {
            await apiRequest('/api/finance/petty-expenses/delete', {
                method: 'POST',
                body: JSON.stringify({ ids }),
            });
            setSelected(new Set());
            setNotice(text('تم حذف ' + ids.length + ' بند.', ids.length + ' item(s) deleted.'));
            loadSummary();
            loadList();
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setRowBusy(false);
        }
    }

    async function changeDate(row: CashRow, value: string): Promise<void> {
        setEditingId(null);

        if (! value || value === row.movement_date || rowBusy) {
            return;
        }

        setRowBusy(true);
        setError('');
        setNotice('');

        try {
            const response = await apiRequest<{ data: { awaiting_approval: boolean } }>(
                '/api/finance/petty-expenses/' + row.id,
                { method: 'PATCH', body: JSON.stringify({ movement_date: value }) },
            );

            setNotice(response.data.awaiting_approval
                ? text('تم تعديل التاريخ وبانتظار الموافقة.', 'Date changed; awaiting approval.')
                : text('تم تعديل التاريخ.', 'Date updated.'));
            loadSummary();
            loadList();
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setRowBusy(false);
        }
    }

    function exportRows(): void {
        downloadCsv(
            'petty-expenses.csv',
            [
                [text('رقم الحركة', 'Movement'), text('التاريخ', 'Date'), text('الفئة', 'Category'), text('المرجع', 'Reference'), text('ملاحظات', 'Notes'), text('المبلغ', 'Amount')],
                ...(list?.data ?? []).map((row) => [
                    row.number,
                    row.movement_date,
                    categoryLabel(row.category),
                    row.reference,
                    row.notes,
                    row.amount,
                ]),
            ],
        );
    }

    return (
        <div className="space-y-5">
            <FinanceHeader
                title={text('النثريات', 'Petty expenses')}
                subtitle={text(
                    'كل المصاريف المدفوعة بدون مستفيد محدد: النثريات والخدمات والصيانة والشحن وغيرها. سجّل عدة بنود ليوم واحد دفعة وحدة.',
                    'Every payment made without a named payee. Record several items for one day in a single step.',
                )}
                actions={(
                    <button type="button" className={financeButton} onClick={exportRows}>
                        <Download size={15} />
                        {text('تصدير', 'Export')}
                    </button>
                )}
            />

            <FinanceNav lookups={lookups} ar={ar} active="petty" />

            <div className="grid gap-3 sm:grid-cols-3">
                <SummaryCard
                    label={text('عدد الدفعات', 'Payments')}
                    value={summary ? summary.count.toLocaleString() : '…'}
                    icon={Receipt}
                />
                <SummaryCard
                    label={text('إجمالي المصروف', 'Total spent')}
                    value={summary ? <Money value={summary.total} currency={currency} compact /> : '…'}
                    icon={Wallet}
                    tone="amber"
                />
                <SummaryCard
                    label={text('عدد الفئات', 'Categories')}
                    value={summary ? summary.by_category.length : '…'}
                    icon={Layers}
                    tone="violet"
                />
            </div>

            {error && (
                <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            {notice && (
                <div role="status" className="rounded-[14px] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
                    {notice}
                </div>
            )}

            {canRecord && (
                <FPanel title={text('تسجيل نثريات', 'Record petty expenses')} icon={Plus}>
                    <div className="space-y-4 p-4">
                        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold text-[var(--ac-text-muted)]">
                            <label className="flex flex-wrap items-center gap-3">
                                <CalendarDays size={15} />
                                {movementDateTo ? text('من تاريخ', 'From date') : text('تاريخ البنود', 'Date for these items')}
                                <input
                                    type="date"
                                    className={financeInput + ' !w-auto'}
                                    value={movementDate}
                                    onChange={(event) => setMovementDate(event.target.value)}
                                />
                            </label>
                            <label className="flex flex-wrap items-center gap-3">
                                {text('إلى تاريخ (اختياري، لتكرار البنود كل يوم)', 'To date (optional, repeats the items every day)')}
                                <input
                                    type="date"
                                    className={financeInput + ' !w-auto'}
                                    min={movementDate}
                                    value={movementDateTo}
                                    onChange={(event) => setMovementDateTo(event.target.value)}
                                />
                            </label>
                            {dayCount > 1 && (
                                <span className="rounded-full bg-[var(--ac-accent-soft)] px-3 py-1 text-[var(--ac-accent-strong)]">
                                    {text('تتكرر على ' + dayCount + ' يوم', 'Repeats over ' + dayCount + ' days')}
                                </span>
                            )}
                        </div>

                        <div className="space-y-2">
                            {entries.map((entry, index) => (
                                <div key={entry.key} className="grid gap-2 sm:grid-cols-[200px_140px_1fr_auto]">
                                    <Select
                                        className={financeInput}
                                        aria-label={text('الفئة', 'Category')}
                                        value={entry.category}
                                        onChange={(event) => updateEntry(entry.key, { category: event.target.value })}
                                    >
                                        {categories.map(([value, label]) => (
                                            <option key={value} value={value}>{label}</option>
                                        ))}
                                    </Select>
                                    <input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        inputMode="decimal"
                                        className={financeInput}
                                        aria-label={text('المبلغ', 'Amount')}
                                        placeholder={text('المبلغ', 'Amount')}
                                        value={entry.amount}
                                        onChange={(event) => updateEntry(entry.key, { amount: event.target.value })}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && index === entries.length - 1 && Number(entry.amount) > 0) {
                                                event.preventDefault();
                                                addEntry(entry.category);
                                            }
                                        }}
                                    />
                                    <input
                                        className={financeInput}
                                        aria-label={text('ملاحظة', 'Note')}
                                        placeholder={text('ملاحظة (مثلاً: قهوة، مواصلات…)', 'Note (e.g. coffee, transport…)')}
                                        value={entry.notes}
                                        onChange={(event) => updateEntry(entry.key, { notes: event.target.value })}
                                    />
                                    <button
                                        type="button"
                                        className={financeButton}
                                        aria-label={text('حذف البند', 'Remove item')}
                                        disabled={entries.length === 1}
                                        onClick={() => setEntries((current) => current.filter((item) => item.key !== entry.key))}
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                            <button type="button" className={financeButton} onClick={() => addEntry()}>
                                <Plus size={15} />
                                {text('إضافة بند', 'Add item')}
                            </button>
                            <button type="button" className={financePrimary} disabled={saving} onClick={save}>
                                {saving
                                    ? text('جارٍ الحفظ…', 'Saving…')
                                    : text('حفظ ' + itemCount + ' بند', 'Save ' + itemCount + ' item(s)')}
                            </button>
                            {filledEntries.length > 0 && (
                                <span className="text-xs text-[var(--ac-text-muted)]">
                                    {text('المجموع', 'Total')}: <Money value={entriesTotal} currency={currency} compact />
                                </span>
                            )}
                        </div>
                    </div>
                </FPanel>
            )}

            <FPanel title={text('السجل', 'Log') + (list ? ' (' + list.meta.total + ')' : '')} icon={Receipt}>
                {canCorrect && selected.size > 0 && (
                    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--ac-line)] bg-[var(--ac-accent-soft)] px-4 py-2 text-xs">
                        <strong>{text('محدد: ' + selected.size, 'Selected: ' + selected.size)}</strong>
                        <button
                            type="button"
                            disabled={rowBusy}
                            className="flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                            onClick={() => void deleteRows(Array.from(selected))}
                        >
                            <Trash2 size={13} />
                            {text('حذف المحدد', 'Delete selected')}
                        </button>
                        <button type="button" className="underline" onClick={() => setSelected(new Set())}>
                            {text('إلغاء التحديد', 'Clear')}
                        </button>
                    </div>
                )}
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[760px] text-xs">
                        <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                            <tr>
                                {canCorrect && (
                                    <th className="w-10 px-3 py-2.5">
                                        <input
                                            type="checkbox"
                                            aria-label={text('تحديد هذه الصفحة', 'Select this page')}
                                            checked={(list?.data.length ?? 0) > 0 && (list?.data ?? []).every((row) => selected.has(row.id))}
                                            onChange={togglePage}
                                            className="size-4 accent-[var(--ac-accent)]"
                                        />
                                    </th>
                                )}
                                {([
                                    ['number', text('رقم الحركة', 'Movement')],
                                    ['date', text('التاريخ', 'Date')],
                                    ['category', text('الفئة', 'Category')],
                                    ['notes', text('ملاحظات', 'Notes')],
                                    ['reference', text('المرجع', 'Reference')],
                                    ['amount', text('المبلغ', 'Amount')],
                                ] as Array<[string, string]>).map(([key, label]) => {
                                    let filter: ReactNode = null;
                                    let filterActive = false;

                                    if (key === 'number' || key === 'notes' || key === 'reference') {
                                        filterActive = search !== '';
                                        filter = (
                                            <ColumnFilterText
                                                ar={ar}
                                                value={search}
                                                onChange={(value) => {
                                                    setSearch(value);
                                                    setPage(1);
                                                }}
                                                placeholder={text('رقم أو ملاحظة أو مرجع', 'Number, note or reference')}
                                            />
                                        );
                                    } else if (key === 'date') {
                                        filterActive = dateFrom !== '' || dateTo !== '';
                                        filter = (
                                            <ColumnFilterRange
                                                ar={ar}
                                                type="date"
                                                from={dateFrom}
                                                to={dateTo}
                                                onChange={(from, to) => {
                                                    setDateFrom(from);
                                                    setDateTo(to);
                                                    setPage(1);
                                                }}
                                            />
                                        );
                                    } else if (key === 'amount') {
                                        filterActive = minAmount !== '' || maxAmount !== '';
                                        filter = (
                                            <ColumnFilterRange
                                                ar={ar}
                                                type="number"
                                                from={minAmount}
                                                to={maxAmount}
                                                onChange={(from, to) => {
                                                    setMinAmount(from);
                                                    setMaxAmount(to);
                                                    setPage(1);
                                                }}
                                            />
                                        );
                                    } else if (key === 'category') {
                                        filterActive = category !== '';
                                        filter = (
                                            <ColumnFilterSelect
                                                value={category}
                                                options={categories}
                                                allLabel={text('جميع الفئات', 'All categories')}
                                                onChange={(value) => {
                                                    setCategory(value);
                                                    setPage(1);
                                                }}
                                            />
                                        );
                                    }

                                    return (
                                        <SortableTh
                                            key={key}
                                            ar={ar}
                                            label={label}
                                            sortKey={key === 'notes' ? undefined : key}
                                            sort={tableSort}
                                            onSort={(next) => {
                                                setTableSort(next);
                                                setPage(1);
                                            }}
                                            filter={filter}
                                            filterActive={filterActive}
                                            className="py-2.5"
                                        />
                                    );
                                })}
                                {canCorrect && <th className="w-12 px-3 py-2.5" />}
                            </tr>
                        </thead>
                        <tbody>
                            {list?.data.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-4 py-10 text-center text-[var(--ac-text-muted)]">
                                        {text('لا توجد دفعات مطابقة.', 'No matching payments.')}
                                    </td>
                                </tr>
                            )}
                            {list?.data.map((row) => (
                                <tr key={row.id} className="border-t border-[var(--ac-line)] hover:bg-blue-50/40">
                                    {canCorrect && (
                                        <td className="px-3 py-2.5">
                                            <input
                                                type="checkbox"
                                                checked={selected.has(row.id)}
                                                onChange={() => toggleRow(row.id)}
                                                className="size-4 accent-[var(--ac-accent)]"
                                            />
                                        </td>
                                    )}
                                    <td className="px-3 py-2.5 font-semibold text-[var(--ac-accent)]">
                                        <Link href={'/app/payments/' + row.id}>{row.number}</Link>
                                    </td>
                                    <td className="px-3 py-2.5">
                                        {canCorrect && editingId === row.id ? (
                                            <input
                                                type="date"
                                                autoFocus
                                                className={financeInput + ' !w-auto !py-1'}
                                                defaultValue={row.movement_date}
                                                onBlur={(event) => void changeDate(row, event.target.value)}
                                                onKeyDown={(event) => {
                                                    if (event.key === 'Enter') {
                                                        event.currentTarget.blur();
                                                    } else if (event.key === 'Escape') {
                                                        setEditingId(null);
                                                    }
                                                }}
                                            />
                                        ) : canCorrect ? (
                                            <button
                                                type="button"
                                                title={text('اضغط لتعديل التاريخ', 'Click to change the date')}
                                                className="rounded-lg px-1.5 py-0.5 underline decoration-dotted underline-offset-4 hover:bg-[var(--ac-accent-soft)]"
                                                onClick={() => setEditingId(row.id)}
                                            >
                                                {row.movement_date}
                                            </button>
                                        ) : row.movement_date}
                                    </td>
                                    <td className="px-3 py-2.5">{categoryLabel(row.category)}</td>
                                    <td className="max-w-[320px] truncate px-3 py-2.5" title={row.notes ?? ''}>{row.notes ?? '—'}</td>
                                    <td className="px-3 py-2.5 text-[var(--ac-text-muted)]">{row.reference ?? '—'}</td>
                                    <td className="px-3 py-2.5 font-bold"><Money value={row.amount} currency={row.currency} compact /></td>
                                    {canCorrect && (
                                        <td className="px-3 py-2.5">
                                            <button
                                                type="button"
                                                aria-label={text('حذف', 'Delete')}
                                                disabled={rowBusy}
                                                className="rounded-lg p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                onClick={() => void deleteRows([row.id])}
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {list && (
                    <DataPagination
                        page={list.meta.current_page}
                        lastPage={list.meta.last_page}
                        perPage={list.meta.per_page}
                        total={list.meta.total}
                        onPageChange={setPage}
                        onPerPageChange={(value) => {
                            setPerPage(value);
                            setPage(1);
                        }}
                    />
                )}
            </FPanel>
        </div>
    );
}
