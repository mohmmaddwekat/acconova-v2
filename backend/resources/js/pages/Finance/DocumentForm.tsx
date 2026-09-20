import { apiRequest } from '@/lib/http';
import { Link } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowLeft,
    Building2,
    Check,
    ChevronDown,
    FileText,
    History,
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

type PriceReference = {
    source: 'party_history' | 'catalog';
    unit_price: string;
    document_number: string | null;
    issue_date: string | null;
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
        price_status: 'final',
        discount_percent: '0',
        discount_type: 'percent',
        discount_value: '0',
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
            'trade'
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

    const currency =
        lookups.currency;

    const exchangeRate =
        '1';

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
                    discount_type:
                        line.discount_type
                        ?? 'percent',
                    discount_value:
                        line.discount_value
                        ?? line.discount_percent
                        ?? '0',
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
        priceReferences,
        setPriceReferences,
    ] = useState<Record<string, PriceReference>>({});

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

    async function loadPartyPrice(
        clientId: string,
        productId: number,
        selectedPartyId = partyId,
    ): Promise<void> {
        const product =
            lookups.products.find(
                item =>
                    item.id ===
                    productId,
            );

        if (! product) {
            return;
        }

        if (! selectedPartyId) {
            changeLine(
                clientId,
                {
                    unit_price:
                        sales
                            ? product.unit_price
                            : product.cost_price,
                },
            );

            setPriceReferences(
                current => {
                    const next = {
                        ...current,
                    };

                    delete next[
                        clientId
                    ];

                    return next;
                },
            );

            return;
        }

        try {
            const result =
                await apiRequest<PriceReference>(
                    '/api/finance/reference-price?party_id='
                    + encodeURIComponent(
                        selectedPartyId,
                    )
                    + '&product_id='
                    + String(
                        productId,
                    )
                    + '&kind='
                    + kind,
                );

            changeLine(
                clientId,
                {
                    unit_price:
                        result.unit_price,
                },
            );

            setPriceReferences(
                current => ({
                    ...current,
                    [clientId]:
                        result,
                }),
            );
        } catch {
            changeLine(
                clientId,
                {
                    unit_price:
                        sales
                            ? product.unit_price
                            : product.cost_price,
                },
            );
        }
    }

    function selectParty(
        value: string,
    ): void {
        setPartyId(
            value,
        );

        setPriceReferences(
            {},
        );

        lines.forEach(
            line => {
                if (
                    line.product_id
                ) {
                    void loadPartyPrice(
                        line.client_id,
                        line.product_id,
                        value,
                    );
                }
            },
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
                    price_status:
                        'final',
                },
            );

            return;
        }

        const numericValue =
            Number(
                value,
            );

        if (
            lines.some(
                item =>
                    item.client_id !==
                        line.client_id
                    && item.product_id ===
                        numericValue,
            )
        ) {
            setError(
                text(
                    'هذا المنتج مضاف بالفعل في الفاتورة. عدّل الكمية في البند الموجود بدلاً من تكراره.',
                    'This product is already on the invoice. Update the existing line quantity instead of adding it twice.',
                ),
            );

            return;
        }

        const product =
            lookups.products.find(
                item =>
                    item.id ===
                    numericValue,
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

        void loadPartyPrice(
            line.client_id,
            product.id,
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

                            const discountValue =
                                Number(
                                    line.discount_value
                                    ?? line.discount_percent,
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
                                line.discount_type ===
                                'fixed'
                                    ? Math.min(
                                        Math.max(
                                            discountValue,
                                            0,
                                        ),
                                        subtotal,
                                    )
                                    : subtotal
                                        * (
                                            Math.min(
                                                Math.max(
                                                    discountValue,
                                                    0,
                                                ),
                                                100,
                                            )
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
                        price_status:
                            line.price_status,
                        discount_percent:
                            line.discount_type === 'percent'
                                ? line.discount_value
                                : '0',
                        discount_type:
                            line.discount_type,
                        discount_value:
                            line.discount_value,
                        tax_rate:
                            line.tax_rate,
                        affects_inventory:
                            line.affects_inventory,
                    }),
                ),
        };
    }

    const estimatedPriceCount =
        sales
            ? 0
            : lines.filter(
                line =>
                    line.price_status ===
                    'estimated',
            ).length;

    async function save(
        issue: boolean,
    ): Promise<void> {
        if (
            busy
            || ! canManage
        ) {
            return;
        }

        const manualLineNames =
            lines
                .filter(
                    line =>
                        ! line.product_id
                        && line.description.trim(),
                )
                .map(
                    line =>
                        line.description
                            .trim()
                            .toLocaleLowerCase(),
                );

        if (
            new Set(
                manualLineNames,
            ).size !==
            manualLineNames.length
        ) {
            setError(
                text(
                    'يوجد بند يدوي مكرر. عدّل الكمية في البند الموجود أو غيّر الوصف بدل تكراره.',
                    'A manual line is duplicated. Update the existing line quantity or change its description instead of repeating it.',
                ),
            );

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

        if (
            issue
            && ! window.confirm(
                text(
                    'تأكيد الإصدار: إجمالي الفاتورة '
                    + new Intl.NumberFormat().format(calculated.total)
                    + ' '
                    + currency
                    + ' وعدد البنود '
                    + String(lines.length)
                    + (estimatedPriceCount > 0
                        ? ' ويوجد ' + String(estimatedPriceCount) + ' بند بسعر مبدئي سيحتاج تثبيتاً لاحقاً.'
                        : '')
                    + '. بعد الإصدار لن يتم تعديل السجل بصمت؛ أي خطأ لاحق سيحتاج تصحيحاً موثقاً. هل راجعت المبلغ؟',
                    'Issue confirmation: invoice total '
                    + new Intl.NumberFormat().format(calculated.total)
                    + ' '
                    + currency
                    + ' across '
                    + String(lines.length)
                    + ' line(s)'
                    + (estimatedPriceCount > 0
                        ? ' and ' + String(estimatedPriceCount) + ' provisional-price line(s) that must be finalized later'
                        : '')
                    + '. After issue, the record cannot be silently edited; later mistakes require a documented correction. Did you review the amount?',
                ),
            )
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

    async function deleteDraftInvoice(): Promise<void> {
        if (! initial?.id || busy || ! canManage) {
            return;
        }

        if (! window.confirm(
            text(
                'حذف هذه المسودة نهائياً؟ هذا مسموح فقط قبل إصدار الفاتورة. الفواتير الصادرة لا تُحذف؛ يتم إلغاؤها أو تصحيحها حتى يبقى السجل المحاسبي محفوظاً.',
                'Delete this draft permanently? This is only allowed before issue. Issued invoices are voided or corrected instead so the accounting history stays intact.',
            ),
        )) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/finance/documents/' + initial.id,
                { method: 'DELETE' },
            );

            window.location.assign(
                sales
                    ? '/app/invoices'
                    : '/app/invoices/purchases',
            );
        } catch (failure) {
            setError(apiErrorText(failure));
        } finally {
            setBusy(false);
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
                        <Link
                            href={
                                sales
                                    ? '/app/invoices'
                                    : '/app/invoices/purchases'
                            }
                            aria-label={text(
                                'رجوع',
                                'Back',
                            )}
                            className={
                                financeButton
                            }
                        >
                            <ArrowLeft
                                size={
                                    15
                                }
                                className="rtl:rotate-180"
                            />
                            {text(
                                'رجوع',
                                'Back',
                            )}
                        </Link>

                        {initial?.id && (
                            <button
                                type="button"
                                className={financeButton + ' !text-red-600'}
                                disabled={busy || ! canManage}
                                onClick={() => void deleteDraftInvoice()}
                            >
                                <Trash2 size={15} />
                                {text('حذف المسودة', 'Delete draft')}
                            </button>
                        )}

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

            <div className="rounded-[14px] border border-blue-100 bg-blue-50/70 px-4 py-3 text-xs text-blue-700">
                {text(
                    'الحقول التي تحمل علامة * مطلوبة. أي حقل آخر اختياري ما لم يظهر شرط مرتبط بطريقة الدفع أو المخزون.',
                    'Fields marked * are required. Other fields are optional unless a payment or inventory condition says otherwise.',
                )}
            </div>

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
                                        'العميل *',
                                        'Customer *',
                                    )
                                    : text(
                                        'المورد *',
                                        'Supplier *',
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
                                            selectParty(
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
                                    'تاريخ الإصدار *',
                                    'Issue date *',
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
                                    'تاريخ الاستحقاق (اختياري)',
                                    'Due date (optional)',
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
                                        'رقم فاتورة المورد (اختياري)',
                                        'Supplier invoice number (optional)',
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
                                    readOnly
                                    aria-readonly="true"
                                    title={text(
                                        'تُحدد العملة من إعدادات مساحة العمل',
                                        'Currency is controlled by workspace settings',
                                    )}
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
                                    readOnly
                                    aria-readonly="true"
                                    title={text(
                                        'سعر الصرف ثابت لأن العملة موحدة من الإعدادات',
                                        'Exchange rate is fixed because the workspace uses one configured currency',
                                    )}
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
                                    'المستودع الافتراضي (اختياري)',
                                    'Default warehouse (optional)',
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
                                    'القسم (اختياري)',
                                    'Department (optional)',
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
                                    'الفرع / الموقع (اختياري)',
                                    'Branch / location (optional)',
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
                                    'شروط الدفع (اختياري)',
                                    'Payment terms (optional)',
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
                        <div className="space-y-4 p-4">
                            {lines.map(
                                (
                                    line,
                                    index,
                                ) => {
                                    const row =
                                        calculated.rows[
                                            index
                                        ];

                                    const priceReference =
                                        priceReferences[
                                            line.client_id
                                        ];

                                    return (
                                        <article
                                            key={
                                                line.client_id
                                            }
                                            className="overflow-hidden rounded-[20px] border border-[#dbe6f5] bg-white shadow-[0_10px_30px_rgba(25,74,135,.055)]"
                                        >
                                            <div className="flex items-center justify-between gap-3 border-b border-[#eaf0f8] bg-gradient-to-l from-[#f6faff] via-white to-white px-4 py-3 sm:px-5">
                                                <div className="flex min-w-0 items-center gap-3">
                                                    <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[#1265d8] text-xs font-bold text-white">
                                                        {index + 1}
                                                    </span>

                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-[#123d78]">
                                                            {text(
                                                                'بند الفاتورة',
                                                                'Invoice line',
                                                            )}
                                                        </p>

                                                        <p className="mt-0.5 truncate text-[10px] text-[#7890b1]">
                                                            {line.product_id
                                                                ? (
                                                                    lookups.products.find(
                                                                        product =>
                                                                            product.id ===
                                                                            line.product_id,
                                                                    )?.name
                                                                    ?? line.description
                                                                )
                                                                : text(
                                                                    'بند يدوي / خدمة / مصروف',
                                                                    'Manual line / service / expense',
                                                                )}
                                                        </p>
                                                    </div>
                                                </div>

                                                <button
                                                    type="button"
                                                    className="flex size-9 shrink-0 items-center justify-center rounded-[11px] border border-red-100 bg-red-50 text-red-500 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-30"
                                                    aria-label={text(
                                                        'حذف البند',
                                                        'Delete line',
                                                    )}
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
                                                    <Trash2 size={15} />
                                                </button>
                                            </div>

                                            <div className="space-y-4 p-4 sm:p-5">
                                                <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-[minmax(280px,2.2fr)_120px_140px_minmax(190px,1fr)]">
                                                    <label className="text-[11px] font-semibold text-[#58739a]">
                                                        {text(
                                                            'المنتج / الخدمة',
                                                            'Product / service',
                                                        )}

                                                        <select
                                                            className={
                                                                financeInput
                                                                + ' mt-2'
                                                            }
                                                            value={
                                                                line.product_id
                                                                ?? ''
                                                            }
                                                            onChange={
                                                                event =>
                                                                    selectProduct(
                                                                        line,
                                                                        event.target.value,
                                                                    )
                                                            }
                                                        >
                                                            <option value="">
                                                                {text(
                                                                    'بند يدوي — خدمة، مصروف أو بند غير مسجل',
                                                                    'Manual line — service, expense or unlisted item',
                                                                )}
                                                            </option>

                                                            {lookups.products
                                                                .filter(
                                                                    product =>
                                                                        product.id ===
                                                                            line.product_id
                                                                        || ! lines.some(
                                                                            item =>
                                                                                item.client_id !==
                                                                                    line.client_id
                                                                                && item.product_id ===
                                                                                    product.id,
                                                                        ),
                                                                )
                                                                .map(
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
                                                    </label>

                                                    <label className="text-[11px] font-semibold text-[#58739a]">
                                                        {text(
                                                            'الكمية *',
                                                            'Quantity *',
                                                        )}

                                                        <input
                                                            type="number"
                                                            min="0.0001"
                                                            step="0.0001"
                                                            className={
                                                                financeInput
                                                                + ' mt-2 text-center font-semibold'
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
                                                                                event.target.value,
                                                                        },
                                                                    )
                                                            }
                                                        />
                                                    </label>

                                                    <label className="text-[11px] font-semibold text-[#58739a]">
                                                        {text(
                                                            'الوحدة',
                                                            'Unit',
                                                        )}

                                                        <input
                                                            className={
                                                                financeInput
                                                                + ' mt-2'
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
                                                                                event.target.value,
                                                                        },
                                                                    )
                                                            }
                                                            placeholder={text(
                                                                'قطعة',
                                                                'Unit',
                                                            )}
                                                        />
                                                    </label>

                                                    <label className="text-[11px] font-semibold text-[#58739a]">
                                                        {text(
                                                            'سعر الوحدة',
                                                            'Unit price',
                                                        )}
                                                        {' ('}
                                                        {currency}
                                                        {') *'}

                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.0001"
                                                            dir="ltr"
                                                            className={
                                                                financeInput
                                                                + ' mt-2 text-start font-bold text-[#123d78]'
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
                                                                                event.target.value,
                                                                        },
                                                                    )
                                                            }
                                                        />
                                                    </label>
                                                </div>

                                                {! line.product_id && (
                                                    <label className="block text-[11px] font-semibold text-[#58739a]">
                                                        {text(
                                                            'وصف البند اليدوي *',
                                                            'Manual line description *',
                                                        )}

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
                                                                                event.target.value,
                                                                        },
                                                                    )
                                                            }
                                                            placeholder={text(
                                                                'اكتب وصفاً واضحاً يظهر في الفاتورة',
                                                                'Write a clear description that will appear on the invoice',
                                                            )}
                                                        />
                                                    </label>
                                                )}

                                                {line.product_id && priceReference && (
                                                    <div
                                                        className={[
                                                            'flex flex-col gap-2 rounded-[13px] border px-3.5 py-3 text-[10px] sm:flex-row sm:items-center sm:justify-between',
                                                            priceReference.source ===
                                                            'party_history'
                                                                ? 'border-blue-100 bg-blue-50/70 text-blue-800'
                                                                : 'border-slate-100 bg-slate-50 text-slate-600',
                                                        ].join(' ')}
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            <History
                                                                size={14}
                                                                className="shrink-0"
                                                            />

                                                            <span>
                                                                {priceReference.source ===
                                                                'party_history'
                                                                    ? (
                                                                        sales
                                                                            ? text(
                                                                                'تم استخدام آخر سعر بيع لهذا العميل تلقائياً.',
                                                                                'The last selling price for this customer was applied automatically.',
                                                                            )
                                                                            : text(
                                                                                'تم استخدام آخر سعر شراء من هذا المورد تلقائياً.',
                                                                                'The last purchase price from this supplier was applied automatically.',
                                                                            )
                                                                    )
                                                                    : text(
                                                                        'لا يوجد سعر سابق لهذا الطرف؛ تم استخدام السعر المرجعي للمنتج.',
                                                                        'No prior price exists for this party; the product reference price was used.',
                                                                    )}
                                                            </span>
                                                        </div>

                                                        <div className="flex flex-wrap items-center gap-2 font-semibold">
                                                            <Money
                                                                value={
                                                                    priceReference.unit_price
                                                                }
                                                                currency={
                                                                    currency
                                                                }
                                                                compact
                                                            />

                                                            {priceReference.document_number && (
                                                                <span className="text-[#7890b1]">
                                                                    {priceReference.document_number}
                                                                    {priceReference.issue_date
                                                                        ? ' · '
                                                                            + priceReference.issue_date
                                                                        : ''}
                                                                </span>
                                                            )}

                                                            <span className="font-normal text-[#7890b1]">
                                                                {text(
                                                                    'يمكنك تعديل السعر الآن؛ بعد إصدار الفاتورة يصبح هو السعر الأحدث لهذا الطرف.',
                                                                    'You can override it now; once the invoice is issued, it becomes this party’s latest price.',
                                                                )}
                                                            </span>
                                                        </div>
                                                    </div>
                                                )}

                                                {! sales && (
                                                    <label
                                                        className={[
                                                            'flex cursor-pointer items-start gap-3 rounded-[14px] border p-3 transition',
                                                            line.price_status ===
                                                            'estimated'
                                                                ? 'border-amber-200 bg-amber-50'
                                                                : 'border-[#e6edf7] bg-[#fbfdff]',
                                                        ].join(' ')}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            checked={
                                                                line.price_status ===
                                                                'estimated'
                                                            }
                                                            onChange={
                                                                event =>
                                                                    changeLine(
                                                                        line.client_id,
                                                                        {
                                                                            price_status:
                                                                                event.target.checked
                                                                                    ? 'estimated'
                                                                                    : 'final',
                                                                        },
                                                                    )
                                                            }
                                                            className="mt-0.5"
                                                        />

                                                        <span>
                                                            <strong className="block text-[11px] text-[#123d78]">
                                                                {text(
                                                                    'السعر غير نهائي بعد',
                                                                    'Price is provisional',
                                                                )}
                                                            </strong>

                                                            <span className="mt-1 block text-[10px] leading-5 text-[#7890b1]">
                                                                {text(
                                                                    'فعّلها إذا سجلت سعر الشراء مؤقتاً وتنتظر السعر النهائي من المورد.',
                                                                    'Enable this when the purchase price is temporary and you are waiting for the supplier’s final price.',
                                                                )}
                                                            </span>
                                                        </span>
                                                    </label>
                                                )}

                                                <div className="grid grid-cols-2 gap-2 2xl:grid-cols-4">
                                                    {[
                                                        [
                                                            text(
                                                                'قبل الخصم',
                                                                'Subtotal',
                                                            ),
                                                            row?.subtotal
                                                            ?? 0,
                                                        ],
                                                        [
                                                            text(
                                                                'الخصم',
                                                                'Discount',
                                                            ),
                                                            row?.discount
                                                            ?? 0,
                                                        ],
                                                        [
                                                            text(
                                                                'الضريبة',
                                                                'Tax',
                                                            ),
                                                            row?.tax
                                                            ?? 0,
                                                        ],
                                                        [
                                                            text(
                                                                'إجمالي البند',
                                                                'Line total',
                                                            ),
                                                            row?.total
                                                            ?? 0,
                                                        ],
                                                    ].map(
                                                        (
                                                            [
                                                                label,
                                                                value,
                                                            ],
                                                            summaryIndex,
                                                        ) => (
                                                            <div
                                                                key={
                                                                    label
                                                                }
                                                                className={[
                                                                    'rounded-[13px] border px-3 py-3',
                                                                    summaryIndex ===
                                                                    3
                                                                        ? 'border-blue-100 bg-[#eef5ff]'
                                                                        : 'border-[#edf2f8] bg-[#fbfdff]',
                                                                ].join(' ')}
                                                            >
                                                                <p className="text-[9px] font-semibold text-[#7890b1]">
                                                                    {label}
                                                                </p>

                                                                <strong className="mt-1 block text-xs text-[#123d78]">
                                                                    <Money
                                                                        value={
                                                                            value
                                                                        }
                                                                        currency={
                                                                            currency
                                                                        }
                                                                        compact
                                                                    />
                                                                </strong>
                                                            </div>
                                                        ),
                                                    )}
                                                </div>

                                                <details className="group rounded-[15px] border border-[#e4edf8] bg-[#fbfdff]">
                                                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[11px] font-bold text-[#49698f] [&::-webkit-details-marker]:hidden">
                                                        <span>
                                                            {text(
                                                                'الخصم والضريبة والمخزون',
                                                                'Discount, tax & inventory',
                                                            )}
                                                        </span>

                                                        <ChevronDown
                                                            size={15}
                                                            className="transition group-open:rotate-180"
                                                        />
                                                    </summary>

                                                    <div className="grid gap-4 border-t border-[#eaf0f8] p-4 md:grid-cols-2 2xl:grid-cols-4">
                                                        <div className="rounded-[13px] border border-[#e5edf7] bg-white p-3 md:col-span-2 2xl:col-span-1">
                                                            <p className="text-[11px] font-semibold text-[#58739a]">
                                                                {text(
                                                                    'الخصم (اختياري)',
                                                                    'Discount (optional)',
                                                                )}
                                                            </p>

                                                            <div className="mt-2 grid grid-cols-2 gap-1 rounded-[10px] bg-[#f3f7fc] p-1">
                                                                {(
                                                                    [
                                                                        [
                                                                            'percent',
                                                                            text(
                                                                                'نسبة %',
                                                                                'Percent %',
                                                                            ),
                                                                        ],
                                                                        [
                                                                            'fixed',
                                                                            text(
                                                                                'مبلغ ثابت',
                                                                                'Fixed amount',
                                                                            ),
                                                                        ],
                                                                    ] as const
                                                                ).map(
                                                                    ([value, label]) => (
                                                                        <button
                                                                            key={value}
                                                                            type="button"
                                                                            onClick={() =>
                                                                                changeLine(
                                                                                    line.client_id,
                                                                                    {
                                                                                        discount_type:
                                                                                            value,
                                                                                        discount_value:
                                                                                            '0',
                                                                                        discount_percent:
                                                                                            '0',
                                                                                    },
                                                                                )
                                                                            }
                                                                            className={[
                                                                                'rounded-[8px] px-2.5 py-2 text-[10px] font-bold transition',
                                                                                line.discount_type ===
                                                                                value
                                                                                    ? 'bg-white text-[#1265d8] shadow-sm'
                                                                                    : 'text-[#7890b1] hover:text-[#49698f]',
                                                                            ].join(' ')}
                                                                        >
                                                                            {label}
                                                                        </button>
                                                                    ),
                                                                )}
                                                            </div>

                                                            <label className="mt-3 block text-[10px] font-semibold text-[#7890b1]">
                                                                {line.discount_type ===
                                                                'fixed'
                                                                    ? text(
                                                                        'قيمة الخصم',
                                                                        'Discount amount',
                                                                    )
                                                                    : text(
                                                                        'نسبة الخصم',
                                                                        'Discount percent',
                                                                    )}

                                                                <div className="mt-1 flex items-stretch">
                                                                    <input
                                                                        type="number"
                                                                        min="0"
                                                                        max={
                                                                            line.discount_type ===
                                                                            'percent'
                                                                                ? 100
                                                                                : (
                                                                                    row?.subtotal
                                                                                    ?? undefined
                                                                                )
                                                                        }
                                                                        step="0.01"
                                                                        dir="ltr"
                                                                        className={
                                                                            financeInput
                                                                            + ' !mt-0 min-w-0 flex-1 rounded-e-none text-start'
                                                                        }
                                                                        value={
                                                                            line.discount_value
                                                                        }
                                                                        onChange={
                                                                            event =>
                                                                                changeLine(
                                                                                    line.client_id,
                                                                                    {
                                                                                        discount_value:
                                                                                            event.target.value,
                                                                                        discount_percent:
                                                                                            line.discount_type ===
                                                                                            'percent'
                                                                                                ? event.target.value
                                                                                                : '0',
                                                                                    },
                                                                                )
                                                                        }
                                                                    />

                                                                    <span className="flex min-w-14 items-center justify-center rounded-e-[12px] border border-s-0 border-[#dbe6f5] bg-[#f8fbff] px-3 text-[10px] font-bold text-[#58739a]">
                                                                        {line.discount_type ===
                                                                        'fixed'
                                                                            ? currency
                                                                            : '%'}
                                                                    </span>
                                                                </div>
                                                            </label>
                                                        </div>

                                                        <label className="text-[11px] font-semibold text-[#58739a]">
                                                            {text(
                                                                'قاعدة الضريبة (اختياري)',
                                                                'Tax rule (optional)',
                                                            )}

                                                            <select
                                                                className={
                                                                    financeInput
                                                                    + ' mt-2'
                                                                }
                                                                value={
                                                                    line.tax_rule_id
                                                                    ?? ''
                                                                }
                                                                onChange={
                                                                    event =>
                                                                        selectTaxRule(
                                                                            line,
                                                                            event.target.value,
                                                                        )
                                                                }
                                                            >
                                                                <option value="">
                                                                    {text(
                                                                        'بدون ضريبة',
                                                                        'No tax',
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
                                                                            {rule.name}
                                                                            {' · '}
                                                                            {rule.rate}
                                                                            %
                                                                        </option>
                                                                    ),
                                                                )}
                                                            </select>
                                                        </label>

                                                        <div className="text-[11px] font-semibold text-[#58739a]">
                                                            {text(
                                                                'تأثير المخزون',
                                                                'Inventory impact',
                                                            )}

                                                            <label className="mt-2 flex min-h-11 items-center gap-3 rounded-[12px] border border-[#dbe6f5] bg-white px-3">
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
                                                                                        event.target.checked,
                                                                                    warehouse_id:
                                                                                        event.target.checked
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
                                                                    {line.affects_inventory
                                                                        ? text(
                                                                            'يؤثر على المخزون',
                                                                            'Affects inventory',
                                                                        )
                                                                        : text(
                                                                            'بدون حركة مخزون',
                                                                            'No stock movement',
                                                                        )}
                                                                </span>
                                                            </label>
                                                        </div>

                                                        {line.affects_inventory ? (
                                                            <label className="text-[11px] font-semibold text-[#58739a]">
                                                                {text(
                                                                    'المستودع *',
                                                                    'Warehouse *',
                                                                )}

                                                                <select
                                                                    className={
                                                                        financeInput
                                                                        + ' mt-2'
                                                                    }
                                                                    value={
                                                                        line.warehouse_id
                                                                        ?? ''
                                                                    }
                                                                    onChange={
                                                                        event =>
                                                                            changeLine(
                                                                                line.client_id,
                                                                                {
                                                                                    warehouse_id:
                                                                                        event.target.value
                                                                                            ? Number(
                                                                                                event.target.value,
                                                                                            )
                                                                                            : null,
                                                                                },
                                                                            )
                                                                    }
                                                                >
                                                                    <option value="">
                                                                        {text(
                                                                            'اختر المستودع',
                                                                            'Select warehouse',
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
                                                        ) : (
                                                            <div className="rounded-[12px] border border-dashed border-[#dbe6f5] bg-white px-3 py-3 text-[10px] leading-5 text-[#7890b1]">
                                                                {text(
                                                                    'المستودع يظهر فقط عندما يكون للبند تأثير على المخزون.',
                                                                    'Warehouse selection appears only when this line affects inventory.',
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </details>
                                            </div>
                                        </article>
                                    );
                                },
                            )}

                            <button
                                type="button"
                                className="flex w-full items-center justify-center gap-2 rounded-[16px] border border-dashed border-[#a9c8ee] bg-[#f8fbff] px-4 py-4 text-xs font-bold text-[#1265d8] transition hover:border-[#1265d8] hover:bg-[#eef5ff]"
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
                                <Plus size={15} />
                                {text(
                                    'إضافة بند آخر',
                                    'Add another line',
                                )}
                            </button>
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
