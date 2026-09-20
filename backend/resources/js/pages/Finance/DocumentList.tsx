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
    }, [kind, page, search, status]);

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

                <div className="border-t border-[var(--ac-line)] px-4 py-3">
                    <SavedViews
                        storageKey={`acconova:saved-views:finance-documents:${kind}`}
                        ar={ar}
                        value={{
                            search,
                            status,
                        }}
                        onApply={(saved) => {
                            setSearch(saved.search);
                            setStatus(saved.status);
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
                    <div className="p-12 text-center text-sm text-slate-400">
                        {text('لا توجد فواتير مطابقة.', 'No matching invoices.')}
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] text-xs">
                                <thead className="bg-[#f7faff] text-[#6f86a8]">
                                    <tr>
                                        {[
                                            text('رقم الفاتورة', 'Invoice'),
                                            sales
                                                ? text('العميل', 'Customer')
                                                : text('المورد', 'Supplier'),
                                            text('النشاط', 'Activity'),
                                            text('تاريخ الإصدار', 'Issue date'),
                                            text('الاستحقاق', 'Due date'),
                                            text('الإجمالي', 'Total'),
                                            text('المدفوع', 'Paid'),
                                            text('المتبقي', 'Outstanding'),
                                            text('الحالة', 'Status'),
                                            text('إجراء', 'Action'),
                                        ].map((label) => (
                                            <th
                                                key={label}
                                                className="px-3 py-3 text-start font-semibold"
                                            >
                                                {label}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {response.data.map((row) => (
                                        <tr
                                            key={row.id}
                                            className="border-t border-[#edf3fa] text-[#1d3f72] hover:bg-blue-50/40"
                                        >
                                            <td className="px-3 py-3 font-semibold text-[#1265d8]">
                                                {row.number}
                                            </td>
                                            <td className="px-3 py-3">
                                                {row.party?.name ?? '—'}
                                            </td>
                                            <td className="px-3 py-3">
                                                {row.activity_type ?? '—'}
                                            </td>
                                            <td className="px-3 py-3">
                                                {row.issue_date}
                                            </td>
                                            <td className="px-3 py-3">
                                                {row.due_date ?? '—'}
                                            </td>
                                            <td className="px-3 py-3 font-semibold">
                                                <Money
                                                    value={row.total}
                                                    currency={row.currency}
                                                    compact
                                                />
                                            </td>
                                            <td className="px-3 py-3 text-emerald-700">
                                                <Money
                                                    value={row.paid_total}
                                                    currency={row.currency}
                                                    compact
                                                />
                                            </td>
                                            <td className="px-3 py-3 text-red-600">
                                                <Money
                                                    value={row.balance_due}
                                                    currency={row.currency}
                                                    compact
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <StatusBadge
                                                    status={row.status}
                                                    ar={ar}
                                                />
                                            </td>
                                            <td className="px-3 py-3">
                                                <Link
                                                    href={showHref(row.id)}
                                                    className={financeButton}
                                                >
                                                    {text('عرض', 'Open')}
                                                </Link>
                                            </td>
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
