import { AppShell } from '@/layouts/AppShell';
import { apiRequest, ApiError } from '@/lib/http';
import { useLocale } from '@/lib/i18n';
import { fetchParties } from '@/features/parties/api';
import { fetchProducts } from '@/features/products/api';
import { fetchWarehouses } from '@/features/inventory/api';
import {
    Head,
    Link,
    router,
    usePage,
} from '@inertiajs/react';
import {
    ArrowRight,
    Check,
    FilePlus2,
    Plus,
    RefreshCcw,
    RotateCcw,
    ShieldCheck,
    Trash2,
    TrendingUp,
} from 'lucide-react';
import type { AppPageProps } from '@/types/app';
import {
    useEffect,
    useMemo,
    useState,
    type FormEvent,
} from 'react';

type Feature =
    | 'unallocated'
    | 'collections'
    | 'ar-aging'
    | 'ap-aging'
    | 'promises'
    | 'pipeline'
    | 'quotations'
    | 'proformas'
    | 'sales-orders'
    | 'purchase-orders'
    | 'backorders'
    | 'returns'
    | 'warranties'
    | 'serials'
    | 'batches';

type Row = Record<string, any>;

type Option = {
    value: string;
    label: string;
    tracksInventory?: boolean;
    roles?: string[];
};

type Field = {
    key: string;
    ar: string;
    en: string;
    type?: 'text' | 'number' | 'date' | 'textarea' | 'select';
    options?: Option[];
    required?: boolean;
    placeholder?: string;
};

type TradeLineDraft = {
    product_id: string;
    warehouse_id: string;
    description: string;
    quantity: string;
    unit_price: string;
    affects_inventory: boolean;
};

const emptyTradeLine = (): TradeLineDraft => ({
    product_id: '',
    warehouse_id: '',
    description: '',
    quantity: '1',
    unit_price: '',
    affects_inventory: false,
});

const tradeFeatures: Feature[] = [
    'quotations',
    'proformas',
    'sales-orders',
    'purchase-orders',
];

const readonlyFeatures: Feature[] = [
    'unallocated',
    'collections',
    'ar-aging',
    'ap-aging',
    'backorders',
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
        unallocated: [
            'دفعات غير مخصصة',
            'Unallocated payment queue',
            'مقبوضات عملاء دخلت فعلياً وبقي منها رصيد غير مربوط بفاتورة بيع.',
            'Posted customer receipts with a remaining amount not yet allocated to a sales invoice.',
        ],
        collections: [
            'لوحة التحصيل',
            'Collections dashboard',
            'العملاء المتأخرون، من يجب التواصل معه اليوم، والمبلغ المتوقع تحصيله.',
            'Overdue customers, who needs contact today and the amount expected to be collected.',
        ],
        'ar-aging': [
            'أعمار الذمم المدينة',
            'A/R aging report',
            'الرصيد المستحق للعملاء حسب 0–30، 31–60، 61–90، وأكثر من 90 يوماً.',
            'Customer receivables grouped into 0–30, 31–60, 61–90 and 90+ day buckets.',
        ],
        'ap-aging': [
            'أعمار الذمم الدائنة',
            'A/P aging report',
            'المبالغ المستحقة للموردين موزعة حسب عمر الاستحقاق.',
            'Supplier payables grouped by aging bucket.',
        ],
        promises: [
            'وعود الدفع',
            'Payment promises',
            'سجل وعود العملاء بالدفع ومتابعة ما تم الوفاء به وما فات موعده.',
            'Track customer payment promises and whether they were fulfilled or missed.',
        ],
        pipeline: [
            'مسار المبيعات',
            'Sales pipeline',
            'Prospect → Contacted → Quoted → Negotiating → Won/Lost.',
            'Prospect → Contacted → Quoted → Negotiating → Won/Lost.',
        ],
        quotations: [
            'عروض الأسعار',
            'Quotations / estimates',
            'عرض سعر مستقل يمكن تحويله إلى فاتورة بيع بضغطة واحدة.',
            'Non-accounting quotations that convert to sales invoice drafts in one click.',
        ],
        proformas: [
            'الفواتير المبدئية',
            'Proforma invoices',
            'فاتورة مبدئية لا تؤثر محاسبياً قبل تحويلها إلى فاتورة بيع.',
            'Non-accounting proforma documents that can later become sales invoices.',
        ],
        'sales-orders': [
            'أوامر البيع',
            'Sales orders',
            'تتبع الطلب والتسليم الجزئي ثم فوترة الكمية المسلّمة.',
            'Track ordered, delivered and invoiced quantities before sales invoicing.',
        ],
        'purchase-orders': [
            'أوامر الشراء',
            'Purchase orders',
            'تتبع ما تم طلبه من المورد وما تم استلامه وما تم تحويله إلى فاتورة.',
            'Track ordered, received and invoiced quantities from suppliers.',
        ],
        backorders: [
            'الطلبات المؤجلة',
            'Backorders',
            'الكميات المطلوبة من العملاء ولم يتم تسليمها بعد.',
            'Customer order quantities that have not yet been delivered.',
        ],
        returns: [
            'المرتجعات / RMA',
            'Returns / RMA',
            'مرتجعات البيع والشراء مربوطة بالفاتورة الأصلية مع السبب والحالة.',
            'Sales and purchase returns linked to the original invoice with reason and status.',
        ],
        warranties: [
            'الضمانات',
            'Warranty tracking',
            'فترات الضمان للمنتجات المباعة وسجل مطالبات الضمان.',
            'Warranty periods for sold products with claim tracking.',
        ],
        serials: [
            'الأرقام التسلسلية',
            'Serial number tracking',
            'تتبع القطعة من المورد والمستودع حتى العميل.',
            'Trace individual units from supplier and warehouse through to the customer.',
        ],
        batches: [
            'الدفعات / التشغيلات',
            'Batch / lot tracking',
            'تتبع Lot/Batch والكميات وتواريخ الإنتاج والانتهاء.',
            'Track lots, quantities, manufacturing dates and expiry dates.',
        ],
    };

    const item = labels[feature];

    return {
        title: ar ? item[0] : item[1],
        subtitle: ar ? item[2] : item[3],
    };
}

function labelFor(
    key: string,
    ar: boolean,
): string {
    const labels: Record<string, [string, string]> = {
        number: ['الرقم', 'Number'],
        kind: ['النوع', 'Type'],
        party: ['العميل / المورد', 'Party'],
        phone: ['الهاتف', 'Phone'],
        email: ['البريد', 'Email'],
        direction: ['الاتجاه', 'Direction'],
        date: ['التاريخ', 'Date'],
        movement_date: ['التاريخ', 'Date'],
        amount: ['المبلغ', 'Amount'],
        allocated: ['المخصص', 'Allocated'],
        unallocated: ['غير المخصص', 'Unallocated'],
        currency: ['العملة', 'Currency'],
        method: ['الطريقة', 'Method'],
        invoice_count: ['عدد الفواتير', 'Invoices'],
        outstanding: ['المستحق', 'Outstanding'],
        oldest_due: ['أقدم استحقاق', 'Oldest due'],
        overdue_days: ['أيام التأخير', 'Days overdue'],
        promise_on: ['موعد الوعد', 'Promise date'],
        promise_amount: ['قيمة الوعد', 'Promise amount'],
        promise_status: ['حالة الوعد', 'Promise status'],
        expected_collection: ['التحصيل المتوقع', 'Expected collection'],
        contact_today: ['اتصال اليوم', 'Contact today'],
        '0_30': ['0–30', '0–30'],
        '31_60': ['31–60', '31–60'],
        '61_90': ['61–90', '61–90'],
        '90_plus': ['+90', '90+'],
        total: ['الإجمالي', 'Total'],
        promised_on: ['تاريخ الوعد', 'Promised on'],
        received_since_promise: ['تم تحصيله منذ الوعد', 'Received since promise'],
        promise_remaining: ['المتبقي من الوعد', 'Promise remaining'],
        status: ['الحالة', 'Status'],
        note: ['ملاحظة', 'Note'],
        title: ['الفرصة', 'Opportunity'],
        stage: ['المرحلة', 'Stage'],
        expected_value: ['القيمة المتوقعة', 'Expected value'],
        probability: ['الاحتمال %', 'Probability %'],
        expected_close_on: ['الإغلاق المتوقع', 'Expected close'],
        next_action_on: ['الإجراء القادم', 'Next action'],
        issue_date: ['تاريخ المستند', 'Issue date'],
        valid_until: ['صالح حتى', 'Valid until'],
        expected_on: ['التسليم / الاستلام المتوقع', 'Expected date'],
        quantity: ['الكمية', 'Quantity'],
        fulfilled_quantity: ['المسلّم / المستلم', 'Fulfilled'],
        invoiced_quantity: ['تمت فوترته', 'Invoiced'],
        remaining_quantity: ['المتبقي', 'Remaining'],
        ordered: ['المطلوب', 'Ordered'],
        fulfilled: ['المنفذ', 'Fulfilled'],
        backorder: ['Backorder', 'Backorder'],
        product: ['المنتج', 'Product'],
        document_number: ['الفاتورة الأصلية', 'Original invoice'],
        reason: ['السبب', 'Reason'],
        total_quantity: ['الكمية', 'Quantity'],
        starts_on: ['بداية الضمان', 'Warranty start'],
        ends_on: ['نهاية الضمان', 'Warranty end'],
        serial_number: ['Serial Number', 'Serial number'],
        claim_count: ['إجمالي المطالبات', 'Claims'],
        open_claim_count: ['مطالبات مفتوحة', 'Open claims'],
        last_claim_status: ['آخر مطالبة', 'Latest claim'],
        warehouse: ['المستودع', 'Warehouse'],
        customer: ['العميل', 'Customer'],
        received_on: ['تاريخ الاستلام', 'Received on'],
        sold_on: ['تاريخ البيع', 'Sold on'],
        lot_code: ['رقم التشغيلة', 'Lot code'],
        manufactured_on: ['تاريخ الإنتاج', 'Manufactured'],
        expiry_date: ['تاريخ الانتهاء', 'Expiry'],
        expired: ['منتهي', 'Expired'],
    };

    const pair = labels[key];

    return pair
        ? (ar ? pair[0] : pair[1])
        : key.replaceAll('_', ' ');
}

function visibleKeys(feature: Feature): string[] {
    const keys: Record<Feature, string[]> = {
        unallocated: [
            'number',
            'party',
            'direction',
            'date',
            'amount',
            'allocated',
            'unallocated',
            'currency',
            'method',
        ],
        collections: [
            'party',
            'phone',
            'email',
            'invoice_count',
            'outstanding',
            'currency',
            'oldest_due',
            'overdue_days',
            'promise_on',
            'promise_amount',
            'expected_collection',
            'contact_today',
        ],
        'ar-aging': [
            'party',
            '0_30',
            '31_60',
            '61_90',
            '90_plus',
            'total',
            'currency',
        ],
        'ap-aging': [
            'party',
            '0_30',
            '31_60',
            '61_90',
            '90_plus',
            'total',
            'currency',
        ],
        promises: [
            'party',
            'document_number',
            'amount',
            'received_since_promise',
            'promise_remaining',
            'promised_on',
            'status',
            'note',
        ],
        pipeline: [
            'party',
            'title',
            'stage',
            'expected_value',
            'probability',
            'expected_close_on',
            'next_action_on',
        ],
        quotations: [
            'number',
            'party',
            'status',
            'issue_date',
            'valid_until',
            'total',
            'currency',
        ],
        proformas: [
            'number',
            'party',
            'status',
            'issue_date',
            'valid_until',
            'total',
            'currency',
        ],
        'sales-orders': [
            'number',
            'party',
            'status',
            'expected_on',
            'quantity',
            'fulfilled_quantity',
            'invoiced_quantity',
            'invoice_count',
            'remaining_quantity',
            'total',
        ],
        'purchase-orders': [
            'number',
            'party',
            'status',
            'expected_on',
            'quantity',
            'fulfilled_quantity',
            'invoiced_quantity',
            'remaining_quantity',
            'total',
        ],
        backorders: [
            'number',
            'party',
            'product',
            'ordered',
            'fulfilled',
            'backorder',
            'expected_on',
        ],
        returns: [
            'kind',
            'document_number',
            'party',
            'reason',
            'total_quantity',
            'status',
            'created_at',
        ],
        warranties: [
            'product',
            'party',
            'document_number',
            'serial_number',
            'starts_on',
            'ends_on',
            'status',
            'claim_count',
            'open_claim_count',
            'last_claim_status',
        ],
        serials: [
            'serial_number',
            'product',
            'warehouse',
            'status',
            'received_on',
            'sold_on',
            'customer',
        ],
        batches: [
            'lot_code',
            'product',
            'warehouse',
            'quantity',
            'manufactured_on',
            'expiry_date',
            'status',
            'expired',
        ],
    };

    return keys[feature];
}

export default function OperationsWorkspace({
    feature,
}: {
    feature: Feature;
}) {
    const ar = useLocale() === 'ar';
    const featureMeta = meta(feature, ar);
    const activeOrganization =
        usePage<AppPageProps>().props.workspace
            .activeOrganization;
    const customPermissions =
        activeOrganization?.permissions;
    const role =
        activeOrganization?.role;

    const builtInFinanceManage = [
        'owner',
        'admin',
        'manager',
        'accountant',
    ].includes(role ?? '');

    const salesManage = customPermissions
        ? customPermissions.includes(
            'finance.sales.manage',
        )
        : builtInFinanceManage;

    const purchasesManage = customPermissions
        ? customPermissions.includes(
            'finance.purchases.manage',
        )
        : builtInFinanceManage;

    const cashReceive = customPermissions
        ? customPermissions.includes(
            'finance.cash.receive',
        )
        : builtInFinanceManage;

    const partyManage = customPermissions
        ? customPermissions.some(permission =>
            [
                'parties.manage',
                'parties.create',
            ].includes(permission),
        )
        : builtInFinanceManage;

    const productManage = customPermissions
        ? customPermissions.some(permission =>
            [
                'products.manage',
                'products.create',
            ].includes(permission),
        )
        : builtInFinanceManage;

    const inventoryManage = customPermissions
        ? customPermissions.includes(
            'inventory.manage',
        )
        : [
            'owner',
            'admin',
            'manager',
        ].includes(role ?? '');

    const canManageFeature =
        feature === 'pipeline'
            ? partyManage
            : feature === 'warranties'
                ? productManage
                : [
                    'serials',
                    'batches',
                ].includes(feature)
                    ? inventoryManage
                    : feature === 'purchase-orders'
                    ? purchasesManage
                    : feature === 'returns'
                        ? salesManage
                            || purchasesManage
                        : [
                            'promises',
                            'quotations',
                            'proformas',
                            'sales-orders',
                        ].includes(feature)
                            ? salesManage
                            : false;

    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState<Record<string, string>>({});
    const [tradeLines, setTradeLines] = useState<TradeLineDraft[]>([
        emptyTradeLine(),
    ]);
    const [fulfillment, setFulfillment] = useState<Record<string, string>>({});
    const [claimReason, setClaimReason] = useState<Record<string, string>>({});
    const [serialCustomer, setSerialCustomer] = useState<Record<string, string>>({});
    const [serialSaleInvoice, setSerialSaleInvoice] = useState<Record<string, string>>({});
    const [parties, setParties] = useState<Option[]>([]);
    const [products, setProducts] = useState<Option[]>([]);
    const [warehouses, setWarehouses] = useState<Option[]>([]);

    const canCreate =
        ! readonlyFeatures.includes(feature)
        && canManageFeature;

    const load = async (): Promise<void> => {
        setLoading(true);
        setError('');

        try {
            const response = await apiRequest<{ data: Row[] }>(
                '/api/operations/' + feature,
            );

            setRows(response.data);
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
        void load();
    }, [feature]);

    useEffect(() => {
        if (
            feature !== 'promises'
            || typeof window === 'undefined'
        ) {
            return;
        }

        const params = new URLSearchParams(
            window.location.search,
        );
        const partyIdParam =
            params.get('party_id');
        const amountParam =
            params.get('amount');

        if (
            ! partyIdParam
            && ! amountParam
        ) {
            return;
        }

        setForm((current) => ({
            ...current,
            ...(partyIdParam
                ? {
                    party_id:
                        partyIdParam,
                }
                : {}),
            ...(amountParam
                && Number(amountParam) > 0
                ? {
                    amount:
                        amountParam,
                }
                : {}),
        }));
    }, [feature]);

    useEffect(() => {
        let active = true;

        Promise.allSettled([
            fetchParties({
                page: 1,
                perPage: 100,
            }),
            fetchProducts({
                page: 1,
                perPage: 100,
            }),
            fetchWarehouses('active'),
        ]).then((results) => {
            if (! active) {
                return;
            }

            const [partyResult, productResult, warehouseResult] = results;

            if (partyResult.status === 'fulfilled') {
                setParties(
                    partyResult.value.data.map((party) => ({
                        value: String(party.id),
                        label:
                            party.company_name
                            || party.name
                            || '#' + String(party.id),
                        roles: party.roles,
                    })),
                );
            }

            if (productResult.status === 'fulfilled') {
                setProducts(
                    productResult.value.data.map((product) => ({
                        value: String(product.id),
                        label: product.name,
                        tracksInventory:
                            product.track_inventory,
                    })),
                );
            }

            if (warehouseResult.status === 'fulfilled') {
                setWarehouses(
                    warehouseResult.value.map((warehouse) => ({
                        value: String(warehouse.id),
                        label: warehouse.name,
                    })),
                );
            }
        });

        return () => {
            active = false;
        };
    }, []);

    const fields = useMemo(
        () => createFields(
            feature,
            ar,
            parties,
            products,
            warehouses,
        ),
        [
            feature,
            ar,
            parties,
            products,
            warehouses,
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
            const payload = buildPayload(
                feature,
                form,
                tradeLines,
            );

            await apiRequest(
                '/api/operations/' + feature,
                {
                    method: 'POST',
                    body: JSON.stringify(payload),
                },
            );

            setForm({});
            setTradeLines([
                emptyTradeLine(),
            ]);
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
        record: number,
        payload: Row,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/operations/'
                + feature
                + '/'
                + String(record),
                {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
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

    async function convert(row: Row): Promise<void> {
        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{
                data: {
                    url: string;
                };
            }>(
                '/api/operations/'
                + feature
                + '/'
                + String(row.id)
                + '/convert',
                {
                    method: 'POST',
                },
            );

            router.visit(response.data.url);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تحويل المستند.'
                            : 'The document could not be converted.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function prepareAllocation(row: Row): Promise<void> {
        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{
                data: {
                    url: string;
                };
            }>(
                '/api/operations/unallocated/'
                + String(row.id)
                + '/prepare-allocation',
                {
                    method: 'POST',
                },
            );

            router.visit(response.data.url);
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تجهيز المقبوض للتخصيص.'
                            : 'The receipt could not be prepared for allocation.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function addClaim(row: Row): Promise<void> {
        const reason = claimReason[String(row.id)]?.trim();

        if (! reason) {
            setError(
                ar
                    ? 'اكتب سبب مطالبة الضمان أولاً.'
                    : 'Enter a warranty claim reason first.',
            );
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/operations/warranties/'
                + String(row.id)
                + '/claims',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        reason,
                    }),
                },
            );

            setClaimReason((current) => ({
                ...current,
                [String(row.id)]: '',
            }));

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تسجيل مطالبة الضمان.'
                            : 'The warranty claim could not be recorded.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function updateClaim(
        warrantyId: number,
        claimId: number,
        payload: Row,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/operations/warranties/'
                + String(warrantyId)
                + '/claims/'
                + String(claimId),
                {
                    method: 'PATCH',
                    body: JSON.stringify(payload),
                },
            );

            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر تحديث مطالبة الضمان.'
                            : 'The warranty claim could not be updated.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <Head title={featureMeta.title} />

            <main
                dir={ar ? 'rtl' : 'ltr'}
                className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 lg:px-8"
            >
                <section className="rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--ac-accent)]">
                                Operations
                            </p>
                            <h1 className="mt-1 text-2xl font-bold text-[var(--ac-text)]">
                                {featureMeta.title}
                            </h1>
                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-muted)]">
                                {featureMeta.subtitle}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => void load()}
                            disabled={loading || busy}
                            className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-transparent px-3 text-xs font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-50"
                        >
                            <RefreshCcw size={14} />
                            {ar ? 'تحديث' : 'Refresh'}
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
                    && readonlyFeatures.includes(feature)
                    && (
                        <OperationalSummary
                            feature={feature}
                            rows={rows}
                            ar={ar}
                        />
                    )}

                {! loading
                    && rows.length > 0
                    && feature === 'pipeline'
                    && (
                        <PipelineBoard
                            rows={rows}
                            ar={ar}
                        />
                    )}

                {canCreate && (
                    <form
                        onSubmit={(event) => void submit(event)}
                        className="mt-5 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-soft)]"
                    >
                        <div className="flex items-center gap-2">
                            <FilePlus2
                                size={16}
                                className="text-[var(--ac-accent)]"
                            />
                            <h2 className="text-sm font-bold text-[var(--ac-text)]">
                                {ar ? 'إضافة سجل جديد' : 'Create new record'}
                            </h2>
                        </div>

                        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            {fields.map((field) => (
                                <FieldInput
                                    key={field.key}
                                    field={field}
                                    ar={ar}
                                    value={form[field.key] ?? ''}
                                    onChange={(value) =>
                                        setForm((current) => ({
                                            ...current,
                                            [field.key]: value,
                                        }))
                                    }
                                />
                            ))}
                        </div>

                        {tradeFeatures.includes(feature) && (
                            <TradeLinesEditor
                                ar={ar}
                                products={products}
                                warehouses={warehouses}
                                lines={tradeLines}
                                onChange={setTradeLines}
                            />
                        )}

                        <div className="mt-4 flex justify-end">
                            <button
                                type="submit"
                                disabled={busy}
                                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-accent)] bg-transparent px-4 text-xs font-bold text-[var(--ac-accent)] transition hover:bg-[var(--ac-accent-soft)] disabled:opacity-50"
                            >
                                <Check size={14} />
                                {ar ? 'حفظ' : 'Save'}
                            </button>
                        </div>
                    </form>
                )}

                <section className="mt-5 space-y-3">
                    {loading ? (
                        <div className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar ? 'جارٍ التحميل…' : 'Loading…'}
                        </div>
                    ) : rows.length === 0 ? (
                        <div className="rounded-[20px] border border-dashed border-[var(--ac-line)] bg-[var(--ac-surface)] p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {ar ? 'لا توجد سجلات حالياً.' : 'No records yet.'}
                        </div>
                    ) : (
                        rows.map((row, index) => (
                            <article
                                key={String(row.id ?? row.order_id ?? index)}
                                className="rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]"
                            >
                                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
                                    {visibleKeys(feature).map((key) => (
                                        <div
                                            key={key}
                                            className="min-w-0 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2"
                                        >
                                            <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                                                {labelFor(key, ar)}
                                            </p>
                                            <p className="mt-1 truncate text-xs font-semibold text-[var(--ac-text)]">
                                                {formatValue(
                                                    row[key],
                                                    ar,
                                                )}
                                            </p>
                                        </div>
                                    ))}
                                </div>

                                <RowActions
                                    feature={feature}
                                    row={row}
                                    ar={ar}
                                    busy={
                                        busy
                                        || ! canManageFeature
                                    }
                                    fulfillments={fulfillment}
                                    claimReason={
                                        claimReason[String(row.id)]
                                        ?? ''
                                    }
                                    serialCustomer={
                                        serialCustomer[String(row.id)]
                                        ?? ''
                                    }
                                    serialSaleInvoice={
                                        serialSaleInvoice[String(row.id)]
                                        ?? ''
                                    }
                                    parties={parties}
                                    onFulfillmentChange={(key, value) =>
                                        setFulfillment((current) => ({
                                            ...current,
                                            [key]: value,
                                        }))
                                    }
                                    onClaimReasonChange={(value) =>
                                        setClaimReason((current) => ({
                                            ...current,
                                            [String(row.id)]: value,
                                        }))
                                    }
                                    onSerialCustomerChange={(value) =>
                                        setSerialCustomer((current) => ({
                                            ...current,
                                            [String(row.id)]: value,
                                        }))
                                    }
                                    onSerialSaleInvoiceChange={(value) =>
                                        setSerialSaleInvoice((current) => ({
                                            ...current,
                                            [String(row.id)]: value,
                                        }))
                                    }
                                    onPatch={(payload) =>
                                        void patch(
                                            Number(row.id),
                                            payload,
                                        )
                                    }
                                    onConvert={() =>
                                        void convert(row)
                                    }
                                    onClaim={() =>
                                        void addClaim(row)
                                    }
                                    onUpdateClaim={(claimId, payload) =>
                                        void updateClaim(
                                            Number(row.id),
                                            claimId,
                                            payload,
                                        )
                                    }
                                    onPrepareAllocation={() =>
                                        void prepareAllocation(row)
                                    }
                                    canReceiveCash={cashReceive}
                                    canCreatePromise={salesManage}
                                />
                            </article>
                        ))
                    )}
                </section>
            </main>
        </AppShell>
    );
}

function createFields(
    feature: Feature,
    ar: boolean,
    parties: Option[],
    products: Option[],
    warehouses: Option[],
): Field[] {
    const party = (
        key = 'party_id',
        required = true,
        role?: 'customer' | 'supplier',
    ): Field => ({
        key,
        ar:
            role === 'supplier'
                ? 'المورد'
                : role === 'customer'
                    ? 'العميل'
                    : 'العميل / المورد',
        en:
            role === 'supplier'
                ? 'Supplier'
                : role === 'customer'
                    ? 'Customer'
                    : 'Party',
        type: 'select',
        options: [
            {
                value: '',
                label: ar ? '— اختر —' : '— Select —',
            },
            ...(
                role
                    ? parties.filter(
                        option =>
                            option.roles?.includes(role),
                    )
                    : parties
            ),
        ],
        required,
    });

    const product = (): Field => ({
        key: 'product_id',
        ar: 'المنتج',
        en: 'Product',
        type: 'select',
        options: [
            {
                value: '',
                label: ar ? '— اختر —' : '— Select —',
            },
            ...products,
        ],
        required: true,
    });

    const warehouse = (): Field => ({
        key: 'warehouse_id',
        ar: 'المستودع',
        en: 'Warehouse',
        type: 'select',
        options: [
            {
                value: '',
                label: ar ? '— بدون —' : '— None —',
            },
            ...warehouses,
        ],
    });

    if (feature === 'promises') {
        return [
            party('party_id', true, 'customer'),
            {
                key: 'financial_document_id',
                ar: 'رقم ID الفاتورة',
                en: 'Invoice ID',
                type: 'number',
            },
            {
                key: 'amount',
                ar: 'المبلغ الموعود',
                en: 'Promised amount',
                type: 'number',
                required: true,
            },
            {
                key: 'promised_on',
                ar: 'موعد الدفع',
                en: 'Promise date',
                type: 'date',
                required: true,
            },
            {
                key: 'note',
                ar: 'ملاحظة',
                en: 'Note',
                type: 'textarea',
            },
        ];
    }

    if (feature === 'pipeline') {
        return [
            party('party_id', false),
            {
                key: 'title',
                ar: 'اسم الفرصة',
                en: 'Opportunity title',
                required: true,
            },
            {
                key: 'expected_value',
                ar: 'القيمة المتوقعة',
                en: 'Expected value',
                type: 'number',
            },
            {
                key: 'expected_close_on',
                ar: 'الإغلاق المتوقع',
                en: 'Expected close',
                type: 'date',
            },
            {
                key: 'next_action_on',
                ar: 'الإجراء القادم',
                en: 'Next action',
                type: 'date',
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (tradeFeatures.includes(feature)) {
        return [
            party(
                'party_id',
                true,
                feature === 'purchase-orders'
                    ? 'supplier'
                    : 'customer',
            ),
            {
                key: 'issue_date',
                ar: 'تاريخ المستند',
                en: 'Issue date',
                type: 'date',
            },
            {
                key:
                    feature === 'sales-orders'
                    || feature === 'purchase-orders'
                        ? 'expected_on'
                        : 'valid_until',
                ar:
                    feature === 'sales-orders'
                    || feature === 'purchase-orders'
                        ? 'التسليم / الاستلام المتوقع'
                        : 'صالح حتى',
                en:
                    feature === 'sales-orders'
                    || feature === 'purchase-orders'
                        ? 'Expected date'
                        : 'Valid until',
                type: 'date',
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (feature === 'returns') {
        return [
            {
                key: 'financial_document_id',
                ar: 'ID الفاتورة الأصلية',
                en: 'Original invoice ID',
                type: 'number',
                required: true,
            },
            {
                key: 'reason',
                ar: 'سبب المرتجع',
                en: 'Return reason',
                required: true,
            },
            {
                key: 'total_quantity',
                ar: 'الكمية المرتجعة',
                en: 'Return quantity',
                type: 'number',
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

    if (feature === 'warranties') {
        return [
            party('party_id', false, 'customer'),
            product(),
            {
                key: 'financial_document_id',
                ar: 'ID فاتورة البيع',
                en: 'Sales invoice ID',
                type: 'number',
            },
            {
                key: 'serial_number',
                ar: 'Serial Number',
                en: 'Serial number',
            },
            {
                key: 'starts_on',
                ar: 'بداية الضمان',
                en: 'Warranty start',
                type: 'date',
                required: true,
            },
            {
                key: 'ends_on',
                ar: 'نهاية الضمان',
                en: 'Warranty end',
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

    if (feature === 'serials') {
        return [
            product(),
            warehouse(),
            party('supplier_party_id', false, 'supplier'),
            party('customer_party_id', false, 'customer'),
            {
                key: 'source_purchase_document_id',
                ar: 'ID فاتورة الشراء',
                en: 'Purchase invoice ID',
                type: 'number',
            },
            {
                key: 'source_sale_document_id',
                ar: 'ID فاتورة البيع',
                en: 'Sales invoice ID',
                type: 'number',
            },
            {
                key: 'serial_number',
                ar: 'Serial Number',
                en: 'Serial number',
                required: true,
            },
            {
                key: 'status',
                ar: 'الحالة',
                en: 'Status',
                type: 'select',
                options: [
                    { value: 'in_stock', label: ar ? 'في المخزون' : 'In stock' },
                    { value: 'reserved', label: ar ? 'محجوز' : 'Reserved' },
                    { value: 'sold', label: ar ? 'مباع' : 'Sold' },
                    { value: 'returned', label: ar ? 'مرتجع' : 'Returned' },
                    { value: 'service', label: ar ? 'صيانة' : 'Service' },
                    { value: 'scrapped', label: ar ? 'مشطوب' : 'Scrapped' },
                ],
            },
            {
                key: 'received_on',
                ar: 'تاريخ الاستلام',
                en: 'Received on',
                type: 'date',
            },
            {
                key: 'sold_on',
                ar: 'تاريخ البيع',
                en: 'Sold on',
                type: 'date',
            },
            {
                key: 'notes',
                ar: 'ملاحظات',
                en: 'Notes',
                type: 'textarea',
            },
        ];
    }

    if (feature === 'batches') {
        return [
            product(),
            warehouse(),
            party('supplier_party_id', false, 'supplier'),
            {
                key: 'lot_code',
                ar: 'Lot / Batch',
                en: 'Lot / batch',
                required: true,
            },
            {
                key: 'quantity',
                ar: 'الكمية',
                en: 'Quantity',
                type: 'number',
                required: true,
            },
            {
                key: 'manufactured_on',
                ar: 'تاريخ الإنتاج',
                en: 'Manufactured on',
                type: 'date',
            },
            {
                key: 'expiry_date',
                ar: 'تاريخ الانتهاء',
                en: 'Expiry date',
                type: 'date',
            },
            {
                key: 'status',
                ar: 'الحالة',
                en: 'Status',
                type: 'select',
                options: [
                    { value: 'available', label: ar ? 'متاح' : 'Available' },
                    { value: 'quarantine', label: ar ? 'حجر' : 'Quarantine' },
                    { value: 'depleted', label: ar ? 'منتهي الكمية' : 'Depleted' },
                    { value: 'expired', label: ar ? 'منتهي الصلاحية' : 'Expired' },
                    { value: 'recalled', label: ar ? 'مسحوب' : 'Recalled' },
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

    return [];
}

function buildPayload(
    feature: Feature,
    form: Record<string, string>,
    tradeLines: TradeLineDraft[],
): Row {
    const clean = Object.fromEntries(
        Object.entries(form)
            .filter(([, value]) => value !== '')
            .map(([key, value]) => [
                key,
                value,
            ]),
    );

    if (tradeFeatures.includes(feature)) {
        return {
            ...clean,
            lines: tradeLines.map(line => ({
                product_id:
                    line.product_id
                        ? Number(line.product_id)
                        : null,
                warehouse_id:
                    line.warehouse_id
                        ? Number(line.warehouse_id)
                        : null,
                description: line.description.trim(),
                quantity: line.quantity,
                unit_price: line.unit_price,
                affects_inventory:
                    line.affects_inventory,
            })),
        };
    }

    return clean;
}

function PipelineBoard({
    rows,
    ar,
}: {
    rows: Row[];
    ar: boolean;
}) {
    const stages = [
        { key: 'prospect', ar: 'عميل محتمل', en: 'Prospect' },
        { key: 'contacted', ar: 'تم التواصل', en: 'Contacted' },
        { key: 'quoted', ar: 'عرض سعر', en: 'Quoted' },
        { key: 'negotiating', ar: 'تفاوض', en: 'Negotiating' },
        { key: 'won', ar: 'مربوحة', en: 'Won' },
        { key: 'lost', ar: 'خاسرة', en: 'Lost' },
    ];

    return (
        <section className="mt-5 overflow-x-auto pb-1">
            <div className="grid min-w-[980px] grid-cols-6 gap-3">
                {stages.map(stage => {
                    const stageRows = rows.filter(
                        row => row.stage === stage.key,
                    );
                    const expected = stageRows.reduce(
                        (sum, row) =>
                            sum + Number(row.expected_value ?? 0),
                        0,
                    );

                    return (
                        <div
                            key={stage.key}
                            className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 shadow-[var(--ac-shadow-soft)]"
                        >
                            <div className="flex items-center justify-between gap-2">
                                <h2 className="text-[10px] font-bold text-[var(--ac-text)]">
                                    {ar ? stage.ar : stage.en}
                                </h2>
                                <span className="rounded-full border border-[var(--ac-line)] px-2 py-0.5 text-[9px] font-semibold text-[var(--ac-text-muted)]">
                                    {stageRows.length}
                                </span>
                            </div>

                            <p className="mt-2 text-sm font-bold text-[var(--ac-accent)]">
                                {expected.toLocaleString(undefined, {
                                    maximumFractionDigits: 2,
                                })}
                            </p>

                            <div className="mt-3 space-y-2">
                                {stageRows.slice(0, 5).map(row => (
                                    <div
                                        key={row.id}
                                        className="rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-2.5 py-2"
                                    >
                                        <p className="truncate text-[10px] font-semibold text-[var(--ac-text)]">
                                            {row.title}
                                        </p>
                                        <p className="mt-1 truncate text-[9px] text-[var(--ac-text-muted)]">
                                            {row.party || (ar ? 'بدون جهة' : 'No party')}
                                        </p>
                                        {row.next_action_on && (
                                            <p className="mt-1 text-[8px] text-[var(--ac-text-muted)]">
                                                {ar ? 'الإجراء القادم: ' : 'Next action: '}
                                                {row.next_action_on}
                                            </p>
                                        )}
                                    </div>
                                ))}

                                {stageRows.length > 5 && (
                                    <p className="pt-1 text-center text-[8px] text-[var(--ac-text-muted)]">
                                        {ar
                                            ? '+' + String(stageRows.length - 5) + ' فرصة أخرى'
                                            : '+' + String(stageRows.length - 5) + ' more'}
                                    </p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
function OperationalSummary({
    feature,
    rows,
    ar,
}: {
    feature: Feature;
    rows: Row[];
    ar: boolean;
}) {
    const amount = (
        key: string,
    ): number =>
        rows.reduce(
            (sum, row) =>
                sum + Number(row[key] ?? 0),
            0,
        );

    const metrics: Array<{
        label: string;
        value: string;
    }> = feature === 'collections'
        ? [
            {
                label:
                    ar
                        ? 'عملاء يحتاجون اتصال اليوم'
                        : 'Customers to contact today',
                value: String(
                    rows.filter(
                        row => row.contact_today,
                    ).length,
                ),
            },
            {
                label:
                    ar
                        ? 'إجمالي المستحق'
                        : 'Total outstanding',
                value:
                    amount('outstanding')
                        .toLocaleString(
                            undefined,
                            {
                                maximumFractionDigits: 4,
                            },
                        ),
            },
            {
                label:
                    ar
                        ? 'التحصيل المتوقع'
                        : 'Expected collection',
                value:
                    amount('expected_collection')
                        .toLocaleString(
                            undefined,
                            {
                                maximumFractionDigits: 4,
                            },
                        ),
            },
        ]
        : feature === 'unallocated'
            ? [
                {
                    label:
                        ar
                            ? 'دفعات تنتظر التخصيص'
                            : 'Payments awaiting allocation',
                    value: String(rows.length),
                },
                {
                    label:
                        ar
                            ? 'إجمالي غير مخصص'
                            : 'Total unallocated',
                    value:
                        amount('unallocated')
                            .toLocaleString(
                                undefined,
                                {
                                    maximumFractionDigits: 4,
                                },
                            ),
                },
            ]
            : feature === 'ar-aging'
                || feature === 'ap-aging'
                ? [
                    {
                        label: '0–30',
                        value:
                            amount('0_30')
                                .toLocaleString(),
                    },
                    {
                        label: '31–60',
                        value:
                            amount('31_60')
                                .toLocaleString(),
                    },
                    {
                        label: '61–90',
                        value:
                            amount('61_90')
                                .toLocaleString(),
                    },
                    {
                        label:
                            ar
                                ? '+90 يوم'
                                : '90+ days',
                        value:
                            amount('90_plus')
                                .toLocaleString(),
                    },
                    {
                        label:
                            ar
                                ? 'الإجمالي'
                                : 'Total',
                        value:
                            amount('total')
                                .toLocaleString(),
                    },
                ]
                : feature === 'backorders'
                    ? [
                        {
                            label:
                                ar
                                    ? 'بنود مؤجلة'
                                    : 'Backordered lines',
                            value: String(rows.length),
                        },
                        {
                            label:
                                ar
                                    ? 'إجمالي الكمية المؤجلة'
                                    : 'Total backordered quantity',
                            value:
                                amount('backorder')
                                    .toLocaleString(
                                        undefined,
                                        {
                                            maximumFractionDigits: 4,
                                        },
                                    ),
                        },
                    ]
                    : [];

    if (metrics.length === 0) {
        return null;
    }

    return (
        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {metrics.map(metric => (
                <div
                    key={metric.label}
                    className="rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]"
                >
                    <p className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--ac-text-muted)]">
                        {metric.label}
                    </p>
                    <p className="mt-2 text-xl font-bold text-[var(--ac-text)]">
                        {metric.value}
                    </p>
                </div>
            ))}
        </section>
    );
}

function TradeLinesEditor({
    ar,
    products,
    warehouses,
    lines,
    onChange,
}: {
    ar: boolean;
    products: Option[];
    warehouses: Option[];
    lines: TradeLineDraft[];
    onChange: (lines: TradeLineDraft[]) => void;
}) {
    function updateLine(
        index: number,
        patch: Partial<TradeLineDraft>,
    ): void {
        onChange(
            lines.map((line, lineIndex) =>
                lineIndex === index
                    ? {
                        ...line,
                        ...patch,
                    }
                    : line,
            ),
        );
    }

    return (
        <div className="mt-5 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                    <h3 className="text-xs font-bold text-[var(--ac-text)]">
                        {ar ? 'بنود المستند' : 'Document lines'}
                    </h3>
                    <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                        {ar
                            ? 'أضف كل المنتجات والخدمات المطلوبة في نفس العرض أو الأمر.'
                            : 'Add all products and services to the same quotation or order.'}
                    </p>
                </div>

                <button
                    type="button"
                    onClick={() =>
                        onChange([
                            ...lines,
                            emptyTradeLine(),
                        ])
                    }
                    className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--ac-line)] bg-transparent px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                >
                    <Plus size={12} />
                    {ar ? 'إضافة بند' : 'Add line'}
                </button>
            </div>

            <div className="mt-3 space-y-2">
                {lines.map((line, index) => (
                    <div
                        key={index}
                        className="grid gap-2 rounded-[13px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.6fr_.7fr_.8fr_auto_auto]"
                    >
                        <select
                            value={line.product_id}
                            onChange={event => {
                                const selected =
                                    products.find(
                                        option =>
                                            option.value
                                            === event.target.value,
                                    );

                                updateLine(index, {
                                    product_id:
                                        event.target.value,
                                    description:
                                        line.description
                                        || selected?.label
                                        || '',
                                    affects_inventory:
                                        Boolean(
                                            selected?.tracksInventory
                                            && line.warehouse_id,
                                        ),
                                });
                            }
                            className="h-9 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        >
                            <option value="">
                                {ar
                                    ? 'منتج/خدمة غير مرتبطة'
                                    : 'Unlinked item'}
                            </option>
                            {products.map(option => (
                                <option
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </option>
                            ))}
                        </select>

                        <select
                            value={line.warehouse_id}
                            onChange={event => {
                                const selectedProduct =
                                    products.find(
                                        option =>
                                            option.value
                                            === line.product_id,
                                    );

                                updateLine(index, {
                                    warehouse_id:
                                        event.target.value,
                                    affects_inventory:
                                        Boolean(
                                            selectedProduct?.tracksInventory
                                            && event.target.value,
                                        ),
                                });
                            }}
                            className="h-9 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        >
                            <option value="">
                                {ar
                                    ? 'بدون مستودع'
                                    : 'No warehouse'}
                            </option>
                            {warehouses.map(option => (
                                <option
                                    key={option.value}
                                    value={option.value}
                                >
                                    {option.label}
                                </option>
                            ))}
                        </select>

                        <input
                            required
                            value={line.description}
                            onChange={event =>
                                updateLine(index, {
                                    description:
                                        event.target.value,
                                })
                            }
                            placeholder={ar ? 'الوصف' : 'Description'}
                            className="h-9 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />

                        <input
                            required
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            value={line.quantity}
                            onChange={event =>
                                updateLine(index, {
                                    quantity:
                                        event.target.value,
                                })
                            }
                            placeholder={ar ? 'الكمية' : 'Qty'}
                            className="h-9 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />

                        <input
                            required
                            type="number"
                            min="0"
                            step="0.0001"
                            value={line.unit_price}
                            onChange={event =>
                                updateLine(index, {
                                    unit_price:
                                        event.target.value,
                                })
                            }
                            placeholder={ar ? 'سعر الوحدة' : 'Unit price'}
                            className="h-9 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />

                        <label className="flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-2 text-[9px] font-semibold text-[var(--ac-text-muted)]">
                            <input
                                type="checkbox"
                                checked={line.affects_inventory}
                                disabled={
                                    ! products.find(
                                        option =>
                                            option.value
                                            === line.product_id,
                                    )?.tracksInventory
                                    || ! line.warehouse_id
                                }
                                onChange={event =>
                                    updateLine(index, {
                                        affects_inventory:
                                            event.target.checked,
                                    })
                                }
                            />
                            {ar ? 'مخزون' : 'Inventory'}
                        </label>

                        <button
                            type="button"
                            disabled={lines.length === 1}
                            onClick={() =>
                                onChange(
                                    lines.filter(
                                        (_, lineIndex) =>
                                            lineIndex !== index,
                                    ),
                                )
                            }
                            aria-label={ar ? 'حذف البند' : 'Remove line'}
                            className="flex size-9 items-center justify-center rounded-[11px] border border-[var(--ac-line)] text-[var(--ac-text-muted)] transition hover:border-red-400 hover:text-red-400 disabled:opacity-30"
                        >
                            <Trash2 size={13} />
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
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
    onChange: (value: string) => void;
}) {
    const label = ar ? field.ar : field.en;

    const base =
        'mt-1 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 py-2 text-sm text-[var(--ac-text)] outline-none transition focus:border-[var(--ac-accent)]';

    return (
        <label
            className={
                field.type === 'textarea'
                    ? 'md:col-span-2 xl:col-span-2'
                    : ''
            }
        >
            <span className="text-[10px] font-semibold text-[var(--ac-text-muted)]">
                {label}
                {field.required ? ' *' : ''}
            </span>

            {field.type === 'select' ? (
                <select
                    required={field.required}
                    value={value}
                    onChange={(event) =>
                        onChange(event.target.value)
                    }
                    className={base}
                >
                    {field.options?.map((option) => (
                        <option
                            key={option.value}
                            value={option.value}
                        >
                            {option.label}
                        </option>
                    ))}
                </select>
            ) : field.type === 'textarea' ? (
                <textarea
                    required={field.required}
                    value={value}
                    onChange={(event) =>
                        onChange(event.target.value)
                    }
                    className={base + ' min-h-20 resize-y'}
                />
            ) : (
                <input
                    required={field.required}
                    type={field.type ?? 'text'}
                    step={field.type === 'number' ? '0.0001' : undefined}
                    value={value}
                    placeholder={field.placeholder}
                    onChange={(event) =>
                        onChange(event.target.value)
                    }
                    className={base}
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
    fulfillments,
    claimReason,
    serialCustomer,
    serialSaleInvoice,
    parties,
    onFulfillmentChange,
    onClaimReasonChange,
    onSerialCustomerChange,
    onSerialSaleInvoiceChange,
    onPatch,
    onConvert,
    onClaim,
    onUpdateClaim,
    onPrepareAllocation,
    canReceiveCash,
    canCreatePromise,
}: {
    feature: Feature;
    row: Row;
    ar: boolean;
    busy: boolean;
    fulfillments: Record<string, string>;
    claimReason: string;
    serialCustomer: string;
    serialSaleInvoice: string;
    parties: Option[];
    onFulfillmentChange: (
        key: string,
        value: string,
    ) => void;
    onClaimReasonChange: (value: string) => void;
    onSerialCustomerChange: (value: string) => void;
    onSerialSaleInvoiceChange: (value: string) => void;
    onPatch: (payload: Row) => void;
    onConvert: () => void;
    onClaim: () => void;
    onUpdateClaim: (
        claimId: number,
        payload: Row,
    ) => void;
    onPrepareAllocation: () => void;
    canReceiveCash: boolean;
    canCreatePromise: boolean;
}) {
    const stages = [
        'prospect',
        'contacted',
        'quoted',
        'negotiating',
        'won',
    ];

    const stageIndex =
        feature === 'pipeline'
            ? stages.indexOf(row.stage)
            : -1;

    return (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--ac-line)] pt-3">
            {row.url && (
                <Link
                    href={row.url}
                    className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                >
                    <ArrowRight size={13} />
                    {ar ? 'فتح' : 'Open'}
                </Link>
            )}

            {tradeFeatures.includes(feature)
                && Array.isArray(row.invoices)
                && row.invoices.length > 0
                && (
                    <div className="flex flex-wrap items-center gap-1.5">
                        {row.invoices.map((invoice: Row) => (
                            <Link
                                key={invoice.id}
                                href={invoice.url}
                                className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                            >
                                <FilePlus2 size={12} />
                                {invoice.number}
                                {Number(invoice.converted_quantity) > 0
                                    ? ' · '
                                        + formatValue(
                                            invoice.converted_quantity,
                                            ar,
                                        )
                                    : ''}
                            </Link>
                        ))}
                    </div>
                )}

            {feature === 'collections'
                && row.party_id
                && canReceiveCash
                && (
                    <Link
                        href={
                            '/app/receipts/create?party_id='
                            + encodeURIComponent(
                                String(row.party_id),
                            )
                            + '&amount='
                            + encodeURIComponent(
                                String(
                                    row.expected_collection
                                    || row.outstanding
                                    || '',
                                ),
                            )
                        }
                        className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-emerald-500/50 px-3 text-[10px] font-semibold text-emerald-400"
                    >
                        <Check size={12} />
                        {ar
                            ? 'تسجيل قبض'
                            : 'Record receipt'}
                    </Link>
                )}

            {feature === 'collections'
                && row.party_id
                && canCreatePromise
                && ! row.promise_on
                && (
                    <Link
                        href={
                            '/app/parties/payment-promises?party_id='
                            + encodeURIComponent(
                                String(row.party_id),
                            )
                            + '&amount='
                            + encodeURIComponent(
                                String(
                                    row.outstanding
                                    || '',
                                ),
                            )
                        }
                        className="inline-flex h-9 items-center gap-1.5 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                    >
                        <FilePlus2 size={12} />
                        {ar
                            ? 'إنشاء وعد دفع'
                            : 'Create promise'}
                    </Link>
                )}

            {feature === 'collections' && row.phone && (
                <a
                    href={'tel:' + String(row.phone)}
                    className="inline-flex h-9 items-center rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                >
                    {ar ? 'اتصال' : 'Call'}
                </a>
            )}

            {feature === 'collections' && row.email && (
                <a
                    href={'mailto:' + String(row.email)}
                    className="inline-flex h-9 items-center rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                >
                    {ar ? 'إيميل' : 'Email'}
                </a>
            )}

            {feature === 'unallocated'
                && row.can_allocate
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onPrepareAllocation}
                        className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-3 text-[10px] font-semibold text-[var(--ac-accent)]"
                    >
                        <FilePlus2 size={13} />
                        {ar
                            ? 'تخصيص على فاتورة'
                            : 'Allocate to invoice'}
                    </button>
                )}

            {feature === 'promises'
                && ! ['fulfilled', 'cancelled'].includes(row.status)
                && (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPatch({
                                    status: 'fulfilled',
                                })
                            }
                            className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-emerald-500/50 px-3 text-[10px] font-semibold text-emerald-400"
                        >
                            <Check size={13} />
                            {ar ? 'تم الدفع' : 'Fulfilled'}
                        </button>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPatch({
                                    status: 'missed',
                                })
                            }
                            className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-amber-500/50 px-3 text-[10px] font-semibold text-amber-400"
                        >
                            <RotateCcw size={13} />
                            {ar ? 'لم يفِ بالوعد' : 'Missed'}
                        </button>
                    </>
                )}

            {feature === 'pipeline'
                && stageIndex >= 0
                && stageIndex < stages.length - 1
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                stage:
                                    stages[
                                        stageIndex + 1
                                    ],
                            })
                        }
                        className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-3 text-[10px] font-semibold text-[var(--ac-accent)]"
                    >
                        <TrendingUp size={13} />
                        {ar ? 'للمرحلة التالية' : 'Advance stage'}
                    </button>
                )}

            {feature === 'pipeline'
                && ! ['won', 'lost'].includes(row.stage)
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                            const reason = window.prompt(
                                ar
                                    ? 'سبب خسارة الفرصة؟ (اختياري)'
                                    : 'Why was this opportunity lost? (optional)',
                            );

                            if (reason === null) {
                                return;
                            }

                            onPatch({
                                stage: 'lost',
                                lost_reason:
                                    reason.trim()
                                    || null,
                            });
                        }
                        className="h-9 rounded-[11px] border border-red-400/50 px-3 text-[10px] font-semibold text-red-400"
                    >
                        {ar ? 'خسارة الفرصة' : 'Mark lost'}
                    </button>
                )}

            {(feature === 'quotations'
                || feature === 'proformas')
                && row.status === 'draft'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status: 'sent',
                            })
                        }
                        className="h-9 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)]"
                    >
                        {ar ? 'تحديد كمُرسل' : 'Mark sent'}
                    </button>
                )}

            {(feature === 'quotations'
                || feature === 'proformas')
                && row.status === 'sent'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status: 'accepted',
                            })
                        }
                        className="h-9 rounded-[11px] border border-emerald-500/50 px-3 text-[10px] font-semibold text-emerald-400"
                    >
                        {ar ? 'تم القبول' : 'Accepted'}
                    </button>
                )}

            {feature === 'quotations'
                && row.status === 'sent'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status: 'rejected',
                            })
                        }
                        className="h-9 rounded-[11px] border border-red-400/50 px-3 text-[10px] font-semibold text-red-400"
                    >
                        {ar ? 'مرفوض' : 'Rejected'}
                    </button>
                )}

            {feature === 'proformas'
                && row.status === 'sent'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status: 'cancelled',
                            })
                        }
                        className="h-9 rounded-[11px] border border-red-400/50 px-3 text-[10px] font-semibold text-red-400"
                    >
                        {ar ? 'إلغاء' : 'Cancel'}
                    </button>
                )}

            {tradeFeatures.includes(feature)
                && ! [
                    'converted',
                    'cancelled',
                    'rejected',
                    'expired',
                ].includes(row.status)
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onConvert}
                        className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] px-3 text-[10px] font-semibold text-[var(--ac-accent)]"
                    >
                        <FilePlus2 size={13} />
                        {ar ? 'تحويل إلى فاتورة' : 'Convert to invoice'}
                    </button>
                )}

            {(feature === 'sales-orders'
                || feature === 'purchase-orders')
                && Array.isArray(row.lines)
                && row.lines.length > 0
                && (
                    <div className="w-full space-y-2">
                        {row.lines.map((line: Row) => {
                            const key =
                                String(row.id)
                                + ':'
                                + String(line.id);
                            const value =
                                fulfillments[key]
                                ?? String(
                                    line.fulfilled_quantity
                                    ?? '',
                                );

                            return (
                                <div
                                    key={line.id}
                                    className="flex flex-wrap items-center gap-2 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2"
                                >
                                    <div className="min-w-40 flex-1">
                                        <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                            {line.product
                                                || line.description}
                                        </p>
                                        <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                            {ar ? 'مطلوب' : 'Ordered'}
                                            {' '}
                                            {formatValue(
                                                line.quantity,
                                                ar,
                                            )}
                                            {' · '}
                                            {ar ? 'منفذ' : 'Fulfilled'}
                                            {' '}
                                            {formatValue(
                                                line.fulfilled_quantity,
                                                ar,
                                            )}
                                            {line.warehouse
                                                ? ' · ' + line.warehouse
                                                : ''}
                                        </p>
                                    </div>

                                    <input
                                        type="number"
                                        min="0"
                                        max={line.quantity}
                                        step="0.0001"
                                        value={value}
                                        onChange={(event) =>
                                            onFulfillmentChange(
                                                key,
                                                event.target.value,
                                            )
                                        }
                                        placeholder={
                                            ar
                                                ? 'الكمية المنفذة'
                                                : 'Fulfilled qty'
                                        }
                                        className="h-9 w-32 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                    />

                                    <button
                                        type="button"
                                        disabled={
                                            busy
                                            || value === ''
                                            || Number(value)
                                                === Number(
                                                    line.fulfilled_quantity,
                                                )
                                        }
                                        onClick={() =>
                                            onPatch({
                                                line_id:
                                                    Number(line.id),
                                                fulfilled_quantity:
                                                    value,
                                            })
                                        }
                                        className="h-9 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40"
                                    >
                                        {feature === 'sales-orders'
                                            ? (
                                                ar
                                                    ? 'تسجيل التسليم'
                                                    : 'Record delivery'
                                            )
                                            : (
                                                ar
                                                    ? 'تسجيل الاستلام'
                                                    : 'Record receipt'
                                            )}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}

            {feature === 'returns'
                && row.status === 'requested'
                && (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPatch({
                                    status: 'approved',
                                })
                            }
                            className="h-9 rounded-[11px] border border-[var(--ac-accent)] px-3 text-[10px] font-semibold text-[var(--ac-accent)]"
                        >
                            {ar ? 'اعتماد RMA' : 'Approve RMA'}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPatch({
                                    status: 'rejected',
                                })
                            }
                            className="h-9 rounded-[11px] border border-red-400/50 px-3 text-[10px] font-semibold text-red-400"
                        >
                            {ar ? 'رفض الطلب' : 'Reject'}
                        </button>
                    </>
                )}

            {feature === 'returns'
                && row.status === 'approved'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status: 'received',
                            })
                        }
                        className="h-9 rounded-[11px] border border-amber-500/50 px-3 text-[10px] font-semibold text-amber-400"
                    >
                        {ar ? 'تم استلام المرتجع' : 'Mark received'}
                    </button>
                )}

            {feature === 'returns'
                && row.status === 'received'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status: 'completed',
                            })
                        }
                        className="h-9 rounded-[11px] border border-emerald-500/50 px-3 text-[10px] font-semibold text-emerald-400"
                    >
                        {ar ? 'إكمال المرتجع' : 'Complete return'}
                    </button>
                )}

            {feature === 'serials'
                && row.status !== 'sold'
                && (
                    <div className="flex flex-wrap items-center gap-2">
                        <select
                            value={serialCustomer}
                            onChange={event =>
                                onSerialCustomerChange(
                                    event.target.value,
                                )
                            }
                            className="h-9 min-w-40 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-[10px] text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        >
                            <option value="">
                                {ar ? 'اختر العميل' : 'Select customer'}
                            </option>
                            {parties
                                .filter(option =>
                                    option.roles?.includes('customer'),
                                )
                                .map(option => (
                                    <option
                                        key={option.value}
                                        value={option.value}
                                    >
                                        {option.label}
                                    </option>
                                ))}
                        </select>

                        <input
                            type="number"
                            min="1"
                            value={serialSaleInvoice}
                            onChange={event =>
                                onSerialSaleInvoiceChange(
                                    event.target.value,
                                )
                            }
                            placeholder={
                                ar
                                    ? 'ID فاتورة البيع (اختياري)'
                                    : 'Sales invoice ID (optional)'
                            }
                            className="h-9 w-44 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-2 text-[10px] text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />

                        <button
                            type="button"
                            disabled={busy || ! serialCustomer}
                            onClick={() =>
                                onPatch({
                                    status: 'sold',
                                    customer_party_id:
                                        Number(serialCustomer),
                                    source_sale_document_id:
                                        serialSaleInvoice
                                            ? Number(serialSaleInvoice)
                                            : null,
                                })
                            }
                            className="h-9 rounded-[11px] border border-[var(--ac-accent)] px-3 text-[10px] font-semibold text-[var(--ac-accent)] disabled:opacity-40"
                        >
                            {ar ? 'تسجيل البيع' : 'Mark sold'}
                        </button>
                    </div>
                )}

            {feature === 'serials'
                && row.status === 'sold'
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status: 'returned',
                            })
                        }
                        className="h-9 rounded-[11px] border border-amber-500/50 px-3 text-[10px] font-semibold text-amber-400"
                    >
                        {ar ? 'تسجيل مرتجع' : 'Mark returned'}
                    </button>
                )}

            {feature === 'batches'
                && row.status === 'available'
                && (
                    <>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPatch({
                                    status: 'quarantine',
                                })
                            }
                            className="h-9 rounded-[11px] border border-amber-500/50 px-3 text-[10px] font-semibold text-amber-400"
                        >
                            {ar ? 'حجر الدفعة' : 'Quarantine'}
                        </button>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                                onPatch({
                                    status: 'recalled',
                                })
                            }
                            className="h-9 rounded-[11px] border border-red-400/50 px-3 text-[10px] font-semibold text-red-400"
                        >
                            {ar ? 'سحب الدفعة' : 'Recall'}
                        </button>
                    </>
                )}

            {feature === 'batches'
                && ['quarantine', 'recalled'].includes(row.status)
                && (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                            onPatch({
                                status: 'available',
                            })
                        }
                        className="h-9 rounded-[11px] border border-emerald-500/50 px-3 text-[10px] font-semibold text-emerald-400"
                    >
                        {ar ? 'إعادة للإتاحة' : 'Make available'}
                    </button>
                )}

            {feature === 'warranties' && (
                <div className="w-full space-y-3">
                    <div className="flex min-w-[280px] flex-1 items-center gap-2">
                        <input
                            value={claimReason}
                            onChange={(event) =>
                                onClaimReasonChange(
                                    event.target.value,
                                )
                            }
                            placeholder={
                                ar
                                    ? 'سبب مطالبة الضمان'
                                    : 'Warranty claim reason'
                            }
                            className="h-9 min-w-0 flex-1 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />
                        <button
                            type="button"
                            disabled={
                                busy
                                || row.status === 'void'
                            }
                            onClick={onClaim}
                            className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-line)] px-3 text-[10px] font-semibold text-[var(--ac-text-soft)] hover:border-[var(--ac-accent)] hover:text-[var(--ac-accent)] disabled:opacity-40"
                        >
                            <ShieldCheck size={13} />
                            {ar ? 'مطالبة' : 'Add claim'}
                        </button>
                    </div>

                    {Array.isArray(row.claims)
                        && row.claims.length > 0
                        && (
                            <div className="space-y-2">
                                {row.claims.map((claim: Row) => (
                                    <div
                                        key={claim.id}
                                        className="flex flex-wrap items-center justify-between gap-2 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-2"
                                    >
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                                {claim.claimed_on}
                                                {' · '}
                                                {claim.reason}
                                            </p>
                                            <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                                {claim.status}
                                                {claim.resolution
                                                    ? ' · ' + claim.resolution
                                                    : ''}
                                            </p>
                                        </div>

                                        {['open', 'in_progress'].includes(
                                            claim.status,
                                        ) && (
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {claim.status === 'open' && (
                                                    <button
                                                        type="button"
                                                        disabled={busy}
                                                        onClick={() =>
                                                            onUpdateClaim(
                                                                Number(claim.id),
                                                                {
                                                                    status:
                                                                        'in_progress',
                                                                },
                                                            )
                                                        }
                                                        className="h-8 rounded-[10px] border border-amber-500/50 px-2 text-[9px] font-semibold text-amber-400"
                                                    >
                                                        {ar
                                                            ? 'قيد المعالجة'
                                                            : 'Start work'}
                                                    </button>
                                                )}

                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => {
                                                        const resolution =
                                                            window.prompt(
                                                                ar
                                                                    ? 'اكتب نتيجة معالجة المطالبة.'
                                                                    : 'Enter the warranty claim resolution.',
                                                            );

                                                        if (
                                                            ! resolution
                                                            || ! resolution.trim()
                                                        ) {
                                                            return;
                                                        }

                                                        onUpdateClaim(
                                                            Number(claim.id),
                                                            {
                                                                status:
                                                                    'resolved',
                                                                resolution:
                                                                    resolution.trim(),
                                                            },
                                                        );
                                                    }}
                                                    className="h-8 rounded-[10px] border border-emerald-500/50 px-2 text-[9px] font-semibold text-emerald-400"
                                                >
                                                    {ar ? 'حل المطالبة' : 'Resolve'}
                                                </button>

                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        onUpdateClaim(
                                                            Number(claim.id),
                                                            {
                                                                status:
                                                                    'rejected',
                                                            },
                                                        )
                                                    }
                                                    className="h-8 rounded-[10px] border border-red-400/50 px-2 text-[9px] font-semibold text-red-400"
                                                >
                                                    {ar ? 'رفض' : 'Reject'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                </div>
            )}
        </div>
    );
}

function formatValue(
    value: unknown,
    ar: boolean,
): string {
    if (value === null || value === undefined || value === '') {
        return '—';
    }

    if (typeof value === 'boolean') {
        return value
            ? (ar ? 'نعم' : 'Yes')
            : (ar ? 'لا' : 'No');
    }

    if (typeof value === 'number') {
        return value.toLocaleString();
    }

    const text = String(value);

    if (
        /^-?\d+(?:\.\d+)?$/.test(text)
        && text.length < 22
    ) {
        return Number(text).toLocaleString(undefined, {
            maximumFractionDigits: 4,
        });
    }

    return text;
}
