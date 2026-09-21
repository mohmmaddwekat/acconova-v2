import { AppShell } from '@/layouts/AppShell';
import {
    ApiError,
    apiRequest,
} from '@/lib/http';
import {
    useLocale,
} from '@/lib/i18n';
import type {
    AppPageProps,
} from '@/types/app';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    AlertTriangle,
    Check,
    FilePlus2,
    RefreshCcw,
    Search,
    ShieldCheck,
    WalletCards,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react';

type Feature =
    | 'expiry-alerts'
    | 'landed-costs'
    | 'exchange-rates'
    | 'budgets'
    | 'spending-limits'
    | 'expense-claims'
    | 'petty-cash'
    | 'recurring-expenses'
    | 'contracts'
    | 'document-expiry'
    | 'data-quality';

type Row = Record<string, any>;

type Option = {
    value: string;
    label: string;
};

type Field = {
    key: string;
    ar: string;
    en: string;
    type?:
        | 'text'
        | 'number'
        | 'date'
        | 'month'
        | 'textarea'
        | 'select';
    options?: Option[];
    required?: boolean;
};

type Lookups = {
    currency: string;
    departments: Array<{
        id: number;
        name: string;
    }>;
    parties: Array<{
        id: number;
        name: string;
    }>;
    purchase_documents: Array<{
        id: number;
        number: string;
        total: string;
        currency: string;
        party: string | null;
    }>;
    staff: Array<{
        id: number;
        name: string;
        department_id: number | null;
    }>;
    can_review_expense_claims: boolean;
};

const readonlyFeatures: Feature[] = [
    'expiry-alerts',
    'exchange-rates',
    'data-quality',
];

const summaryFeatures: Feature[] = [
    'expiry-alerts',
    'landed-costs',
    'exchange-rates',
    'budgets',
    'spending-limits',
    'expense-claims',
    'petty-cash',
    'recurring-expenses',
    'contracts',
    'document-expiry',
    'data-quality',
];

function meta(
    feature: Feature,
    ar: boolean,
): {
    title: string;
    subtitle: string;
} {
    const labels: Record<
        Feature,
        [string, string, string, string]
    > = {
        'expiry-alerts': [
            'تنبيهات انتهاء الصلاحية',
            'Expiry date tracking',
            'دفعات المخزون التي انتهت أو ستنتهي قريباً مع مستوى تنبيه واضح.',
            'Inventory lots that are expired or approaching expiry, with clear alert levels.',
        ],
        'landed-costs': [
            'تكلفة الاستيراد والتوريد',
            'Landed cost',
            'وزّع الشحن والجمارك والتأمين والمصاريف على بنود فاتورة الشراء. التوزيع هنا تحليلي آمن ولا يغيّر تقييم المخزون أو القيد المحاسبي تلقائياً.',
            'Allocate freight, customs, insurance and handling across purchase lines. This is a safe analytical worksheet and does not automatically revalue inventory or post accounting entries.',
        ],
        'exchange-rates': [
            'سجل أسعار الصرف',
            'Exchange rate history',
            'سجل سعر الصرف المستخدم في كل فاتورة ومتى تغيّر ومن قام بالتعديل.',
            'History of the exchange rate used on every invoice, including when and by whom it changed.',
        ],
        budgets: [
            'الميزانية مقابل الفعلي',
            'Budget vs actual',
            'ميزانية شهرية لكل قسم مقارنة بالمصروف الفعلي المسجل في المدفوعات.',
            'Monthly department budgets compared with actual posted outgoing cash movements.',
        ],
        'spending-limits': [
            'سقوف صرف الأقسام',
            'Department spending limits',
            'سقف صرف شهري لكل قسم؛ النظام يمنع ترحيل دفعة تتجاوز السقف النشط.',
            'Monthly department spending caps; posting a payment that exceeds an active cap is blocked.',
        ],
        'expense-claims': [
            'مطالبات المصاريف',
            'Expense claims',
            'الموظف يرفع طلب تعويض، والجهة المخولة تراجعه وتعتمده ثم تسجل مرجع الدفع.',
            'Employees submit reimbursements, authorized reviewers approve them and record the payout reference.',
        ],
        'petty-cash': [
            'صناديق النثريات',
            'Petty cash management',
            'صناديق مستقلة بسقف ورصيد ومسؤول وحركات إيداع وصرف مدققة.',
            'Independent petty cash funds with caps, balances, custodians and controlled in/out transactions.',
        ],
        'recurring-expenses': [
            'المصاريف المتكررة',
            'Recurring expenses',
            'إيجار وإنترنت واشتراكات ومصاريف دورية مع موعد الاستحقاق القادم.',
            'Rent, internet, subscriptions and other recurring costs with the next expected due date.',
        ],
        contracts: [
            'إدارة العقود',
            'Contract management',
            'عقود العملاء والموردين مع القيمة والفترة ونوع التجديد وتنبيهات 30/15/7 أيام.',
            'Customer and supplier contracts with value, term, renewal mode and 30/15/7-day expiry alerts.',
        ],
        'document-expiry': [
            'انتهاء الوثائق',
            'Document expiry tracking',
            'تتبع الرخص والشهادات والإقامات ووثائق الجهات والتنبيه قبل انتهائها.',
            'Track licenses, certificates, permits, staff documents and party documents before expiry.',
        ],
        'data-quality': [
            'مركز جودة البيانات',
            'Data quality center',
            'اكتشاف البيانات الناقصة والسجلات المحتمل تكرارها والمنتجات المادية بدون تكلفة.',
            'Find incomplete records, possible duplicates and physical products with missing cost data.',
        ],
    };

    const item =
        labels[feature];

    return {
        title:
            ar
                ? item[0]
                : item[1],
        subtitle:
            ar
                ? item[2]
                : item[3],
    };
}

function labelFor(
    key: string,
    ar: boolean,
): string {
    const labels: Record<
        string,
        [string, string]
    > = {
        product: ['المنتج', 'Product'],
        warehouse: ['المستودع', 'Warehouse'],
        lot_code: ['التشغيلة', 'Lot / batch'],
        quantity: ['الكمية', 'Quantity'],
        expiry_date: ['تاريخ الانتهاء', 'Expiry'],
        days_until_expiry: ['الأيام المتبقية', 'Days left'],
        alert_level: ['التنبيه', 'Alert'],
        document_number: ['المستند', 'Document'],
        party: ['العميل / المورد', 'Party'],
        cost_type: ['نوع التكلفة', 'Cost type'],
        title: ['العنوان', 'Title'],
        amount: ['المبلغ', 'Amount'],
        currency: ['العملة', 'Currency'],
        allocation_method: ['طريقة التوزيع', 'Allocation'],
        status: ['الحالة', 'Status'],
        base_currency: ['العملة الأساسية', 'Base currency'],
        exchange_rate: ['سعر الصرف', 'Exchange rate'],
        source: ['المصدر', 'Source'],
        recorded_at: ['وقت التسجيل', 'Recorded at'],
        changed_by: ['عدّلها', 'Changed by'],
        department: ['القسم', 'Department'],
        month: ['الشهر', 'Month'],
        actual: ['الفعلي', 'Actual'],
        variance: ['الفرق', 'Variance'],
        usage_percent: ['الاستخدام %', 'Usage %'],
        monthly_limit: ['السقف الشهري', 'Monthly limit'],
        spent: ['المصروف', 'Spent'],
        remaining: ['المتبقي', 'Remaining'],
        submitted_by_name: ['الموظف', 'Employee'],
        expense_date: ['تاريخ المصروف', 'Expense date'],
        merchant: ['الجهة / المتجر', 'Merchant'],
        reviewed_by_name: ['راجعها', 'Reviewed by'],
        payout_reference: ['مرجع الدفع', 'Payout reference'],
        name: ['الاسم', 'Name'],
        custodian: ['المسؤول', 'Custodian'],
        limit_amount: ['السقف', 'Limit'],
        balance: ['الرصيد', 'Balance'],
        spent_this_month: ['صرف الشهر', 'Spent this month'],
        frequency: ['التكرار', 'Frequency'],
        next_due_on: ['الاستحقاق القادم', 'Next due'],
        days_until_due: ['الأيام للاستحقاق', 'Days until due'],
        contract_type: ['نوع العقد', 'Contract type'],
        starts_on: ['البداية', 'Starts'],
        ends_on: ['النهاية', 'Ends'],
        value: ['القيمة', 'Value'],
        renewal_type: ['التجديد', 'Renewal'],
        subject_type: ['صاحب الوثيقة', 'Subject type'],
        subject_label: ['الجهة / الموظف', 'Subject'],
        document_type: ['نوع الوثيقة', 'Document type'],
        document_number: ['رقم الوثيقة', 'Document number'],
        expires_on: ['تنتهي في', 'Expires on'],
        entity_type: ['نوع السجل', 'Record type'],
        entity: ['السجل', 'Record'],
        issue: ['المشكلة', 'Issue'],
        severity: ['الأهمية', 'Severity'],
        accounting_effect: ['أثر محاسبي', 'Accounting effect'],
    };

    const pair =
        labels[key];

    return pair
        ? (
            ar
                ? pair[0]
                : pair[1]
        )
        : key.replaceAll(
            '_',
            ' ',
        );
}

function visibleKeys(
    feature: Feature,
): string[] {
    const keys: Record<
        Feature,
        string[]
    > = {
        'expiry-alerts': [
            'product',
            'warehouse',
            'lot_code',
            'quantity',
            'expiry_date',
            'days_until_expiry',
            'alert_level',
        ],
        'landed-costs': [
            'document_number',
            'party',
            'cost_type',
            'title',
            'amount',
            'currency',
            'allocation_method',
            'status',
        ],
        'exchange-rates': [
            'document_number',
            'base_currency',
            'currency',
            'exchange_rate',
            'source',
            'changed_by',
            'recorded_at',
        ],
        budgets: [
            'department',
            'month',
            'amount',
            'currency',
            'actual',
            'variance',
            'usage_percent',
        ],
        'spending-limits': [
            'department',
            'month',
            'monthly_limit',
            'currency',
            'spent',
            'remaining',
            'usage_percent',
            'active',
        ],
        'expense-claims': [
            'submitted_by_name',
            'department',
            'title',
            'expense_date',
            'merchant',
            'amount',
            'currency',
            'status',
            'reviewed_by_name',
            'payout_reference',
        ],
        'petty-cash': [
            'name',
            'department',
            'custodian',
            'limit_amount',
            'currency',
            'balance',
            'spent_this_month',
            'active',
        ],
        'recurring-expenses': [
            'title',
            'party',
            'department',
            'amount',
            'currency',
            'frequency',
            'next_due_on',
            'days_until_due',
            'active',
        ],
        contracts: [
            'title',
            'party',
            'contract_type',
            'starts_on',
            'ends_on',
            'days_until_expiry',
            'alert_level',
            'value',
            'currency',
            'renewal_type',
            'status',
        ],
        'document-expiry': [
            'subject_type',
            'subject_label',
            'document_type',
            'document_number',
            'expires_on',
            'days_until_expiry',
            'alert_level',
            'status',
        ],
        'data-quality': [
            'entity_type',
            'entity',
            'issue',
            'severity',
        ],
    };

    return keys[feature];
}

function defaultForm(
    feature: Feature,
    currency: string,
): Record<string, string> {
    const today =
        new Date()
            .toISOString()
            .slice(
                0,
                10,
            );

    const month =
        today.slice(
            0,
            7,
        );

    const common = {
        currency,
    };

    switch (feature) {
        case 'budgets':
            return {
                ...common,
                month,
            };
        case 'expense-claims':
            return {
                ...common,
                expense_date: today,
            };
        case 'petty-cash':
            return {
                ...common,
                opening_balance: '0',
            };
        case 'recurring-expenses':
            return {
                ...common,
                frequency: 'monthly',
                next_due_on: today,
            };
        case 'contracts':
            return {
                ...common,
                contract_type: 'other',
                starts_on: today,
                ends_on: today,
                renewal_type: 'manual',
                reminder_days: '30',
            };
        case 'document-expiry':
            return {
                subject_type: 'organization',
                expires_on: today,
                reminder_days: '30',
            };
        case 'landed-costs':
            return {
                cost_type: 'shipping',
                allocation_method: 'value',
            };
        case 'spending-limits':
            return common;
        default:
            return {};
    }
}

export default function ControlWorkspace({
    feature,
}: {
    feature: Feature;
}) {
    const ar =
        useLocale() === 'ar';
    const info =
        meta(
            feature,
            ar,
        );
    const page =
        usePage<AppPageProps>();
    const activeOrganization =
        page.props.workspace
            .activeOrganization;
    const role =
        activeOrganization?.role;
    const permissions =
        activeOrganization?.permissions;

    const builtInFinance =
        [
            'owner',
            'admin',
            'manager',
            'accountant',
        ].includes(
            role ?? '',
        );

    const cashPay =
        permissions
            ? permissions.includes(
                'finance.cash.pay',
            )
            : builtInFinance;
    const purchasesManage =
        permissions
            ? permissions.includes(
                'finance.purchases.manage',
            )
            : builtInFinance;
    const partyManage =
        permissions
            ? permissions.some(
                permission =>
                    [
                        'parties.manage',
                        'parties.create',
                    ].includes(
                        permission,
                    ),
            )
            : [
                'owner',
                'admin',
                'manager',
                'accountant',
            ].includes(
                role ?? '',
            );
    const staffManage =
        permissions
            ? permissions.some(
                permission =>
                    [
                        'staff.manage',
                        'staff.team_manage',
                    ].includes(
                        permission,
                    ),
            )
            : [
                'owner',
                'admin',
                'manager',
            ].includes(
                role ?? '',
            );

    const canManageFeature =
        feature === 'landed-costs'
            ? purchasesManage
            : [
                'budgets',
                'spending-limits',
                'petty-cash',
                'recurring-expenses',
            ].includes(
                feature,
            )
                ? cashPay
                : feature === 'expense-claims'
                    ? Boolean(
                        activeOrganization,
                    )
                    : feature === 'contracts'
                        ? partyManage
                        : feature === 'document-expiry'
                            ? staffManage
                            : false;

    const canCreate =
        ! readonlyFeatures.includes(
            feature,
        )
        && canManageFeature;

    const [
        lookups,
        setLookups,
    ] = useState<Lookups>({
        currency: 'ILS',
        departments: [],
        parties: [],
        purchase_documents: [],
        staff: [],
        can_review_expense_claims: false,
    });
    const [
        rows,
        setRows,
    ] = useState<Row[]>([]);
    const [
        form,
        setForm,
    ] = useState<
        Record<string, string>
    >({});
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
    const [
        search,
        setSearch,
    ] = useState('');
    const [
        statusFilter,
        setStatusFilter,
    ] = useState('');

    const load = async (): Promise<void> => {
        setLoading(true);
        setError('');

        try {
            const response =
                await apiRequest<{
                    data: Row[];
                }>(
                    '/api/control/'
                    + feature,
                );

            setRows(
                response.data,
            );
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تحميل البيانات.'
                            : 'The data could not be loaded.'
                    ),
            );
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const controller =
            new AbortController();

        apiRequest<Lookups>(
            '/api/control-lookups',
            {
                signal:
                    controller.signal,
            },
        )
            .then(
                response => {
                    setLookups(
                        response,
                    );
                    setForm(
                        defaultForm(
                            feature,
                            response.currency,
                        ),
                    );
                },
            )
            .catch(
                () => {
                    setForm(
                        defaultForm(
                            feature,
                            'ILS',
                        ),
                    );
                },
            );

        return () =>
            controller.abort();
    }, [
        feature,
        activeOrganization?.id,
    ]);

    useEffect(() => {
        void load();
        setSearch('');
        setStatusFilter('');
    }, [
        feature,
        activeOrganization?.id,
    ]);

    const fields =
        useMemo(
            () =>
                createFields(
                    feature,
                    ar,
                    lookups,
                    form,
                ),
            [
                feature,
                ar,
                lookups,
                form.subject_type,
            ],
        );

    const statusOptions =
        useMemo(
            () =>
                Array.from(
                    new Set(
                        rows
                            .map(
                                row =>
                                    String(
                                        row.status
                                        ?? row.alert_level
                                        ?? row.severity
                                        ?? '',
                                    ),
                            )
                            .filter(Boolean),
                    ),
                ).sort(),
            [rows],
        );

    const filteredRows =
        useMemo(
            () => {
                const needle =
                    search
                        .trim()
                        .toLowerCase();

                return rows.filter(
                    row => {
                        const status =
                            String(
                                row.status
                                ?? row.alert_level
                                ?? row.severity
                                ?? '',
                            );

                        if (
                            statusFilter
                            && status
                                !== statusFilter
                        ) {
                            return false;
                        }

                        if (! needle) {
                            return true;
                        }

                        return JSON.stringify(
                            row,
                        )
                            .toLowerCase()
                            .includes(
                                needle,
                            );
                    },
                );
            },
            [
                rows,
                search,
                statusFilter,
            ],
        );

    async function submit(
        event: FormEvent<HTMLFormElement>,
    ): Promise<void> {
        event.preventDefault();

        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/control/'
                + feature,
                {
                    method: 'POST',
                    body:
                        JSON.stringify(
                            buildPayload(
                                feature,
                                form,
                            ),
                        ),
                },
            );

            setForm(
                defaultForm(
                    feature,
                    lookups.currency,
                ),
            );
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر حفظ السجل.'
                            : 'The record could not be saved.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function patch(
        row: Row,
        payload: Row,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/control/'
                + feature
                + '/'
                + String(row.id),
                {
                    method: 'PATCH',
                    body:
                        JSON.stringify(
                            payload,
                        ),
                },
            );

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تحديث السجل.'
                            : 'The record could not be updated.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function pettyTransaction(
        row: Row,
        direction:
            | 'in'
            | 'out',
    ): Promise<void> {
        const amount =
            window.prompt(
                direction === 'out'
                    ? (
                        ar
                            ? 'قيمة الصرف من صندوق النثريات'
                            : 'Petty cash spend amount'
                    )
                    : (
                        ar
                            ? 'قيمة الإيداع في صندوق النثريات'
                            : 'Petty cash deposit amount'
                    ),
            );

        if (
            amount === null
            || Number(amount) <= 0
        ) {
            return;
        }

        const category =
            window.prompt(
                ar
                    ? 'التصنيف أو البيان (اختياري)'
                    : 'Category or description (optional)',
            );

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/control/petty-cash/'
                + String(row.id)
                + '/transactions',
                {
                    method: 'POST',
                    body:
                        JSON.stringify({
                            direction,
                            amount,
                            category:
                                category?.trim()
                                || null,
                        }),
                },
            );

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تسجيل حركة النثريات.'
                            : 'The petty cash transaction could not be recorded.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <Head
                title={info.title}
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
                                Controls
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {info.title}
                            </h1>
                            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                {info.subtitle}
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
                            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-50"
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
                    <div
                        role="alert"
                        className="mt-4 rounded-[14px] border border-red-300/40 bg-red-500/10 p-4 text-sm text-red-300"
                    >
                        {error}
                    </div>
                )}

                {! loading
                    && rows.length > 0
                    && (
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
                                            ? 'بحث في السجلات...'
                                            : 'Search records...'
                                    }
                                    className="h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] ps-9 pe-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                />
                            </div>

                            {statusOptions.length
                                > 1 && (
                                <select
                                    value={
                                        statusFilter
                                    }
                                    onChange={
                                        event =>
                                            setStatusFilter(
                                                event.target.value,
                                            )
                                    }
                                    className="h-10 min-w-40 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                >
                                    <option value="">
                                        {ar
                                            ? 'كل الحالات'
                                            : 'All statuses'}
                                    </option>
                                    {statusOptions.map(
                                        status => (
                                            <option
                                                key={
                                                    status
                                                }
                                                value={
                                                    status
                                                }
                                            >
                                                {formatValue(
                                                    status,
                                                    ar,
                                                )}
                                            </option>
                                        ),
                                    )}
                                </select>
                            )}

                            <span className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                                {
                                    filteredRows.length
                                }
                                {' / '}
                                {rows.length}
                            </span>
                        </section>
                    )}

                {! loading
                    && rows.length > 0
                    && summaryFeatures.includes(
                        feature,
                    )
                    && (
                        <ControlSummary
                            feature={
                                feature
                            }
                            rows={
                                filteredRows
                            }
                            ar={ar}
                        />
                    )}

                {canCreate && (
                    <form
                        onSubmit={
                            event =>
                                void submit(
                                    event,
                                )
                        }
                        className="mt-5 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]"
                    >
                        <div className="flex items-center gap-2">
                            <FilePlus2
                                size={16}
                                className="text-[var(--ac-accent)]"
                            />
                            <h2 className="text-sm font-bold text-[var(--ac-text)]">
                                {ar
                                    ? 'إضافة سجل جديد'
                                    : 'Create new record'}
                            </h2>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {fields.map(
                                field => (
                                    <FieldInput
                                        key={
                                            field.key
                                        }
                                        field={
                                            field
                                        }
                                        ar={ar}
                                        value={
                                            form[
                                                field.key
                                            ]
                                            ?? ''
                                        }
                                        onChange={
                                            value =>
                                                setForm(
                                                    current => ({
                                                        ...current,
                                                        [field.key]:
                                                            value,
                                                    }),
                                                )
                                        }
                                    />
                                ),
                            )}
                        </div>

                        <div className="mt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={busy}
                                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-accent)] px-4 text-xs font-bold text-[var(--ac-accent)] transition hover:bg-[var(--ac-accent-soft)] disabled:opacity-50"
                            >
                                <Check
                                    size={14}
                                />
                                {ar
                                    ? 'حفظ'
                                    : 'Save'}
                            </button>
                        </div>
                    </form>
                )}

                <section className="mt-5 space-y-3">
                    {loading ? (
                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar
                                ? 'جارٍ التحميل…'
                                : 'Loading…'}
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar
                                ? 'لا توجد سجلات حالياً.'
                                : 'No records yet.'}
                        </div>
                    ) : filteredRows.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar
                                ? 'لا توجد نتائج مطابقة.'
                                : 'No matching records.'}
                        </div>
                    ) : (
                        filteredRows.map(
                            (
                                row,
                                index,
                            ) => (
                                <article
                                    key={
                                        String(
                                            row.id
                                            ?? index,
                                        )
                                    }
                                    className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]"
                                >
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                                        {visibleKeys(
                                            feature,
                                        ).map(
                                            key => (
                                                <div
                                                    key={
                                                        key
                                                    }
                                                    className="min-w-0 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2"
                                                >
                                                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                        {labelFor(
                                                            key,
                                                            ar,
                                                        )}
                                                    </p>
                                                    <p className="mt-1 truncate text-xs font-semibold text-[var(--ac-text)]">
                                                        {formatValue(
                                                            row[
                                                                key
                                                            ],
                                                            ar,
                                                        )}
                                                    </p>
                                                </div>
                                            ),
                                        )}
                                    </div>

                                    {feature
                                        === 'landed-costs'
                                        && Array.isArray(
                                            row.allocations,
                                        )
                                        && row.allocations.length
                                            > 0
                                        && (
                                            <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                                {row.allocations.map(
                                                    (
                                                        allocation: Row,
                                                    ) => (
                                                        <div
                                                            key={
                                                                allocation.line_id
                                                            }
                                                            className="rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2 text-[10px]"
                                                        >
                                                            <p className="font-semibold text-[var(--ac-text)]">
                                                                {
                                                                    allocation.product
                                                                }
                                                            </p>
                                                            <p className="mt-1 text-[var(--ac-text-muted)]">
                                                                {ar
                                                                    ? 'حصة التكلفة: '
                                                                    : 'Allocated cost: '}
                                                                {formatValue(
                                                                    allocation.allocated_cost,
                                                                    ar,
                                                                )}
                                                                {' · '}
                                                                {ar
                                                                    ? 'إضافة للوحدة: '
                                                                    : 'Extra/unit: '}
                                                                {formatValue(
                                                                    allocation.extra_unit_cost,
                                                                    ar,
                                                                )}
                                                            </p>
                                                        </div>
                                                    ),
                                                )}
                                            </div>
                                        )}

                                    <RowActions
                                        feature={
                                            feature
                                        }
                                        row={row}
                                        ar={ar}
                                        busy={
                                            busy
                                            || ! canManageFeature
                                        }
                                        canReviewExpenseClaims={
                                            lookups.can_review_expense_claims
                                        }
                                        onPatch={
                                            payload =>
                                                void patch(
                                                    row,
                                                    payload,
                                                )
                                        }
                                        onPettyTransaction={
                                            direction =>
                                                void pettyTransaction(
                                                    row,
                                                    direction,
                                                )
                                        }
                                    />
                                </article>
                            ),
                        )
                    )}
                </section>
            </main>
        </AppShell>
    );
}

function createFields(
    feature: Feature,
    ar: boolean,
    lookups: Lookups,
    form: Record<string, string>,
): Field[] {
    const departments: Option[] = [
        {
            value: '',
            label:
                ar
                    ? '— بدون قسم —'
                    : '— No department —',
        },
        ...lookups.departments.map(
            department => ({
                value:
                    String(
                        department.id,
                    ),
                label:
                    department.name,
            }),
        ),
    ];

    const parties: Option[] = [
        {
            value: '',
            label:
                ar
                    ? '— بدون جهة —'
                    : '— No party —',
        },
        ...lookups.parties.map(
            party => ({
                value:
                    String(
                        party.id,
                    ),
                label:
                    party.name,
            }),
        ),
    ];

    const purchaseDocuments: Option[] = [
        {
            value: '',
            label:
                ar
                    ? '— اختر فاتورة شراء —'
                    : '— Select purchase invoice —',
        },
        ...lookups.purchase_documents.map(
            document => ({
                value:
                    String(
                        document.id,
                    ),
                label: [
                    document.number,
                    document.party,
                    document.total
                        + ' '
                        + document.currency,
                ]
                    .filter(Boolean)
                    .join(' · '),
            }),
        ),
    ];

    if (
        feature
        === 'landed-costs'
    ) {
        return [
            {
                key: 'purchase_document_id',
                ar: 'فاتورة الشراء',
                en: 'Purchase invoice',
                type: 'select',
                options:
                    purchaseDocuments,
                required: true,
            },
            {
                key: 'cost_type',
                ar: 'نوع التكلفة',
                en: 'Cost type',
                type: 'select',
                required: true,
                options: [
                    {
                        value: 'shipping',
                        label:
                            ar
                                ? 'شحن'
                                : 'Shipping',
                    },
                    {
                        value: 'customs',
                        label:
                            ar
                                ? 'جمارك'
                                : 'Customs',
                    },
                    {
                        value: 'insurance',
                        label:
                            ar
                                ? 'تأمين'
                                : 'Insurance',
                    },
                    {
                        value: 'handling',
                        label:
                            ar
                                ? 'مناولة'
                                : 'Handling',
                    },
                    {
                        value: 'other',
                        label:
                            ar
                                ? 'أخرى'
                                : 'Other',
                    },
                ],
            },
            {
                key: 'title',
                ar: 'البيان',
                en: 'Description',
                required: true,
            },
            {
                key: 'amount',
                ar: 'المبلغ',
                en: 'Amount',
                type: 'number',
                required: true,
            },
            {
                key: 'allocation_method',
                ar: 'طريقة التوزيع',
                en: 'Allocation method',
                type: 'select',
                required: true,
                options: [
                    {
                        value: 'value',
                        label:
                            ar
                                ? 'حسب قيمة البنود'
                                : 'By line value',
                    },
                    {
                        value: 'quantity',
                        label:
                            ar
                                ? 'حسب الكمية'
                                : 'By quantity',
                    },
                    {
                        value: 'equal',
                        label:
                            ar
                                ? 'بالتساوي'
                                : 'Equal split',
                    },
                ],
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (
        feature === 'budgets'
        || feature
            === 'spending-limits'
    ) {
        return [
            {
                key: 'department_id',
                ar: 'القسم',
                en: 'Department',
                type: 'select',
                options:
                    departments.filter(
                        option =>
                            option.value
                            !== '',
                    ),
                required: true,
            },
            ...(
                feature
                    === 'budgets'
                    ? [
                        {
                            key: 'month',
                            ar: 'الشهر',
                            en: 'Month',
                            type: 'month' as const,
                            required: true,
                        },
                        {
                            key: 'amount',
                            ar: 'قيمة الميزانية',
                            en: 'Budget amount',
                            type: 'number' as const,
                            required: true,
                        },
                    ]
                    : [
                        {
                            key: 'monthly_limit',
                            ar: 'سقف الصرف الشهري',
                            en: 'Monthly limit',
                            type: 'number' as const,
                            required: true,
                        },
                    ]
            ),
            {
                key: 'currency',
                ar: 'العملة',
                en: 'Currency',
                required: true,
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (
        feature
        === 'expense-claims'
    ) {
        return [
            {
                key: 'title',
                ar: 'وصف المصروف',
                en: 'Expense title',
                required: true,
            },
            {
                key: 'amount',
                ar: 'المبلغ',
                en: 'Amount',
                type: 'number',
                required: true,
            },
            {
                key: 'currency',
                ar: 'العملة',
                en: 'Currency',
                required: true,
            },
            {
                key: 'expense_date',
                ar: 'تاريخ المصروف',
                en: 'Expense date',
                type: 'date',
                required: true,
            },
            {
                key: 'merchant',
                ar: 'المتجر / الجهة',
                en: 'Merchant',
            },
            {
                key: 'reference',
                ar: 'مرجع / رقم فاتورة',
                en: 'Reference / receipt no.',
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (
        feature
        === 'petty-cash'
    ) {
        return [
            {
                key: 'name',
                ar: 'اسم الصندوق',
                en: 'Fund name',
                required: true,
            },
            {
                key: 'department_id',
                ar: 'القسم',
                en: 'Department',
                type: 'select',
                options: departments,
            },
            {
                key: 'limit_amount',
                ar: 'سقف الصندوق',
                en: 'Fund limit',
                type: 'number',
                required: true,
            },
            {
                key: 'opening_balance',
                ar: 'الرصيد الافتتاحي',
                en: 'Opening balance',
                type: 'number',
            },
            {
                key: 'currency',
                ar: 'العملة',
                en: 'Currency',
                required: true,
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (
        feature
        === 'recurring-expenses'
    ) {
        return [
            {
                key: 'title',
                ar: 'اسم المصروف',
                en: 'Expense title',
                required: true,
            },
            {
                key: 'department_id',
                ar: 'القسم',
                en: 'Department',
                type: 'select',
                options: departments,
            },
            {
                key: 'party_id',
                ar: 'المورد / الجهة',
                en: 'Supplier / party',
                type: 'select',
                options: parties,
            },
            {
                key: 'amount',
                ar: 'المبلغ',
                en: 'Amount',
                type: 'number',
                required: true,
            },
            {
                key: 'currency',
                ar: 'العملة',
                en: 'Currency',
                required: true,
            },
            {
                key: 'frequency',
                ar: 'التكرار',
                en: 'Frequency',
                type: 'select',
                required: true,
                options: [
                    {
                        value: 'weekly',
                        label:
                            ar
                                ? 'أسبوعي'
                                : 'Weekly',
                    },
                    {
                        value: 'monthly',
                        label:
                            ar
                                ? 'شهري'
                                : 'Monthly',
                    },
                    {
                        value: 'quarterly',
                        label:
                            ar
                                ? 'ربع سنوي'
                                : 'Quarterly',
                    },
                    {
                        value: 'yearly',
                        label:
                            ar
                                ? 'سنوي'
                                : 'Yearly',
                    },
                ],
            },
            {
                key: 'next_due_on',
                ar: 'الاستحقاق القادم',
                en: 'Next due',
                type: 'date',
                required: true,
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (feature === 'contracts') {
        return [
            {
                key: 'party_id',
                ar: 'العميل / المورد',
                en: 'Party',
                type: 'select',
                options: parties,
            },
            {
                key: 'title',
                ar: 'اسم العقد',
                en: 'Contract title',
                required: true,
            },
            {
                key: 'contract_type',
                ar: 'نوع العقد',
                en: 'Contract type',
                type: 'select',
                required: true,
                options: [
                    {
                        value: 'customer',
                        label:
                            ar
                                ? 'عميل'
                                : 'Customer',
                    },
                    {
                        value: 'supplier',
                        label:
                            ar
                                ? 'مورد'
                                : 'Supplier',
                    },
                    {
                        value: 'other',
                        label:
                            ar
                                ? 'أخرى'
                                : 'Other',
                    },
                ],
            },
            {
                key: 'starts_on',
                ar: 'تاريخ البداية',
                en: 'Start date',
                type: 'date',
                required: true,
            },
            {
                key: 'ends_on',
                ar: 'تاريخ النهاية',
                en: 'End date',
                type: 'date',
                required: true,
            },
            {
                key: 'value',
                ar: 'قيمة العقد',
                en: 'Contract value',
                type: 'number',
            },
            {
                key: 'currency',
                ar: 'العملة',
                en: 'Currency',
                required: true,
            },
            {
                key: 'renewal_type',
                ar: 'نوع التجديد',
                en: 'Renewal type',
                type: 'select',
                required: true,
                options: [
                    {
                        value: 'none',
                        label:
                            ar
                                ? 'بدون تجديد'
                                : 'No renewal',
                    },
                    {
                        value: 'manual',
                        label:
                            ar
                                ? 'يدوي'
                                : 'Manual',
                    },
                    {
                        value: 'auto',
                        label:
                            ar
                                ? 'تلقائي'
                                : 'Auto renewal',
                    },
                ],
            },
            {
                key: 'reminder_days',
                ar: 'التنبيه قبل كم يوم',
                en: 'Reminder days',
                type: 'number',
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (
        feature
        === 'document-expiry'
    ) {
        const subjectOptions =
            form.subject_type
                === 'party'
                    ? parties
                : form.subject_type
                    === 'staff'
                        ? [
                            {
                                value: '',
                                label:
                                    ar
                                        ? '— اختر موظف —'
                                        : '— Select employee —',
                            },
                            ...lookups.staff.map(
                                staff => ({
                                    value:
                                        String(
                                            staff.id,
                                        ),
                                    label:
                                        staff.name,
                                }),
                            ),
                        ]
                    : [];

        return [
            {
                key: 'subject_type',
                ar: 'نوع صاحب الوثيقة',
                en: 'Subject type',
                type: 'select',
                required: true,
                options: [
                    {
                        value: 'organization',
                        label:
                            ar
                                ? 'الشركة'
                                : 'Organization',
                    },
                    {
                        value: 'party',
                        label:
                            ar
                                ? 'عميل / مورد'
                                : 'Party',
                    },
                    {
                        value: 'staff',
                        label:
                            ar
                                ? 'موظف'
                                : 'Employee',
                    },
                    {
                        value: 'other',
                        label:
                            ar
                                ? 'أخرى'
                                : 'Other',
                    },
                ],
            },
            ...(
                subjectOptions.length
                    ? [
                        {
                            key: 'subject_id',
                            ar: 'السجل',
                            en: 'Record',
                            type: 'select' as const,
                            options:
                                subjectOptions,
                        },
                    ]
                    : [
                        {
                            key: 'subject_label',
                            ar: 'اسم الجهة',
                            en: 'Subject label',
                        },
                    ]
            ),
            {
                key: 'document_type',
                ar: 'نوع الوثيقة',
                en: 'Document type',
                required: true,
            },
            {
                key: 'document_number',
                ar: 'رقم الوثيقة',
                en: 'Document number',
            },
            {
                key: 'issued_on',
                ar: 'تاريخ الإصدار',
                en: 'Issued on',
                type: 'date',
            },
            {
                key: 'expires_on',
                ar: 'تاريخ الانتهاء',
                en: 'Expires on',
                type: 'date',
                required: true,
            },
            {
                key: 'reminder_days',
                ar: 'التنبيه قبل كم يوم',
                en: 'Reminder days',
                type: 'number',
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    return [];
}

function buildPayload(
    feature: Feature,
    form: Record<string, string>,
): Row {
    const clean =
        Object.fromEntries(
            Object.entries(
                form,
            ).filter(
                ([, value]) =>
                    value !== '',
            ),
        );

    if (
        feature
        === 'document-expiry'
        && clean.subject_id
    ) {
        const lookupLabel =
            clean.subject_type
                === 'party'
                    ? null
                    : null;

        void lookupLabel;
    }

    return clean;
}

function FieldInput({
    field,
    ar,
    value,
    onChange,
}: {
    field: Field;
    ar: boolean;
    value: string;
    onChange: (
        value: string,
    ) => void;
}) {
    const label =
        ar
            ? field.ar
            : field.en;
    const base =
        'mt-1 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 py-2 text-sm text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)]';

    return (
        <label
            className={
                field.type
                    === 'textarea'
                    ? 'md:col-span-2 xl:col-span-2'
                    : ''
            }
        >
            <span className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                {label}
                {field.required
                    ? ' *'
                    : ''}
            </span>

            {field.type
                === 'select'
                ? (
                    <select
                        required={
                            field.required
                        }
                        value={
                            value
                        }
                        onChange={
                            event =>
                                onChange(
                                    event.target.value,
                                )
                        }
                        className={
                            base
                        }
                    >
                        {field.options?.map(
                            option => (
                                <option
                                    key={
                                        option.value
                                    }
                                    value={
                                        option.value
                                    }
                                >
                                    {
                                        option.label
                                    }
                                </option>
                            ),
                        )}
                    </select>
                )
                : field.type
                    === 'textarea'
                    ? (
                        <textarea
                            required={
                                field.required
                            }
                            value={
                                value
                            }
                            onChange={
                                event =>
                                    onChange(
                                        event.target.value,
                                    )
                            }
                            className={
                                base
                                + ' min-h-20 resize-y'
                            }
                        />
                    )
                    : (
                        <input
                            required={
                                field.required
                            }
                            type={
                                field.type
                                ?? 'text'
                            }
                            step={
                                field.type
                                    === 'number'
                                    ? '0.0001'
                                    : undefined
                            }
                            value={
                                value
                            }
                            onChange={
                                event =>
                                    onChange(
                                        event.target.value,
                                    )
                            }
                            className={
                                base
                            }
                        />
                    )}
        </label>
    );
}

function RowActions({
    feature,
    row,
    ar,
    busy,
    canReviewExpenseClaims,
    onPatch,
    onPettyTransaction,
}: {
    feature: Feature;
    row: Row;
    ar: boolean;
    busy: boolean;
    canReviewExpenseClaims: boolean;
    onPatch: (
        payload: Row,
    ) => void;
    onPettyTransaction: (
        direction:
            | 'in'
            | 'out',
    ) => void;
}) {
    const button =
        'inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40';

    return (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--ac-line)] pt-3">
            {row.url && (
                <Link
                    href={row.url}
                    className={
                        button
                    }
                >
                    {ar
                        ? 'فتح السجل'
                        : 'Open record'}
                </Link>
            )}

            {feature
                === 'landed-costs'
                && row.status
                    === 'draft'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status:
                                    'allocated',
                            })
                        }
                        className={
                            button
                        }
                    >
                        <Check
                            size={12}
                        />
                        {ar
                            ? 'اعتماد التوزيع'
                            : 'Lock allocation'}
                    </button>
                )}

            {feature
                === 'spending-limits'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                active:
                                    ! row.active,
                            })
                        }
                        className={
                            button
                        }
                    >
                        {row.active
                            ? (
                                ar
                                    ? 'إيقاف السقف'
                                    : 'Disable limit'
                            )
                            : (
                                ar
                                    ? 'تفعيل السقف'
                                    : 'Enable limit'
                            )}
                    </button>
                )}

            {feature
                === 'expense-claims'
                && canReviewExpenseClaims
                && row.status
                    === 'submitted'
                && (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPatch({
                                    status:
                                        'approved',
                                })
                            }
                            className={
                                button
                            }
                        >
                            <Check
                                size={12}
                            />
                            {ar
                                ? 'اعتماد'
                                : 'Approve'}
                        </button>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                                const reason =
                                    window.prompt(
                                        ar
                                            ? 'سبب رفض المطالبة'
                                            : 'Rejection reason',
                                    );

                                if (
                                    reason === null
                                    || ! reason.trim()
                                ) {
                                    return;
                                }

                                onPatch({
                                    status:
                                        'rejected',
                                    rejection_reason:
                                        reason.trim(),
                                });
                            }}
                            className="h-9 rounded-[11px] border border-red-400/50 px-3 text-[10px] font-semibold text-red-400 disabled:opacity-40"
                        >
                            {ar
                                ? 'رفض'
                                : 'Reject'}
                        </button>
                    </>
                )}

            {feature
                === 'expense-claims'
                && canReviewExpenseClaims
                && row.status
                    === 'approved'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            const reference =
                                window.prompt(
                                    ar
                                        ? 'مرجع الدفع أو رقم الحركة'
                                        : 'Payout reference',
                                );

                            if (
                                reference === null
                                || ! reference.trim()
                            ) {
                                return;
                            }

                            onPatch({
                                status:
                                    'paid',
                                payout_reference:
                                    reference.trim(),
                            });
                        }}
                        className="h-9 rounded-[11px] border border-emerald-500/50 px-3 text-[10px] font-semibold text-emerald-400 disabled:opacity-40"
                    >
                        {ar
                            ? 'تسجيل التعويض'
                            : 'Mark reimbursed'}
                    </button>
                )}

            {feature
                === 'petty-cash'
                && row.active
                && (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPettyTransaction(
                                    'out',
                                )
                            }
                            className={
                                button
                            }
                        >
                            {ar
                                ? 'صرف'
                                : 'Spend'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPettyTransaction(
                                    'in',
                                )
                            }
                            className={
                                button
                            }
                        >
                            {ar
                                ? 'إيداع'
                                : 'Deposit'}
                        </button>
                    </>
                )}

            {feature
                === 'petty-cash'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                active:
                                    ! row.active,
                            })
                        }
                        className={
                            button
                        }
                    >
                        {row.active
                            ? (
                                ar
                                    ? 'إغلاق الصندوق'
                                    : 'Deactivate fund'
                            )
                            : (
                                ar
                                    ? 'إعادة تفعيل'
                                    : 'Reactivate'
                            )}
                    </button>
                )}

            {feature
                === 'recurring-expenses'
                && row.active
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                advance_next_due:
                                    true,
                            })
                        }
                        className={
                            button
                        }
                    >
                        {ar
                            ? 'تمت هذه الدورة'
                            : 'Advance next due'}
                    </button>
                )}

            {feature
                === 'recurring-expenses'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                active:
                                    ! row.active,
                            })
                        }
                        className={
                            button
                        }
                    >
                        {row.active
                            ? (
                                ar
                                    ? 'إيقاف مؤقت'
                                    : 'Pause'
                            )
                            : (
                                ar
                                    ? 'استئناف'
                                    : 'Resume'
                            )}
                    </button>
                )}

            {feature
                === 'contracts'
                && row.status
                    === 'active'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            if (
                                ! window.confirm(
                                    ar
                                        ? 'إنهاء هذا العقد؟'
                                        : 'Terminate this contract?',
                                )
                            ) {
                                return;
                            }

                            onPatch({
                                status:
                                    'terminated',
                            });
                        }}
                        className="h-9 rounded-[11px] border border-red-400/50 px-3 text-[10px] font-semibold text-red-400 disabled:opacity-40"
                    >
                        {ar
                            ? 'إنهاء العقد'
                            : 'Terminate'}
                    </button>
                )}

            {feature
                === 'document-expiry'
                && [
                    'active',
                    'expired',
                ].includes(
                    row.status,
                )
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status:
                                    'renewed',
                            })
                        }
                        className={
                            button
                        }
                    >
                        {ar
                            ? 'تم التجديد'
                            : 'Mark renewed'}
                    </button>
                )}
        </div>
    );
}

function ControlSummary({
    feature,
    rows,
    ar,
}: {
    feature: Feature;
    rows: Row[];
    ar: boolean;
}) {
    const count = (
        predicate: (
            row: Row,
        ) => boolean,
    ): string =>
        String(
            rows.filter(
                predicate,
            ).length,
        );

    const metrics: Array<{
        label: string;
        value: string;
    }> = feature
        === 'expiry-alerts'
        ? [
            {
                label:
                    ar
                        ? 'منتهية'
                        : 'Expired',
                value:
                    count(
                        row =>
                            row.alert_level
                            === 'expired',
                    ),
            },
            {
                label:
                    ar
                        ? 'خلال 7 أيام'
                        : 'Within 7 days',
                value:
                    count(
                        row =>
                            row.alert_level
                            === 'critical',
                    ),
            },
            {
                label:
                    ar
                        ? 'خلال 30 يوم'
                        : 'Within 30 days',
                value:
                    count(
                        row =>
                            [
                                'critical',
                                'warning',
                                'upcoming',
                            ].includes(
                                row.alert_level,
                            ),
                    ),
            },
        ]
        : feature
            === 'landed-costs'
            ? [
                {
                    label:
                        ar
                            ? 'مسودات'
                            : 'Draft worksheets',
                    value:
                        count(
                            row =>
                                row.status
                                === 'draft',
                        ),
                },
                {
                    label:
                        ar
                            ? 'توزيعات معتمدة'
                            : 'Locked allocations',
                    value:
                        count(
                            row =>
                                row.status
                                === 'allocated',
                        ),
                },
            ]
            : feature
                === 'exchange-rates'
                ? [
                    {
                        label:
                            ar
                                ? 'سجلات أسعار صرف'
                                : 'Rate history entries',
                        value:
                            String(
                                rows.length,
                            ),
                    },
                    {
                        label:
                            ar
                                ? 'عملات مستخدمة'
                                : 'Currencies used',
                        value:
                            String(
                                new Set(
                                    rows.map(
                                        row =>
                                            row.currency,
                                    ),
                                ).size,
                            ),
                    },
                ]
                : feature
                    === 'budgets'
                    ? [
                        {
                            label:
                                ar
                                    ? 'أقسام فوق الميزانية'
                                    : 'Over budget',
                            value:
                                count(
                                    row =>
                                        Number(
                                            row.actual,
                                        )
                                        > Number(
                                            row.amount,
                                        ),
                                ),
                        },
                        {
                            label:
                                ar
                                    ? 'ميزانيات معرفة'
                                    : 'Budgets defined',
                            value:
                                String(
                                    rows.length,
                                ),
                        },
                    ]
                    : feature
                        === 'spending-limits'
                        ? [
                            {
                                label:
                                    ar
                                        ? 'سقوف نشطة'
                                        : 'Active limits',
                                value:
                                    count(
                                        row =>
                                            Boolean(
                                                row.active,
                                            ),
                                    ),
                            },
                            {
                                label:
                                    ar
                                        ? 'استخدام 90%+'
                                        : '90%+ used',
                                value:
                                    count(
                                        row =>
                                            Number(
                                                row.usage_percent,
                                            )
                                            >= 90,
                                    ),
                            },
                        ]
                        : feature
                            === 'expense-claims'
                            ? [
                                {
                                    label:
                                        ar
                                            ? 'بانتظار المراجعة'
                                            : 'Awaiting review',
                                    value:
                                        count(
                                            row =>
                                                row.status
                                                === 'submitted',
                                        ),
                                },
                                {
                                    label:
                                        ar
                                            ? 'معتمدة'
                                            : 'Approved',
                                    value:
                                        count(
                                            row =>
                                                row.status
                                                === 'approved',
                                        ),
                                },
                                {
                                    label:
                                        ar
                                            ? 'تم تعويضها'
                                            : 'Reimbursed',
                                    value:
                                        count(
                                            row =>
                                                row.status
                                                === 'paid',
                                        ),
                                },
                            ]
                            : feature
                                === 'petty-cash'
                                ? [
                                    {
                                        label:
                                            ar
                                                ? 'صناديق نشطة'
                                                : 'Active funds',
                                        value:
                                            count(
                                                row =>
                                                    Boolean(
                                                        row.active,
                                                    ),
                                            ),
                                    },
                                    {
                                        label:
                                            ar
                                                ? 'صناديق فارغة'
                                                : 'Empty funds',
                                        value:
                                            count(
                                                row =>
                                                    Number(
                                                        row.balance,
                                                    )
                                                    <= 0,
                                            ),
                                    },
                                ]
                                : feature
                                    === 'recurring-expenses'
                                    ? [
                                        {
                                            label:
                                                ar
                                                    ? 'مصروفات نشطة'
                                                    : 'Active expenses',
                                            value:
                                                count(
                                                    row =>
                                                        Boolean(
                                                            row.active,
                                                        ),
                                                ),
                                        },
                                        {
                                            label:
                                                ar
                                                    ? 'تستحق خلال 30 يوم'
                                                    : 'Due within 30 days',
                                            value:
                                                count(
                                                    row =>
                                                        Boolean(
                                                            row.active,
                                                        )
                                                        && Number(
                                                            row.days_until_due,
                                                        )
                                                        <= 30,
                                                ),
                                        },
                                    ]
                                    : feature
                                        === 'contracts'
                                        ? [
                                            {
                                                label:
                                                    ar
                                                        ? 'عقود نشطة'
                                                        : 'Active contracts',
                                                value:
                                                    count(
                                                        row =>
                                                            row.status
                                                            === 'active',
                                                    ),
                                            },
                                            {
                                                label:
                                                    ar
                                                        ? 'تنتهي خلال 30 يوم'
                                                        : 'Expire within 30 days',
                                                value:
                                                    count(
                                                        row =>
                                                            Number(
                                                                row.days_until_expiry,
                                                            )
                                                            >= 0
                                                            && Number(
                                                                row.days_until_expiry,
                                                            )
                                                            <= 30,
                                                    ),
                                            },
                                            {
                                                label:
                                                    ar
                                                        ? 'منتهية'
                                                        : 'Expired',
                                                value:
                                                    count(
                                                        row =>
                                                            row.status
                                                            === 'expired',
                                                    ),
                                            },
                                        ]
                                        : feature
                                            === 'document-expiry'
                                            ? [
                                                {
                                                    label:
                                                        ar
                                                            ? 'تنتهي خلال 30 يوم'
                                                            : 'Expire within 30 days',
                                                    value:
                                                        count(
                                                            row =>
                                                                Number(
                                                                    row.days_until_expiry,
                                                                )
                                                                >= 0
                                                                && Number(
                                                                    row.days_until_expiry,
                                                                )
                                                                <= 30,
                                                        ),
                                                },
                                                {
                                                    label:
                                                        ar
                                                            ? 'منتهية'
                                                            : 'Expired',
                                                    value:
                                                        count(
                                                            row =>
                                                                row.status
                                                                === 'expired',
                                                        ),
                                                },
                                            ]
                                            : feature
                                                === 'data-quality'
                                                ? [
                                                    {
                                                        label:
                                                            ar
                                                                ? 'مشاكل عالية الأهمية'
                                                                : 'High priority',
                                                        value:
                                                            count(
                                                                row =>
                                                                    row.severity
                                                                    === 'high',
                                                            ),
                                                    },
                                                    {
                                                        label:
                                                            ar
                                                                ? 'تحتاج مراجعة'
                                                                : 'Needs review',
                                                        value:
                                                            count(
                                                                row =>
                                                                    row.severity
                                                                    === 'warning',
                                                            ),
                                                    },
                                                ]
                                                : [];

    if (
        metrics.length === 0
    ) {
        return null;
    }

    return (
        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {metrics.map(
                metric => (
                    <div
                        key={
                            metric.label
                        }
                        className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]"
                    >
                        <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                            {
                                metric.label
                            }
                        </p>
                        <p className="mt-2 text-xl font-bold text-[var(--ac-text)]">
                            {
                                metric.value
                            }
                        </p>
                    </div>
                ),
            )}
        </section>
    );
}

function formatValue(
    value: unknown,
    ar: boolean,
): string {
    if (
        value === null
        || value === undefined
        || value === ''
    ) {
        return '—';
    }

    if (
        typeof value
        === 'boolean'
    ) {
        return value
            ? (
                ar
                    ? 'نعم'
                    : 'Yes'
            )
            : (
                ar
                    ? 'لا'
                    : 'No'
            );
    }

    if (
        typeof value
        === 'number'
    ) {
        return value
            .toLocaleString();
    }

    const text =
        String(
            value,
        );

    const labels: Record<
        string,
        [string, string]
    > = {
        expired: ['منتهي', 'Expired'],
        critical: ['حرج', 'Critical'],
        warning: ['تحذير', 'Warning'],
        upcoming: ['قريب', 'Upcoming'],
        later: ['لاحقاً', 'Later'],
        reminder: ['ضمن فترة التنبيه', 'Reminder window'],
        '7_days': ['خلال 7 أيام', 'Within 7 days'],
        '15_days': ['خلال 15 يوم', 'Within 15 days'],
        '30_days': ['خلال 30 يوم', 'Within 30 days'],
        none: ['لا يوجد', 'None'],
        draft: ['مسودة', 'Draft'],
        allocated: ['تم اعتماد التوزيع', 'Allocation locked'],
        submitted: ['بانتظار المراجعة', 'Submitted'],
        approved: ['معتمد', 'Approved'],
        rejected: ['مرفوض', 'Rejected'],
        paid: ['تم التعويض', 'Paid'],
        active: ['نشط', 'Active'],
        terminated: ['منتهي مبكراً', 'Terminated'],
        renewed: ['تم التجديد', 'Renewed'],
        weekly: ['أسبوعي', 'Weekly'],
        monthly: ['شهري', 'Monthly'],
        quarterly: ['ربع سنوي', 'Quarterly'],
        yearly: ['سنوي', 'Yearly'],
        customer: ['عميل', 'Customer'],
        supplier: ['مورد', 'Supplier'],
        other: ['أخرى', 'Other'],
        auto: ['تلقائي', 'Auto'],
        manual: ['يدوي', 'Manual'],
        organization: ['الشركة', 'Organization'],
        party: ['عميل / مورد', 'Party'],
        staff: ['موظف', 'Employee'],
        high: ['عالية', 'High'],
        value: ['حسب القيمة', 'By value'],
        quantity: ['حسب الكمية', 'By quantity'],
        equal: ['بالتساوي', 'Equal'],
        shipping: ['شحن', 'Shipping'],
        customs: ['جمارك', 'Customs'],
        insurance: ['تأمين', 'Insurance'],
        handling: ['مناولة', 'Handling'],
        migration_backfill: ['سجل سابق', 'Historical backfill'],
        draft_created: ['إنشاء المسودة', 'Draft created'],
        draft_updated: ['تعديل المسودة', 'Draft updated'],
    };

    if (labels[text]) {
        return ar
            ? labels[text][0]
            : labels[text][1];
    }

    if (
        /^-?\d+(?:\.\d+)?$/.test(
            text,
        )
        && text.length < 22
    ) {
        return Number(
            text,
        ).toLocaleString(
            undefined,
            {
                maximumFractionDigits:
                    4,
            },
        );
    }

    return text;
}
