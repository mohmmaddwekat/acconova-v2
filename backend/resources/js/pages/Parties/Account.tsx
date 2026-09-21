import { AppShell } from '@/layouts/AppShell';
import { ApiError, apiRequest } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { downloadCsv } from '@/pages/Finance/shared';
import { Head, Link } from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowUpRight,
    Banknote,
    Building2,
    ChevronLeft,
    ChevronRight,
    CircleDollarSign,
    Clock3,
    Download,
    FileText,
    HandCoins,
    Landmark,
    Mail,
    MapPin,
    Pencil,
    Plus,
    Printer,
    ReceiptText,
    RefreshCcw,
    RotateCcw,
    Save,
    Search,
    ShoppingCart,
    UserRound,
    WalletCards,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

type Scope = 'all' | 'customer' | 'supplier';
type TransactionType =
    | 'all'
    | 'invoice'
    | 'cash'
    | 'opening_balance';

type OpeningBalance = {
    id: number;
    amount: string;
    as_of_date: string;
    notes: string | null;
} | null;

type Aging = {
    current: string;
    days_1_30: string;
    days_31_60: string;
    days_61_90: string;
    over_90: string;
};

type AccountTransaction = {
    id: string;
    source_id: number;
    side: 'customer' | 'supplier';
    type: 'invoice' | 'cash' | 'opening_balance';
    date: string;
    reference: string;
    description: string;
    amount: string;
    currency: string;
    debit: string;
    credit: string;
    balance: string;
    url: string | null;
    status: string;
    method: string | null;
    allocated?: string;
    unallocated?: string;
};

type PartyAccountResponse = {
    party: {
        id: number;
        type: string;
        name: string | null;
        company_name: string | null;
        contact_name: string | null;
        email: string | null;
        phone: string | null;
        tax_number: string | null;
        credit_limit: string | null;
        address: {
            line_1: string | null;
            line_2: string | null;
            city: string | null;
            state: string | null;
            postal_code: string | null;
            country_code: string | null;
        };
        notes: string | null;
        roles: string[];
        archived: boolean;
    };
    scope: Scope;
    currency: string;
    period: {
        date_from: string;
        date_to: string;
    };
    summary: {
        opening_balance: string;
        invoice_total: string;
        cash_total: string;
        closing_balance: string;
        transaction_count: number;
    };
    positions: {
        customer: string;
        supplier: string;
        net: string;
        customer_advance: string;
        supplier_advance: string;
    };
    opening_balances: {
        customer: OpeningBalance;
        supplier: OpeningBalance;
    };
    aging: Aging;
    aging_breakdown: {
        customer: Aging;
        supplier: Aging;
    };
    transactions: AccountTransaction[];
    permissions: {
        sales_view: boolean;
        sales_manage: boolean;
        purchases_view: boolean;
        purchases_manage: boolean;
        cash_view: boolean;
        cash_receive: boolean;
        cash_pay: boolean;
        party_edit: boolean;
    };
};

type OpeningDraft = {
    customerAmount: string;
    customerDirection: 'owes_us' | 'credit';
    customerDate: string;
    customerNotes: string;
    supplierAmount: string;
    supplierDirection: 'we_owe' | 'credit';
    supplierDate: string;
    supplierNotes: string;
};

const panel =
    'rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]';

const button =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)] disabled:opacity-40';

const primaryButton =
    'inline-flex h-10 items-center justify-center gap-2 rounded-[11px] border border-[var(--ac-accent)] bg-[var(--ac-accent)] px-4 text-[10px] font-bold text-white transition hover:brightness-110 disabled:opacity-40';

const input =
    'h-11 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)] focus:ring-2 focus:ring-[var(--ac-accent)]/10';

function dateValue(date: Date): string {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function yearStart(): string {
    const date = new Date();

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

function displayMoney(
    value: string | number,
    currency: string,
    locale: string,
): string {
    return new Intl.NumberFormat(
        locale === 'ar'
            ? 'ar'
            : 'en',
        {
            style: 'currency',
            currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        },
    ).format(
        Math.abs(
            toNumber(
                value,
            ),
        ),
    );
}

function displaySignedMoney(
    value: string | number,
    currency: string,
    locale: string,
): string {
    const numeric =
        toNumber(
            value,
        );

    const formatted =
        displayMoney(
            numeric,
            currency,
            locale,
        );

    return numeric < -0.00005
        ? '-' + formatted
        : formatted;
}

function signedStatus(
    value: number,
    scope: Scope,
    ar: boolean,
): string {
    if (
        Math.abs(
            value,
        ) < 0.00005
    ) {
        return ar
            ? 'الحساب مسوّى'
            : 'Settled';
    }

    if (
        scope === 'customer'
    ) {
        return value > 0
            ? (
                ar
                    ? 'العميل مدين لك'
                    : 'Customer owes you'
            )
            : (
                ar
                    ? 'رصيد للعميل / دفعة مقدمة'
                    : 'Customer credit / advance'
            );
    }

    if (
        scope === 'supplier'
    ) {
        return value > 0
            ? (
                ar
                    ? 'أنت مدين للمورد'
                    : 'You owe supplier'
            )
            : (
                ar
                    ? 'رصيد لك عند المورد / دفعة مقدمة'
                    : 'Supplier advance / credit'
            );
    }

    return value > 0
        ? (
            ar
                ? 'الجهة مدينة لك بالصافي'
                : 'Party owes you net'
        )
        : (
            ar
                ? 'أنت مدين للجهة بالصافي'
                : 'You owe the party net'
        );
}

function transactionLabel(
    transaction: AccountTransaction,
    ar: boolean,
): string {
    if (
        transaction.type ===
        'opening_balance'
    ) {
        return ar
            ? 'رصيد مدوّر'
            : 'Opening balance';
    }

    if (
        transaction.type ===
        'invoice'
    ) {
        return transaction.side ===
            'customer'
            ? (
                ar
                    ? 'فاتورة بيع'
                    : 'Sales invoice'
            )
            : (
                ar
                    ? 'فاتورة شراء'
                    : 'Purchase invoice'
            );
    }

    return transaction.side ===
        'customer'
        ? (
            ar
                ? 'قبض من العميل'
                : 'Customer receipt'
        )
        : (
            ar
                ? 'دفع للمورد'
                : 'Supplier payment'
        );
}

function paymentMethodLabel(
    value: string | null,
    ar: boolean,
): string {
    const map: Record<
        string,
        [string, string]
    > = {
        cash: [
            'نقدي',
            'Cash',
        ],
        bank_transfer: [
            'تحويل بنكي',
            'Bank transfer',
        ],
        check: [
            'شيك',
            'Check',
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

    return value
        && map[value]
        ? (
            ar
                ? map[value][0]
                : map[value][1]
        )
        : '';
}

export default function PartyAccount({
    partyId,
}: {
    partyId: number;
}) {
    const locale =
        useLocale();

    const ar =
        locale === 'ar';

    const [
        scope,
        setScope,
    ] = useState<Scope>(
        'all',
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
        data,
        setData,
    ] = useState<
        PartyAccountResponse | null
    >(
        null,
    );

    const [
        loading,
        setLoading,
    ] = useState(
        true,
    );

    const [
        busy,
        setBusy,
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
        search,
        setSearch,
    ] = useState(
        '',
    );

    const [
        transactionType,
        setTransactionType,
    ] = useState<
        TransactionType
    >(
        'all',
    );

    const [
        page,
        setPage,
    ] = useState(
        1,
    );

    const [
        pageSize,
        setPageSize,
    ] = useState(
        20,
    );

    const [
        openingOpen,
        setOpeningOpen,
    ] = useState(
        false,
    );

    const [
        openingDraft,
        setOpeningDraft,
    ] = useState<
        OpeningDraft | null
    >(
        null,
    );

    const [
        notes,
        setNotes,
    ] = useState(
        '',
    );

    const [
        notesMessage,
        setNotesMessage,
    ] = useState(
        '',
    );

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
                    scope,
                    date_from:
                        dateFrom,
                    date_to:
                        dateTo,
                });

            const response =
                await apiRequest<
                    PartyAccountResponse
                >(
                    '/api/parties/'
                    + String(
                        partyId,
                    )
                    + '/account?'
                    + params
                        .toString(),
                );

            setData(
                response,
            );

            setNotes(
                response.party
                    .notes
                ?? '',
            );
        } catch (
            failure
        ) {
            setError(
                failure instanceof
                ApiError
                    ? failure
                        .message
                    : (
                        ar
                            ? 'تعذر تحميل كشف الحساب.'
                            : 'Could not load the account statement.'
                    ),
            );
        } finally {
            setLoading(
                false,
            );
        }
    }

    useEffect(
        () => {
            void load();
        },
        [
            partyId,
            scope,
            dateFrom,
            dateTo,
        ],
    );

    useEffect(
        () => {
            setPage(
                1,
            );
        },
        [
            search,
            transactionType,
            scope,
            dateFrom,
            dateTo,
        ],
    );

    const filtered =
        useMemo(
            () => {
                if (
                    ! data
                ) {
                    return [];
                }

                const query =
                    search
                        .trim()
                        .toLowerCase();

                return data
                    .transactions
                    .filter(
                        transaction => {
                            const typeMatches =
                                transactionType ===
                                    'all'
                                || transaction
                                    .type ===
                                    transactionType;

                            if (
                                ! typeMatches
                            ) {
                                return false;
                            }

                            if (
                                ! query
                            ) {
                                return true;
                            }

                            return [
                                transaction
                                    .reference,
                                transaction
                                    .description,
                                transaction
                                    .method,
                                transaction
                                    .status,
                                transactionLabel(
                                    transaction,
                                    ar,
                                ),
                            ]
                                .filter(
                                    Boolean,
                                )
                                .some(
                                    value =>
                                        String(
                                            value,
                                        )
                                            .toLowerCase()
                                            .includes(
                                                query,
                                            ),
                                );
                        },
                    );
            },
            [
                data,
                search,
                transactionType,
                ar,
            ],
        );

    const lastPage =
        Math.max(
            1,
            Math.ceil(
                filtered.length
                / pageSize,
            ),
        );

    const visibleTransactions =
        filtered.slice(
            (
                page
                - 1
            ) * pageSize,
            page
            * pageSize,
        );

    useEffect(
        () => {
            if (
                page >
                lastPage
            ) {
                setPage(
                    lastPage,
                );
            }
        },
        [
            page,
            lastPage,
        ],
    );

    function openOpeningBalances(): void {
        if (
            ! data
        ) {
            return;
        }

        const customer =
            data
                .opening_balances
                .customer;

        const supplier =
            data
                .opening_balances
                .supplier;

        const customerSigned =
            toNumber(
                customer?.amount,
            );

        const supplierSigned =
            toNumber(
                supplier?.amount,
            );

        setOpeningDraft({
            customerAmount:
                String(
                    Math.abs(
                        customerSigned,
                    ),
                ),
            customerDirection:
                customerSigned < 0
                    ? 'credit'
                    : 'owes_us',
            customerDate:
                customer
                    ?.as_of_date
                ?? dateFrom,
            customerNotes:
                customer
                    ?.notes
                ?? '',
            supplierAmount:
                String(
                    Math.abs(
                        supplierSigned,
                    ),
                ),
            supplierDirection:
                supplierSigned < 0
                    ? 'credit'
                    : 'we_owe',
            supplierDate:
                supplier
                    ?.as_of_date
                ?? dateFrom,
            supplierNotes:
                supplier
                    ?.notes
                ?? '',
        });

        setOpeningOpen(
            true,
        );
    }

    async function clearOpeningBalance(
        side: 'customer' | 'supplier',
    ): Promise<void> {
        if (
            ! data
            || busy
        ) {
            return;
        }

        const current =
            data.opening_balances[
                side
            ];

        if (
            ! current
        ) {
            return;
        }

        const confirmed =
            window.confirm(
                ar
                    ? 'إزالة الرصيد المدور لهذا الجانب؟ بعد الإزالة سيعود كشف الحساب لاستخدام الحركات التاريخية الموجودة قبل هذا التاريخ.'
                    : 'Remove this opening balance? The statement will then use historical transactions before that date again.',
            );

        if (
            ! confirmed
        ) {
            return;
        }

        setBusy(
            true,
        );

        try {
            await apiRequest(
                '/api/parties/'
                + String(
                    partyId,
                )
                + '/opening-balances/'
                + side,
                {
                    method:
                        'DELETE',
                },
            );

            setOpeningOpen(
                false,
            );

            await load();
        } catch (
            failure
        ) {
            setError(
                failure instanceof
                ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر إزالة الرصيد المدور.'
                            : 'Could not remove the opening balance.'
                    ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    async function saveOpeningBalances(): Promise<void> {
        if (
            ! data
            || ! openingDraft
            || busy
        ) {
            return;
        }

        setBusy(
            true,
        );
        setError(
            '',
        );

        try {
            const payload:
                Record<
                    string,
                    unknown
                > = {};

            if (
                data.party
                    .roles
                    .includes(
                        'customer',
                    )
                && data
                    .permissions
                    .sales_manage
            ) {
                const amount =
                    Math.abs(
                        toNumber(
                            openingDraft
                                .customerAmount,
                        ),
                    )
                    * (
                        openingDraft
                            .customerDirection ===
                            'credit'
                            ? -1
                            : 1
                    );

                payload.customer = {
                    amount,
                    as_of_date:
                        openingDraft
                            .customerDate,
                    notes:
                        openingDraft
                            .customerNotes
                            .trim()
                        || null,
                };
            }

            if (
                data.party
                    .roles
                    .includes(
                        'supplier',
                    )
                && data
                    .permissions
                    .purchases_manage
            ) {
                const amount =
                    Math.abs(
                        toNumber(
                            openingDraft
                                .supplierAmount,
                        ),
                    )
                    * (
                        openingDraft
                            .supplierDirection ===
                            'credit'
                            ? -1
                            : 1
                    );

                payload.supplier = {
                    amount,
                    as_of_date:
                        openingDraft
                            .supplierDate,
                    notes:
                        openingDraft
                            .supplierNotes
                            .trim()
                        || null,
                };
            }

            await apiRequest(
                '/api/parties/'
                + String(
                    partyId,
                )
                + '/opening-balances',
                {
                    method:
                        'PATCH',
                    body:
                        JSON.stringify(
                            payload,
                        ),
                },
            );

            setOpeningOpen(
                false,
            );

            await load();
        } catch (
            failure
        ) {
            setError(
                failure instanceof
                ApiError
                    ? failure
                        .message
                    : (
                        ar
                            ? 'تعذر حفظ الرصيد المدور.'
                            : 'Could not save opening balances.'
                    ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    async function saveNotes(): Promise<void> {
        if (
            ! data
            || ! data
                .permissions
                .party_edit
            || busy
        ) {
            return;
        }

        setBusy(
            true,
        );

        setNotesMessage(
            '',
        );

        try {
            await apiRequest(
                '/api/parties/'
                + String(
                    partyId,
                )
                + '/notes',
                {
                    method:
                        'PATCH',
                    body:
                        JSON.stringify({
                            notes,
                        }),
                },
            );

            setNotesMessage(
                ar
                    ? 'تم حفظ الملاحظات.'
                    : 'Notes saved.',
            );
        } catch (
            failure
        ) {
            setNotesMessage(
                failure instanceof
                ApiError
                    ? failure
                        .message
                    : (
                        ar
                            ? 'تعذر حفظ الملاحظات.'
                            : 'Could not save notes.'
                    ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    function exportStatement(): void {
        if (
            ! data
        ) {
            return;
        }

        downloadCsv(
            'party-'
            + String(
                data.party.id,
            )
            + '-statement-'
            + dateFrom
            + '-'
            + dateTo
            + '.csv',
            [
                [
                    ar
                        ? 'التاريخ'
                        : 'Date',
                    ar
                        ? 'المرجع'
                        : 'Reference',
                    ar
                        ? 'النوع'
                        : 'Type',
                    ar
                        ? 'الوصف'
                        : 'Description',
                    ar
                        ? 'مدين'
                        : 'Debit',
                    ar
                        ? 'دائن'
                        : 'Credit',
                    ar
                        ? 'الرصيد'
                        : 'Balance',
                    ar
                        ? 'العملة'
                        : 'Currency',
                ],
                ...filtered.map(
                    transaction => [
                        transaction
                            .date,
                        transaction
                            .reference,
                        transactionLabel(
                            transaction,
                            ar,
                        ),
                        transaction
                            .description,
                        transaction
                            .debit,
                        transaction
                            .credit,
                        transaction
                            .balance,
                        transaction
                            .currency,
                    ],
                ),
            ],
        );
    }

    if (
        loading
        && ! data
    ) {
        return (
            <AppShell>
                <Head
                    title={
                        ar
                            ? 'كشف الحساب'
                            : 'Account statement'
                    }
                />

                <main className="mx-auto max-w-[1680px] p-4 sm:p-6">
                    <div className="h-40 animate-pulse rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)]" />

                    <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {[
                            1,
                            2,
                            3,
                            4,
                        ].map(
                            item => (
                                <div
                                    key={
                                        item
                                    }
                                    className="h-28 animate-pulse rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                                />
                            ),
                        )}
                    </div>
                </main>
            </AppShell>
        );
    }

    return (
        <AppShell>
            <Head
                title={
                    data
                        ?.party
                        .name
                        ? (
                            (
                                ar
                                    ? 'حساب '
                                    : 'Account '
                            )
                            + data
                                .party
                                .name
                        )
                        : (
                            ar
                                ? 'كشف الحساب'
                                : 'Account statement'
                        )
                }
            />

            <main
                dir={
                    ar
                        ? 'rtl'
                        : 'ltr'
                }
                className="mx-auto w-full max-w-[1680px] px-3 py-4 sm:px-5 sm:py-6 lg:px-7"
            >
                {error && (
                    <div className="mb-4 rounded-[14px] border border-red-400/25 bg-red-500/10 px-4 py-3 text-xs text-[var(--ac-danger)]">
                        {
                            error
                        }
                    </div>
                )}

                {data && (
                    <>
                        <section
                            className={
                                panel
                                + ' overflow-hidden'
                            }
                        >
                            <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
                                <div className="flex min-w-0 items-start gap-4">
                                    <div className="flex size-16 shrink-0 items-center justify-center rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)] sm:size-20">
                                        {data
                                            .party
                                            .type ===
                                        'company' ? (
                                            <Building2
                                                size={
                                                    30
                                                }
                                            />
                                        ) : (
                                            <UserRound
                                                size={
                                                    30
                                                }
                                            />
                                        )}
                                    </div>

                                    <div className="min-w-0">
                                        <Link
                                            href="/app/parties"
                                            className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[var(--ac-text-muted)] transition hover:text-[var(--ac-accent)]"
                                        >
                                            <ArrowLeft
                                                size={
                                                    12
                                                }
                                                className="rtl:rotate-180"
                                            />

                                            {ar
                                                ? 'العودة إلى الجهات'
                                                : 'Back to Parties'}
                                        </Link>

                                        <h1 className="mt-2 break-words text-2xl font-bold tracking-[-0.035em] text-[var(--ac-text)] sm:text-3xl">
                                            {data
                                                .party
                                                .name
                                                || (
                                                    ar
                                                        ? 'جهة بدون اسم'
                                                        : 'Unnamed Party'
                                                )}
                                        </h1>

                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                            {data
                                                .party
                                                .roles
                                                .map(
                                                    role => (
                                                        <span
                                                            key={
                                                                role
                                                            }
                                                            className="rounded-full border border-[var(--ac-line)] bg-[var(--ac-accent-soft)] px-2.5 py-1 text-[9px] font-bold text-[var(--ac-accent)]"
                                                        >
                                                            {role ===
                                                            'customer'
                                                                ? (
                                                                    ar
                                                                        ? 'عميل'
                                                                        : 'Customer'
                                                                )
                                                                : role ===
                                                                    'supplier'
                                                                    ? (
                                                                        ar
                                                                            ? 'مورد'
                                                                            : 'Supplier'
                                                                    )
                                                                    : (
                                                                        ar
                                                                            ? 'جهة اتصال'
                                                                            : 'Contact'
                                                                    )}
                                                        </span>
                                                    ),
                                                )}

                                            {data
                                                .party
                                                .archived && (
                                                <span className="rounded-full border border-red-400/25 bg-red-500/10 px-2.5 py-1 text-[9px] font-bold text-[var(--ac-danger)]">
                                                    {ar
                                                        ? 'مؤرشف'
                                                        : 'Archived'}
                                                </span>
                                            )}
                                        </div>

                                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-[10px] text-[var(--ac-text-muted)]">
                                            {(data.party.address.city
                                                || data.party.address.country_code) && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <MapPin size={13} />
                                                    {[
                                                        data.party.address.city,
                                                        data.party.address.country_code,
                                                    ]
                                                        .filter(Boolean)
                                                        .join(', ')}
                                                </span>
                                            )}

                                            {data.party.email && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Mail size={13} />
                                                    {data.party.email}
                                                </span>
                                            )}

                                            {data.party.phone && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <Landmark size={13} />
                                                    {data.party.phone}
                                                </span>
                                            )}

                                            {data.party.tax_number && (
                                                <span className="inline-flex items-center gap-1.5">
                                                    <ReceiptText size={13} />
                                                    {ar
                                                        ? 'ضريبي: '
                                                        : 'Tax: '}
                                                    {data.party.tax_number}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap gap-2 lg:justify-end">
                                    {data
                                        .permissions
                                        .party_edit && (
                                        <Link
                                            href={
                                                '/app/parties?edit='
                                                + String(
                                                    data
                                                        .party
                                                        .id,
                                                )
                                            }
                                            className={
                                                button
                                            }
                                        >
                                            <Pencil
                                                size={
                                                    13
                                                }
                                            />

                                            {ar
                                                ? 'تعديل الجهة'
                                                : 'Edit Party'}
                                        </Link>
                                    )}

                                    {(data
                                        .permissions
                                        .sales_manage
                                        || data
                                            .permissions
                                            .purchases_manage) && (
                                        <button
                                            type="button"
                                            className={
                                                button
                                            }
                                            onClick={
                                                openOpeningBalances
                                            }
                                        >
                                            <RotateCcw
                                                size={
                                                    13
                                                }
                                            />

                                            {ar
                                                ? 'الرصيد المدور'
                                                : 'Opening balance'}
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        className={
                                            button
                                        }
                                        onClick={() =>
                                            window
                                                .print()
                                        }
                                    >
                                        <Printer
                                            size={
                                                13
                                            }
                                        />

                                        {ar
                                            ? 'طباعة'
                                            : 'Print'}
                                    </button>

                                    <button
                                        type="button"
                                        className={
                                            button
                                        }
                                        onClick={
                                            exportStatement
                                        }
                                    >
                                        <Download
                                            size={
                                                13
                                            }
                                        />

                                        {ar
                                            ? 'تصدير'
                                            : 'Export'}
                                    </button>
                                </div>
                            </div>

                            <div className="border-t border-[var(--ac-line)] px-5 py-3 sm:px-6">
                                <div className="flex flex-wrap gap-2">
                                    {data.party.roles.includes(
                                        'customer',
                                    )
                                        && data.permissions.sales_manage && (
                                        <Link
                                            href={
                                                '/app/invoices/sales/create?party_id='
                                                + String(data.party.id)
                                            }
                                            className={primaryButton}
                                        >
                                            <Plus size={13} />
                                            {ar ? 'فاتورة بيع' : 'Sales invoice'}
                                        </Link>
                                    )}

                                    {data.party.roles.includes(
                                        'customer',
                                    )
                                        && data.permissions.cash_receive && (
                                        <Link
                                            href={
                                                '/app/receipts/create?party_id='
                                                + String(data.party.id)
                                            }
                                            className={button}
                                        >
                                            <Banknote size={13} />
                                            {ar ? 'قبض / دفعة مقدمة' : 'Receipt / advance'}
                                        </Link>
                                    )}

                                    {data.party.roles.includes(
                                        'supplier',
                                    )
                                        && data.permissions.purchases_manage && (
                                        <Link
                                            href={
                                                '/app/invoices/purchases/create?party_id='
                                                + String(data.party.id)
                                            }
                                            className={button}
                                        >
                                            <ShoppingCart size={13} />
                                            {ar ? 'فاتورة شراء' : 'Purchase invoice'}
                                        </Link>
                                    )}

                                    {data.party.roles.includes(
                                        'supplier',
                                    )
                                        && data.permissions.cash_pay && (
                                        <Link
                                            href={
                                                '/app/payments/create?party_id='
                                                + String(data.party.id)
                                            }
                                            className={button}
                                        >
                                            <HandCoins size={13} />
                                            {ar ? 'دفع / دفعة مقدمة' : 'Payment / advance'}
                                        </Link>
                                    )}
                                </div>
                            </div>
                        </section>

                        <section className="mt-5">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                                <div>
                                    <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ac-accent)]">
                                        {ar
                                            ? 'كشف الحساب'
                                            : 'ACCOUNT STATEMENT'}
                                    </p>

                                    <h2 className="mt-1 text-xl font-bold text-[var(--ac-text)] sm:text-2xl">
                                        {ar
                                            ? 'الحركات والرصيد الحالي'
                                            : 'Transactions & current balance'}
                                    </h2>

                                    <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                        {ar
                                            ? 'يعرض الفواتير والقبوضات والدفعات والرصيد المدور والدفعات المقدمة من نفس السجل المالي.'
                                            : 'Invoices, receipts, payments, carried balances and advances from the same financial ledger.'}
                                    </p>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {data.party.roles.includes('customer')
                                        && data.party.roles.includes('supplier') && (
                                        <ScopeButton
                                            active={scope === 'all'}
                                            onClick={() => setScope('all')}
                                        >
                                            {ar ? 'الكل / الصافي' : 'All / Net'}
                                        </ScopeButton>
                                    )}

                                    {data.party.roles.includes('customer') && (
                                        <ScopeButton
                                            active={scope === 'customer'}
                                            onClick={() => setScope('customer')}
                                        >
                                            {ar ? 'كعميل' : 'Customer'}
                                        </ScopeButton>
                                    )}

                                    {data.party.roles.includes('supplier') && (
                                        <ScopeButton
                                            active={scope === 'supplier'}
                                            onClick={() => setScope('supplier')}
                                        >
                                            {ar ? 'كمورد' : 'Supplier'}
                                        </ScopeButton>
                                    )}
                                </div>
                            </div>

                            <div className={panel + ' mt-4 p-4 sm:p-5'}>
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1.15fr_1fr_minmax(260px,1.5fr)_auto]">
                                    <label className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                                        {ar ? 'الفترة' : 'Date range'}

                                        <div className="mt-2 grid grid-cols-2 gap-2">
                                            <input
                                                type="date"
                                                className={input}
                                                value={dateFrom}
                                                onChange={event =>
                                                    setDateFrom(
                                                        event.target.value,
                                                    )}
                                            />

                                            <input
                                                type="date"
                                                className={input}
                                                value={dateTo}
                                                min={dateFrom}
                                                onChange={event =>
                                                    setDateTo(
                                                        event.target.value,
                                                    )}
                                            />
                                        </div>
                                    </label>

                                    <label className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                                        {ar ? 'نوع الحركة' : 'Transaction type'}

                                        <select
                                            className={input + ' mt-2'}
                                            value={transactionType}
                                            onChange={event =>
                                                setTransactionType(
                                                    event.target.value as TransactionType,
                                                )}
                                        >
                                            <option value="all">
                                                {ar ? 'كل الحركات' : 'All transactions'}
                                            </option>
                                            <option value="invoice">
                                                {ar ? 'الفواتير' : 'Invoices'}
                                            </option>
                                            <option value="cash">
                                                {ar ? 'القبض والدفع' : 'Receipts & payments'}
                                            </option>
                                            <option value="opening_balance">
                                                {ar ? 'الرصيد المدور' : 'Opening balance'}
                                            </option>
                                        </select>
                                    </label>

                                    <label className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                                        {ar ? 'بحث في الحركات' : 'Search transactions'}

                                        <div className="relative mt-2">
                                            <Search
                                                size={14}
                                                className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                            />

                                            <input
                                                className={input + ' ps-9'}
                                                value={search}
                                                onChange={event =>
                                                    setSearch(
                                                        event.target.value,
                                                    )}
                                                placeholder={
                                                    ar
                                                        ? 'رقم، مرجع، طريقة دفع...'
                                                        : 'Number, reference, payment method...'
                                                }
                                            />
                                        </div>
                                    </label>

                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSearch('');
                                            setTransactionType('all');
                                            setDateFrom(yearStart());
                                            setDateTo(today());
                                        }}
                                        className={button + ' self-end'}
                                    >
                                        <RefreshCcw size={13} />
                                        {ar ? 'إعادة ضبط' : 'Reset'}
                                    </button>
                                </div>
                            </div>

                            <SummaryCards
                                data={data}
                                scope={scope}
                                ar={ar}
                                locale={locale}
                            />

                            <div className={panel + ' mt-4 overflow-hidden'}>
                                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ac-line)] px-4 py-3 sm:px-5">
                                    <div>
                                        <h3 className="text-sm font-bold text-[var(--ac-text)]">
                                            {ar ? 'حركات الحساب' : 'Account transactions'}
                                        </h3>

                                        <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                            {filtered.length}
                                            {' '}
                                            {ar ? 'حركة' : 'transactions'}
                                        </p>
                                    </div>

                                    {loading && (
                                        <span className="inline-flex items-center gap-2 text-[9px] text-[var(--ac-accent)]">
                                            <RefreshCcw
                                                size={12}
                                                className="animate-spin"
                                            />
                                            {ar ? 'جارٍ التحديث...' : 'Refreshing...'}
                                        </span>
                                    )}
                                </div>

                                <div className="hidden overflow-x-auto md:block">
                                    <table className="w-full min-w-[980px] text-[10px]">
                                        <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                            <tr>
                                                <th className="px-4 py-3 text-start font-semibold">
                                                    #
                                                </th>
                                                <th className="px-4 py-3 text-start font-semibold">
                                                    {ar ? 'التاريخ' : 'Date'}
                                                </th>
                                                <th className="px-4 py-3 text-start font-semibold">
                                                    {ar ? 'المرجع' : 'Reference'}
                                                </th>
                                                <th className="px-4 py-3 text-start font-semibold">
                                                    {ar ? 'النوع' : 'Type'}
                                                </th>
                                                <th className="px-4 py-3 text-start font-semibold">
                                                    {ar ? 'الوصف' : 'Description'}
                                                </th>
                                                <th className="px-4 py-3 text-end font-semibold">
                                                    {ar ? 'مدين' : 'Debit'}
                                                </th>
                                                <th className="px-4 py-3 text-end font-semibold">
                                                    {ar ? 'دائن' : 'Credit'}
                                                </th>
                                                <th className="px-4 py-3 text-end font-semibold">
                                                    {ar ? 'الرصيد' : 'Balance'}
                                                </th>
                                            </tr>
                                        </thead>

                                        <tbody>
                                            {visibleTransactions.map(
                                                (transaction, index) => (
                                                    <TransactionRow
                                                        key={transaction.id}
                                                        transaction={transaction}
                                                        index={
                                                            (page - 1) * pageSize
                                                            + index
                                                            + 1
                                                        }
                                                        currency={data.currency}
                                                        locale={locale}
                                                        ar={ar}
                                                    />
                                                ),
                                            )}

                                            {visibleTransactions.length === 0 && (
                                                <tr>
                                                    <td
                                                        colSpan={8}
                                                        className="px-5 py-14 text-center text-xs text-[var(--ac-text-muted)]"
                                                    >
                                                        {ar
                                                            ? 'لا توجد حركات تطابق هذه الفترة أو الفلاتر.'
                                                            : 'No transactions match this period or filters.'}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>

                                <div className="space-y-2 p-3 md:hidden">
                                    {visibleTransactions.map(
                                        (transaction, index) => (
                                            <TransactionCard
                                                key={transaction.id}
                                                transaction={transaction}
                                                index={
                                                    (page - 1) * pageSize
                                                    + index
                                                    + 1
                                                }
                                                currency={data.currency}
                                                locale={locale}
                                                ar={ar}
                                            />
                                        ),
                                    )}

                                    {visibleTransactions.length === 0 && (
                                        <div className="py-12 text-center text-xs text-[var(--ac-text-muted)]">
                                            {ar
                                                ? 'لا توجد حركات تطابق هذه الفترة أو الفلاتر.'
                                                : 'No transactions match this period or filters.'}
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-col gap-3 border-t border-[var(--ac-line)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-2 text-[9px] text-[var(--ac-text-muted)]">
                                        <span>
                                            {ar ? 'عرض' : 'Show'}
                                        </span>

                                        <select
                                            className="h-8 rounded-[9px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-[9px] text-[var(--ac-text)]"
                                            value={pageSize}
                                            onChange={event => {
                                                setPageSize(
                                                    Number(event.target.value),
                                                );
                                                setPage(1);
                                            }}
                                        >
                                            <option value={10}>10</option>
                                            <option value={20}>20</option>
                                            <option value={50}>50</option>
                                        </select>

                                        <span>
                                            {ar
                                                ? 'من '
                                                    + String(filtered.length)
                                                    + ' حركة'
                                                : 'of '
                                                    + String(filtered.length)
                                                    + ' transactions'}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="flex size-9 items-center justify-center rounded-[10px] border border-[var(--ac-line)] text-[var(--ac-text-muted)] disabled:opacity-30"
                                            disabled={page <= 1}
                                            onClick={() =>
                                                setPage(current => current - 1)}
                                        >
                                            {ar
                                                ? <ChevronRight size={14} />
                                                : <ChevronLeft size={14} />}
                                        </button>

                                        <span className="min-w-10 rounded-[10px] bg-[var(--ac-accent)] px-3 py-2 text-center text-[10px] font-bold text-white">
                                            {page}
                                        </span>

                                        <button
                                            type="button"
                                            className="flex size-9 items-center justify-center rounded-[10px] border border-[var(--ac-line)] text-[var(--ac-text-muted)] disabled:opacity-30"
                                            disabled={page >= lastPage}
                                            onClick={() =>
                                                setPage(current => current + 1)}
                                        >
                                            {ar
                                                ? <ChevronLeft size={14} />
                                                : <ChevronRight size={14} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
                                <section className={panel + ' p-5'}>
                                    <div className="flex items-center gap-2">
                                        <FileText
                                            size={17}
                                            className="text-[var(--ac-accent)]"
                                        />
                                        <h3 className="text-sm font-bold text-[var(--ac-text)]">
                                            {ar ? 'ملاحظات داخلية' : 'Internal notes'}
                                        </h3>
                                    </div>

                                    <textarea
                                        rows={5}
                                        className="mt-4 w-full resize-y rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3 text-xs leading-6 text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                        value={notes}
                                        disabled={! data.permissions.party_edit}
                                        onChange={event =>
                                            setNotes(
                                                event.target.value,
                                            )}
                                        placeholder={
                                            ar
                                                ? 'أضف ملاحظات داخلية عن الحساب...'
                                                : 'Add internal account notes...'
                                        }
                                    />

                                    <div className="mt-3 flex items-center justify-between gap-3">
                                        <span className="text-[9px] text-[var(--ac-text-muted)]">
                                            {notesMessage}
                                        </span>

                                        {data.permissions.party_edit && (
                                            <button
                                                type="button"
                                                className={button}
                                                disabled={busy}
                                                onClick={() =>
                                                    void saveNotes()}
                                            >
                                                <Save size={12} />
                                                {ar ? 'حفظ' : 'Save'}
                                            </button>
                                        )}
                                    </div>
                                </section>

                                <section className={panel + ' p-5'}>
                                    <div className="flex items-center gap-2">
                                        <Clock3
                                            size={17}
                                            className="text-[var(--ac-accent)]"
                                        />
                                        <h3 className="text-sm font-bold text-[var(--ac-text)]">
                                            {ar ? 'أعمار الذمم' : 'Account aging'}
                                        </h3>
                                    </div>

                                    <div className="mt-4 space-y-4">
                                        {data.party.roles.includes('customer')
                                            && data.permissions.sales_view && (
                                            <AgingRow
                                                title={
                                                    ar
                                                        ? 'ذمم العميل (A/R)'
                                                        : 'Customer receivables (A/R)'
                                                }
                                                aging={data.aging_breakdown.customer}
                                                currency={data.currency}
                                                locale={locale}
                                                ar={ar}
                                            />
                                        )}

                                        {data.party.roles.includes('supplier')
                                            && data.permissions.purchases_view && (
                                            <AgingRow
                                                title={
                                                    ar
                                                        ? 'ذمم المورد (A/P)'
                                                        : 'Supplier payables (A/P)'
                                                }
                                                aging={data.aging_breakdown.supplier}
                                                currency={data.currency}
                                                locale={locale}
                                                ar={ar}
                                            />
                                        )}
                                    </div>
                                </section>
                            </div>
                        </section>

                        <PrintStatement
                            data={data}
                            transactions={filtered}
                            scope={scope}
                            locale={locale}
                            ar={ar}
                        />

                        {openingOpen
                            && openingDraft && (
                            <OpeningBalanceDialog
                                data={data}
                                draft={openingDraft}
                                setDraft={setOpeningDraft}
                                busy={busy}
                                ar={ar}
                                onClose={() =>
                                    setOpeningOpen(false)}
                                onSave={() =>
                                    void saveOpeningBalances()}
                                onClear={side =>
                                    void clearOpeningBalance(side)}
                            />
                        )}
                    </>
                )}
            </main>
        </AppShell>
    );
}

function ScopeButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'h-9 rounded-[10px] border px-3 text-[10px] font-bold transition',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                    : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text-muted)] hover:text-[var(--ac-text)]',
            ].join(' ')}
        >
            {children}
        </button>
    );
}

function SummaryCards({
    data,
    scope,
    ar,
    locale,
}: {
    data: PartyAccountResponse;
    scope: Scope;
    ar: boolean;
    locale: string;
}) {
    const currency =
        data.currency;

    if (
        scope === 'all'
    ) {
        const customer =
            toNumber(
                data.positions
                    .customer,
            );

        const supplier =
            toNumber(
                data.positions
                    .supplier,
            );

        const net =
            toNumber(
                data.positions
                    .net,
            );

        const advances =
            toNumber(
                data.positions
                    .customer_advance,
            )
            + toNumber(
                data.positions
                    .supplier_advance,
            );

        return (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricCard
                    icon={CircleDollarSign}
                    label={
                        ar
                            ? 'مركز العميل'
                            : 'Customer position'
                    }
                    value={
                        displayMoney(
                            customer,
                            currency,
                            locale,
                        )
                    }
                    note={
                        signedStatus(
                            customer,
                            'customer',
                            ar,
                        )
                    }
                    tone={
                        customer < 0
                            ? 'positive'
                            : 'default'
                    }
                />

                <MetricCard
                    icon={ShoppingCart}
                    label={
                        ar
                            ? 'مركز المورد'
                            : 'Supplier position'
                    }
                    value={
                        displayMoney(
                            supplier,
                            currency,
                            locale,
                        )
                    }
                    note={
                        signedStatus(
                            supplier,
                            'supplier',
                            ar,
                        )
                    }
                    tone={
                        supplier < 0
                            ? 'positive'
                            : 'default'
                    }
                />

                <MetricCard
                    icon={WalletCards}
                    label={
                        ar
                            ? 'الدفعات المقدمة المتاحة'
                            : 'Available advances'
                    }
                    value={
                        displayMoney(
                            advances,
                            currency,
                            locale,
                        )
                    }
                    note={
                        (
                            ar
                                ? 'عميل '
                                : 'Customer '
                        )
                        + displayMoney(
                            data
                                .positions
                                .customer_advance,
                            currency,
                            locale,
                        )
                        + ' · '
                        + (
                            ar
                                ? 'مورد '
                                : 'Supplier '
                        )
                        + displayMoney(
                            data
                                .positions
                                .supplier_advance,
                            currency,
                            locale,
                        )
                    }
                    tone={
                        advances > 0
                            ? 'positive'
                            : 'muted'
                    }
                />

                <MetricCard
                    icon={Landmark}
                    label={
                        ar
                            ? 'صافي الحساب'
                            : 'Net position'
                    }
                    value={
                        displayMoney(
                            net,
                            currency,
                            locale,
                        )
                    }
                    note={
                        signedStatus(
                            net,
                            'all',
                            ar,
                        )
                    }
                    tone="accent"
                />
            </div>
        );
    }

    const closing =
        toNumber(
            data.summary
                .closing_balance,
        );

    return (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
                icon={RotateCcw}
                label={
                    ar
                        ? 'الرصيد الافتتاحي'
                        : 'Opening balance'
                }
                value={
                    displayMoney(
                        data.summary
                            .opening_balance,
                        currency,
                        locale,
                    )
                }
                note={
                    ar
                        ? 'الرصيد المرحل قبل بداية الفترة'
                        : 'Carried balance before the period'
                }
                tone="muted"
            />

            <MetricCard
                icon={ReceiptText}
                label={
                    scope ===
                    'customer'
                        ? (
                            ar
                                ? 'إجمالي فواتير البيع'
                                : 'Sales invoices'
                        )
                        : (
                            ar
                                ? 'إجمالي فواتير الشراء'
                                : 'Purchase invoices'
                        )
                }
                value={
                    displayMoney(
                        data.summary
                            .invoice_total,
                        currency,
                        locale,
                    )
                }
                note={
                    ar
                        ? 'ضمن الفترة المحددة'
                        : 'Within selected period'
                }
            />

            <MetricCard
                icon={
                    scope ===
                    'customer'
                        ? Banknote
                        : HandCoins
                }
                label={
                    scope ===
                    'customer'
                        ? (
                            ar
                                ? 'إجمالي القبوضات'
                                : 'Total receipts'
                        )
                        : (
                            ar
                                ? 'إجمالي الدفعات'
                                : 'Total payments'
                        )
                }
                value={
                    displayMoney(
                        data.summary
                            .cash_total,
                        currency,
                        locale,
                    )
                }
                note={
                    (
                        ar
                            ? 'رصيد مقدم متاح '
                            : 'Available advance '
                    )
                    + displayMoney(
                        scope ===
                        'customer'
                            ? data
                                .positions
                                .customer_advance
                            : data
                                .positions
                                .supplier_advance,
                        currency,
                        locale,
                    )
                }
                tone="positive"
            />

            <MetricCard
                icon={Landmark}
                label={
                    ar
                        ? 'الرصيد الحالي'
                        : 'Current balance'
                }
                value={
                    displayMoney(
                        closing,
                        currency,
                        locale,
                    )
                }
                note={
                    signedStatus(
                        closing,
                        scope,
                        ar,
                    )
                }
                tone="accent"
            />
        </div>
    );
}

function MetricCard({
    icon: Icon,
    label,
    value,
    note,
    tone = 'default',
}: {
    icon:
        typeof CircleDollarSign;
    label: string;
    value: string;
    note: string;
    tone?:
        | 'default'
        | 'accent'
        | 'positive'
        | 'muted';
}) {
    const classes = {
        default:
            'border-[var(--ac-line)] bg-[var(--ac-surface)]',
        accent:
            'border-[var(--ac-accent)]/30 bg-[var(--ac-accent-soft)]',
        positive:
            'border-emerald-400/20 bg-emerald-500/5',
        muted:
            'border-[var(--ac-line)] bg-[var(--ac-surface-soft)]',
    }[tone];

    return (
        <div
            className={
                'rounded-[18px] border p-4 shadow-[var(--ac-shadow-soft)] '
                + classes
            }
        >
            <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-accent)]">
                    <Icon
                        size={
                            17
                        }
                    />
                </span>

                <div className="min-w-0">
                    <p className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                        {label}
                    </p>

                    <strong className="mt-1 block break-words text-lg text-[var(--ac-text)]">
                        {value}
                    </strong>

                    <p className="mt-1 text-[9px] leading-4 text-[var(--ac-text-muted)]">
                        {note}
                    </p>
                </div>
            </div>
        </div>
    );
}

function TransactionRow({
    transaction,
    index,
    currency,
    locale,
    ar,
}: {
    transaction:
        AccountTransaction;
    index: number;
    currency: string;
    locale: string;
    ar: boolean;
}) {
    return (
        <tr className="border-b border-[var(--ac-line)] last:border-b-0 hover:bg-[var(--ac-surface-soft)]">
            <td className="px-4 py-3 text-[var(--ac-text-muted)]">
                {index}
            </td>

            <td className="whitespace-nowrap px-4 py-3 text-[var(--ac-text-soft)]">
                {transaction.date}
            </td>

            <td className="px-4 py-3">
                {transaction.url ? (
                    <Link
                        href={
                            transaction.url
                        }
                        className="inline-flex items-center gap-1 font-bold text-[var(--ac-accent)] hover:underline"
                    >
                        {
                            transaction
                                .reference
                        }
                        <ArrowUpRight
                            size={
                                10
                            }
                        />
                    </Link>
                ) : (
                    <span className="font-semibold text-[var(--ac-text-soft)]">
                        {
                            transaction
                                .reference
                        }
                    </span>
                )}
            </td>

            <td className="px-4 py-3">
                <span
                    className={[
                        'rounded-full px-2 py-1 text-[8px] font-bold',
                        transaction.type ===
                            'invoice'
                            ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                            : transaction.type ===
                                'cash'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-amber-500/10 text-amber-400',
                    ].join(
                        ' ',
                    )}
                >
                    {transactionLabel(
                        transaction,
                        ar,
                    )}
                </span>
            </td>

            <td className="max-w-[320px] px-4 py-3 text-[var(--ac-text-soft)]">
                <div className="break-words">
                    {
                        transaction
                            .description
                    }
                </div>

                {transaction.method && (
                    <div className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                        {paymentMethodLabel(
                            transaction
                                .method,
                            ar,
                        )}

                        {toNumber(
                            transaction
                                .unallocated,
                        ) > 0 && (
                            <>
                                {' · '}
                                {ar
                                    ? 'غير مخصص: '
                                    : 'Unallocated: '}
                                {displayMoney(
                                    transaction
                                        .unallocated
                                    ?? '0',
                                    currency,
                                    locale,
                                )}
                            </>
                        )}
                    </div>
                )}
            </td>

            <td className="px-4 py-3 text-end font-semibold text-[var(--ac-text)]">
                {toNumber(
                    transaction
                        .debit,
                ) > 0
                    ? displayMoney(
                        transaction
                            .debit,
                        currency,
                        locale,
                    )
                    : '—'}
            </td>

            <td className="px-4 py-3 text-end font-semibold text-[var(--ac-text)]">
                {toNumber(
                    transaction
                        .credit,
                ) > 0
                    ? displayMoney(
                        transaction
                            .credit,
                        currency,
                        locale,
                    )
                    : '—'}
            </td>

            <td className="px-4 py-3 text-end font-bold text-[var(--ac-text)]">
                {displaySignedMoney(
                    transaction
                        .balance,
                    currency,
                    locale,
                )}
            </td>
        </tr>
    );
}

function TransactionCard({
    transaction,
    index,
    currency,
    locale,
    ar,
}: {
    transaction:
        AccountTransaction;
    index: number;
    currency: string;
    locale: string;
    ar: boolean;
}) {
    return (
        <article className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-[9px] text-[var(--ac-text-muted)]">
                        #{index}
                        {' · '}
                        {
                            transaction
                                .date
                        }
                    </p>

                    {transaction.url ? (
                        <Link
                            href={
                                transaction
                                    .url
                            }
                            className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[var(--ac-accent)]"
                        >
                            {
                                transaction
                                    .reference
                            }
                            <ArrowUpRight
                                size={
                                    10
                                }
                            />
                        </Link>
                    ) : (
                        <strong className="mt-1 block text-xs text-[var(--ac-text)]">
                            {
                                transaction
                                    .reference
                            }
                        </strong>
                    )}
                </div>

                <span className="rounded-full bg-[var(--ac-accent-soft)] px-2 py-1 text-[8px] font-bold text-[var(--ac-accent)]">
                    {transactionLabel(
                        transaction,
                        ar,
                    )}
                </span>
            </div>

            <p className="mt-2 text-[10px] leading-5 text-[var(--ac-text-soft)]">
                {
                    transaction
                        .description
                }
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <MiniValue
                    label={
                        ar
                            ? 'مدين'
                            : 'Debit'
                    }
                    value={
                        toNumber(
                            transaction
                                .debit,
                        ) > 0
                            ? displayMoney(
                                transaction
                                    .debit,
                                currency,
                                locale,
                            )
                            : '—'
                    }
                />

                <MiniValue
                    label={
                        ar
                            ? 'دائن'
                            : 'Credit'
                    }
                    value={
                        toNumber(
                            transaction
                                .credit,
                        ) > 0
                            ? displayMoney(
                                transaction
                                    .credit,
                                currency,
                                locale,
                            )
                            : '—'
                    }
                />

                <MiniValue
                    label={
                        ar
                            ? 'الرصيد'
                            : 'Balance'
                    }
                    value={
                        displaySignedMoney(
                            transaction
                                .balance,
                            currency,
                            locale,
                        )
                    }
                    strong
                />
            </div>
        </article>
    );
}

function MiniValue({
    label,
    value,
    strong = false,
}: {
    label: string;
    value: string;
    strong?: boolean;
}) {
    return (
        <div className="rounded-[10px] bg-[var(--ac-surface)] px-2 py-2">
            <p className="text-[8px] text-[var(--ac-text-muted)]">
                {label}
            </p>

            <p
                className={[
                    'mt-1 break-words text-[9px] text-[var(--ac-text)]',
                    strong
                        ? 'font-bold'
                        : 'font-semibold',
                ].join(
                    ' ',
                )}
            >
                {value}
            </p>
        </div>
    );
}

function AgingRow({
    title,
    aging,
    currency,
    locale,
    ar,
}: {
    title: string;
    aging: Aging;
    currency: string;
    locale: string;
    ar: boolean;
}) {
    const cells:
        [string, string][] = [
            [
                ar
                    ? 'حالي'
                    : 'Current',
                aging.current,
            ],
            [
                '1–30',
                aging.days_1_30,
            ],
            [
                '31–60',
                aging.days_31_60,
            ],
            [
                '61–90',
                aging.days_61_90,
            ],
            [
                ar
                    ? 'أكثر من 90'
                    : '90+',
                aging.over_90,
            ],
        ];

    return (
        <div className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-3">
            <p className="mb-3 text-[10px] font-bold text-[var(--ac-text-soft)]">
                {title}
            </p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {cells.map(
                    ([
                        label,
                        value,
                    ]) => (
                        <div
                            key={
                                label
                            }
                            className="rounded-[10px] bg-[var(--ac-surface)] px-2 py-2"
                        >
                            <p className="text-[8px] text-[var(--ac-text-muted)]">
                                {label}
                            </p>

                            <strong className="mt-1 block text-[9px] text-[var(--ac-text)]">
                                {displayMoney(
                                    value,
                                    currency,
                                    locale,
                                )}
                            </strong>
                        </div>
                    ),
                )}
            </div>
        </div>
    );
}

function OpeningBalanceDialog({
    data,
    draft,
    setDraft,
    busy,
    ar,
    onClose,
    onSave,
    onClear,
}: {
    data:
        PartyAccountResponse;
    draft:
        OpeningDraft;
    setDraft: (
        value:
            OpeningDraft,
    ) => void;
    busy: boolean;
    ar: boolean;
    onClose: () => void;
    onSave: () => void;
    onClear: (
        side: 'customer' | 'supplier',
    ) => void;
}) {
    return (
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-3">
            <div
                dir={
                    ar
                        ? 'rtl'
                        : 'ltr'
                }
                className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-[22px] border border-[var(--ac-line-strong)] bg-[var(--ac-surface)] shadow-2xl"
            >
                <div className="flex items-start justify-between gap-4 border-b border-[var(--ac-line)] p-5">
                    <div>
                        <h2 className="text-lg font-bold text-[var(--ac-text)]">
                            {ar
                                ? 'الرصيد المدور / الافتتاحي'
                                : 'Opening / carried balance'}
                        </h2>

                        <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'استخدمه فقط للرصيد الذي كان موجوداً قبل بدء التسجيل في AccoNova. الدفعات الجديدة أو الزائدة تُسجل كقبض أو دفع عادي وتتحول إلى رصيد مقدم تلقائياً.'
                                : 'Use this only for balances that existed before AccoNova. New prepayments or overpayments are normal receipts/payments and become advances automatically.'}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={
                            onClose
                        }
                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--ac-line)] text-[var(--ac-text-muted)]"
                    >
                        <X
                            size={
                                14
                            }
                        />
                    </button>
                </div>

                <div className="grid gap-4 p-5 md:grid-cols-2">
                    {data.party.roles.includes(
                        'customer',
                    ) && (
                        <OpeningSideEditor
                            title={
                                ar
                                    ? 'رصيد العميل'
                                    : 'Customer opening balance'
                            }
                            amount={
                                draft
                                    .customerAmount
                            }
                            direction={
                                draft
                                    .customerDirection
                            }
                            date={
                                draft
                                    .customerDate
                            }
                            notes={
                                draft
                                    .customerNotes
                            }
                            disabled={
                                ! data
                                    .permissions
                                    .sales_manage
                            }
                            ar={
                                ar
                            }
                            options={[
                                [
                                    'owes_us',
                                    ar
                                        ? 'العميل مدين لك'
                                        : 'Customer owes you',
                                ],
                                [
                                    'credit',
                                    ar
                                        ? 'رصيد للعميل / دفعة مقدمة'
                                        : 'Customer credit / advance',
                                ],
                            ]}
                            onAmount={
                                value =>
                                    setDraft({
                                        ...draft,
                                        customerAmount:
                                            value,
                                    })
                            }
                            onDirection={
                                value =>
                                    setDraft({
                                        ...draft,
                                        customerDirection:
                                            value as OpeningDraft['customerDirection'],
                                    })
                            }
                            onDate={
                                value =>
                                    setDraft({
                                        ...draft,
                                        customerDate:
                                            value,
                                    })
                            }
                            onNotes={
                                value =>
                                    setDraft({
                                        ...draft,
                                        customerNotes:
                                            value,
                                    })
                            }
                            onClear={
                                data.opening_balances.customer
                                    ? () => onClear('customer')
                                    : undefined
                            }
                        />
                    )}

                    {data.party.roles.includes(
                        'supplier',
                    ) && (
                        <OpeningSideEditor
                            title={
                                ar
                                    ? 'رصيد المورد'
                                    : 'Supplier opening balance'
                            }
                            amount={
                                draft
                                    .supplierAmount
                            }
                            direction={
                                draft
                                    .supplierDirection
                            }
                            date={
                                draft
                                    .supplierDate
                            }
                            notes={
                                draft
                                    .supplierNotes
                            }
                            disabled={
                                ! data
                                    .permissions
                                    .purchases_manage
                            }
                            ar={
                                ar
                            }
                            options={[
                                [
                                    'we_owe',
                                    ar
                                        ? 'أنت مدين للمورد'
                                        : 'You owe supplier',
                                ],
                                [
                                    'credit',
                                    ar
                                        ? 'رصيد لك عند المورد / دفعة مقدمة'
                                        : 'Supplier owes you / advance',
                                ],
                            ]}
                            onAmount={
                                value =>
                                    setDraft({
                                        ...draft,
                                        supplierAmount:
                                            value,
                                    })
                            }
                            onDirection={
                                value =>
                                    setDraft({
                                        ...draft,
                                        supplierDirection:
                                            value as OpeningDraft['supplierDirection'],
                                    })
                            }
                            onDate={
                                value =>
                                    setDraft({
                                        ...draft,
                                        supplierDate:
                                            value,
                                    })
                            }
                            onNotes={
                                value =>
                                    setDraft({
                                        ...draft,
                                        supplierNotes:
                                            value,
                                    })
                            }
                            onClear={
                                data.opening_balances.supplier
                                    ? () => onClear('supplier')
                                    : undefined
                            }
                        />
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-[var(--ac-line)] p-5">
                    <button
                        type="button"
                        className={
                            button
                        }
                        disabled={
                            busy
                        }
                        onClick={
                            onClose
                        }
                    >
                        {ar
                            ? 'إلغاء'
                            : 'Cancel'}
                    </button>

                    <button
                        type="button"
                        className={
                            primaryButton
                        }
                        disabled={
                            busy
                        }
                        onClick={
                            onSave
                        }
                    >
                        <Save
                            size={
                                13
                            }
                        />

                        {ar
                            ? 'حفظ الرصيد'
                            : 'Save balance'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function OpeningSideEditor({
    title,
    amount,
    direction,
    date,
    notes,
    disabled,
    ar,
    options,
    onAmount,
    onDirection,
    onDate,
    onNotes,
    onClear,
}: {
    title: string;
    amount: string;
    direction: string;
    date: string;
    notes: string;
    disabled: boolean;
    ar: boolean;
    options:
        [string, string][];
    onAmount: (
        value: string,
    ) => void;
    onDirection: (
        value: string,
    ) => void;
    onDate: (
        value: string,
    ) => void;
    onNotes: (
        value: string,
    ) => void;
    onClear?: () => void;
}) {
    return (
        <section className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4">
            <h3 className="text-xs font-bold text-[var(--ac-text)]">
                {title}
            </h3>

            <label className="mt-4 block text-[10px] font-semibold text-[var(--ac-text-soft)]">
                {ar
                    ? 'الحالة'
                    : 'Balance direction'}

                <select
                    className={
                        input
                        + ' mt-2'
                    }
                    value={
                        direction
                    }
                    disabled={
                        disabled
                    }
                    onChange={
                        event =>
                            onDirection(
                                event
                                    .target
                                    .value,
                            )
                    }
                >
                    {options.map(
                        ([
                            value,
                            label,
                        ]) => (
                            <option
                                key={
                                    value
                                }
                                value={
                                    value
                                }
                            >
                                {label}
                            </option>
                        ),
                    )}
                </select>
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                    {ar
                        ? 'المبلغ'
                        : 'Amount'}

                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        className={
                            input
                            + ' mt-2'
                        }
                        value={
                            amount
                        }
                        disabled={
                            disabled
                        }
                        onChange={
                            event =>
                                onAmount(
                                    event
                                        .target
                                        .value,
                                )
                        }
                    />
                </label>

                <label className="text-[10px] font-semibold text-[var(--ac-text-soft)]">
                    {ar
                        ? 'اعتباراً من'
                        : 'As of date'}

                    <input
                        type="date"
                        className={
                            input
                            + ' mt-2'
                        }
                        value={
                            date
                        }
                        disabled={
                            disabled
                        }
                        onChange={
                            event =>
                                onDate(
                                    event
                                        .target
                                        .value,
                                )
                        }
                    />
                </label>
            </div>

            <label className="mt-3 block text-[10px] font-semibold text-[var(--ac-text-soft)]">
                {ar
                    ? 'ملاحظة'
                    : 'Note'}

                <textarea
                    rows={
                        3
                    }
                    className="mt-2 w-full resize-y rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    value={
                        notes
                    }
                    disabled={
                        disabled
                    }
                    onChange={
                        event =>
                            onNotes(
                                event
                                    .target
                                    .value,
                            )
                    }
                />
            </label>

            {onClear
                && ! disabled && (
                <button
                    type="button"
                    onClick={onClear}
                    className="mt-3 text-[9px] font-semibold text-[var(--ac-danger)] hover:underline"
                >
                    {ar
                        ? 'إزالة الرصيد المدور لهذا الجانب'
                        : 'Remove this opening balance'}
                </button>
            )}
        </section>
    );
}

function PrintStatement({
    data,
    transactions,
    scope,
    locale,
    ar,
}: {
    data:
        PartyAccountResponse;
    transactions:
        AccountTransaction[];
    scope: Scope;
    locale: string;
    ar: boolean;
}) {
    return (
        <div
            dir={
                ar
                    ? 'rtl'
                    : 'ltr'
            }
            className="hidden print:block"
        >
            <style>
                {[
                    '@media print {',
                    '@page { size: A4; margin: 12mm; }',
                    'body * { visibility: hidden !important; }',
                    '.party-account-print, .party-account-print * { visibility: visible !important; }',
                    '.party-account-print { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; color: #172b4d !important; background: #fff !important; }',
                    '}',
                ].join(
                    ' ',
                )}
            </style>

            <article className="party-account-print bg-white p-2 text-[#172b4d]">
                <div className="border-b border-slate-300 pb-4">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-slate-400">
                        AccoNova
                    </p>

                    <h1 className="mt-1 text-2xl font-bold">
                        {ar
                            ? 'كشف حساب'
                            : 'Statement of Account'}
                    </h1>

                    <h2 className="mt-2 text-lg font-semibold">
                        {
                            data.party
                                .name
                        }
                    </h2>

                    <div className="mt-2 text-[10px] leading-5 text-slate-500">
                        {data.party.tax_number && (
                            <span>
                                {ar
                                    ? 'الرقم الضريبي: '
                                    : 'Tax number: '}
                                {
                                    data.party
                                        .tax_number
                                }
                                {' · '}
                            </span>
                        )}

                        <span>
                            {
                                data.period
                                    .date_from
                            }
                            {' — '}
                            {
                                data.period
                                    .date_to
                            }
                        </span>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-4 gap-2 text-[9px]">
                    <PrintMetric
                        label={
                            ar
                                ? 'الرصيد الافتتاحي'
                                : 'Opening balance'
                        }
                        value={
                            displayMoney(
                                data.summary
                                    .opening_balance,
                                data.currency,
                                locale,
                            )
                        }
                    />

                    <PrintMetric
                        label={
                            ar
                                ? 'الفواتير'
                                : 'Invoices'
                        }
                        value={
                            displayMoney(
                                data.summary
                                    .invoice_total,
                                data.currency,
                                locale,
                            )
                        }
                    />

                    <PrintMetric
                        label={
                            ar
                                ? 'القبض / الدفع'
                                : 'Cash movements'
                        }
                        value={
                            displayMoney(
                                data.summary
                                    .cash_total,
                                data.currency,
                                locale,
                            )
                        }
                    />

                    <PrintMetric
                        label={
                            ar
                                ? 'الرصيد الختامي'
                                : 'Closing balance'
                        }
                        value={
                            displayMoney(
                                data.summary
                                    .closing_balance,
                                data.currency,
                                locale,
                            )
                        }
                    />
                </div>

                <table className="mt-5 w-full border-collapse text-[8px]">
                    <thead>
                        <tr className="border-y border-slate-300 bg-slate-50">
                            <th className="px-2 py-2 text-start">
                                #
                            </th>
                            <th className="px-2 py-2 text-start">
                                {ar
                                    ? 'التاريخ'
                                    : 'Date'}
                            </th>
                            <th className="px-2 py-2 text-start">
                                {ar
                                    ? 'المرجع'
                                    : 'Reference'}
                            </th>
                            <th className="px-2 py-2 text-start">
                                {ar
                                    ? 'النوع'
                                    : 'Type'}
                            </th>
                            <th className="px-2 py-2 text-end">
                                {ar
                                    ? 'مدين'
                                    : 'Debit'}
                            </th>
                            <th className="px-2 py-2 text-end">
                                {ar
                                    ? 'دائن'
                                    : 'Credit'}
                            </th>
                            <th className="px-2 py-2 text-end">
                                {ar
                                    ? 'الرصيد'
                                    : 'Balance'}
                            </th>
                        </tr>
                    </thead>

                    <tbody>
                        {transactions.map(
                            (
                                transaction,
                                index,
                            ) => (
                                <tr
                                    key={
                                        transaction
                                            .id
                                    }
                                    className="border-b border-slate-200"
                                >
                                    <td className="px-2 py-2">
                                        {
                                            index
                                            + 1
                                        }
                                    </td>

                                    <td className="px-2 py-2">
                                        {
                                            transaction
                                                .date
                                        }
                                    </td>

                                    <td className="px-2 py-2">
                                        {
                                            transaction
                                                .reference
                                        }
                                    </td>

                                    <td className="px-2 py-2">
                                        {transactionLabel(
                                            transaction,
                                            ar,
                                        )}
                                    </td>

                                    <td className="px-2 py-2 text-end">
                                        {toNumber(
                                            transaction
                                                .debit,
                                        ) > 0
                                            ? displayMoney(
                                                transaction
                                                    .debit,
                                                data.currency,
                                                locale,
                                            )
                                            : '—'}
                                    </td>

                                    <td className="px-2 py-2 text-end">
                                        {toNumber(
                                            transaction
                                                .credit,
                                        ) > 0
                                            ? displayMoney(
                                                transaction
                                                    .credit,
                                                data.currency,
                                                locale,
                                            )
                                            : '—'}
                                    </td>

                                    <td className="px-2 py-2 text-end font-bold">
                                        {displaySignedMoney(
                                            transaction
                                                .balance,
                                            data.currency,
                                            locale,
                                        )}
                                    </td>
                                </tr>
                            ),
                        )}
                    </tbody>
                </table>

                <div className="mt-6 border-t border-slate-300 pt-3 text-[9px] text-slate-500">
                    {signedStatus(
                        toNumber(
                            data.summary
                                .closing_balance,
                        ),
                        scope,
                        ar,
                    )}
                </div>
            </article>
        </div>
    );
}

function PrintMetric({
    label,
    value,
}: {
    label: string;
    value: string;
}) {
    return (
        <div className="rounded border border-slate-200 p-2">
            <p className="text-slate-500">
                {label}
            </p>

            <strong className="mt-1 block text-[10px]">
                {value}
            </strong>
        </div>
    );
}
