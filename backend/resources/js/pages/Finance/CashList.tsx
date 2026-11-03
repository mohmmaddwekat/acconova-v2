import {
    AdvancedFilterBuilder,
    type AdvancedFilterCondition,
} from '@/components/data/AdvancedFilterBuilder';
import {
    ListPreferencesControl,
    useListPreferences,
    type ListColumn,
} from '@/components/data/ListPreferences';
import { SmartEmptyState } from '@/components/data/SmartEmptyState';
import { DataPagination } from '@/components/data/DataPagination';
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
    CalendarClock,
    CheckCircle2,
    Download,
    FileText,
    Plus,
    Search,
    WalletCards,
    XCircle,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { FinanceNav } from './FinanceNav';
import { RecurringPaymentsPanel } from './RecurringPaymentsPanel';
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
    CashRow,
    FinanceLookups,
} from './types';
import { Select } from '@/components/ui/Select';

type Response = {
    data: CashRow[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
    summary: {
        count: number;
        posted_incoming: string;
        posted_outgoing: string;
        drafts: number;
        reversed: number;
    };
};

export function CashList({
    direction,
    lookups,
    ar,
}: {
    direction: 'incoming' | 'outgoing';
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    const incoming = direction === 'incoming';
    const canCreate = incoming
        ? lookups.permissions.cash_receive
        : lookups.permissions.cash_pay;

    const [response, setResponse] = useState<Response | null>(null);
    const [search, setSearch] = useState('');
    const [method, setMethod] = useState('');
    const [status, setStatus] = useState('');
    const [category, setCategory] = useState('');
    const [advancedConditions, setAdvancedConditions] =
        useState<AdvancedFilterCondition[]>([]);
    const [tableSort, setTableSort] = useState<TableSort>(null);
    const [columnFilters, setColumnFilters] = useState({
        min_amount: '',
        max_amount: '',
        date_from: '',
        date_to: '',
    });
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(20);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [refreshKey, setRefreshKey] = useState(0);
    const [archivingId, setArchivingId] = useState<number | null>(null);
    const [paymentView, setPaymentView] =
        useState<'transactions' | 'recurring'>(
            'transactions',
        );

    function changePaymentView(
        view: 'transactions' | 'recurring',
    ): void {
        setPaymentView(view);
    }

    const cashColumns: ListColumn[] = [
        { key: 'number', label: text('رقم الحركة', 'Movement') },
        { key: 'date', label: text('التاريخ', 'Date') },
        { key: 'party', label: text('المستفيد / المصدر', 'Party / source') },
        { key: 'category', label: text('الفئة', 'Category') },
        { key: 'method', label: text('الطريقة', 'Method') },
        { key: 'reference', label: text('المرجع', 'Reference') },
        { key: 'amount', label: text('المبلغ', 'Amount') },
        { key: 'status', label: text('الحالة', 'Status') },
        { key: 'action', label: text('إجراء', 'Action') },
    ];

    const listPreferences = useListPreferences(
        `acconova:list-preferences:finance:cash:${direction}`,
        cashColumns,
    );

    const advancedFilterValues = advancedConditions.reduce(
        (result, condition) => {
            const value = condition.value.trim();

            if (! value) {
                return result;
            }

            if (condition.field === 'amount') {
                if (condition.operator === 'gte') {
                    result.min_amount = value;
                }
                if (condition.operator === 'lte') {
                    result.max_amount = value;
                }
                if (condition.operator === 'equals') {
                    result.min_amount = value;
                    result.max_amount = value;
                }
            }

            if (condition.field === 'movement_date') {
                if (condition.operator === 'after') {
                    result.date_from = value;
                }
                if (condition.operator === 'before') {
                    result.date_to = value;
                }
                if (condition.operator === 'equals') {
                    result.date_from = value;
                    result.date_to = value;
                }
            }

            return result;
        },
        {} as {
            min_amount?: string;
            max_amount?: string;
            date_from?: string;
            date_to?: string;
        },
    );

    const liveTick = useLiveTick();
    const seenLiveTick = useRef(liveTick);

    useEffect(() => {
        const silent = seenLiveTick.current !== liveTick;
        seenLiveTick.current = liveTick;
        const controller = new AbortController();
        const params = new URLSearchParams({
            direction,
            page: String(page),
            per_page: String(perPage),
        });

        if (search.trim()) {
            params.set('search', search.trim());
        }
        if (method) {
            params.set('method', method);
        }
        if (status) {
            params.set('status', status);
        }
        if (category) {
            params.set('category', category);
        }
        if (! incoming) {
            params.set('exclude_petty', '1');
        }
        const minAmount = columnFilters.min_amount || advancedFilterValues.min_amount;
        const maxAmount = columnFilters.max_amount || advancedFilterValues.max_amount;
        const dateFrom = columnFilters.date_from || advancedFilterValues.date_from;
        const dateTo = columnFilters.date_to || advancedFilterValues.date_to;

        if (minAmount) {
            params.set('min_amount', minAmount);
        }
        if (maxAmount) {
            params.set('max_amount', maxAmount);
        }
        if (dateFrom) {
            params.set('date_from', dateFrom);
        }
        if (dateTo) {
            params.set('date_to', dateTo);
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
            '/api/finance/cash-movements?' + params.toString(),
            { signal: controller.signal },
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
        direction,
        page,
        perPage,
        search,
        method,
        status,
        category,
        advancedFilterValues.min_amount,
        advancedFilterValues.max_amount,
        advancedFilterValues.date_from,
        advancedFilterValues.date_to,
        columnFilters,
        tableSort,
        refreshKey,
        liveTick,
    ]);

    const hasFilters = search !== ''
        || method !== ''
        || status !== ''
        || category !== ''
        || advancedConditions.length > 0
        || Object.values(columnFilters).some((value) => value !== '');

    function clearAllFilters(): void {
        setSearch('');
        setMethod('');
        setStatus('');
        setCategory('');
        setAdvancedConditions([]);
        setColumnFilters({
            min_amount: '',
            max_amount: '',
            date_from: '',
            date_to: '',
        });
        setPage(1);
    }

    const showEmptyState = ! response
        || (response.data.length === 0 && ! hasFilters && tableSort === null);

    const title = incoming
        ? text('سجل المقبوضات', 'Receipts ledger')
        : text('سجل المدفوعات', 'Payments ledger');

    const subtitle = incoming
        ? text(
            'كل المقبوضات الواردة: تحصيل فواتير، دفعات مقدمة، تسويات، تمويل، بيع أصول وإيرادات أخرى.',
            'All incoming cash: invoice collections, advances, settlements, funding, asset sales and other income.',
        )
        : text(
            'كل المدفوعات الخارجة: الموردون، المواد الخام، التشغيل، الإيجار، الشحن، الضرائب والمصاريف الأخرى. الرواتب تبقى داخل نظام الموظفين.',
            'All outgoing cash: suppliers, raw materials, operations, rent, freight, taxes and other expenses. Payroll stays in the staff module.',
        );

    const createHref = incoming
        ? '/app/receipts/create'
        : '/app/payments/create';

    const detailHref = (id: number): string =>
        incoming
            ? '/app/receipts/' + id
            : '/app/payments/' + id;

    async function archiveMovement(row: CashRow): Promise<void> {
        const reason = window.prompt(text(
            'سبب أرشفة الحركة؟ سيتم عكس أثرها المالي. (5 أحرف على الأقل)',
            'Archive reason? Its financial effect will be reversed. (at least 5 characters)',
        ));

        if (! reason || reason.trim().length < 5) {
            return;
        }

        setArchivingId(row.id);
        setError('');

        try {
            await apiRequest(`/api/finance/cash-movements/${row.id}/reverse`, {
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

    const categories = incoming
        ? [
            ['customer_receipt', text('تحصيل عميل', 'Customer receipt')],
            ['capital', text('تمويل / رأس مال', 'Capital / funding')],
            ['asset_sale', text('بيع أصل', 'Asset sale')],
            ['loan', text('قرض مستلم', 'Loan received')],
            ['refund', text('مرتجع / تسوية', 'Refund / settlement')],
            ['other_income', text('دخل آخر', 'Other income')],
            ['other', text('أخرى', 'Other')],
        ]
        : [
            ['supplier_payment', text('موردون', 'Suppliers')],
            ['raw_material', text('مواد خام', 'Raw materials')],
            ['goods_for_resale', text('بضائع للبيع', 'Goods for resale')],
            ['packaging', text('تعبئة وتغليف', 'Packaging')],
            ['operating_expense', text('مصروف تشغيلي', 'Operating expense')],
            ['rent', text('إيجار', 'Rent')],
            ['utilities', text('كهرباء ومياه', 'Utilities')],
            ['shipping_customs', text('شحن وجمارك', 'Freight & customs')],
            ['maintenance', text('صيانة', 'Maintenance')],
            ['marketing', text('تسويق', 'Marketing')],
            ['tax_payment', text('ضرائب', 'Tax payment')],
            ['government_fee', text('رسوم حكومية', 'Government fee')],
            ['asset_purchase', text('شراء أصل', 'Asset purchase')],
            ['other_expense', text('مصروف آخر', 'Other expense')],
            ['other', text('أخرى', 'Other')],
        ];

    const methods = [
        ['cash', text('نقدي', 'Cash')],
        ['bank_transfer', text('تحويل بنكي', 'Bank transfer')],
        ['check', text('شيك', 'Check')],
        ['card', text('بطاقة', 'Card')],
        ['electronic_wallet', text('محفظة إلكترونية', 'E-wallet')],
        ['direct_debit', text('خصم مباشر', 'Direct debit')],
        ['other', text('أخرى', 'Other')],
    ];

    function exportRows(): void {
        const rows = response?.data ?? [];

        downloadCsv(
            incoming ? 'receipts.csv' : 'payments.csv',
            [
                [
                    text('رقم الحركة', 'Movement'),
                    text('التاريخ', 'Date'),
                    text('الطرف', 'Party'),
                    text('الفئة', 'Category'),
                    text('الطريقة', 'Method'),
                    text('المبلغ', 'Amount'),
                    text('العملة', 'Currency'),
                    text('الحالة', 'Status'),
                    text('المرجع', 'Reference'),
                ],
                ...rows.map((row) => [
                    row.number,
                    row.movement_date,
                    row.party?.name,
                    row.category,
                    row.method,
                    row.amount,
                    row.currency,
                    row.status,
                    row.reference,
                ]),
            ],
        );
    }

    return (
        <div className="space-y-4">
            <FinanceHeader
                title={
                    ! incoming && paymentView === 'recurring'
                        ? text('المدفوعات المتكررة', 'Recurring payments')
                        : title
                }
                subtitle={
                    ! incoming && paymentView === 'recurring'
                        ? text(
                            'الإيجار والاشتراكات والخدمات والالتزامات الدورية، كلها داخل صفحة المدفوعات نفسها.',
                            'Rent, subscriptions, services and recurring obligations, all inside the payments workspace.',
                        )
                        : subtitle
                }
                actions={
                    ! incoming && paymentView === 'recurring'
                        ? undefined
                        : <>
                        <button
                            type="button"
                            className={financeButton}
                            disabled={! response?.data.length}
                            onClick={exportRows}
                        >
                            <Download size={15} />
                            {text('تصدير', 'Export')}
                        </button>

                        {canCreate && (
                            <Link href={createHref} className={financePrimary}>
                                <Plus size={15} />
                                {incoming
                                    ? text('تسجيل مقبوض', 'Record receipt')
                                    : text('تسجيل دفعة', 'Record payment')}
                            </Link>
                        )}
                    </>
                }
            />

            {(
                incoming
                || paymentView === 'transactions'
            ) && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <SummaryCard
                    label={text('إجمالي الحركات', 'Movements')}
                    value={response?.summary.count ?? 0}
                    icon={FileText}
                />
                <SummaryCard
                    label={text('المقبوضات المؤكدة', 'Posted receipts')}
                    value={
                        <Money
                            value={response?.summary.posted_incoming ?? 0}
                            currency={lookups.currency}
                        />
                    }
                    icon={Banknote}
                    tone="green"
                />
                <SummaryCard
                    label={text('المدفوعات المؤكدة', 'Posted payments')}
                    value={
                        <Money
                            value={response?.summary.posted_outgoing ?? 0}
                            currency={lookups.currency}
                        />
                    }
                    icon={WalletCards}
                    tone="amber"
                />
                <SummaryCard
                    label={text('مسودات / معكوسة', 'Draft / reversed')}
                    value={
                        String(response?.summary.drafts ?? 0)
                        + ' / '
                        + String(response?.summary.reversed ?? 0)
                    }
                    icon={XCircle}
                    tone="red"
                />
            </div>
            )}

            <FinanceNav
                lookups={lookups}
                ar={ar}
                active={incoming ? 'receipts' : 'payments'}
            />

            {! incoming && lookups.permissions.recurring_payments_view && (
                <div className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-2 shadow-[0_8px_28px_rgba(30,75,140,.04)]">
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            aria-pressed={paymentView === 'transactions'}
                            onClick={() => changePaymentView('transactions')}
                            className={[
                                'inline-flex min-h-9 items-center gap-2 rounded-[10px] px-3.5 py-2 text-xs font-semibold transition',
                                paymentView === 'transactions'
                                    ? 'bg-[var(--ac-accent-solid)] text-white shadow-[0_5px_14px_rgba(18,101,216,.14)]'
                                    : 'text-[var(--ac-text-soft)] hover:bg-blue-50 hover:text-[var(--ac-accent)]',
                            ].join(' ')}
                        >
                            <WalletCards size={14} />
                            {text('الحركات', 'Transactions')}
                        </button>

                        <button
                            type="button"
                            aria-pressed={paymentView === 'recurring'}
                            onClick={() => changePaymentView('recurring')}
                            className={[
                                'inline-flex min-h-9 items-center gap-2 rounded-[10px] px-3.5 py-2 text-xs font-semibold transition',
                                paymentView === 'recurring'
                                    ? 'bg-[var(--ac-accent-solid)] text-white shadow-[0_5px_14px_rgba(18,101,216,.14)]'
                                    : 'text-[var(--ac-text-soft)] hover:bg-blue-50 hover:text-[var(--ac-accent)]',
                            ].join(' ')}
                        >
                            <CalendarClock size={14} />
                            {text('المدفوعات المتكررة', 'Recurring payments')}
                        </button>
                    </div>
                </div>
            )}

            {! incoming && paymentView === 'recurring' ? (
                <RecurringPaymentsPanel />
            ) : (
            <>
            <FPanel title={text('عوامل التصفية والبحث', 'Filters & search')} icon={Search}>
                <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
                    <label className="relative xl:col-span-2">
                        <Search size={16} className="absolute start-3 top-3 text-[var(--ac-text-muted)]" />
                        <input
                            className={financeInput + ' ps-9'}
                            value={search}
                            onChange={(event) => {
                                setSearch(event.target.value);
                                setPage(1);
                            }}
                            placeholder={text(
                                'ابحث بالرقم أو المرجع أو الطرف...',
                                'Search movement, reference or party...',
                            )}
                        />
                    </label>

                    <Select
                        className={financeInput}
                        value={category}
                        onChange={(event) => {
                            setCategory(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">{text('جميع الفئات', 'All categories')}</option>
                        {categories.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </Select>

                    <Select
                        className={financeInput}
                        value={method}
                        onChange={(event) => {
                            setMethod(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">{text('جميع طرق الدفع', 'All methods')}</option>
                        {methods.map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </Select>

                    <Select
                        className={financeInput}
                        value={status}
                        onChange={(event) => {
                            setStatus(event.target.value);
                            setPage(1);
                        }}
                    >
                        <option value="">{text('جميع الحالات', 'All statuses')}</option>
                        <option value="draft">{text('مسودة', 'Draft')}</option>
                        <option value="posted">{text('مؤكدة', 'Posted')}</option>
                        <option value="reversed">{text('معكوسة', 'Reversed')}</option>
                    </Select>
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
                                key: 'amount',
                                label: text('المبلغ', 'Amount'),
                                type: 'number',
                                operators: ['gte', 'lte', 'equals'],
                            },
                            {
                                key: 'movement_date',
                                label: text('تاريخ الحركة', 'Movement date'),
                                type: 'date',
                                operators: ['after', 'before', 'equals'],
                            },
                        ]}
                    />

                    <ListPreferencesControl
                        columns={cashColumns}
                        order={listPreferences.order}
                        hidden={listPreferences.hidden}
                        density={listPreferences.density}
                        onOrderChange={listPreferences.setOrder}
                        onToggleColumn={listPreferences.toggleColumn}
                        onDensityChange={listPreferences.setDensity}
                        ar={ar}
                    />

                    <SavedViews
                        storageKey={`acconova:saved-views:cash:${direction}`}
                        ar={ar}
                        value={{
                            search,
                            category,
                            method,
                            status,
                            advancedConditions,
                        }}
                        onApply={(saved) => {
                            setSearch(saved.search);
                            setCategory(saved.category);
                            setMethod(saved.method);
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
                <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            <FPanel title={title + (response ? ' (' + response.meta.total + ')' : '')} icon={CheckCircle2}>
                {loading && ! response ? (
                    <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                        {text('جارٍ تحميل الحركات...', 'Loading movements...')}
                    </div>
                ) : showEmptyState ? (
                    <SmartEmptyState
                        icon={incoming ? WalletCards : Banknote}
                        title={text(
                            search || method || status || category
                                ? 'لا توجد حركات مطابقة'
                                : incoming
                                    ? 'لا توجد مقبوضات بعد'
                                    : 'لا توجد مدفوعات بعد',
                            search || method || status || category
                                ? 'No matching movements'
                                : incoming
                                    ? 'No receipts yet'
                                    : 'No payments yet',
                        )}
                        description={text(
                            search || method || status || category
                                ? 'غيّر البحث أو عوامل التصفية، أو سجّل حركة جديدة.'
                                : 'ابدأ بتسجيل أول حركة مالية لتظهر هنا مع حالة الاعتماد وطريقة الدفع.',
                            search || method || status || category
                                ? 'Adjust the search or filters, or record a new movement.'
                                : 'Record the first cash movement to track status and payment method here.',
                        )}
                        primary={canCreate ? (
                            <Link
                                href={createHref}
                                className={financePrimary}
                            >
                                <Plus size={15} />
                                {incoming
                                    ? text('تسجيل مقبوض', 'Record receipt')
                                    : text('تسجيل دفعة', 'Record payment')}
                            </Link>
                        ) : undefined}
                        secondary={(search || method || status || category) ? (
                            <button
                                type="button"
                                className={financeButton}
                                onClick={() => {
                                    setSearch('');
                                    setMethod('');
                                    setStatus('');
                                    setCategory('');
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
                            <table className="w-full min-w-[980px] text-xs">
                                <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                    <tr>
                                        {listPreferences.visibleKeys.map((key) => {
                                            const column = cashColumns.find((item) => item.key === key);

                                            if (! column) {
                                                return null;
                                            }

                                            const sortKeys: Record<string, string> = {
                                                number: 'number',
                                                date: 'date',
                                                party: 'party',
                                                category: 'category',
                                                method: 'method',
                                                reference: 'reference',
                                                amount: 'amount',
                                                status: 'status',
                                            };

                                            let filter: ReactNode;
                                            let filterActive = false;

                                            if (key === 'number' || key === 'party' || key === 'reference') {
                                                filterActive = search !== '';
                                                filter = (
                                                    <ColumnFilterText
                                                        ar={ar}
                                                        value={search}
                                                        onChange={(value) => {
                                                            setSearch(value);
                                                            setPage(1);
                                                        }}
                                                        placeholder={text('رقم أو مرجع أو اسم', 'Number, reference or name')}
                                                    />
                                                );
                                            } else if (key === 'date') {
                                                filterActive = columnFilters.date_from !== '' || columnFilters.date_to !== '';
                                                filter = (
                                                    <ColumnFilterRange
                                                        ar={ar}
                                                        type="date"
                                                        from={columnFilters.date_from}
                                                        to={columnFilters.date_to}
                                                        onChange={(from, to) => {
                                                            setColumnFilters((current) => ({ ...current, date_from: from, date_to: to }));
                                                            setPage(1);
                                                        }}
                                                    />
                                                );
                                            } else if (key === 'amount') {
                                                filterActive = columnFilters.min_amount !== '' || columnFilters.max_amount !== '';
                                                filter = (
                                                    <ColumnFilterRange
                                                        ar={ar}
                                                        type="number"
                                                        from={columnFilters.min_amount}
                                                        to={columnFilters.max_amount}
                                                        onChange={(from, to) => {
                                                            setColumnFilters((current) => ({ ...current, min_amount: from, max_amount: to }));
                                                            setPage(1);
                                                        }}
                                                    />
                                                );
                                            } else if (key === 'category') {
                                                filterActive = category !== '';
                                                filter = (
                                                    <ColumnFilterSelect
                                                        value={category}
                                                        options={categories as [string, string][]}
                                                        allLabel={text('جميع الفئات', 'All categories')}
                                                        onChange={(value) => {
                                                            setCategory(value);
                                                            setPage(1);
                                                        }}
                                                    />
                                                );
                                            } else if (key === 'method') {
                                                filterActive = method !== '';
                                                filter = (
                                                    <ColumnFilterSelect
                                                        value={method}
                                                        options={methods as [string, string][]}
                                                        allLabel={text('جميع طرق الدفع', 'All methods')}
                                                        onChange={(value) => {
                                                            setMethod(value);
                                                            setPage(1);
                                                        }}
                                                    />
                                                );
                                            } else if (key === 'status') {
                                                filterActive = status !== '';
                                                filter = (
                                                    <ColumnFilterSelect
                                                        value={status}
                                                        options={[
                                                            ['draft', text('مسودة', 'Draft')],
                                                            ['posted', text('مؤكدة', 'Posted')],
                                                            ['reversed', text('معكوسة', 'Reversed')],
                                                        ]}
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
                                                {text('لا توجد حركات مطابقة للفلاتر.', 'No movements match the filters.')}
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
                                            className="border-t border-[var(--ac-line)] text-[var(--ac-text)] hover:bg-blue-50/40"
                                        >
                                            {listPreferences.visibleKeys.map((key) => {
                                                const cell = [
                                                    'px-3',
                                                    listPreferences.density === 'compact' ? 'py-2' : 'py-3',
                                                ].join(' ');

                                                switch (key) {
                                                    case 'number':
                                                        return <td key={key} className={cell + ' font-semibold text-[var(--ac-accent)]'}>{row.number}</td>;
                                                    case 'date':
                                                        return <td key={key} className={cell}>{row.movement_date}</td>;
                                                    case 'party':
                                                        return <td key={key} className={cell}>{row.party?.name ?? '—'}</td>;
                                                    case 'category':
                                                        return <td key={key} className={cell}>{row.category}</td>;
                                                    case 'method':
                                                        return (
                                                            <td key={key} className={cell}>
                                                                {row.method}
                                                                {row.method === 'check' && row.check_status
                                                                    ? <span className="ms-1 text-[9px] text-[var(--ac-text-muted)]">({row.check_status})</span>
                                                                    : null}
                                                            </td>
                                                        );
                                                    case 'reference':
                                                        return <td key={key} className={cell}>{row.reference ?? '—'}</td>;
                                                    case 'amount':
                                                        return (
                                                            <td key={key} className={cell + ' font-bold'}>
                                                                <Money value={row.amount} currency={row.currency} compact />
                                                            </td>
                                                        );
                                                    case 'status':
                                                        return (
                                                            <td key={key} className={cell}>
                                                                <StatusBadge status={row.status} ar={ar} />
                                                            </td>
                                                        );
                                                    case 'action':
                                                        return (
                                                            <td key={key} className={cell}>
                                                                <div className="flex items-center gap-2">
                                                                    <Link href={detailHref(row.id)} className={financeButton}>
                                                                        {text('عرض', 'Open')}
                                                                    </Link>
                                                                    {lookups.permissions.cash_correct && row.status === 'posted' && (
                                                                        <button
                                                                            type="button"
                                                                            disabled={archivingId === row.id}
                                                                            onClick={() => void archiveMovement(row)}
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
                                                    default:
                                                        return null;
                                                }
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
            </>
            )}
        </div>
    );
}
