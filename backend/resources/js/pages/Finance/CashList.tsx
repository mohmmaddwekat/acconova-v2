import { apiRequest } from '@/lib/http';
import { Link, usePage } from '@inertiajs/react';
import {
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
import { useEffect, useState } from 'react';
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
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const inertiaUrl = usePage().url;
    const paymentView: 'transactions' | 'recurring' =
        ! incoming
        && new URLSearchParams(
            inertiaUrl.includes('?')
                ? inertiaUrl.split('?')[1]
                : '',
        ).get('view') === 'recurring'
            ? 'recurring'
            : 'transactions';

    useEffect(() => {
        const controller = new AbortController();
        const params = new URLSearchParams({
            direction,
            page: String(page),
            per_page: '20',
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

        setLoading(true);
        setError('');

        apiRequest<Response>(
            '/api/finance/cash-movements?' + params.toString(),
            { signal: controller.signal },
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
    }, [direction, page, search, method, status, category]);

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
                <div className="rounded-[16px] border border-[#dbe6f5] bg-white p-2 shadow-[0_8px_28px_rgba(30,75,140,.04)]">
                    <div className="flex flex-wrap gap-2">
                        <Link
                            href="/app/payments"
                            preserveScroll
                            replace
                            aria-current={
                                paymentView === 'transactions'
                                    ? 'page'
                                    : undefined
                            }
                            className={[
                                'inline-flex min-h-9 items-center gap-2 rounded-[10px] px-3.5 py-2 text-xs font-semibold transition',
                                paymentView === 'transactions'
                                    ? 'bg-[#123d78] text-white shadow-[0_5px_14px_rgba(18,101,216,.14)]'
                                    : 'text-[#52709a] hover:bg-blue-50 hover:text-[#1958a6]',
                            ].join(' ')}
                        >
                            <WalletCards size={14} />
                            {text('الحركات', 'Transactions')}
                        </Link>

                        <Link
                            href="/app/payments?view=recurring"
                            preserveScroll
                            replace
                            aria-current={
                                paymentView === 'recurring'
                                    ? 'page'
                                    : undefined
                            }
                            className={[
                                'inline-flex min-h-9 items-center gap-2 rounded-[10px] px-3.5 py-2 text-xs font-semibold transition',
                                paymentView === 'recurring'
                                    ? 'bg-[#123d78] text-white shadow-[0_5px_14px_rgba(18,101,216,.14)]'
                                    : 'text-[#52709a] hover:bg-blue-50 hover:text-[#1958a6]',
                            ].join(' ')}
                        >
                            <CalendarClock size={14} />
                            {text('المدفوعات المتكررة', 'Recurring payments')}
                        </Link>
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
                        <Search size={16} className="absolute start-3 top-3 text-slate-400" />
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

                    <select
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
                    </select>

                    <select
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
                    </select>

                    <select
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
                    </select>
                </div>
            </FPanel>

            {error && (
                <div role="alert" className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {error}
                </div>
            )}

            <FPanel title={title + (response ? ' (' + response.meta.total + ')' : '')} icon={CheckCircle2}>
                {loading ? (
                    <div className="p-12 text-center text-sm text-slate-400">
                        {text('جارٍ تحميل الحركات...', 'Loading movements...')}
                    </div>
                ) : ! response?.data.length ? (
                    <div className="p-12 text-center text-sm text-slate-400">
                        {text('لا توجد حركات مطابقة.', 'No matching movements.')}
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[980px] text-xs">
                                <thead className="bg-[#f7faff] text-[#6f86a8]">
                                    <tr>
                                        {[
                                            text('رقم الحركة', 'Movement'),
                                            text('التاريخ', 'Date'),
                                            text('المستفيد / المصدر', 'Party / source'),
                                            text('الفئة', 'Category'),
                                            text('الطريقة', 'Method'),
                                            text('المرجع', 'Reference'),
                                            text('المبلغ', 'Amount'),
                                            text('الحالة', 'Status'),
                                            text('إجراء', 'Action'),
                                        ].map((label) => (
                                            <th key={label} className="px-3 py-3 text-start font-semibold">
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
                                            <td className="px-3 py-3 font-semibold text-[#1265d8]">{row.number}</td>
                                            <td className="px-3 py-3">{row.movement_date}</td>
                                            <td className="px-3 py-3">{row.party?.name ?? '—'}</td>
                                            <td className="px-3 py-3">{row.category}</td>
                                            <td className="px-3 py-3">
                                                {row.method}
                                                {row.method === 'check' && row.check_status
                                                    ? <span className="ms-1 text-[9px] text-slate-400">({row.check_status})</span>
                                                    : null}
                                            </td>
                                            <td className="px-3 py-3">{row.reference ?? '—'}</td>
                                            <td className="px-3 py-3 font-bold">
                                                <Money value={row.amount} currency={row.currency} compact />
                                            </td>
                                            <td className="px-3 py-3">
                                                <StatusBadge status={row.status} ar={ar} />
                                            </td>
                                            <td className="px-3 py-3">
                                                <Link href={detailHref(row.id)} className={financeButton}>
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
                                    {text('صفحة', 'Page')} {response.meta.current_page} / {response.meta.last_page}
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
            </>
            )}
        </div>
    );
}
