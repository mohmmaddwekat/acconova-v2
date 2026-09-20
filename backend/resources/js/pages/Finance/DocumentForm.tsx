import { apiRequest } from '@/lib/http';
import {
    AlertTriangle,
    Building2,
    Check,
    FileText,
    Package,
    Plus,
    Save,
    Send,
    Trash2,
    Truck,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
    FPanel,
    FinanceHeader,
    Money,
    apiErrorText,
    addDays,
    financeButton,
    financeInput,
    financePrimary,
    todayValue,
} from './shared';
import type {
    DocumentDetail,
    DocumentLine,
    FinanceLookups,
} from './types';

type EditableLine = DocumentLine & {
    client_id: string;
};

function emptyLine(
    warehouseId: number | null,
): EditableLine {
    return {
        client_id:
            String(Date.now()) +
            '-' +
            String(Math.random()),
        product_id: null,
        warehouse_id: warehouseId,
        tax_rule_id: null,
        description: '',
        unit: '',
        quantity: '1',
        unit_price: '0',
        discount_percent: '0',
        tax_rate: '0',
        affects_inventory: false,
    };
}

export function DocumentForm({
    kind,
    lookups,
    ar,
    initial,
}: {
    kind: 'sale_invoice' | 'purchase_invoice';
    lookups: FinanceLookups;
    ar: boolean;
    initial?: DocumentDetail | null;
}) {
    const text = (
        arabic: string,
        english: string,
    ): string => ar ? arabic : english;

    const sales =
        kind ===
        'sale_invoice';

    const canManage =
        sales
            ? lookups.permissions.sales_manage
            : lookups.permissions.purchases_manage;

    const defaultWarehouse =
        lookups.warehouses.find(
            warehouse =>
                warehouse.is_default,
        )
        ?? lookups.warehouses[0]
        ?? null;

    const issueDate =
        initial?.issue_date
        ?? todayValue();

    const [
        partyId,
        setPartyId,
    ] = useState(
        initial?.party?.id
            ? String(
                initial.party.id,
            )
            : '',
    );

    const [
        externalNumber,
        setExternalNumber,
    ] = useState(
        initial?.external_number
        ?? '',
    );

    const [
        selectedIssueDate,
        setSelectedIssueDate,
    ] = useState(
        issueDate,
    );

    const [
        dueDate,
        setDueDate,
    ] = useState(
        initial?.due_date
        ?? addDays(
            issueDate,
            30,
        ),
    );

    const [
        activityType,
        setActivityType,
    ] = useState(
        initial?.activity_type
        ?? (
            sales
                ? 'trade'
                : 'goods_for_resale'
        ),
    );

    const [
        marketType,
        setMarketType,
    ] = useState(
        initial?.market_type
        ?? 'local',
    );

    const [
        warehouseId,
        setWarehouseId,
    ] = useState(
        initial?.warehouse_id
            ? String(
                initial.warehouse_id,
            )
            : (
                defaultWarehouse
                    ? String(
                        defaultWarehouse.id,
                    )
                    : ''
            ),
    );

    const [
        departmentId,
        setDepartmentId,
    ] = useState(
        initial?.department_id
            ? String(
                initial.department_id,
            )
            : '',
    );

    const [
        branchLabel,
        setBranchLabel,
    ] = useState(
        initial?.branch_label
        ?? '',
    );

    const [
        currency,
        setCurrency,
    ] = useState(
        initial?.currency
        ?? lookups.currency,
    );

    const [
        exchangeRate,
        setExchangeRate,
    ] = useState(
        initial?.exchange_rate
        ?? '1',
    );

    const [
        paymentTerms,
        setPaymentTerms,
    ] = useState(
        initial?.payment_terms
        ?? '30',
    );

    const [
        shippingTotal,
        setShippingTotal,
    ] = useState(
        initial?.shipping_total
        ?? '0',
    );

    const [
        notes,
        setNotes,
    ] = useState(
        initial?.notes
        ?? '',
    );

    const [
        internalNotes,
        setInternalNotes,
    ] = useState(
        initial?.internal_notes
        ?? '',
    );

    const [
        lines,
        setLines,
    ] = useState<EditableLine[]>(
        initial?.lines.length
            ? initial.lines.map(
                (
                    line,
                    index,
                ) => ({
                    ...line,
                    client_id:
                        'existing-'
                        + String(
                            line.id
                            ?? index,
                        ),
                }),
            )
            : [
                emptyLine(
                    defaultWarehouse?.id
                    ?? null,
                ),
            ],
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
        acknowledgeWarnings,
        setAcknowledgeWarnings,
    ] = useState(
        false,
    );

    const availableParties =
        lookups.parties.filter(
            party =>
                party.roles.includes(
                    sales
                        ? 'customer'
                        : 'supplier',
                ),
        );

    const availableTaxRules =
        lookups.tax_rules.filter(
            rule =>
                rule.applies_to ===
                    'both'
                || rule.applies_to ===
                    (
                        sales
                            ? 'sales'
                            : 'purchases'
                    ),
        );

    const selectedParty =
        availableParties.find(
            party =>
                String(
                    party.id,
                ) ===
                partyId,
        )
        ?? null;

    function changeLine(
        clientId: string,
        patch: Partial<EditableLine>,
    ): void {
        setLines(
            current =>
                current.map(
                    line =>
                        line.client_id ===
                        clientId
                            ? {
                                ...line,
                                ...patch,
                            }
                            : line,
                ),
        );
    }

    function selectProduct(
        line: EditableLine,
        value: string,
    ): void {
        if (! value) {
            changeLine(
                line.client_id,
                {
                    product_id:
                        null,
                    description:
                        '',
                    unit:
                        '',
                    unit_price:
                        '0',
                    tax_rate:
                        '0',
                    tax_rule_id:
                        null,
                    affects_inventory:
                        false,
                },
            );

            return;
        }

        const product =
            lookups.products.find(
                item =>
                    item.id ===
                    Number(
                        value,
                    ),
            );

        if (! product) {
            return;
        }

        changeLine(
            line.client_id,
            {
                product_id:
                    product.id,
                description:
                    product.name,
                unit:
                    product.unit
                    ?? '',
                unit_price:
                    sales
                        ? product.unit_price
                        : product.cost_price,
                tax_rate:
                    product.tax_rate
                    ?? '0',
                affects_inventory:
                    product.track_inventory,
                warehouse_id:
                    product.track_inventory
                        ? (
                            line.warehouse_id
                            ?? defaultWarehouse?.id
                            ?? null
                        )
                        : null,
            },
        );
    }

    function selectTaxRule(
        line: EditableLine,
        value: string,
    ): void {
        if (! value) {
            changeLine(
                line.client_id,
                {
                    tax_rule_id:
                        null,
                },
            );

            return;
        }

        const rule =
            availableTaxRules.find(
                item =>
                    item.id ===
                    Number(
                        value,
                    ),
            );

        changeLine(
            line.client_id,
            {
                tax_rule_id:
                    rule?.id
                    ?? null,
                tax_rate:
                    rule?.rate
                    ?? line.tax_rate,
            },
        );
    }

    const calculated =
        useMemo(
            () => {
                const rows =
                    lines.map(
                        line => {
                            const quantity =
                                Number(
                                    line.quantity,
                                )
                                || 0;

                            const price =
                                Number(
                                    line.unit_price,
                                )
                                || 0;

                            const discountPercent =
                                Number(
                                    line.discount_percent,
                                )
                                || 0;

                            const taxRate =
                                Number(
                                    line.tax_rate,
                                )
                                || 0;

                            const subtotal =
                                quantity
                                * price;

                            const discount =
                                subtotal
                                * (
                                    discountPercent
                                    / 100
                                );

                            const taxable =
                                Math.max(
                                    subtotal
                                    - discount,
                                    0,
                                );

                            const rule =
                                availableTaxRules.find(
                                    item =>
                                        item.id ===
                                        line.tax_rule_id,
                                );

                            const tax =
                                rule?.inclusive
                                && taxRate > 0
                                    ? taxable
                                        - (
                                            taxable
                                            / (
                                                1
                                                + (
                                                    taxRate
                                                    / 100
                                                )
                                            )
                                        )
                                    : taxable
                                        * (
                                            taxRate
                                            / 100
                                        );

                            const total =
                                rule?.inclusive
                                    ? taxable
                                    : taxable
                                        + tax;

                            return {
                                subtotal,
                                discount,
                                tax,
                                total,
                            };
                        },
                    );

                const subtotal =
                    rows.reduce(
                        (
                            sum,
                            row,
                        ) =>
                            sum
                            + row.subtotal,
                        0,
                    );

                const discount =
                    rows.reduce(
                        (
                            sum,
                            row,
                        ) =>
                            sum
                            + row.discount,
                        0,
                    );

                const tax =
                    rows.reduce(
                        (
                            sum,
                            row,
                        ) =>
                            sum
                            + row.tax,
                        0,
                    );

                const lineTotal =
                    rows.reduce(
                        (
                            sum,
                            row,
                        ) =>
                            sum
                            + row.total,
                        0,
                    );

                return {
                    rows,
                    subtotal,
                    discount,
                    tax,
                    total:
                        lineTotal
                        + (
                            Number(
                                shippingTotal,
                            )
                            || 0
                        ),
                };
            },
            [
                lines,
                shippingTotal,
                availableTaxRules,
            ],
        );

    const warnings =
        useMemo(
            () =>
                lines.flatMap(
                    line => {
                        if (! line.product_id) {
                            return [];
                        }

                        const product =
                            lookups.products.find(
                                item =>
                                    item.id ===
                                    line.product_id,
                            );

                        if (! product) {
                            return [];
                        }

                        const baseline =
                            Number(
                                sales
                                    ? product.unit_price
                                    : product.cost_price,
                            );

                        const entered =
                            Number(
                                line.unit_price,
                            );

                        if (
                            baseline <= 0
                            || entered <= 0
                        ) {
                            return [];
                        }

                        const ratio =
                            entered
                            / baseline;

                        if (
                            ratio >= 5
                            || ratio <= 0.2
                        ) {
                            return [
                                text(
                                    'السعر المدخل للبند «'
                                    + product.name
                                    + '» بعيد جداً عن السعر المرجعي ('
                                    + String(
                                        baseline,
                                    )
                                    + '). راجعه قبل الإصدار.',
                                    'The entered price for “'
                                    + product.name
                                    + '” differs sharply from the catalog reference ('
                                    + String(
                                        baseline,
                                    )
                                    + '). Review it before issuing.',
                                ),
                            ];
                        }

                        return [];
                    },
                ),
            [
                lines,
                lookups.products,
                sales,
                ar,
            ],
        );

    function payload() {
        return {
            kind,
            party_id:
                Number(
                    partyId,
                ),
            warehouse_id:
                warehouseId
                    ? Number(
                        warehouseId,
                    )
                    : null,
            department_id:
                departmentId
                    ? Number(
                        departmentId,
                    )
                    : null,
            external_number:
                externalNumber
                    || null,
            issue_date:
                selectedIssueDate,
            due_date:
                dueDate
                    || null,
            activity_type:
                activityType,
            market_type:
                marketType,
            branch_label:
                branchLabel
                    || null,
            currency,
            exchange_rate:
                exchangeRate,
            shipping_total:
                shippingTotal
                    || '0',
            payment_terms:
                paymentTerms
                    || null,
            notes:
                notes
                    || null,
            internal_notes:
                internalNotes
                    || null,
            lines:
                lines.map(
                    line => ({
                        product_id:
                            line.product_id,
                        warehouse_id:
                            line.warehouse_id,
                        tax_rule_id:
                            line.tax_rule_id,
                        description:
                            line.description,
                        unit:
                            line.unit,
                        quantity:
                            line.quantity,
                        unit_price:
                            line.unit_price,
                        discount_percent:
                            line.discount_percent,
                        tax_rate:
                            line.tax_rate,
                        affects_inventory:
                            line.affects_inventory,
                    }),
                ),
        };
    }

    async function save(
        issue: boolean,
    ): Promise<void> {
        if (
            busy
            || ! canManage
        ) {
            return;
        }

        if (! partyId) {
            setError(
                sales
                    ? text(
                        'اختر العميل أولاً.',
                        'Select a customer first.',
                    )
                    : text(
                        'اختر المورد أولاً.',
                        'Select a supplier first.',
                    ),
            );

            return;
        }

        if (
            issue
            && warnings.length
            && ! acknowledgeWarnings
        ) {
            setError(
                text(
                    'يوجد سعر غير معتاد. راجعه ثم فعّل مربع التأكيد قبل إصدار الفاتورة.',
                    'There is an unusual price. Review it and acknowledge the warning before issuing.',
                ),
            );

            return;
        }

        setBusy(
            true,
        );

        setError(
            '',
        );

        try {
            const response =
                await apiRequest<{
                    data:
                        DocumentDetail;
                }>(
                    initial?.id
                        ? '/api/finance/documents/'
                            + initial.id
                        : '/api/finance/documents',
                    {
                        method:
                            initial?.id
                                ? 'PATCH'
                                : 'POST',

                        body:
                            JSON.stringify(
                                payload(),
                            ),
                    },
                );

            let document =
                response.data;

            if (issue) {
                const issued =
                    await apiRequest<{
                        data:
                            DocumentDetail;
                    }>(
                        '/api/finance/documents/'
                        + document.id
                        + '/issue',
                        {
                            method:
                                'POST',

                            body:
                                JSON.stringify({
                                    acknowledge_warnings:
                                        acknowledgeWarnings,
                                }),
                        },
                    );

                document =
                    issued.data;
            }

            window.location.assign(
                sales
                    ? '/app/invoices/sales/'
                        + document.id
                    : '/app/invoices/purchases/'
                        + document.id,
            );
        } catch (
            failure
        ) {
            setError(
                apiErrorText(
                    failure,
                ),
            );
        } finally {
            setBusy(
                false,
            );
        }
    }

    const title =
        initial
            ? (
                sales
                    ? text(
                        'تعديل مسودة فاتورة البيع',
                        'Edit sales invoice draft',
                    )
                    : text(
                        'تعديل مسودة فاتورة الشراء',
                        'Edit purchase invoice draft',
                    )
            )
            : (
                sales
                    ? text(
                        'إنشاء فاتورة بيع',
                        'Create sales invoice',
                    )
                    : text(
                        'إنشاء فاتورة شراء',
                        'Create purchase invoice',
                    )
            );

    const activityOptions =
        [
            [
                'trade',
                text(
                    'تجارة فقط',
                    'Trade only',
                ),
            ],
            [
                'import_distribution',
                text(
                    'استيراد وتوزيع',
                    'Import & distribution',
                ),
            ],
            [
                'manufacturing',
                text(
                    'تصنيع وبيع',
                    'Manufacturing & sales',
                ),
            ],
            [
                'packaging',
                text(
                    'تعبئة وتغليف وبيع',
                    'Packaging & sales',
                ),
            ],
            [
                'services',
                text(
                    'خدمات',
                    'Services',
                ),
            ],
            [
                'other',
                text(
                    'نشاط آخر',
                    'Other',
                ),
            ],
        ];

    return (
        <div className="space-y-4">
            <FinanceHeader
                title={
                    title
                }
                subtitle={
                    sales
                        ? text(
                            'أنشئ فاتورة للعملاء لأي نموذج عمل: تجارة، استيراد وتوزيع، تصنيع، تعبئة أو خدمات.',
                            'Create customer invoices for trading, importing, manufacturing, packaging or service businesses.',
                        )
                        : text(
                            'سجل مشتريات الموردين سواء كانت مخزوناً أو مواد خام أو خدمات أو شحناً أو مصروفاً لا يؤثر على المخزون.',
                            'Record supplier purchases for stock, raw materials, services, freight or non-inventory costs.',
                        )
                }
                actions={
                    <>
                        <button
                            type="button"
                            className={
                                financeButton
                            }
                            disabled={
                                busy
                                || ! canManage
                            }
                            onClick={() =>
                                void save(
                                    false,
                                )
                            }
                        >
                            <Save
                                size={
                                    15
                                }
                            />
                            {text(
                                'حفظ كمسودة',
                                'Save draft',
                            )}
                        </button>

                        <button
                            type="button"
                            className={
                                financePrimary
                            }
                            disabled={
                                busy
                                || ! canManage
                            }
                            onClick={() =>
                                void save(
                                    true,
                                )
                            }
                        >
                            <Send
                                size={
                                    15
                                }
                            />
                            {text(
                                'اعتماد وإصدار',
                                'Issue invoice',
                            )}
                        </button>
                    </>
                }
            />

            {! canManage && (
                <div className="rounded-[14px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    {text(
                        'دورك الحالي يسمح بالعرض فقط ولا يسمح بإنشاء أو تعديل الفواتير.',
                        'Your current role is read-only for this invoice type.',
                    )}
                </div>
            )}

            {initial?.correction_reason && (
                <div className="rounded-[14px] border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
                    <strong>
                        {text(
                            'هذه مسودة تصحيح:',
                            'Correction draft:',
                        )}
                    </strong>{' '}
                    {
                        initial.correction_reason
                    }
                </div>
            )}

            {error && (
                <div
                    role="alert"
                    className="rounded-[14px] border border-red-200 bg-red-50 p-4 text-sm text-red-700"
                >
                    {
                        error
                    }
                </div>
            )}

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
                <div className="space-y-4">
                    <FPanel
                        title={text(
                            'معلومات الفاتورة',
                            'Invoice information',
                        )}
                        icon={
                            Building2
                        }
                    >
                        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
                            <label className="text-xs font-semibold text-[#49698f] md:col-span-2">
                                {sales
                                    ? text(
                                        'العميل',
                                        'Customer',
                                    )
                                    : text(
                                        'المورد',
                                        'Supplier',
                                    )}

                                <select
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        partyId
                                    }
                                    onChange={
                                        event =>
                                            setPartyId(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                >
                                    <option value="">
                                        {sales
                                            ? text(
                                                'اختر العميل',
                                                'Select customer',
                                            )
                                            : text(
                                                'اختر المورد',
                                                'Select supplier',
                                            )}
                                    </option>

                                    {availableParties.map(
                                        party => (
                                            <option
                                                key={
                                                    party.id
                                                }
                                                value={
                                                    party.id
                                                }
                                            >
                                                {
                                                    party.name
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'تاريخ الإصدار',
                                    'Issue date',
                                )}

                                <input
                                    type="date"
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        selectedIssueDate
                                    }
                                    onChange={
                                        event =>
                                            setSelectedIssueDate(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'تاريخ الاستحقاق',
                                    'Due date',
                                )}

                                <input
                                    type="date"
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        dueDate
                                    }
                                    onChange={
                                        event =>
                                            setDueDate(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                />
                            </label>

                            {! sales && (
                                <label className="text-xs font-semibold text-[#49698f]">
                                    {text(
                                        'رقم فاتورة المورد',
                                        'Supplier invoice number',
                                    )}

                                    <input
                                        className={
                                            financeInput
                                            + ' mt-2'
                                        }
                                        value={
                                            externalNumber
                                        }
                                        onChange={
                                            event =>
                                                setExternalNumber(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    />
                                </label>
                            )}

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'العملة',
                                    'Currency',
                                )}

                                <input
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        currency
                                    }
                                    maxLength={
                                        3
                                    }
                                    onChange={
                                        event =>
                                            setCurrency(
                                                event
                                                    .target
                                                    .value
                                                    .toUpperCase(),
                                            )
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'سعر الصرف',
                                    'Exchange rate',
                                )}

                                <input
                                    type="number"
                                    step="0.00000001"
                                    min="0.00000001"
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        exchangeRate
                                    }
                                    onChange={
                                        event =>
                                            setExchangeRate(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'السوق',
                                    'Market',
                                )}

                                <select
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        marketType
                                    }
                                    onChange={
                                        event =>
                                            setMarketType(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                >
                                    <option value="local">
                                        {text(
                                            'محلي',
                                            'Local',
                                        )}
                                    </option>
                                    <option value="import">
                                        {text(
                                            'استيراد',
                                            'Import',
                                        )}
                                    </option>
                                    <option value="export">
                                        {text(
                                            'تصدير',
                                            'Export',
                                        )}
                                    </option>
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'نوع النشاط',
                                    'Business activity',
                                )}

                                <select
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        activityType
                                    }
                                    onChange={
                                        event =>
                                            setActivityType(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                >
                                    {activityOptions.map(
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
                                                {
                                                    label
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'المستودع الافتراضي',
                                    'Default warehouse',
                                )}

                                <select
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        warehouseId
                                    }
                                    onChange={
                                        event =>
                                            setWarehouseId(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                >
                                    <option value="">
                                        {text(
                                            'بدون مستودع',
                                            'No warehouse',
                                        )}
                                    </option>

                                    {lookups.warehouses.map(
                                        warehouse => (
                                            <option
                                                key={
                                                    warehouse.id
                                                }
                                                value={
                                                    warehouse.id
                                                }
                                            >
                                                {
                                                    warehouse.name
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'القسم',
                                    'Department',
                                )}

                                <select
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        departmentId
                                    }
                                    onChange={
                                        event =>
                                            setDepartmentId(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                >
                                    <option value="">
                                        {text(
                                            'بدون قسم',
                                            'No department',
                                        )}
                                    </option>

                                    {lookups.departments.map(
                                        department => (
                                            <option
                                                key={
                                                    department.id
                                                }
                                                value={
                                                    department.id
                                                }
                                            >
                                                {
                                                    department.name
                                                }
                                            </option>
                                        ),
                                    )}
                                </select>
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'الفرع / الموقع',
                                    'Branch / location',
                                )}

                                <input
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        branchLabel
                                    }
                                    onChange={
                                        event =>
                                            setBranchLabel(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                />
                            </label>

                            <label className="text-xs font-semibold text-[#49698f]">
                                {text(
                                    'شروط الدفع',
                                    'Payment terms',
                                )}

                                <input
                                    className={
                                        financeInput
                                        + ' mt-2'
                                    }
                                    value={
                                        paymentTerms
                                    }
                                    onChange={
                                        event =>
                                            setPaymentTerms(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                    placeholder={text(
                                        'مثال: 30 يوم',
                                        'Example: Net 30',
                                    )}
                                />
                            </label>
                        </div>
                    </FPanel>

                    <FPanel
                        title={text(
                            'بنود الفاتورة',
                            'Invoice lines',
                        )}
                        icon={
                            Package
                        }
                        action={
                            <button
                                type="button"
                                className={
                                    financePrimary
                                }
                                onClick={() =>
                                    setLines(
                                        current => [
                                            ...current,
                                            emptyLine(
                                                warehouseId
                                                    ? Number(
                                                        warehouseId,
                                                    )
                                                    : null,
                                            ),
                                        ],
                                    )
                                }
                            >
                                <Plus
                                    size={
                                        14
                                    }
                                />

                                {text(
                                    'إضافة بند',
                                    'Add line',
                                )}
                            </button>
                        }
                    >
                        <div className="space-y-3 p-4">
                            {lines.map(
                                (
                                    line,
                                    index,
                                ) => {
                                    const row =
                                        calculated.rows[
                                            index
                                        ];

                                    return (
                                        <div
                                            key={
                                                line.client_id
                                            }
                                            className="grid gap-2 rounded-[14px] border border-[#e5edf7] bg-[#fbfdff] p-3 xl:grid-cols-[1.6fr_.7fr_.6fr_.7fr_.65fr_.8fr_.65fr_auto]"
                                        >
                                            <div>
                                                <label className="text-[10px] font-semibold text-[#6c84a6]">
                                                    {text(
                                                        'المنتج / الخدمة',
                                                        'Product / service',
                                                    )}
                                                </label>

                                                <select
                                                    className={
                                                        financeInput
                                                        + ' mt-1'
                                                    }
                                                    value={
                                                        line.product_id
                                                        ?? ''
                                                    }
                                                    onChange={
                                                        event =>
                                                            selectProduct(
                                                                line,
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                    }
                                                >
                                                    <option value="">
                                                        {text(
                                                            'بند يدوي / مصروف أو خدمة',
                                                            'Manual line / expense / service',
                                                        )}
                                                    </option>

                                                    {lookups.products.map(
                                                        product => (
                                                            <option
                                                                key={
                                                                    product.id
                                                                }
                                                                value={
                                                                    product.id
                                                                }
                                                            >
                                                                {
                                                                    product.name
                                                                }
                                                                {product.sku
                                                                    ? ' · '
                                                                        + product.sku
                                                                    : ''}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>

                                                <input
                                                    className={
                                                        financeInput
                                                        + ' mt-2'
                                                    }
                                                    value={
                                                        line.description
                                                    }
                                                    onChange={
                                                        event =>
                                                            changeLine(
                                                                line.client_id,
                                                                {
                                                                    description:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                },
                                                            )
                                                    }
                                                    placeholder={text(
                                                        'وصف البند',
                                                        'Line description',
                                                    )}
                                                />
                                            </div>

                                            <label className="text-[10px] font-semibold text-[#6c84a6]">
                                                {text(
                                                    'الكمية',
                                                    'Quantity',
                                                )}

                                                <input
                                                    type="number"
                                                    min="0.0001"
                                                    step="0.0001"
                                                    className={
                                                        financeInput
                                                        + ' mt-1'
                                                    }
                                                    value={
                                                        line.quantity
                                                    }
                                                    onChange={
                                                        event =>
                                                            changeLine(
                                                                line.client_id,
                                                                {
                                                                    quantity:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                },
                                                            )
                                                    }
                                                />
                                            </label>

                                            <label className="text-[10px] font-semibold text-[#6c84a6]">
                                                {text(
                                                    'الوحدة',
                                                    'Unit',
                                                )}

                                                <input
                                                    className={
                                                        financeInput
                                                        + ' mt-1'
                                                    }
                                                    value={
                                                        line.unit
                                                    }
                                                    onChange={
                                                        event =>
                                                            changeLine(
                                                                line.client_id,
                                                                {
                                                                    unit:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                },
                                                            )
                                                    }
                                                />
                                            </label>

                                            <label className="text-[10px] font-semibold text-[#6c84a6]">
                                                {text(
                                                    'سعر الوحدة',
                                                    'Unit price',
                                                )}

                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="0.0001"
                                                    className={
                                                        financeInput
                                                        + ' mt-1'
                                                    }
                                                    value={
                                                        line.unit_price
                                                    }
                                                    onChange={
                                                        event =>
                                                            changeLine(
                                                                line.client_id,
                                                                {
                                                                    unit_price:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                },
                                                            )
                                                    }
                                                />
                                            </label>

                                            <label className="text-[10px] font-semibold text-[#6c84a6]">
                                                {text(
                                                    'خصم %',
                                                    'Discount %',
                                                )}

                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="100"
                                                    step="0.01"
                                                    className={
                                                        financeInput
                                                        + ' mt-1'
                                                    }
                                                    value={
                                                        line.discount_percent
                                                    }
                                                    onChange={
                                                        event =>
                                                            changeLine(
                                                                line.client_id,
                                                                {
                                                                    discount_percent:
                                                                        event
                                                                            .target
                                                                            .value,
                                                                },
                                                            )
                                                    }
                                                />
                                            </label>

                                            <label className="text-[10px] font-semibold text-[#6c84a6]">
                                                {text(
                                                    'قاعدة الضريبة',
                                                    'Tax rule',
                                                )}

                                                <select
                                                    className={
                                                        financeInput
                                                        + ' mt-1'
                                                    }
                                                    value={
                                                        line.tax_rule_id
                                                        ?? ''
                                                    }
                                                    onChange={
                                                        event =>
                                                            selectTaxRule(
                                                                line,
                                                                event
                                                                    .target
                                                                    .value,
                                                            )
                                                    }
                                                >
                                                    <option value="">
                                                        {text(
                                                            'بدون قاعدة',
                                                            'No rule',
                                                        )}
                                                    </option>

                                                    {availableTaxRules.map(
                                                        rule => (
                                                            <option
                                                                key={
                                                                    rule.id
                                                                }
                                                                value={
                                                                    rule.id
                                                                }
                                                            >
                                                                {
                                                                    rule.name
                                                                }
                                                                {' · '}
                                                                {
                                                                    rule.rate
                                                                }
                                                                %
                                                                {' · '}
                                                                {
                                                                    rule.country_code
                                                                }
                                                                {rule.region_code
                                                                    ? '-'
                                                                        + rule.region_code
                                                                    : ''}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            </label>

                                            <div className="text-[10px] font-semibold text-[#6c84a6]">
                                                {text(
                                                    'المخزون',
                                                    'Inventory',
                                                )}

                                                <label className="mt-2 flex min-h-10 items-center gap-2 rounded-[10px] border border-[#d8e4f4] bg-white px-3">
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            line.affects_inventory
                                                        }
                                                        disabled={
                                                            ! line.product_id
                                                        }
                                                        onChange={
                                                            event =>
                                                                changeLine(
                                                                    line.client_id,
                                                                    {
                                                                        affects_inventory:
                                                                            event
                                                                                .target
                                                                                .checked,
                                                                        warehouse_id:
                                                                            event
                                                                                .target
                                                                                .checked
                                                                                ? (
                                                                                    line.warehouse_id
                                                                                    ?? defaultWarehouse?.id
                                                                                    ?? null
                                                                                )
                                                                                : null,
                                                                    },
                                                                )
                                                        }
                                                    />

                                                    <span>
                                                        {text(
                                                            'يؤثر',
                                                            'Affects',
                                                        )}
                                                    </span>
                                                </label>
                                            </div>

                                            <div className="flex items-end gap-2">
                                                <div className="min-w-24 rounded-[10px] bg-white p-2 text-end">
                                                    <p className="text-[9px] text-slate-400">
                                                        {text(
                                                            'الإجمالي',
                                                            'Total',
                                                        )}
                                                    </p>

                                                    <strong className="text-xs text-[#123d78]">
                                                        <Money
                                                            value={
                                                                row?.total
                                                                ?? 0
                                                            }
                                                            currency={
                                                                currency
                                                            }
                                                            compact
                                                        />
                                                    </strong>
                                                </div>

                                                <button
                                                    type="button"
                                                    className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border border-red-100 bg-red-50 text-red-500 disabled:opacity-30"
                                                    disabled={
                                                        lines.length <=
                                                        1
                                                    }
                                                    onClick={() =>
                                                        setLines(
                                                            current =>
                                                                current.filter(
                                                                    item =>
                                                                        item.client_id !==
                                                                        line.client_id,
                                                                ),
                                                        )
                                                    }
                                                >
                                                    <Trash2
                                                        size={
                                                            15
                                                        }
                                                    />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                },
                            )}
                        </div>
                    </FPanel>

                    {warnings.length > 0 && (
                        <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4">
                            <div className="flex items-start gap-3">
                                <AlertTriangle
                                    size={
                                        20
                                    }
                                    className="mt-0.5 shrink-0 text-amber-600"
                                />

                                <div>
                                    <h3 className="text-sm font-bold text-amber-900">
                                        {text(
                                            'مراجعة إلزامية قبل الإصدار',
                                            'Required review before issue',
                                        )}
                                    </h3>

                                    <ul className="mt-2 space-y-1 text-xs leading-5 text-amber-800">
                                        {warnings.map(
                                            (
                                                warning,
                                                index,
                                            ) => (
                                                <li
                                                    key={
                                                        index
                                                    }
                                                >
                                                    •{' '}
                                                    {
                                                        warning
                                                    }
                                                </li>
                                            ),
                                        )}
                                    </ul>

                                    <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-amber-900">
                                        <input
                                            type="checkbox"
                                            checked={
                                                acknowledgeWarnings
                                            }
                                            onChange={
                                                event =>
                                                    setAcknowledgeWarnings(
                                                        event
                                                            .target
                                                            .checked,
                                                    )
                                            }
                                        />

                                        {text(
                                            'راجعت الأسعار غير المعتادة وأؤكد أنها صحيحة.',
                                            'I reviewed the unusual prices and confirm they are correct.',
                                        )}
                                    </label>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="grid gap-4 lg:grid-cols-3">
                        <FPanel
                            title={text(
                                'الشحن والتكاليف الإضافية',
                                'Shipping & extra costs',
                            )}
                            icon={
                                Truck
                            }
                        >
                            <div className="p-4">
                                <label className="text-xs font-semibold text-[#49698f]">
                                    {text(
                                        'مصاريف الشحن',
                                        'Shipping amount',
                                    )}

                                    <input
                                        type="number"
                                        min="0"
                                        step="0.0001"
                                        className={
                                            financeInput
                                            + ' mt-2'
                                        }
                                        value={
                                            shippingTotal
                                        }
                                        onChange={
                                            event =>
                                                setShippingTotal(
                                                    event
                                                        .target
                                                        .value,
                                                )
                                        }
                                    />
                                </label>
                            </div>
                        </FPanel>

                        <FPanel
                            title={text(
                                'ملاحظات العميل / المورد',
                                'External notes',
                            )}
                            icon={
                                FileText
                            }
                        >
                            <div className="p-4">
                                <textarea
                                    className={
                                        financeInput
                                        + ' min-h-28'
                                    }
                                    value={
                                        notes
                                    }
                                    onChange={
                                        event =>
                                            setNotes(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                />
                            </div>
                        </FPanel>

                        <FPanel
                            title={text(
                                'ملاحظات داخلية',
                                'Internal notes',
                            )}
                            icon={
                                FileText
                            }
                        >
                            <div className="p-4">
                                <textarea
                                    className={
                                        financeInput
                                        + ' min-h-28'
                                    }
                                    value={
                                        internalNotes
                                    }
                                    onChange={
                                        event =>
                                            setInternalNotes(
                                                event
                                                    .target
                                                    .value,
                                            )
                                    }
                                />
                            </div>
                        </FPanel>
                    </div>
                </div>

                <aside className="space-y-4 xl:sticky xl:top-24">
                    <FPanel
                        title={
                            sales
                                ? text(
                                    'معلومات العميل',
                                    'Customer',
                                )
                                : text(
                                    'معلومات المورد',
                                    'Supplier',
                                )
                        }
                        icon={
                            Building2
                        }
                    >
                        <div className="space-y-2 p-4 text-xs">
                            <strong className="block text-base text-[#123d78]">
                                {selectedParty?.name
                                    ?? text(
                                        'لم يتم الاختيار',
                                        'Not selected',
                                    )}
                            </strong>

                            <p className="text-slate-500">
                                {selectedParty?.email
                                    ?? '—'}
                            </p>

                            <p className="text-slate-500">
                                {selectedParty?.phone
                                    ?? '—'}
                            </p>

                            <p className="text-slate-500">
                                {selectedParty?.country_code
                                    ?? '—'}
                                {selectedParty?.region_code
                                    ? ' / '
                                        + selectedParty.region_code
                                    : ''}
                            </p>
                        </div>
                    </FPanel>

                    <FPanel
                        title={text(
                            'ملخص الفاتورة',
                            'Invoice summary',
                        )}
                        icon={
                            FileText
                        }
                    >
                        <div className="space-y-3 p-4 text-xs">
                            <div className="flex justify-between gap-4">
                                <span className="text-slate-500">
                                    {text(
                                        'المجموع الفرعي',
                                        'Subtotal',
                                    )}
                                </span>

                                <strong>
                                    <Money
                                        value={
                                            calculated.subtotal
                                        }
                                        currency={
                                            currency
                                        }
                                    />
                                </strong>
                            </div>

                            <div className="flex justify-between gap-4">
                                <span className="text-slate-500">
                                    {text(
                                        'إجمالي الخصم',
                                        'Discount',
                                    )}
                                </span>

                                <strong className="text-red-500">
                                    -
                                    <Money
                                        value={
                                            calculated.discount
                                        }
                                        currency={
                                            currency
                                        }
                                    />
                                </strong>
                            </div>

                            <div className="flex justify-between gap-4">
                                <span className="text-slate-500">
                                    {text(
                                        'الضريبة',
                                        'Tax',
                                    )}
                                </span>

                                <strong>
                                    <Money
                                        value={
                                            calculated.tax
                                        }
                                        currency={
                                            currency
                                        }
                                    />
                                </strong>
                            </div>

                            <div className="flex justify-between gap-4">
                                <span className="text-slate-500">
                                    {text(
                                        'الشحن',
                                        'Shipping',
                                    )}
                                </span>

                                <strong>
                                    <Money
                                        value={
                                            shippingTotal
                                        }
                                        currency={
                                            currency
                                        }
                                    />
                                </strong>
                            </div>

                            <div className="border-t border-[#e6eef8] pt-3">
                                <div className="flex items-end justify-between gap-4">
                                    <span className="font-bold text-[#123d78]">
                                        {text(
                                            'الإجمالي الكلي',
                                            'Grand total',
                                        )}
                                    </span>

                                    <strong className="text-xl text-[#1265d8]">
                                        <Money
                                            value={
                                                calculated.total
                                            }
                                            currency={
                                                currency
                                            }
                                        />
                                    </strong>
                                </div>
                            </div>
                        </div>
                    </FPanel>

                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 p-4 text-xs leading-6 text-emerald-800">
                        <div className="flex items-center gap-2 font-bold">
                            <Check
                                size={
                                    16
                                }
                            />

                            {text(
                                'حماية من أخطاء الإدخال',
                                'Entry error protection',
                            )}
                        </div>

                        <p className="mt-2">
                            {text(
                                'الفاتورة المصدرة لا يتم تعديلها بصمت. أي خطأ لاحق يُعالج بنسخة تصحيح مرتبطة بالأصل مع سجل تدقيق كامل.',
                                'Issued invoices are never silently rewritten. Later mistakes use a linked correction revision with a complete audit trail.',
                            )}
                        </p>
                    </div>
                </aside>
            </div>
        </div>
    );
}
