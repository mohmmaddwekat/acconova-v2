import { ApiError, apiRequest } from '@/lib/http';
import { downloadCsv } from '@/pages/Finance/shared';
import type {
    CashRow,
    DocumentRow,
} from '@/pages/Finance/types';
import { Link } from '@inertiajs/react';
import {
    Banknote,
    CalendarDays,
    CheckCircle2,
    CircleDollarSign,
    Clock3,
    CreditCard,
    Download,
    FileText,
    Landmark,
    Plus,
    ReceiptText,
    RefreshCcw,
    Search,
    WalletCards,
} from 'lucide-react';
import {
    useEffect,
    useState,
    type ComponentType,
    type ReactNode,
} from 'react';

type PartySide =
    | 'customer'
    | 'supplier';

type PartyOperationsTab =
    | 'invoices'
    | 'payments';

type Permissions = {
    sales_view: boolean;
    sales_manage: boolean;
    purchases_view: boolean;
    purchases_manage: boolean;
    cash_view: boolean;
    cash_receive: boolean;
    cash_pay: boolean;
    party_edit: boolean;
};

type PageMeta = {
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
};

type DocumentResponse = {
    data: DocumentRow[];
    meta: PageMeta;
    summary: {
        count: number;
        total: string;
        paid: string;
        outstanding: string;
        paid_count: number;
        open_count: number;
        overdue: number;
        overdue_amount: string;
    };
};

type MethodSummary = {
    count: number;
    amount: string;
};

type CashResponse = {
    data: CashRow[];
    meta: PageMeta;
    summary: {
        count: number;
        posted_incoming: string;
        posted_outgoing: string;
        drafts: number;
        reversed: number;
        methods: Record<
            string,
            MethodSummary
        >;
    };
};

const panel =
    'rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]';

const button =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)] disabled:opacity-40';

const primaryButton =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-accent)] bg-[var(--ac-accent)] px-4 text-[10px] font-bold text-white transition hover:brightness-110 disabled:opacity-40';

const input =
    'h-11 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)] focus:ring-2 focus:ring-[var(--ac-accent)]/10';

function dateValue(
    date: Date,
): string {
    return [
        date.getFullYear(),
        String(
            date.getMonth() + 1,
        ).padStart(
            2,
            '0',
        ),
        String(
            date.getDate(),
        ).padStart(
            2,
            '0',
        ),
    ].join(
        '-',
    );
}

function yearStart(): string {
    const date =
        new Date();

    return dateValue(
        new Date(
            date.getFullYear(),
            0,
            1,
        ),
    );
}

function today(): string {
    return dateValue(
        new Date(),
    );
}

function toNumber(
    value:
        | string
        | number
        | null
        | undefined,
): number {
    return Number(
        value ?? 0,
    ) || 0;
}

function money(
    value:
        | string
        | number,
    currency: string,
    locale: string,
): string {
    return new Intl.NumberFormat(
        locale === 'ar'
            ? 'ar'
            : 'en',
        {
            style:
                'currency',
            currency,
            minimumFractionDigits:
                2,
            maximumFractionDigits:
                2,
        },
    ).format(
        toNumber(
            value,
        ),
    );
}

function documentOverdue(
    row: DocumentRow,
): boolean {
    if (
        ! row.due_date
        || ! [
            'issued',
            'partially_paid',
        ].includes(
            row.status,
        )
    ) {
        return false;
    }

    return row.due_date
        < today();
}

function statusLabel(
    status: string,
    ar: boolean,
): string {
    const map:
        Record<
            string,
            [string, string]
        > = {
            draft: [
                'مسودة',
                'Draft',
            ],
            issued: [
                'غير مدفوعة',
                'Unpaid',
            ],
            partially_paid: [
                'مدفوعة جزئياً',
                'Partial',
            ],
            paid: [
                'مدفوعة',
                'Paid',
            ],
            overpaid: [
                'مدفوعة بزيادة',
                'Overpaid',
            ],
            superseded: [
                'مستبدلة',
                'Superseded',
            ],
            voided: [
                'ملغاة',
                'Voided',
            ],
            posted: [
                'مرحّلة',
                'Posted',
            ],
            reversed: [
                'معكوسة',
                'Reversed',
            ],
        };

    return map[status]
        ? (
            ar
                ? map[status][0]
                : map[status][1]
        )
        : status;
}

function methodLabel(
    method: string,
    ar: boolean,
): string {
    const map:
        Record<
            string,
            [string, string]
        > = {
            bank_transfer: [
                'تحويل بنكي',
                'Bank transfer',
            ],
            check: [
                'شيك',
                'Cheque',
            ],
            cash: [
                'نقدي',
                'Cash',
            ],
            card: [
                'بطاقة',
                'Card',
            ],
            electronic_wallet: [
                'محفظة إلكترونية',
                'E-wallet',
            ],
            direct_debit: [
                'خصم مباشر',
                'Direct debit',
            ],
            other: [
                'أخرى',
                'Other',
            ],
        };

    return map[method]
        ? (
            ar
                ? map[method][0]
                : map[method][1]
        )
        : method;
}

function invoiceHref(
    side: PartySide,
    id: number,
): string {
    return side ===
        'customer'
        ? '/app/invoices/sales/'
            + String(id)
        : '/app/invoices/purchases/'
            + String(id);
}

function invoiceCreateHref(
    side: PartySide,
    partyId: number,
): string {
    return (
        side ===
        'customer'
            ? '/app/invoices/sales/create?party_id='
            : '/app/invoices/purchases/create?party_id='
    ) + String(
        partyId,
    );
}

function cashHref(
    side: PartySide,
    id: number,
): string {
    return side ===
        'customer'
        ? '/app/receipts/'
            + String(id)
        : '/app/payments/'
            + String(id);
}

function cashCreateHref(
    side: PartySide,
    partyId: number,
): string {
    return (
        side ===
        'customer'
            ? '/app/receipts/create?party_id='
            : '/app/payments/create?party_id='
    ) + String(
        partyId,
    );
}

function settlementHref(
    side: PartySide,
    documentId: number,
): string {
    return (
        side ===
        'customer'
            ? '/app/receipts/create?document_id='
            : '/app/payments/create?document_id='
    ) + String(
        documentId,
    );
}

export function PartyFinancialOperations({
    partyId,
    partyName,
    roles,
    permissions,
    currency,
    tab,
    ar,
    locale,
}: {
    partyId: number;
    partyName: string;
    roles: string[];
    permissions: Permissions;
    currency: string;
    tab: PartyOperationsTab;
    ar: boolean;
    locale: string;
}) {
    const hasCustomer =
        roles.includes(
            'customer',
        );

    const hasSupplier =
        roles.includes(
            'supplier',
        );

    const [
        side,
        setSide,
    ] = useState<
        PartySide
    >(
        hasCustomer
            ? 'customer'
            : 'supplier',
    );

    const [
        dateFrom,
        setDateFrom,
    ] = useState(
        yearStart(),
    );

    const [
        dateTo,
        setDateTo,
    ] = useState(
        today(),
    );

    const [
        search,
        setSearch,
    ] = useState(
        '',
    );

    const [
        status,
        setStatus,
    ] = useState(
        '',
    );

    const [
        method,
        setMethod,
    ] = useState(
        '',
    );

    const [
        page,
        setPage,
    ] = useState(
        1,
    );

    const [
        loading,
        setLoading,
    ] = useState(
        false,
    );

    const [
        error,
        setError,
    ] = useState(
        '',
    );

    const [
        documents,
        setDocuments,
    ] = useState<
        DocumentResponse | null
    >(
        null,
    );

    const [
        cash,
        setCash,
    ] = useState<
        CashResponse | null
    >(
        null,
    );

    useEffect(
        () => {
            if (
                side ===
                    'customer'
                && ! hasCustomer
                && hasSupplier
            ) {
                setSide(
                    'supplier',
                );
            }

            if (
                side ===
                    'supplier'
                && ! hasSupplier
                && hasCustomer
            ) {
                setSide(
                    'customer',
                );
            }
        },
        [
            side,
            hasCustomer,
            hasSupplier,
        ],
    );

    useEffect(
        () => {
            setPage(
                1,
            );
        },
        [
            side,
            dateFrom,
            dateTo,
            search,
            status,
            method,
            tab,
        ],
    );

    useEffect(
        () => {
            let alive =
                true;

            async function load(): Promise<void> {
                setLoading(
                    true,
                );
                setError(
                    '',
                );

                try {
                    const params =
                        new URLSearchParams({
                            party_id:
                                String(
                                    partyId,
                                ),
                            date_from:
                                dateFrom,
                            date_to:
                                dateTo,
                            page:
                                String(
                                    page,
                                ),
                            per_page:
                                '10',
                        });

                    if (
                        search.trim()
                    ) {
                        params.set(
                            'search',
                            search.trim(),
                        );
                    }

                    if (
                        tab ===
                        'invoices'
                    ) {
                        params.set(
                            'kind',
                            side ===
                                'customer'
                                ? 'sale_invoice'
                                : 'purchase_invoice',
                        );

                        if (
                            status
                        ) {
                            params.set(
                                'status',
                                status,
                            );
                        }

                        const response =
                            await apiRequest<
                                DocumentResponse
                            >(
                                '/api/finance/documents?'
                                + params.toString(),
                            );

                        if (
                            alive
                        ) {
                            setDocuments(
                                response,
                            );
                        }
                    } else {
                        params.set(
                            'direction',
                            side ===
                                'customer'
                                ? 'incoming'
                                : 'outgoing',
                        );

                        params.set(
                            'category',
                            side ===
                                'customer'
                                ? 'customer_receipt'
                                : 'supplier_payment',
                        );

                        if (
                            method
                        ) {
                            params.set(
                                'method',
                                method,
                            );
                        }

                        const response =
                            await apiRequest<
                                CashResponse
                            >(
                                '/api/finance/cash-movements?'
                                + params.toString(),
                            );

                        if (
                            alive
                        ) {
                            setCash(
                                response,
                            );
                        }
                    }
                } catch (
                    failure
                ) {
                    if (
                        alive
                    ) {
                        setError(
                            failure instanceof
                            ApiError
                                ? failure.message
                                : (
                                    ar
                                        ? 'تعذر تحميل بيانات هذه الجهة.'
                                        : 'Could not load this party data.'
                                ),
                        );
                    }
                } finally {
                    if (
                        alive
                    ) {
                        setLoading(
                            false,
                        );
                    }
                }
            }

            void load();

            return () => {
                alive =
                    false;
            };
        },
        [
            partyId,
            side,
            dateFrom,
            dateTo,
            search,
            status,
            method,
            page,
            tab,
            ar,
        ],
    );

    const canManageInvoice =
        side ===
            'customer'
            ? permissions
                .sales_manage
            : permissions
                .purchases_manage;

    const canManageCash =
        side ===
            'customer'
            ? permissions
                .cash_receive
            : permissions
                .cash_pay;

    const sideTitle =
        side ===
            'customer'
            ? (
                ar
                    ? 'العميل'
                    : 'customer'
            )
            : (
                ar
                    ? 'المورد'
                    : 'supplier'
            );

    const title =
        tab ===
            'invoices'
            ? (
                side ===
                    'customer'
                    ? (
                        ar
                            ? 'فواتير العميل'
                            : 'Customer invoices'
                    )
                    : (
                        ar
                            ? 'فواتير المورد'
                            : 'Supplier bills'
                    )
            )
            : (
                side ===
                    'customer'
                    ? (
                        ar
                            ? 'مقبوضات العميل'
                            : 'Customer receipts'
                    )
                    : (
                        ar
                            ? 'مدفوعات المورد'
                            : 'Supplier payments'
                    )
            );

    const reset = (): void => {
        setSearch(
            '',
        );
        setStatus(
            '',
        );
        setMethod(
            '',
        );
        setDateFrom(
            yearStart(),
        );
        setDateTo(
            today(),
        );
        setPage(
            1,
        );
    };

    function exportRows(): void {
        if (
            tab ===
                'invoices'
            && documents
        ) {
            downloadCsv(
                'party-'
                + String(
                    partyId,
                )
                + '-'
                + side
                + '-invoices.csv',
                [
                    [
                        ar
                            ? 'رقم الفاتورة'
                            : 'Invoice no',
                        ar
                            ? 'تاريخ الإصدار'
                            : 'Issue date',
                        ar
                            ? 'الاستحقاق'
                            : 'Due date',
                        ar
                            ? 'الحالة'
                            : 'Status',
                        ar
                            ? 'الإجمالي'
                            : 'Total',
                        ar
                            ? 'المدفوع'
                            : 'Paid',
                        ar
                            ? 'المتبقي'
                            : 'Balance',
                    ],
                    ...documents.data.map(
                        row => [
                            row.number,
                            row.issue_date,
                            row.due_date
                            ?? '',
                            statusLabel(
                                row.status,
                                ar,
                            ),
                            row.total,
                            row.paid_total,
                            row.balance_due,
                        ],
                    ),
                ],
            );

            return;
        }

        if (
            tab ===
                'payments'
            && cash
        ) {
            downloadCsv(
                'party-'
                + String(
                    partyId,
                )
                + '-'
                + side
                + '-cash.csv',
                [
                    [
                        ar
                            ? 'الرقم'
                            : 'Number',
                        ar
                            ? 'التاريخ'
                            : 'Date',
                        ar
                            ? 'الطريقة'
                            : 'Method',
                        ar
                            ? 'المرجع'
                            : 'Reference',
                        ar
                            ? 'المبلغ'
                            : 'Amount',
                        ar
                            ? 'المخصص'
                            : 'Allocated',
                        ar
                            ? 'غير المخصص'
                            : 'Unallocated',
                    ],
                    ...cash.data.map(
                        row => [
                            row.number,
                            row.movement_date,
                            methodLabel(
                                row.method,
                                ar,
                            ),
                            row.reference
                            ?? '',
                            row.amount,
                            row.allocated_total,
                            row.unallocated_total,
                        ],
                    ),
                ],
            );
        }
    }

    const meta =
        tab ===
            'invoices'
            ? documents?.meta
            : cash?.meta;

    return (
        <section className="mt-5">
            <div className={panel + ' overflow-hidden'}>
                <div className="flex flex-col gap-4 border-b border-[var(--ac-line)] p-4 sm:p-5 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-[var(--ac-text)]">
                            {title}
                        </h2>

                        <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            {tab ===
                            'invoices'
                                ? (
                                    ar
                                        ? 'عرض وإضافة وإدارة جميع الفواتير الخاصة بهذه الجهة فقط.'
                                        : 'View, add and manage invoices for this party only.'
                                )
                                : (
                                    ar
                                        ? 'عرض وإضافة وإدارة جميع حركات القبض أو الدفع الخاصة بهذه الجهة فقط.'
                                        : 'View, add and manage receipts or payments for this party only.'
                                )}
                        </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className={button}
                            onClick={
                                exportRows
                            }
                        >
                            <Download
                                size={13}
                            />
                            {ar
                                ? 'تصدير'
                                : 'Export'}
                        </button>

                        {(tab ===
                            'invoices'
                            ? canManageInvoice
                            : canManageCash) && (
                            <Link
                                href={
                                    tab ===
                                        'invoices'
                                        ? invoiceCreateHref(
                                            side,
                                            partyId,
                                        )
                                        : cashCreateHref(
                                            side,
                                            partyId,
                                        )
                                }
                                className={primaryButton}
                            >
                                <Plus
                                    size={13}
                                />

                                {tab ===
                                    'invoices'
                                    ? (
                                        side ===
                                            'customer'
                                            ? (
                                                ar
                                                    ? 'إضافة فاتورة بيع'
                                                    : 'Add invoice'
                                            )
                                            : (
                                                ar
                                                    ? 'إضافة فاتورة شراء'
                                                    : 'Add bill'
                                            )
                                    )
                                    : (
                                        side ===
                                            'customer'
                                            ? (
                                                ar
                                                    ? 'إضافة مقبوض'
                                                    : 'Add receipt'
                                            )
                                            : (
                                                ar
                                                    ? 'إضافة دفعة'
                                                    : 'Add payment'
                                            )
                                    )}
                            </Link>
                        )}
                    </div>
                </div>

                <div className="p-4 sm:p-5">
                    {hasCustomer
                        && hasSupplier && (
                        <div className="mb-4 flex flex-wrap gap-2">
                            <SideButton
                                active={
                                    side ===
                                    'customer'
                                }
                                onClick={() =>
                                    setSide(
                                        'customer',
                                    )}
                            >
                                {ar
                                    ? 'كعميل'
                                    : 'As customer'}
                            </SideButton>

                            <SideButton
                                active={
                                    side ===
                                    'supplier'
                                }
                                onClick={() =>
                                    setSide(
                                        'supplier',
                                    )}
                            >
                                {ar
                                    ? 'كمورد'
                                    : 'As supplier'}
                            </SideButton>
                        </div>
                    )}

                    <div className="rounded-[12px] border border-[var(--ac-accent)]/20 bg-[var(--ac-accent-soft)] px-4 py-3 text-[10px] font-medium text-[var(--ac-accent)]">
                        {ar
                            ? 'يتم عرض بيانات '
                                + sideTitle
                                + ' '
                                + partyName
                                + ' فقط، وأي إضافة جديدة ستختار هذه الجهة تلقائياً.'
                            : 'Showing '
                                + sideTitle
                                + ' records for '
                                + partyName
                                + ' only. New records will preselect this party.'}
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-[1.15fr_0.9fr_minmax(260px,1.6fr)_auto]">
                        <label className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                            {ar
                                ? 'الفترة'
                                : 'Date range'}

                            <div className="mt-2 grid grid-cols-2 gap-2">
                                <input
                                    type="date"
                                    className={input}
                                    value={
                                        dateFrom
                                    }
                                    onChange={
                                        event =>
                                            setDateFrom(
                                                event.target.value,
                                            )
                                    }
                                />

                                <input
                                    type="date"
                                    className={input}
                                    value={
                                        dateTo
                                    }
                                    min={
                                        dateFrom
                                    }
                                    onChange={
                                        event =>
                                            setDateTo(
                                                event.target.value,
                                            )
                                    }
                                />
                            </div>
                        </label>

                        <label className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                            {tab ===
                            'invoices'
                                ? (
                                    ar
                                        ? 'الحالة'
                                        : 'Status'
                                )
                                : (
                                    ar
                                        ? 'طريقة الدفع'
                                        : 'Method'
                                )}

                            {tab ===
                            'invoices' ? (
                                <select
                                    className={input + ' mt-2'}
                                    value={
                                        status
                                    }
                                    onChange={
                                        event =>
                                            setStatus(
                                                event.target.value,
                                            )
                                    }
                                >
                                    <option value="">
                                        {ar
                                            ? 'جميع الحالات'
                                            : 'All statuses'}
                                    </option>
                                    {[
                                        'draft',
                                        'issued',
                                        'partially_paid',
                                        'paid',
                                        'overpaid',
                                        'superseded',
                                        'voided',
                                    ].map(
                                        value => (
                                            <option
                                                key={
                                                    value
                                                }
                                                value={
                                                    value
                                                }
                                            >
                                                {statusLabel(
                                                    value,
                                                    ar,
                                                )}
                                            </option>
                                        ),
                                    )}
                                </select>
                            ) : (
                                <select
                                    className={input + ' mt-2'}
                                    value={
                                        method
                                    }
                                    onChange={
                                        event =>
                                            setMethod(
                                                event.target.value,
                                            )
                                    }
                                >
                                    <option value="">
                                        {ar
                                            ? 'كل الطرق'
                                            : 'All methods'}
                                    </option>
                                    {[
                                        'bank_transfer',
                                        'check',
                                        'cash',
                                        'card',
                                        'electronic_wallet',
                                        'direct_debit',
                                        'other',
                                    ].map(
                                        value => (
                                            <option
                                                key={
                                                    value
                                                }
                                                value={
                                                    value
                                                }
                                            >
                                                {methodLabel(
                                                    value,
                                                    ar,
                                                )}
                                            </option>
                                        ),
                                    )}
                                </select>
                            )}
                        </label>

                        <label className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                            {tab ===
                            'invoices'
                                ? (
                                    ar
                                        ? 'بحث في الفواتير'
                                        : 'Search invoices'
                                )
                                : (
                                    ar
                                        ? 'بحث في الحركات'
                                        : 'Search payments'
                                )}

                            <div className="relative mt-2">
                                <Search
                                    size={14}
                                    className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                />

                                <input
                                    className={input + ' ps-9'}
                                    value={
                                        search
                                    }
                                    onChange={
                                        event =>
                                            setSearch(
                                                event.target.value,
                                            )
                                    }
                                    placeholder={
                                        tab ===
                                        'invoices'
                                            ? (
                                                ar
                                                    ? 'رقم الفاتورة أو المرجع...'
                                                    : 'Invoice number or reference...'
                                            )
                                            : (
                                                ar
                                                    ? 'رقم الحركة أو المرجع أو الملاحظات...'
                                                    : 'Number, reference or notes...'
                                            )
                                    }
                                />
                            </div>
                        </label>

                        <button
                            type="button"
                            className={button + ' self-end'}
                            onClick={
                                reset
                            }
                        >
                            <RefreshCcw
                                size={13}
                            />
                            {ar
                                ? 'إعادة ضبط'
                                : 'Reset'}
                        </button>
                    </div>

                    {error && (
                        <div className="mt-4 rounded-[12px] border border-red-400/25 bg-red-500/10 px-4 py-3 text-xs text-[var(--ac-danger)]">
                            {error}
                        </div>
                    )}

                    {tab ===
                    'invoices' ? (
                        <InvoiceContent
                            response={
                                documents
                            }
                            loading={
                                loading
                            }
                            side={
                                side
                            }
                            currency={
                                currency
                            }
                            locale={
                                locale
                            }
                            ar={
                                ar
                            }
                            canManageInvoice={
                                canManageInvoice
                            }
                            canManageCash={
                                canManageCash
                            }
                        />
                    ) : (
                        <CashContent
                            response={
                                cash
                            }
                            loading={
                                loading
                            }
                            side={
                                side
                            }
                            currency={
                                currency
                            }
                            locale={
                                locale
                            }
                            ar={
                                ar
                            }
                        />
                    )}

                    {meta
                        && meta.last_page
                            > 1 && (
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--ac-line)] pt-4 text-[10px] text-[var(--ac-text-muted)]">
                            <span>
                                {ar
                                    ? 'صفحة '
                                        + String(
                                            meta.current_page,
                                        )
                                        + ' من '
                                        + String(
                                            meta.last_page,
                                        )
                                    : 'Page '
                                        + String(
                                            meta.current_page,
                                        )
                                        + ' of '
                                        + String(
                                            meta.last_page,
                                        )}
                            </span>

                            <div className="flex gap-2">
                                <button
                                    type="button"
                                    className={button}
                                    disabled={
                                        page <=
                                        1
                                    }
                                    onClick={() =>
                                        setPage(
                                            current =>
                                                current
                                                - 1,
                                        )}
                                >
                                    {ar
                                        ? 'السابق'
                                        : 'Previous'}
                                </button>

                                <button
                                    type="button"
                                    className={button}
                                    disabled={
                                        page >=
                                        meta.last_page
                                    }
                                    onClick={() =>
                                        setPage(
                                            current =>
                                                current
                                                + 1,
                                        )}
                                >
                                    {ar
                                        ? 'التالي'
                                        : 'Next'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function SideButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children:
        ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={
                onClick
            }
            className={[
                'h-9 rounded-[10px] border px-3 text-[10px] font-bold transition',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                    : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-muted)] hover:text-[var(--ac-text)]',
            ].join(
                ' ',
            )}
        >
            {children}
        </button>
    );
}

function InvoiceContent({
    response,
    loading,
    side,
    currency,
    locale,
    ar,
    canManageInvoice,
    canManageCash,
}: {
    response:
        | DocumentResponse
        | null;
    loading: boolean;
    side: PartySide;
    currency: string;
    locale: string;
    ar: boolean;
    canManageInvoice: boolean;
    canManageCash: boolean;
}) {
    const summary =
        response?.summary;

    return (
        <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    icon={
                        FileText
                    }
                    label={
                        side ===
                        'customer'
                            ? (
                                ar
                                    ? 'إجمالي الفواتير'
                                    : 'Total invoices'
                            )
                            : (
                                ar
                                    ? 'إجمالي فواتير الشراء'
                                    : 'Total bills'
                            )
                    }
                    value={
                        String(
                            summary
                                ?.count
                            ?? 0,
                        )
                    }
                    note={
                        money(
                            summary
                                ?.total
                            ?? 0,
                            currency,
                            locale,
                        )
                    }
                    tone="accent"
                />

                <StatCard
                    icon={
                        CheckCircle2
                    }
                    label={
                        ar
                            ? 'مدفوعة'
                            : 'Paid'
                    }
                    value={
                        String(
                            summary
                                ?.paid_count
                            ?? 0,
                        )
                    }
                    note={
                        money(
                            summary
                                ?.paid
                            ?? 0,
                            currency,
                            locale,
                        )
                    }
                    tone="positive"
                />

                <StatCard
                    icon={
                        Clock3
                    }
                    label={
                        ar
                            ? 'مفتوحة / جزئية'
                            : 'Open / partial'
                    }
                    value={
                        String(
                            summary
                                ?.open_count
                            ?? 0,
                        )
                    }
                    note={
                        money(
                            summary
                                ?.outstanding
                            ?? 0,
                            currency,
                            locale,
                        )
                    }
                    tone="warning"
                />

                <StatCard
                    icon={
                        CircleDollarSign
                    }
                    label={
                        ar
                            ? 'متأخرة'
                            : 'Overdue'
                    }
                    value={
                        String(
                            summary
                                ?.overdue
                            ?? 0,
                        )
                    }
                    note={
                        money(
                            summary
                                ?.overdue_amount
                            ?? 0,
                            currency,
                            locale,
                        )
                    }
                    tone="danger"
                />
            </div>

            <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--ac-line)]">
                {loading
                    && ! response ? (
                    <div className="p-12 text-center text-xs text-[var(--ac-text-muted)]">
                        {ar
                            ? 'جارٍ تحميل الفواتير...'
                            : 'Loading invoices...'}
                    </div>
                ) : ! response
                    ?.data
                    .length ? (
                    <div className="p-12 text-center">
                        <div className="mx-auto flex size-12 items-center justify-center rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <ReceiptText
                                size={20}
                            />
                        </div>

                        <h3 className="mt-3 text-sm font-bold text-[var(--ac-text)]">
                            {ar
                                ? 'لا توجد فواتير لهذه الجهة في الفترة المحددة.'
                                : 'No invoices for this party in the selected period.'}
                        </h3>
                    </div>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[980px] text-[10px]">
                                <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                    <tr>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'رقم الفاتورة'
                                                : 'Invoice no'}
                                        </th>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'تاريخ الإصدار'
                                                : 'Issue date'}
                                        </th>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'الاستحقاق'
                                                : 'Due date'}
                                        </th>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'الحالة'
                                                : 'Status'}
                                        </th>
                                        <th className="px-3 py-3 text-end font-semibold">
                                            {ar
                                                ? 'الإجمالي'
                                                : 'Total'}
                                        </th>
                                        <th className="px-3 py-3 text-end font-semibold">
                                            {ar
                                                ? 'المدفوع'
                                                : 'Paid'}
                                        </th>
                                        <th className="px-3 py-3 text-end font-semibold">
                                            {ar
                                                ? 'المتبقي'
                                                : 'Balance'}
                                        </th>
                                        <th className="px-3 py-3 text-end font-semibold">
                                            {ar
                                                ? 'الإجراءات'
                                                : 'Actions'}
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {response
                                        .data
                                        .map(
                                            row => (
                                                <tr
                                                    key={
                                                        row.id
                                                    }
                                                    className="border-t border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]"
                                                >
                                                    <td className="px-3 py-3">
                                                        <Link
                                                            href={
                                                                invoiceHref(
                                                                    side,
                                                                    row.id,
                                                                )
                                                            }
                                                            className="font-bold text-[var(--ac-accent)] hover:underline"
                                                        >
                                                            {
                                                                row.number
                                                            }
                                                        </Link>
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        {
                                                            row.issue_date
                                                        }
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        {
                                                            row.due_date
                                                            ?? '—'
                                                        }
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        <StatusPill
                                                            status={
                                                                row.status
                                                            }
                                                            ar={
                                                                ar
                                                            }
                                                            overdue={
                                                                documentOverdue(
                                                                    row,
                                                                )
                                                            }
                                                        />
                                                    </td>

                                                    <td className="px-3 py-3 text-end font-semibold">
                                                        {money(
                                                            row.total,
                                                            row.currency,
                                                            locale,
                                                        )}
                                                    </td>

                                                    <td className="px-3 py-3 text-end">
                                                        {money(
                                                            row.paid_total,
                                                            row.currency,
                                                            locale,
                                                        )}
                                                    </td>

                                                    <td className="px-3 py-3 text-end font-semibold">
                                                        {money(
                                                            row.balance_due,
                                                            row.currency,
                                                            locale,
                                                        )}
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        <div className="flex justify-end gap-1.5">
                                                            <Link
                                                                href={
                                                                    invoiceHref(
                                                                        side,
                                                                        row.id,
                                                                    )
                                                                }
                                                                className={button + ' h-8 px-2'}
                                                            >
                                                                {row.status ===
                                                                    'draft'
                                                                    && canManageInvoice
                                                                    ? (
                                                                        ar
                                                                            ? 'تعديل'
                                                                            : 'Edit'
                                                                    )
                                                                    : (
                                                                        ar
                                                                            ? 'فتح'
                                                                            : 'Open'
                                                                    )}
                                                            </Link>

                                                            {toNumber(
                                                                row.balance_due,
                                                            ) > 0
                                                                && canManageCash
                                                                && ! [
                                                                    'draft',
                                                                    'voided',
                                                                    'superseded',
                                                                ].includes(
                                                                    row.status,
                                                                ) && (
                                                                <Link
                                                                    href={
                                                                        settlementHref(
                                                                            side,
                                                                            row.id,
                                                                        )
                                                                    }
                                                                    className={button + ' h-8 px-2 text-[var(--ac-accent)]'}
                                                                >
                                                                    {side ===
                                                                        'customer'
                                                                        ? (
                                                                            ar
                                                                                ? 'قبض'
                                                                                : 'Receive'
                                                                        )
                                                                        : (
                                                                            ar
                                                                                ? 'دفع'
                                                                                : 'Pay'
                                                                        )}
                                                                </Link>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            ),
                                        )}
                                </tbody>
                            </table>
                        </div>

                        <div className="divide-y divide-[var(--ac-line)] md:hidden">
                            {response.data.map(
                                row => (
                                    <article
                                        key={
                                            row.id
                                        }
                                        className="p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <Link
                                                    href={
                                                        invoiceHref(
                                                            side,
                                                            row.id,
                                                        )
                                                    }
                                                    className="font-bold text-[var(--ac-accent)]"
                                                >
                                                    {
                                                        row.number
                                                    }
                                                </Link>

                                                <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                    {
                                                        row.issue_date
                                                    }
                                                    {' · '}
                                                    {
                                                        row.due_date
                                                        ?? '—'
                                                    }
                                                </p>
                                            </div>

                                            <StatusPill
                                                status={
                                                    row.status
                                                }
                                                ar={
                                                    ar
                                                }
                                                overdue={
                                                    documentOverdue(
                                                        row,
                                                    )
                                                }
                                            />
                                        </div>

                                        <div className="mt-3 grid grid-cols-3 gap-2 text-[9px]">
                                            <MobileValue
                                                label={
                                                    ar
                                                        ? 'الإجمالي'
                                                        : 'Total'
                                                }
                                                value={
                                                    money(
                                                        row.total,
                                                        row.currency,
                                                        locale,
                                                    )
                                                }
                                            />
                                            <MobileValue
                                                label={
                                                    ar
                                                        ? 'المدفوع'
                                                        : 'Paid'
                                                }
                                                value={
                                                    money(
                                                        row.paid_total,
                                                        row.currency,
                                                        locale,
                                                    )
                                                }
                                            />
                                            <MobileValue
                                                label={
                                                    ar
                                                        ? 'المتبقي'
                                                        : 'Balance'
                                                }
                                                value={
                                                    money(
                                                        row.balance_due,
                                                        row.currency,
                                                        locale,
                                                    )
                                                }
                                            />
                                        </div>

                                        <div className="mt-3 flex gap-2">
                                            <Link
                                                href={
                                                    invoiceHref(
                                                        side,
                                                        row.id,
                                                    )
                                                }
                                                className={button + ' h-8'}
                                            >
                                                {ar
                                                    ? 'فتح'
                                                    : 'Open'}
                                            </Link>

                                            {toNumber(
                                                row.balance_due,
                                            ) > 0
                                                && canManageCash
                                                && ! [
                                                    'draft',
                                                    'voided',
                                                    'superseded',
                                                ].includes(
                                                    row.status,
                                                ) && (
                                                <Link
                                                    href={
                                                        settlementHref(
                                                            side,
                                                            row.id,
                                                        )
                                                    }
                                                    className={button + ' h-8 text-[var(--ac-accent)]'}
                                                >
                                                    {side ===
                                                        'customer'
                                                        ? (
                                                            ar
                                                                ? 'قبض'
                                                                : 'Receive'
                                                        )
                                                        : (
                                                            ar
                                                                ? 'دفع'
                                                                : 'Pay'
                                                        )}
                                                </Link>
                                            )}
                                        </div>
                                    </article>
                                ),
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

function CashContent({
    response,
    loading,
    side,
    currency,
    locale,
    ar,
}: {
    response:
        | CashResponse
        | null;
    loading: boolean;
    side: PartySide;
    currency: string;
    locale: string;
    ar: boolean;
}) {
    const total =
        side ===
            'customer'
            ? response
                ?.summary
                .posted_incoming
            : response
                ?.summary
                .posted_outgoing;

    const methods =
        response?.summary
            .methods
        ?? {};

    return (
        <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard
                    icon={
                        ReceiptText
                    }
                    label={
                        side ===
                        'customer'
                            ? (
                                ar
                                    ? 'إجمالي المقبوضات'
                                    : 'Total receipts'
                            )
                            : (
                                ar
                                    ? 'إجمالي المدفوعات'
                                    : 'Total payments'
                            )
                    }
                    value={
                        String(
                            response
                                ?.summary
                                .count
                            ?? 0,
                        )
                    }
                    note={
                        money(
                            total
                            ?? 0,
                            currency,
                            locale,
                        )
                    }
                    tone="accent"
                />

                <StatCard
                    icon={
                        Landmark
                    }
                    label={
                        ar
                            ? 'تحويل بنكي'
                            : 'Bank transfer'
                    }
                    value={
                        String(
                            methods
                                .bank_transfer
                                ?.count
                            ?? 0,
                        )
                    }
                    note={
                        money(
                            methods
                                .bank_transfer
                                ?.amount
                            ?? 0,
                            currency,
                            locale,
                        )
                    }
                    tone="positive"
                />

                <StatCard
                    icon={
                        CreditCard
                    }
                    label={
                        ar
                            ? 'شيكات'
                            : 'Cheques'
                    }
                    value={
                        String(
                            methods
                                .check
                                ?.count
                            ?? 0,
                        )
                    }
                    note={
                        money(
                            methods
                                .check
                                ?.amount
                            ?? 0,
                            currency,
                            locale,
                        )
                    }
                    tone="warning"
                />

                <StatCard
                    icon={
                        Banknote
                    }
                    label={
                        ar
                            ? 'نقدي'
                            : 'Cash'
                    }
                    value={
                        String(
                            methods
                                .cash
                                ?.count
                            ?? 0,
                        )
                    }
                    note={
                        money(
                            methods
                                .cash
                                ?.amount
                            ?? 0,
                            currency,
                            locale,
                        )
                    }
                    tone="danger"
                />
            </div>

            <div className="mt-4 overflow-hidden rounded-[14px] border border-[var(--ac-line)]">
                {loading
                    && ! response ? (
                    <div className="p-12 text-center text-xs text-[var(--ac-text-muted)]">
                        {ar
                            ? 'جارٍ تحميل الحركات...'
                            : 'Loading transactions...'}
                    </div>
                ) : ! response
                    ?.data
                    .length ? (
                    <div className="p-12 text-center">
                        <div className="mx-auto flex size-12 items-center justify-center rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <WalletCards
                                size={20}
                            />
                        </div>

                        <h3 className="mt-3 text-sm font-bold text-[var(--ac-text)]">
                            {ar
                                ? 'لا توجد حركات لهذه الجهة في الفترة المحددة.'
                                : 'No cash movements for this party in the selected period.'}
                        </h3>
                    </div>
                ) : (
                    <>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[1040px] text-[10px]">
                                <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                    <tr>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'الرقم'
                                                : 'Number'}
                                        </th>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'التاريخ'
                                                : 'Date'}
                                        </th>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'الطريقة'
                                                : 'Method'}
                                        </th>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'المرجع'
                                                : 'Reference'}
                                        </th>
                                        <th className="px-3 py-3 text-end font-semibold">
                                            {ar
                                                ? 'المبلغ'
                                                : 'Amount'}
                                        </th>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'مطبق على'
                                                : 'Applied to'}
                                        </th>
                                        <th className="px-3 py-3 text-start font-semibold">
                                            {ar
                                                ? 'ملاحظات / رصيد مقدم'
                                                : 'Notes / advance'}
                                        </th>
                                        <th className="px-3 py-3 text-end font-semibold">
                                            {ar
                                                ? 'الإجراءات'
                                                : 'Actions'}
                                        </th>
                                    </tr>
                                </thead>

                                <tbody>
                                    {response
                                        .data
                                        .map(
                                            row => (
                                                <tr
                                                    key={
                                                        row.id
                                                    }
                                                    className="border-t border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]"
                                                >
                                                    <td className="px-3 py-3">
                                                        <Link
                                                            href={
                                                                cashHref(
                                                                    side,
                                                                    row.id,
                                                                )
                                                            }
                                                            className="font-bold text-[var(--ac-accent)] hover:underline"
                                                        >
                                                            {
                                                                row.number
                                                            }
                                                        </Link>
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        {
                                                            row.movement_date
                                                        }
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        <span className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-2 py-1 text-[9px] font-semibold">
                                                            {methodLabel(
                                                                row.method,
                                                                ar,
                                                            )}
                                                        </span>
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        {
                                                            row.reference
                                                            ?? '—'
                                                        }
                                                    </td>

                                                    <td className="px-3 py-3 text-end font-semibold">
                                                        {money(
                                                            row.amount,
                                                            row.currency,
                                                            locale,
                                                        )}
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        {row.applied_to.length
                                                            ? (
                                                                <div className="flex max-w-[260px] flex-wrap gap-1">
                                                                    {row.applied_to.map(
                                                                        allocation => (
                                                                            <Link
                                                                                key={
                                                                                    allocation.document_id
                                                                                }
                                                                                href={
                                                                                    invoiceHref(
                                                                                        side,
                                                                                        allocation.document_id,
                                                                                    )
                                                                                }
                                                                                className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] px-2 py-1 text-[8px] font-semibold text-[var(--ac-accent)] hover:underline"
                                                                            >
                                                                                {allocation.document_number
                                                                                    ?? '#'
                                                                                        + String(
                                                                                            allocation.document_id,
                                                                                        )}
                                                                            </Link>
                                                                        ),
                                                                    )}
                                                                </div>
                                                            )
                                                            : (
                                                                <span className="text-[var(--ac-text-muted)]">
                                                                    {ar
                                                                        ? 'غير مخصص'
                                                                        : 'Unallocated'}
                                                                </span>
                                                            )}
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        <div className="max-w-[280px]">
                                                            {row.notes
                                                                && (
                                                                <p className="truncate">
                                                                    {
                                                                        row.notes
                                                                    }
                                                                </p>
                                                            )}

                                                            {toNumber(
                                                                row.unallocated_total,
                                                            ) > 0 && (
                                                                <span className="mt-1 inline-flex rounded-full border border-[var(--ac-accent)]/25 bg-[var(--ac-accent-soft)] px-2 py-1 text-[8px] font-bold text-[var(--ac-accent)]">
                                                                    {ar
                                                                        ? 'رصيد مقدم متاح: '
                                                                        : 'Available credit: '}
                                                                    {money(
                                                                        row.unallocated_total,
                                                                        row.currency,
                                                                        locale,
                                                                    )}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    <td className="px-3 py-3">
                                                        <div className="flex justify-end">
                                                            <Link
                                                                href={
                                                                    cashHref(
                                                                        side,
                                                                        row.id,
                                                                    )
                                                                }
                                                                className={button + ' h-8 px-2'}
                                                            >
                                                                {row.status ===
                                                                    'draft'
                                                                    ? (
                                                                        ar
                                                                            ? 'تعديل'
                                                                            : 'Edit'
                                                                    )
                                                                    : (
                                                                        ar
                                                                            ? 'فتح'
                                                                            : 'Open'
                                                                    )}
                                                            </Link>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ),
                                        )}
                                </tbody>
                            </table>
                        </div>

                        <div className="divide-y divide-[var(--ac-line)] md:hidden">
                            {response.data.map(
                                row => (
                                    <article
                                        key={
                                            row.id
                                        }
                                        className="p-4"
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <Link
                                                    href={
                                                        cashHref(
                                                            side,
                                                            row.id,
                                                        )
                                                    }
                                                    className="font-bold text-[var(--ac-accent)]"
                                                >
                                                    {
                                                        row.number
                                                    }
                                                </Link>

                                                <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                    {
                                                        row.movement_date
                                                    }
                                                    {' · '}
                                                    {methodLabel(
                                                        row.method,
                                                        ar,
                                                    )}
                                                </p>
                                            </div>

                                            <strong className="text-sm text-[var(--ac-text)]">
                                                {money(
                                                    row.amount,
                                                    row.currency,
                                                    locale,
                                                )}
                                            </strong>
                                        </div>

                                        <div className="mt-3 text-[9px] text-[var(--ac-text-soft)]">
                                            {row.reference
                                                || row.notes
                                                || (
                                                    ar
                                                        ? 'بدون مرجع'
                                                        : 'No reference'
                                                )}
                                        </div>

                                        {toNumber(
                                            row.unallocated_total,
                                        ) > 0 && (
                                            <div className="mt-2 rounded-[10px] border border-[var(--ac-accent)]/20 bg-[var(--ac-accent-soft)] px-3 py-2 text-[9px] font-semibold text-[var(--ac-accent)]">
                                                {ar
                                                    ? 'رصيد مقدم غير مخصص: '
                                                    : 'Unallocated advance: '}
                                                {money(
                                                    row.unallocated_total,
                                                    row.currency,
                                                    locale,
                                                )}
                                            </div>
                                        )}

                                        <Link
                                            href={
                                                cashHref(
                                                    side,
                                                    row.id,
                                                )
                                            }
                                            className={button + ' mt-3 h-8'}
                                        >
                                            {ar
                                                ? 'فتح الحركة'
                                                : 'Open transaction'}
                                        </Link>
                                    </article>
                                ),
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );
}

function StatCard({
    icon: Icon,
    label,
    value,
    note,
    tone,
}: {
    icon:
        ComponentType<{
            size?: number;
            className?: string;
        }>;
    label: string;
    value: string;
    note: string;
    tone:
        | 'accent'
        | 'positive'
        | 'warning'
        | 'danger';
}) {
    const tones = {
        accent:
            'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]',
        positive:
            'bg-emerald-500/10 text-emerald-500',
        warning:
            'bg-amber-500/10 text-amber-500',
        danger:
            'bg-red-500/10 text-red-500',
    };

    return (
        <div className="flex min-h-24 items-center gap-3 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4">
            <span
                className={[
                    'flex size-11 shrink-0 items-center justify-center rounded-full',
                    tones[tone],
                ].join(
                    ' ',
                )}
            >
                <Icon
                    size={19}
                />
            </span>

            <div className="min-w-0">
                <p className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                    {label}
                </p>

                <p className="mt-1 text-lg font-bold text-[var(--ac-text)]">
                    {value}
                </p>

                <p className="mt-0.5 truncate text-[9px] text-[var(--ac-text-soft)]">
                    {note}
                </p>
            </div>
        </div>
    );
}

function StatusPill({
    status,
    ar,
    overdue = false,
}: {
    status: string;
    ar: boolean;
    overdue?: boolean;
}) {
    const tone =
        overdue
            ? 'border-red-500/20 bg-red-500/10 text-red-500'
            : status ===
            'paid'
        || status ===
            'overpaid'
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500'
            : status ===
                'partially_paid'
                ? 'border-amber-500/20 bg-amber-500/10 text-amber-500'
                : status ===
                    'voided'
                    || status ===
                        'superseded'
                    ? 'border-red-500/20 bg-red-500/10 text-red-500'
                    : 'border-[var(--ac-line)] bg-[var(--ac-surface-soft)] text-[var(--ac-text-soft)]';

    return (
        <span
            className={[
                'inline-flex rounded-full border px-2 py-1 text-[8px] font-bold',
                tone,
            ].join(
                ' ',
            )}
        >
            {overdue
                ? (
                    ar
                        ? 'متأخرة'
                        : 'Overdue'
                )
                : statusLabel(
                    status,
                    ar,
                )}
        </span>
    );
}

function MobileValue({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded-[10px] bg-[var(--ac-surface-soft)] p-2">
            <p className="text-[8px] text-[var(--ac-text-muted)]">
                {label}
            </p>
            <p className="mt-1 truncate font-bold text-[var(--ac-text)]">
                {value}
            </p>
        </div>
    );
}
