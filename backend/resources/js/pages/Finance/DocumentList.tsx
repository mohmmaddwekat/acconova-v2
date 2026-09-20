import { SmartEmptyState } from '@/components/data/SmartEmptyState';
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
import { apiRequest } from '@/lib/http';
import { Link } from '@inertiajs/react';
import {
    Banknote,
    CalendarDays,
    Download,
    FileText,
    Plus,
    Search,
    TimerReset,
    WalletCards,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
    lookups,
    ar,
}: {
    kind: 'sale_invoice' | 'purchase_invoice';
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

    const [
        page,
        setPage,
    ] = useState(1);

    const [
        error,
        setError,
    ] = useState('');

    const [
        loading,
        setLoading,
    ] = useState(true);

    const sales = kind === 'sale_invoice';
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
        `acconova:list-preferences:finance:${kind}`,
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


    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({
            kind,
            page: String(page),
            per_page: '20',
        });

        if (search.trim()) {
            params.set('search', search.trim());
        }

        if (status) {
            params.set('status', status);
        }

        if (advancedFilterValues.min_total) {
            params.set('min_total', advancedFilterValues.min_total);
        }
        if (advancedFilterValues.max_total) {
            params.set('max_total', advancedFilterValues.max_total);
        }
        if (advancedFilterValues.due_after) {
            params.set('due_after', advancedFilterValues.due_after);
        }
        if (advancedFilterValues.due_before) {
            params.set('due_before', advancedFilterValues.due_before);
        }

        setLoading(true);
        setError('');

        apiRequest<Response>(
            '/api/finance/documents?' + params.toString(),
            {
                signal: controller.signal,
            },
        )
            .then(setResponse)
            .catch((failure) => {
                if (! controller.signal.aborted) {
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
        page,
        search,
        status,
        advancedFilterValues.min_total,
        advancedFilterValues.max_total,
        advancedFilterValues.due_after,
        advancedFilterValues.due_before,
    ]);

    const title = sales
        ? text('فواتير البيع', 'Sales invoices')
        : text('فواتير الشراء', 'Purchase invoices');

    const subtitle = sales
        ? text(
            'إدارة دورة البيع من المسودة إلى الإصدار والتحصيل، مع تتبع الرصيد والتصحيحات دون محو التاريخ.',
            'Manage sales from draft through issue and collection, with balances and immutable corrections.',
        )
        : text(
            'إدارة فواتير الموردين وشراء المواد الخام والبضائع والخدمات والشحن والأصول والمصاريف المرتبطة.',
            'Manage supplier invoices for raw materials, resale goods, services, freight, assets and related costs.',
        );

    const createHref = sales
        ? '/app/invoices/sales/create'
        : '/app/invoices/purchases/create';

    const showHref = (id: number): string =>
        sales
            ? '/app/invoices/sales/' + id
            : '/app/invoices/purchases/' + id;

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

                        {canManage && (
                            <Link
                                href={createHref}
                                className={financePrimary}
                            >
                                <Plus size={15} />
                                {sales
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
                active={sales ? 'sales' : 'purchases'}
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

                    <select
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
                    </select>

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
                {loading ? (
                    <div className="p-12 text-center text-sm text-slate-400">
                        {text('جارٍ تحميل الفواتير...', 'Loading invoices...')}
                    </div>
                ) : ! response?.data.length ? (
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
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[760px] text-xs">
                                <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                    <tr>
                                        {listPreferences.visibleKeys.map((key) => {
                                            const column = invoiceColumns.find(
                                                (item) => item.key === key,
                                            );

                                            return column ? (
                                                <th
                                                    key={key}
                                                    className={[
                                                        'px-3 text-start font-semibold',
                                                        listPreferences.density === 'compact'
                                                            ? 'py-2'
                                                            : 'py-3',
                                                    ].join(' ')}
                                                >
                                                    {column.label}
                                                </th>
                                            ) : null;
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {response.data.map((row) => (
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
                                                        <Link href={showHref(row.id)} className={financeButton}>
                                                            {text('عرض', 'Open')}
                                                        </Link>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {response.meta.last_page > 1 && (
                            <div className="flex items-center justify-between border-t border-[#edf3fa] p-4 text-xs text-slate-500">
                                <span>
                                    {text('صفحة', 'Page')}{' '}
                                    {response.meta.current_page}{' / '}
                                    {response.meta.last_page}
                                </span>

                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        className={financeButton}
                                        disabled={page <= 1}
                                        onClick={() => setPage((value) => value - 1)}
                                    >
                                        {text('السابق', 'Previous')}
                                    </button>
                                    <button
                                        type="button"
                                        className={financeButton}
                                        disabled={page >= response.meta.last_page}
                                        onClick={() => setPage((value) => value + 1)}
                                    >
                                        {text('التالي', 'Next')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </>
                )}
            </FPanel>
        </div>
    );
}
