import { SmartEmptyState } from '@/components/data/SmartEmptyState';
import { DataPagination } from '@/components/data/DataPagination';
import {
    AdvancedFilterBuilder,
    type AdvancedFilterCondition,
} from '@/components/data/AdvancedFilterBuilder';
import {
    ListPreferencesControl,
    useListPreferences,
    type ListColumn,
} from '@/components/data/ListPreferences';
import { SavedViews } from '@/components/data/SavedViews';
import {
    ColumnFilterRange,
    ColumnFilterSelect,
    ColumnFilterText,
    SortableTh,
    type TableSort,
} from '@/components/data/SortableHeader';
import { apiRequest } from '@/lib/http';
import { useLiveTick } from '@/lib/live';
import { Link } from '@inertiajs/react';
import {
    Archive,
    Banknote,
    CalendarDays,
    Download,
    FileText,
    Plus,
    Search,
    TimerReset,
    WalletCards,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { PaymentDialog } from './PaymentDialog';
import { FinanceNav } from './FinanceNav';
import { InvoiceAutomationLibrary } from './InvoiceAutomationLibrary';
import {
    FinanceHeader,
    FPanel,
    Money,
    StatusBadge,
    SummaryCard,
    apiErrorText,
    downloadCsv,
    financeButton,
    financeInput,
    financePrimary,
} from './shared';
import type {
    DocumentRow,
    FinanceLookups,
} from './types';
import { Select } from '@/components/ui/Select';

type Response = {
    data: DocumentRow[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
    summary: {
        count: number;
        total: string;
        paid: string;
        outstanding: string;
        overdue: number;
    };
};

function dueDateTone(
    dueDate: string | null,
    status: string,
): string {
    if (! dueDate) {
        return 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]';
    }

    if (
        status === 'paid'
        || status === 'overpaid'
    ) {
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }

    const due =
        new Date(
            dueDate
            + 'T12:00:00',
        );
    const current =
        new Date();

    current.setHours(
        12,
        0,
        0,
        0,
    );

    const days =
        Math.ceil(
            (
                due.getTime()
                - current.getTime()
            )
            / 86400000,
        );

    if (
        days < 0
        && ! [
            'voided',
            'reversed',
            'draft',
        ].includes(status)
    ) {
        return 'border-red-200 bg-red-50 text-red-700';
    }

    if (
        days >= 0
        && days <= 3
        && ! [
            'voided',
            'reversed',
        ].includes(status)
    ) {
        return 'border-amber-200 bg-amber-50 text-amber-700';
    }

    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export function DocumentList({
    kind,
    misc = false,
    lookups,
    ar,
}: {
    kind: 'sale_invoice' | 'purchase_invoice';
    /** Walk-in (متفرقات) sales: their own list, create page and no manual receipt button. */
    misc?: boolean;
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const [
        response,
        setResponse,
    ] = useState<Response | null>(null);

    const [
        search,
        setSearch,
    ] = useState('');

    const [
        status,
        setStatus,
    ] = useState('');

    const [
        advancedConditions,
        setAdvancedConditions,
    ] = useState<AdvancedFilterCondition[]>([]);

    const [tableSort, setTableSort] = useState<TableSort>(null);

    const [columnFilters, setColumnFilters] = useState({
        min_total: '',
        max_total: '',
        date_from: '',
        date_to: '',
        due_after: '',
        due_before: '',
    });

    function changeColumnFilter(
        patch: Partial<typeof columnFilters>,
    ): void {
        setColumnFilters((current) => ({ ...current, ...patch }));
        setPage(1);
    }

    const [
        page,
        setPage,
    ] = useState(1);
    const [perPage, setPerPage] = useState(20);

    const [
        error,
        setError,
    ] = useState('');

    const [
        loading,
        setLoading,
    ] = useState(true);

    const sales = kind === 'sale_invoice';
    const [paymentOpen, setPaymentOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);
    const [archivingId, setArchivingId] = useState<number | null>(null);
    const canRecordCash = sales
        ? lookups.permissions.cash_receive
        : lookups.permissions.cash_pay;
    const canManage = sales
        ? lookups.permissions.sales_manage
        : lookups.permissions.purchases_manage;

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const invoiceColumns: ListColumn[] = [
        {
            key: 'number',
            label: text('رقم الفاتورة', 'Invoice'),
        },
        {
            key: 'party',
            label: sales
                ? text('العميل', 'Customer')
                : text('المورد', 'Supplier'),
        },
        {
            key: 'activity',
            label: text('النشاط', 'Activity'),
        },
        {
            key: 'issue_date',
            label: text('تاريخ الإصدار', 'Issue date'),
        },
        {
            key: 'due_date',
            label: text('الاستحقاق', 'Due date'),
        },
        {
            key: 'total',
            label: text('الإجمالي', 'Total'),
        },
        {
            key: 'paid',
            label: text('المدفوع', 'Paid'),
        },
        {
            key: 'outstanding',
            label: text('المتبقي', 'Outstanding'),
        },
        {
            key: 'status',
            label: text('الحالة', 'Status'),
        },
        {
            key: 'action',
            label: text('إجراء', 'Action'),
        },
    ];

    const listPreferences = useListPreferences(
        `acconova:list-preferences:finance:${kind}${misc ? ':misc' : ''}`,
        invoiceColumns,
    );

    const advancedFilterValues = advancedConditions.reduce(
        (result, condition) => {
            const value = condition.value.trim();

            if (! value) {
                return result;
            }

            if (condition.field === 'total') {
                if (condition.operator === 'gte') {
                    result.min_total = value;
                }
                if (condition.operator === 'lte') {
                    result.max_total = value;
                }
                if (condition.operator === 'equals') {
                    result.min_total = value;
                    result.max_total = value;
                }
            }

            if (condition.field === 'due_date') {
                if (condition.operator === 'after') {
                    result.due_after = value;
                }
                if (condition.operator === 'before') {
                    result.due_before = value;
                }
                if (condition.operator === 'equals') {
                    result.due_after = value;
                    result.due_before = value;
                }
            }

            return result;
        },
        {} as {
            min_total?: string;
            max_total?: string;
            due_after?: string;
            due_before?: string;
        },
    );


    const liveTick = useLiveTick();
    const seenLiveTick = useRef(liveTick);

    useEffect(() => {
        const silent = seenLiveTick.current !== liveTick;
        seenLiveTick.current = liveTick;
        const controller = new AbortController();
        const params = new URLSearchParams({
            kind,
            page: String(page),
            per_page: String(perPage),
        });

        if (misc) {
            params.set('misc', '1');
        }

        if (search.trim()) {
            params.set('search', search.trim());
        }

        if (status) {
            params.set('status', status);
        }

        const minTotal = columnFilters.min_total || advancedFilterValues.min_total;
        const maxTotal = columnFilters.max_total || advancedFilterValues.max_total;
        const dueAfter = columnFilters.due_after || advancedFilterValues.due_after;
        const dueBefore = columnFilters.due_before || advancedFilterValues.due_before;

        if (minTotal) {
            params.set('min_total', minTotal);
        }
        if (maxTotal) {
            params.set('max_total', maxTotal);
        }
        if (dueAfter) {
            params.set('due_after', dueAfter);
        }
        if (dueBefore) {
            params.set('due_before', dueBefore);
        }
        if (columnFilters.date_from) {
            params.set('date_from', columnFilters.date_from);
        }
        if (columnFilters.date_to) {
            params.set('date_to', columnFilters.date_to);
        }
        if (tableSort) {
            params.set('sort', tableSort.key);
            params.set('sort_direction', tableSort.direction);
        }

        if (! silent) {
            setLoading(true);
            setError('');
        }

        apiRequest<Response>(
            '/api/finance/documents?' + params.toString(),
            {
                signal: controller.signal,
            },
        )
            .then(setResponse)
            .catch((failure) => {
                if (! controller.signal.aborted && ! silent) {
                    setError(apiErrorText(failure));
                }
            })
            .finally(() => {
                if (! controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [
        kind,
        misc,
        page,
        perPage,
        search,
        status,
        advancedFilterValues.min_total,
        advancedFilterValues.max_total,
        advancedFilterValues.due_after,
        advancedFilterValues.due_before,
        columnFilters,
        tableSort,
        refreshKey,
        liveTick,
    ]);

    const title = misc
        ? text('فواتير مبيعات متفرقات', 'Walk-in sales invoices')
        : sales
        ? text('فواتير البيع', 'Sales invoices')
        : text('فواتير الشراء', 'Purchase invoices');

    const subtitle = misc
        ? text(
            'مبيعات سريعة بدون زبون محدد. كل فاتورة تُحفظ مدفوعة نقداً مع قبض نقدي تلقائي.',
            'Quick sales with no named customer. Each invoice is saved paid in cash with an automatic receipt.',
        )
        : sales
        ? text(
            'إدارة دورة البيع من المسودة إلى الإصدار والتحصيل، مع تتبع الرصيد والتصحيحات دون محو التاريخ.',
            'Manage sales from draft through issue and collection, with balances and immutable corrections.',
        )
        : text(
            'إدارة فواتير الموردين وشراء المواد الخام والبضائع والخدمات والشحن والأصول والمصاريف المرتبطة.',
            'Manage supplier invoices for raw materials, resale goods, services, freight, assets and related costs.',
        );

    const createHref = misc
        ? '/app/misc-sales/create'
        : sales
        ? '/app/invoices/sales/create'
        : '/app/invoices/purchases/create';

    const showHref = (id: number): string =>
        sales
            ? '/app/invoices/sales/' + id
            : '/app/invoices/purchases/' + id;

    async function archiveDocument(row: DocumentRow): Promise<void> {
        const reason = window.prompt(text(
            'سبب أرشفة الفاتورة؟ سيتم إلغاء أثرها المالي والمخزني. (5 أحرف على الأقل)',
            'Archive reason? Its financial and inventory effect will be cancelled. (at least 5 characters)',
        ));

        if (! reason || reason.trim().length < 5) {
            return;
        }

        setArchivingId(row.id);
        setError('');

        try {
            await apiRequest(`/api/finance/documents/${row.id}/void`, {
                method: 'POST',
                body: JSON.stringify({ reason: reason.trim() }),
            });
            setRefreshKey((value) => value + 1);
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setArchivingId(null);
        }
    }

    function exportRows(): void {
        const rows = response?.data ?? [];

        downloadCsv(
            sales ? 'sales-invoices.csv' : 'purchase-invoices.csv',
            [
                [
                    text('رقم الفاتورة', 'Invoice number'),
                    text('الطرف', 'Party'),
                    text('تاريخ الإصدار', 'Issue date'),
                    text('تاريخ الاستحقاق', 'Due date'),
                    text('الحالة', 'Status'),
                    text('الإجمالي', 'Total'),
                    text('المدفوع', 'Paid'),
                    text('المتبقي', 'Outstanding'),
                    text('العملة', 'Currency'),
                ],
                ...rows.map((row) => [
                    row.number,
                    row.party?.name,
                    row.issue_date,
                    row.due_date,
                    row.status,
                    row.total,
                    row.paid_total,
                    row.balance_due,
                    row.currency,
                ]),
            ],
        );
    }

    const hasFilters = search !== ''
        || status !== ''
        || advancedConditions.length > 0
        || Object.values(columnFilters).some((value) => value !== '');

    function clearAllFilters(): void {
        setSearch('');
        setStatus('');
        setAdvancedConditions([]);
        setColumnFilters({
            min_total: '',
            max_total: '',
            date_from: '',
            date_to: '',
            due_after: '',
            due_before: '',
        });
        setPage(1);
    }

    const showEmptyState = ! response
        || (response.data.length === 0 && ! hasFilters && tableSort === null);

    const statuses = [
        ['draft', text('مسودة', 'Draft')],
        ['issued', text('غير مدفوعة', 'Issued')],
        ['partially_paid', text('مدفوعة جزئياً', 'Partially paid')],
        ['paid', text('مدفوعة', 'Paid')],
        ['overpaid', text('مدفوعة بزيادة', 'Overpaid')],
        ['superseded', text('مصححة', 'Corrected')],
        ['voided', text('ملغاة', 'Voided')],
    ];

    return (
        <div className="space-y-4">
            <FinanceHeader
                title={title}
                subtitle={subtitle}
                actions={
                    <>
                        <button
                            type="button"
                            className={financeButton}
                            onClick={exportRows}
                            disabled={! response?.data.length}
                        >
                            <Download size={15} />
                            {text('تصدير', 'Export')}
                        </button>

                        {canRecordCash && ! misc && (
                            <button
                                type="button"
                                className={financeButton}
                                onClick={() => setPaymentOpen(true)}
                            >
                                <Banknote size={15} />
                                {sales
                                    ? text('إضافة مقبوض', 'Add receipt')
                                    : text('إضافة دفعة', 'Add payment')}
                            </button>
                        )}

                        {canManage && (
                            <Link
                                href={createHref}
                                className={financePrimary}
                            >
                                <Plus size={15} />
                                {misc
                                    ? text('إضافة فاتورة متفرقات', 'Add walk-in sale')
                                    : sales
                                    ? text('إنشاء فاتورة بيع', 'Create sales invoice')
                                    : text('إنشاء فاتورة شراء', 'Create purchase invoice')}
                            </Link>
                        )}
                    </>
                }
            />

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    label={text('إجمالي الفواتير', 'Invoices')}
                    value={response?.summary.count ?? 0}
                    icon={FileText}
                    tone="blue"
                />
                <SummaryCard
                    label={sales
                        ? text('إجمالي المبيعات', 'Sales total')
                        : text('إجمالي المشتريات', 'Purchases total')}
                    value={
                        <Money
                            value={response?.summary.total ?? 0}
                            currency={lookups.currency}
                        />
                    }
                    icon={WalletCards}
                    tone="green"
                />
                <SummaryCard
                    label={text('المحصل / المدفوع', 'Paid')}
                    value={
                        <Money
                            value={response?.summary.paid ?? 0}
                            currency={lookups.currency}
                        />
                    }
                    icon={Banknote}
                    tone="amber"
                />
                <SummaryCard
                    label={text('المتبقي', 'Outstanding')}
                    value={
                        <Money
                            value={response?.summary.outstanding ?? 0}
                            currency={lookups.currency}
                        />
                    }
                    hint={text(
                        'الفواتير المفتوحة والجزئية',
                        'Open and partial invoices',
                    )}
                    icon={TimerReset}
                    tone="red"
                />
            </div>

            <FinanceNav
                lookups={lookups}
                ar={ar}
                active={misc ? 'misc' : sales ? 'sales' : 'purchases'}
            />

            <FPanel
                title={text('عوامل التصفية والبحث', 'Filters & search')}
                icon={Search}
            >
                <div className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_240px_auto]">
                    <label className="relative">
                        <Search
                            size={16}
                            className="absolute start-3 top-3 text-slate-400"
                        />
                        <input
                            className={financeInput + ' ps-9'}
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder={text(
                                'ابحث برقم الفاتورة أو اسم العميل/المورد...',
                                'Search invoice number or party...',
                            )}
                        />
                    </label>

                    <Select
                        className={financeInput}
                        value={status}
                        onChange={(event) => {
                            setStatus(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">
                            {text('جميع الحالات', 'All statuses')}
                        </option>
                        {statuses.map(([value, label]) => (
                            <option key={value} value={value}>
                                {label}
                            </option>
                        ))}
                    </Select>

                    <button
                        type="button"
                        className={financeButton}
                        onClick={() => {
                            setSearch('');
                            setStatus('');
                            setPage(1);
                        }}
                    >
                        <CalendarDays size={15} />
                        {text('إعادة تعيين', 'Reset')}
                    </button>
                </div>

                <div className="flex flex-wrap items-center gap-2 border-t border-[var(--ac-line)] px-4 py-3">
                    <AdvancedFilterBuilder
                        ar={ar}
                        value={advancedConditions}
                        onChange={(next) => {
                            setAdvancedConditions(next);
                            setPage(1);
                        }}
                        fields={[
                            {
                                key: 'total',
                                label: text('إجمالي الفاتورة', 'Invoice total'),
                                type: 'number',
                                operators: ['gte', 'lte', 'equals'],
                            },
                            {
                                key: 'due_date',
                                label: text('تاريخ الاستحقاق', 'Due date'),
                                type: 'date',
                                operators: ['after', 'before', 'equals'],
                            },
                        ]}
                    />

                    <ListPreferencesControl
                        columns={invoiceColumns}
                        order={listPreferences.order}
                        hidden={listPreferences.hidden}
                        density={listPreferences.density}
                        onOrderChange={listPreferences.setOrder}
                        onToggleColumn={listPreferences.toggleColumn}
                        onDensityChange={listPreferences.setDensity}
                        ar={ar}
                    />

                    <InvoiceAutomationLibrary
                        kind={kind}
                        ar={ar}
                        canManage={canManage}
                    />

                    <SavedViews
                        storageKey={`acconova:saved-views:finance-documents:${kind}`}
                        ar={ar}
                        value={{
                            search,
                            status,
                            advancedConditions,
                        }}
                        onApply={(saved) => {
                            setSearch(saved.search);
                            setStatus(saved.status);
                            setAdvancedConditions(
                                saved.advancedConditions ?? [],
                            );
                            setPage(1);
                        }}
                    />
                </div>
            </FPanel>

            {error && (
                <div
                    role="alert"
                    className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {error}
                </div>
            )}

            <FPanel
                title={
                    title +
                    (response
                        ? ' (' + response.meta.total + ')'
                        : '')
                }
                icon={FileText}
            >
                {loading && ! response ? (
                    <div className="p-12 text-center text-sm text-slate-400">
                        {text('جارٍ تحميل الفواتير...', 'Loading invoices...')}
                    </div>
                ) : showEmptyState ? (
                    <SmartEmptyState
                        icon={FileText}
                        title={text(
                            search || status
                                ? 'لا توجد فواتير مطابقة'
                                : 'لا توجد فواتير بعد',
                            search || status
                                ? 'No matching invoices'
                                : 'No invoices yet',
                        )}
                        description={text(
                            search || status
                                ? 'غيّر البحث أو الحالة، أو ابدأ فاتورة جديدة.'
                                : 'أنشئ أول فاتورة لتبدأ دورة البيع أو الشراء داخل AccoNova.',
                            search || status
                                ? 'Adjust search or status, or start a new invoice.'
                                : 'Create the first invoice to start this finance workflow in AccoNova.',
                        )}
                        primary={canManage ? (
                            <Link
                                href={createHref}
                                className={financePrimary}
                            >
                                <Plus size={15} />
                                {sales
                                    ? text('إنشاء فاتورة بيع', 'Create sales invoice')
                                    : text('إنشاء فاتورة شراء', 'Create purchase invoice')}
                            </Link>
                        ) : undefined}
                        secondary={(search || status) ? (
                            <button
                                type="button"
                                className={financeButton}
                                onClick={() => {
                                    setSearch('');
                                    setStatus('');
                                    setPage(1);
                                }}
                            >
                                {text('مسح التصفية', 'Clear filters')}
                            </button>
                        ) : undefined}
                    />
                ) : (
                    <>
                        <div className={['overflow-x-auto transition-opacity', loading ? 'opacity-50' : ''].join(' ')}>
                            <table className="w-full min-w-[760px] text-xs">
                                <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                    <tr>
                                        {listPreferences.visibleKeys.map((key) => {
                                            const column = invoiceColumns.find(
                                                (item) => item.key === key,
                                            );

                                            if (! column) {
                                                return null;
                                            }

                                            const sortKeys: Record<string, string> = {
                                                number: 'number',
                                                party: 'party',
                                                issue_date: 'issue_date',
                                                due_date: 'due_date',
                                                total: 'total',
                                                paid: 'paid',
                                                outstanding: 'outstanding',
                                                status: 'status',
                                            };

                                            let filter: ReactNode;
                                            let filterActive = false;

                                            if (key === 'number' || key === 'party') {
                                                filterActive = search !== '';
                                                filter = (
                                                    <ColumnFilterText
                                                        ar={ar}
                                                        value={search}
                                                        onChange={(value) => {
                                                            setSearch(value);
                                                            setPage(1);
                                                        }}
                                                        placeholder={text('رقم الفاتورة أو الاسم', 'Invoice number or name')}
                                                    />
                                                );
                                            } else if (key === 'issue_date') {
                                                filterActive = columnFilters.date_from !== '' || columnFilters.date_to !== '';
                                                filter = (
                                                    <ColumnFilterRange
                                                        ar={ar}
                                                        type="date"
                                                        from={columnFilters.date_from}
                                                        to={columnFilters.date_to}
                                                        onChange={(from, to) => changeColumnFilter({ date_from: from, date_to: to })}
                                                    />
                                                );
                                            } else if (key === 'due_date') {
                                                filterActive = columnFilters.due_after !== '' || columnFilters.due_before !== '';
                                                filter = (
                                                    <ColumnFilterRange
                                                        ar={ar}
                                                        type="date"
                                                        from={columnFilters.due_after}
                                                        to={columnFilters.due_before}
                                                        onChange={(from, to) => changeColumnFilter({ due_after: from, due_before: to })}
                                                    />
                                                );
                                            } else if (key === 'total') {
                                                filterActive = columnFilters.min_total !== '' || columnFilters.max_total !== '';
                                                filter = (
                                                    <ColumnFilterRange
                                                        ar={ar}
                                                        type="number"
                                                        from={columnFilters.min_total}
                                                        to={columnFilters.max_total}
                                                        onChange={(from, to) => changeColumnFilter({ min_total: from, max_total: to })}
                                                    />
                                                );
                                            } else if (key === 'status') {
                                                filterActive = status !== '';
                                                filter = (
                                                    <ColumnFilterSelect
                                                        value={status}
                                                        options={statuses as [string, string][]}
                                                        allLabel={text('جميع الحالات', 'All statuses')}
                                                        onChange={(value) => {
                                                            setStatus(value);
                                                            setPage(1);
                                                        }}
                                                    />
                                                );
                                            }

                                            return (
                                                <SortableTh
                                                    key={key}
                                                    ar={ar}
                                                    label={column.label}
                                                    sortKey={sortKeys[key]}
                                                    sort={tableSort}
                                                    onSort={(next) => {
                                                        setTableSort(next);
                                                        setPage(1);
                                                    }}
                                                    filter={filter}
                                                    filterActive={filterActive}
                                                    className={listPreferences.density === 'compact' ? 'py-2' : 'py-3'}
                                                />
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {response?.data.length === 0 && (
                                        <tr>
                                            <td
                                                colSpan={listPreferences.visibleKeys.length}
                                                className="px-4 py-10 text-center text-sm text-[var(--ac-text-muted)]"
                                            >
                                                {text('لا توجد فواتير مطابقة للفلاتر.', 'No invoices match the filters.')}
                                                {' '}
                                                <button
                                                    type="button"
                                                    className="font-semibold text-[var(--ac-accent)] underline"
                                                    onClick={clearAllFilters}
                                                >
                                                    {text('مسح كل الفلاتر', 'Clear all filters')}
                                                </button>
                                            </td>
                                        </tr>
                                    )}
                                    {response?.data.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="border-t border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]"
                                        >
                                            {listPreferences.visibleKeys.map((key) => {
                                                const cellClass = [
                                                    'px-3',
                                                    listPreferences.density === 'compact'
                                                        ? 'py-2'
                                                        : 'py-3',
                                                ].join(' ');

                                                if (key === 'number') {
                                                    return (
                                                        <td key={key} className={cellClass + ' font-semibold text-[var(--ac-accent)]'}>
                                                            {row.number}
                                                        </td>
                                                    );
                                                }

                                                if (key === 'party') {
                                                    return (
                                                        <td key={key} className={cellClass}>
                                                            {row.party?.name ?? '—'}
                                                        </td>
                                                    );
                                                }

                                                if (key === 'activity') {
                                                    return (
                                                        <td key={key} className={cellClass}>
                                                            {row.activity_type ?? '—'}
                                                        </td>
                                                    );
                                                }

                                                if (key === 'issue_date') {
                                                    return (
                                                        <td key={key} className={cellClass}>
                                                            {row.issue_date}
                                                        </td>
                                                    );
                                                }

                                                if (key === 'due_date') {
                                                    return (
                                                        <td key={key} className={cellClass}>
                                                            <span
                                                                className={[
                                                                    'inline-flex rounded-full border px-2 py-1 text-[10px] font-semibold',
                                                                    dueDateTone(
                                                                        row.due_date,
                                                                        row.status,
                                                                    ),
                                                                ].join(' ')}
                                                            >
                                                                {row.due_date ?? '—'}
                                                            </span>
                                                        </td>
                                                    );
                                                }

                                                if (key === 'total') {
                                                    return (
                                                        <td key={key} className={cellClass + ' font-semibold'}>
                                                            <Money value={row.total} currency={row.currency} compact />
                                                        </td>
                                                    );
                                                }

                                                if (key === 'paid') {
                                                    return (
                                                        <td key={key} className={cellClass + ' text-emerald-600'}>
                                                            <Money value={row.paid_total} currency={row.currency} compact />
                                                        </td>
                                                    );
                                                }

                                                if (key === 'outstanding') {
                                                    return (
                                                        <td key={key} className={cellClass + ' text-red-600'}>
                                                            <Money value={row.balance_due} currency={row.currency} compact />
                                                        </td>
                                                    );
                                                }

                                                if (key === 'status') {
                                                    return (
                                                        <td key={key} className={cellClass}>
                                                            <StatusBadge status={row.status} ar={ar} />
                                                        </td>
                                                    );
                                                }

                                                return (
                                                    <td key={key} className={cellClass}>
                                                        <div className="flex items-center gap-2">
                                                            <Link href={showHref(row.id)} className={financeButton}>
                                                                {text('عرض', 'Open')}
                                                            </Link>
                                                            {canManage
                                                                && lookups.permissions.documents_correct
                                                                && ['draft', 'issued', 'partially_paid', 'paid', 'overpaid'].includes(row.status) && (
                                                                <button
                                                                    type="button"
                                                                    disabled={archivingId === row.id}
                                                                    onClick={() => void archiveDocument(row)}
                                                                    className={financeButton}
                                                                >
                                                                    <Archive size={14} />
                                                                    {archivingId === row.id
                                                                        ? text('جارٍ الأرشفة...', 'Archiving...')
                                                                        : text('أرشفة', 'Archive')}
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <DataPagination
                            page={response.meta.current_page}
                            lastPage={response.meta.last_page}
                            perPage={response.meta.per_page}
                            total={response.meta.total}
                            loading={loading}
                            onPageChange={setPage}
                            onPerPageChange={(value) => { setPerPage(value); setPage(1); }}
                        />
                    </>
                )}
            </FPanel>

            {paymentOpen && (
                <PaymentDialog
                    direction={sales ? 'incoming' : 'outgoing'}
                    lookups={lookups}
                    ar={ar}
                    onClose={() => setPaymentOpen(false)}
                    onChanged={() => setRefreshKey((value) => value + 1)}
                />
            )}
        </div>
    );
}
