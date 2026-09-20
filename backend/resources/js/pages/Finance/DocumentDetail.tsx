import {
    RecordCollaborationPanel,
} from '@/components/data/RecordCollaborationPanel';
import { apiRequest } from '@/lib/http';
import { RecordQuickActions } from '@/components/data/RecordQuickActions';
import { Link } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowLeftRight,
    Banknote,
    Building2,
    CalendarDays,
    Copy,
    Download,
    FileText,
    Pencil,
    Printer,
    RotateCcw,
    ShieldCheck,
    Wallet,
    XCircle,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { DocumentForm } from './DocumentForm';
import { InvoiceAutomationActions } from './InvoiceAutomationActions';
import { FulfillmentPanel } from './FulfillmentPanel';
import {
    FPanel,
    FinanceHeader,
    Money,
    StatusBadge,
    apiErrorText,
    downloadCsv,
    financeButton,
    financePrimary,
} from './shared';
import type {
    AuditEvent,
    DocumentDetail as DocumentDetailType,
    FinanceLookups,
} from './types';

type AvailableCredit = {
    id: number;
    number: string;
    movement_date: string;
    method: string;
    amount: string;
    allocated: string;
    available: string;
    currency: string;
};

export function DocumentDetail({
    id,
    kind,
    lookups,
    ar,
}: {
    id: number;
    kind: 'sale_invoice' | 'purchase_invoice';
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (
        arabic: string,
        english: string,
    ): string => ar ? arabic : english;

    const sales =
        kind ===
        'sale_invoice';

    const [
        document,
        setDocument,
    ] = useState<DocumentDetailType | null>(
        null,
    );

    const [
        audit,
        setAudit,
    ] = useState<AuditEvent[]>(
        [],
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
        revision,
        setRevision,
    ] = useState(
        0,
    );

    const [
        availableCredits,
        setAvailableCredits,
    ] = useState<AvailableCredit[]>(
        [],
    );

    const canCashPermission =
        sales
            ? lookups.permissions.cash_receive
            : lookups.permissions.cash_pay;

    const canCopy =
        sales
            ? lookups.permissions.sales_manage
            : lookups.permissions.purchases_manage;

    useEffect(
        () => {
            const controller =
                new AbortController();

            setLoading(
                true,
            );

            setError(
                '',
            );

            apiRequest<{
                data:
                    DocumentDetailType;
                audit:
                    AuditEvent[];
            }>(
                '/api/finance/documents/'
                + id,
                {
                    signal:
                        controller.signal,
                },
            )
                .then(
                    response => {
                        setDocument(
                            response.data,
                        );

                        setAudit(
                            response.audit,
                        );

                        if (
                            canCashPermission
                            && Number(
                                response.data.balance_due,
                            ) > 0
                            && [
                                'issued',
                                'partially_paid',
                            ].includes(
                                response.data.status,
                            )
                        ) {
                            void apiRequest<{
                                data:
                                    AvailableCredit[];
                            }>(
                                '/api/finance/documents/'
                                + response.data.id
                                + '/available-credits',
                            )
                                .then(
                                    credits =>
                                        setAvailableCredits(
                                            credits.data,
                                        ),
                                )
                                .catch(
                                    () =>
                                        setAvailableCredits(
                                            [],
                                        ),
                                );
                        } else {
                            setAvailableCredits(
                                [],
                            );
                        }
                    },
                )
                .catch(
                    failure => {
                        if (
                            ! controller
                                .signal
                                .aborted
                        ) {
                            setError(
                                apiErrorText(
                                    failure,
                                ),
                            );
                        }
                    },
                )
                .finally(
                    () => {
                        if (
                            ! controller
                                .signal
                                .aborted
                        ) {
                            setLoading(
                                false,
                            );
                        }
                    },
                );

            return () =>
                controller.abort();
        },
        [
            id,
            revision,
            canCashPermission,
        ],
    );

    if (loading) {
        return (
            <div className="rounded-[18px] border border-[#dbe6f5] bg-white p-12 text-center text-sm text-slate-400">
                {text(
                    'جارٍ تحميل الفاتورة...',
                    'Loading invoice...',
                )}
            </div>
        );
    }

    if (
        error
        || ! document
    ) {
        return (
            <div className="rounded-[18px] border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                {error
                    || text(
                        'تعذر تحميل الفاتورة.',
                        'Invoice could not be loaded.',
                    )}
            </div>
        );
    }

    if (
        document.status ===
        'draft'
    ) {
        return (
            <DocumentForm
                kind={
                    kind
                }
                lookups={
                    lookups
                }
                ar={
                    ar
                }
                initial={
                    document
                }
            />
        );
    }

    const canCorrect =
        lookups.permissions.documents_correct
        && (
            sales
                ? lookups.permissions.sales_manage
                : lookups.permissions.purchases_manage
        );

    const canCash =
        canCashPermission;

    const hasEstimatedPrices =
        ! sales
        && document.lines.some(
            line =>
                line.price_status ===
                'estimated',
        );

    async function applyCredit(
        credit: AvailableCredit,
    ): Promise<void> {
        if (
            busy
            || ! canCash
        ) {
            return;
        }

        const amount =
            Math.min(
                Number(
                    credit.available,
                ) || 0,
                Number(
                    document.balance_due,
                ) || 0,
            );

        if (amount <= 0) {
            return;
        }

        if (
            ! window.confirm(
                text(
                    'استخدام '
                    + new Intl.NumberFormat().format(
                        amount,
                    )
                    + ' '
                    + document.currency
                    + ' من الرصيد المقدم '
                    + credit.number
                    + ' على هذه الفاتورة؟',
                    'Apply '
                    + new Intl.NumberFormat().format(
                        amount,
                    )
                    + ' '
                    + document.currency
                    + ' from advance '
                    + credit.number
                    + ' to this invoice?',
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
            await apiRequest(
                '/api/finance/documents/'
                + document.id
                + '/apply-credit',
                {
                    method:
                        'POST',

                    body:
                        JSON.stringify({
                            movement_id:
                                credit.id,
                            amount,
                        }),
                },
            );

            setRevision(
                value =>
                    value
                    + 1,
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

    async function correct(
        presetReason?: string,
    ): Promise<void> {
        if (
            busy
            || ! canCorrect
        ) {
            return;
        }

        const reason =
            presetReason
            ?? window.prompt(
                text(
                    'اكتب سبب التصحيح بوضوح. لن يتم حذف الفاتورة القديمة، وسيتم إنشاء مسودة تصحيح مرتبطة بها.',
                    'Enter a clear correction reason. The old invoice will remain and a linked correction draft will be created.',
                ),
            );

        if (
            ! reason
            || reason.trim().length <
                5
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
                        DocumentDetailType;
                }>(
                    '/api/finance/documents/'
                    + document.id
                    + '/correct',
                    {
                        method:
                            'POST',

                        body:
                            JSON.stringify({
                                reason:
                                    reason.trim(),
                            }),
                    },
                );

            window.location.assign(
                sales
                    ? '/app/invoices/sales/'
                        + response.data.id
                    : '/app/invoices/purchases/'
                        + response.data.id,
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

    async function voidDocument(): Promise<void> {
        if (
            busy
            || ! canCorrect
        ) {
            return;
        }

        const reason =
            window.prompt(
                text(
                    'سبب إلغاء الفاتورة؟ لا يمكن الإلغاء إذا عليها دفعات مؤكدة.',
                    'Reason for voiding? A document with posted allocations cannot be voided.',
                ),
            );

        if (
            ! reason
            || reason.trim().length <
                5
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
            await apiRequest(
                '/api/finance/documents/'
                + document.id
                + '/void',
                {
                    method:
                        'POST',

                    body:
                        JSON.stringify({
                            reason:
                                reason.trim(),
                        }),
                },
            );

            setRevision(
                value =>
                    value
                    + 1,
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

    function exportInvoice(): void {
        downloadCsv(
            document.number
            + '.csv',
            [
                [
                    text(
                        'الوصف',
                        'Description',
                    ),
                    text(
                        'SKU',
                        'SKU',
                    ),
                    text(
                        'الكمية',
                        'Quantity',
                    ),
                    text(
                        'سعر الوحدة',
                        'Unit price',
                    ),
                    text(
                        'الخصم',
                        'Discount',
                    ),
                    text(
                        'نوع الخصم',
                        'Discount type',
                    ),
                    text(
                        'الضريبة',
                        'Tax',
                    ),
                    text(
                        'الإجمالي',
                        'Total',
                    ),
                ],

                ...document.lines.map(
                    line => [
                        line.description,
                        line.sku,
                        line.quantity,
                        line.unit_price,
                        line.line_discount,
                        line.discount_type === 'fixed'
                            ? text('مبلغ ثابت', 'Fixed amount')
                            : String(line.discount_value) + '%',
                        line.line_tax,
                        line.line_total,
                    ],
                ),
            ],
        );
    }

    const cashHref =
        sales
            ? '/app/receipts/create?document_id='
                + document.id
            : '/app/payments/create?document_id='
                + document.id;

    return (
        <>
            <div className="space-y-4 print:hidden">
            <FinanceHeader
                title={
                    (
                        sales
                            ? text(
                                'فاتورة بيع ',
                                'Sales invoice ',
                            )
                            : text(
                                'فاتورة شراء ',
                                'Purchase invoice ',
                            )
                    )
                    + document.number
                }
                subtitle={text(
                    'التفاصيل المالية، البنود، التحصيل أو السداد، وسجل التصحيحات والتغييرات.',
                    'Financial detail, line items, collections or payments, corrections and audit history.',
                )}
                actions={
                    <>
                        <RecordQuickActions
                            recordKey={(sales ? 'sale-invoice-' : 'purchase-invoice-') + String(document.id)}
                            kind={sales ? 'sale_invoice' : 'purchase_invoice'}
                            label={document.number}
                            detail={[
                                document.party?.name,
                                document.total + ' ' + document.currency,
                            ].filter(Boolean).join(' · ')}
                            href={
                                (sales
                                    ? '/app/invoices/sales/'
                                    : '/app/invoices/purchases/')
                                + String(document.id)
                            }
                            ar={ar}
                        />

                        <InvoiceAutomationActions
                            documentId={document.id}
                            ar={ar}
                            canManage={canCopy}
                            onError={setError}
                        />

                        {canCopy && (
                            <Link
                                href={
                                    (sales
                                        ? '/app/invoices/sales/create?copy_from='
                                        : '/app/invoices/purchases/create?copy_from=')
                                    + String(document.id)
                                }
                                className={financeButton}
                            >
                                <Copy size={15} />
                                {text('نسخ الفاتورة', 'Copy invoice')}
                            </Link>
                        )}

                        <button
                            type="button"
                            className={
                                financeButton
                            }
                            onClick={
                                exportInvoice
                            }
                        >
                            <Download
                                size={
                                    15
                                }
                            />

                            {text(
                                'تصدير',
                                'Export',
                            )}
                        </button>

                        <button
                            type="button"
                            className={
                                financeButton
                            }
                            onClick={() =>
                                window.print()
                            }
                        >
                            <Printer
                                size={
                                    15
                                }
                            />

                            {text(
                                'طباعة',
                                'Print',
                            )}
                        </button>

                        {hasEstimatedPrices
                            && canCorrect
                            && inActiveStatus(
                                document.status,
                            ) && (
                            <button
                                type="button"
                                className={
                                    financePrimary
                                }
                                disabled={
                                    busy
                                }
                                onClick={() =>
                                    void correct(
                                        text(
                                            'تثبيت الأسعار النهائية لبنود الشراء التي سُجلت بسعر مبدئي.',
                                            'Finalize purchase lines that were recorded with provisional prices.',
                                        ),
                                    )
                                }
                            >
                                <Pencil
                                    size={
                                        15
                                    }
                                />

                                {text(
                                    'تثبيت أسعار الشراء',
                                    'Finalize purchase prices',
                                )}
                            </button>
                        )}

                        {canCorrect
                            && inActiveStatus(
                                document.status,
                            ) && (
                            <button
                                type="button"
                                className={
                                    financeButton
                                }
                                disabled={
                                    busy
                                }
                                onClick={() =>
                                    void correct()
                                }
                            >
                                <Pencil
                                    size={
                                        15
                                    }
                                />

                                {text(
                                    'تصحيح',
                                    'Correct',
                                )}
                            </button>
                        )}

                        {canCorrect
                            && [
                                'issued',
                                'partially_paid',
                            ].includes(
                                document.status,
                            ) && (
                            <button
                                type="button"
                                className={
                                    financeButton
                                    + ' !text-red-600'
                                }
                                disabled={
                                    busy
                                }
                                onClick={() =>
                                    void voidDocument()
                                }
                            >
                                <XCircle
                                    size={
                                        15
                                    }
                                />

                                {text(
                                    'إلغاء',
                                    'Void',
                                )}
                            </button>
                        )}

                        {canCash
                            && Number(
                                document.balance_due,
                            ) > 0
                            && inActiveStatus(
                                document.status,
                            ) && (
                            <Link
                                href={
                                    cashHref
                                }
                                className={
                                    financePrimary
                                }
                            >
                                <Banknote
                                    size={
                                        15
                                    }
                                />

                                {sales
                                    ? text(
                                        'تحصيل دفعة',
                                        'Collect payment',
                                    )
                                    : text(
                                        'تسجيل دفع',
                                        'Record payment',
                                    )}
                            </Link>
                        )}
                    </>
                }
            />

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

            {document.correction_reason && (
                <div className="rounded-[14px] border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
                    <strong>
                        {text(
                            'سبب التصحيح:',
                            'Correction reason:',
                        )}
                    </strong>{' '}
                    {
                        document.correction_reason
                    }
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <InfoCard
                    label={text(
                        'الحالة',
                        'Status',
                    )}
                >
                    <StatusBadge
                        status={
                            document.status
                        }
                        ar={
                            ar
                        }
                    />
                </InfoCard>

                <InfoCard
                    label={
                        sales
                            ? text(
                                'العميل',
                                'Customer',
                            )
                            : text(
                                'المورد',
                                'Supplier',
                            )
                    }
                >
                    {
                        document.party?.name
                        ?? '—'
                    }
                </InfoCard>

                <InfoCard
                    label={text(
                        'تاريخ الإصدار',
                        'Issue date',
                    )}
                >
                    {
                        document.issue_date
                    }
                </InfoCard>

                <InfoCard
                    label={text(
                        'الاستحقاق',
                        'Due date',
                    )}
                >
                    {
                        document.due_date
                        ?? '—'
                    }
                </InfoCard>

                <InfoCard
                    label={text(
                        'النشاط والسوق',
                        'Activity & market',
                    )}
                >
                    {
                        document.activity_type
                        ?? '—'
                    }
                    {' · '}
                    {
                        document.market_type
                        ?? '—'
                    }
                </InfoCard>
            </div>

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_310px]">
                <div className="space-y-4">
                    <FPanel
                        title={text(
                            'بنود الفاتورة',
                            'Invoice lines',
                        )}
                        icon={
                            FileText
                        }
                    >
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] text-xs">
                                <thead className="bg-[#f7faff] text-[#7188aa]">
                                    <tr>
                                        {[
                                            '#',
                                            text(
                                                'المنتج / الخدمة',
                                                'Product / service',
                                            ),
                                            'SKU',
                                            text(
                                                'الكمية',
                                                'Quantity',
                                            ),
                                            text(
                                                'سعر الوحدة',
                                                'Unit price',
                                            ),
                                            text(
                                                'الخصم',
                                                'Discount',
                                            ),
                                            text(
                                                'الضريبة',
                                                'Tax',
                                            ),
                                            text(
                                                'الإجمالي',
                                                'Total',
                                            ),
                                            text(
                                                'المخزون',
                                                'Inventory',
                                            ),
                                        ].map(
                                            label => (
                                                <th
                                                    key={
                                                        label
                                                    }
                                                    className="px-3 py-3 text-start font-semibold"
                                                >
                                                    {
                                                        label
                                                    }
                                                </th>
                                            ),
                                        )}
                                    </tr>
                                </thead>

                                <tbody>
                                    {document.lines.map(
                                        (
                                            line,
                                            index,
                                        ) => (
                                            <tr
                                                key={
                                                    line.id
                                                    ?? index
                                                }
                                                className="border-t border-[#edf3fa]"
                                            >
                                                <td className="px-3 py-3">
                                                    {index
                                                        + 1}
                                                </td>

                                                <td className="px-3 py-3 font-semibold text-[#173f78]">
                                                    {
                                                        line.description
                                                    }
                                                </td>

                                                <td className="px-3 py-3">
                                                    {
                                                        line.sku
                                                        ?? '—'
                                                    }
                                                </td>

                                                <td className="px-3 py-3">
                                                    {
                                                        line.quantity
                                                    }{' '}
                                                    {
                                                        line.unit
                                                    }
                                                </td>

                                                <td className="px-3 py-3">
                                                    <Money
                                                        value={
                                                            line.unit_price
                                                        }
                                                        currency={
                                                            document.currency
                                                        }
                                                        compact
                                                    />

                                                    {! sales && (
                                                        <span
                                                            className={[
                                                                'mt-1 inline-flex rounded-full px-2 py-0.5 text-[9px] font-semibold',
                                                                line.price_status === 'estimated'
                                                                    ? 'bg-amber-50 text-amber-700'
                                                                    : 'bg-emerald-50 text-emerald-700',
                                                            ].join(' ')}
                                                        >
                                                            {line.price_status === 'estimated'
                                                                ? text('سعر مبدئي', 'Provisional')
                                                                : text('سعر نهائي', 'Final')}
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="px-3 py-3 text-red-500">
                                                    <Money
                                                        value={
                                                            line.line_discount
                                                            ?? 0
                                                        }
                                                        currency={
                                                            document.currency
                                                        }
                                                        compact
                                                    />

                                                    {Number(
                                                        line.line_discount
                                                        ?? 0,
                                                    ) > 0 && (
                                                        <span className="mt-1 block text-[9px] font-medium text-slate-400">
                                                            {line.discount_type ===
                                                            'fixed'
                                                                ? text(
                                                                    'مبلغ ثابت',
                                                                    'Fixed amount',
                                                                )
                                                                : (
                                                                    String(
                                                                        line.discount_value,
                                                                    )
                                                                    + '%'
                                                                )}
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="px-3 py-3">
                                                    <Money
                                                        value={
                                                            line.line_tax
                                                            ?? 0
                                                        }
                                                        currency={
                                                            document.currency
                                                        }
                                                        compact
                                                    />
                                                    <span className="ms-1 text-[9px] text-slate-400">
                                                        {
                                                            line.tax_rate
                                                        }
                                                        %
                                                    </span>
                                                </td>

                                                <td className="px-3 py-3 font-bold text-[#123d78]">
                                                    <Money
                                                        value={
                                                            line.line_total
                                                            ?? 0
                                                        }
                                                        currency={
                                                            document.currency
                                                        }
                                                        compact
                                                    />
                                                </td>

                                                <td className="px-3 py-3">
                                                    {line.affects_inventory
                                                        ? text(
                                                            'نعم',
                                                            'Yes',
                                                        )
                                                        : text(
                                                            'لا',
                                                            'No',
                                                        )}
                                                </td>
                                            </tr>
                                        ),
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </FPanel>

                    {availableCredits.length > 0 && (
                        <FPanel
                            title={
                                sales
                                    ? text(
                                        'رصيد مقدم متاح للعميل',
                                        'Available customer advance',
                                    )
                                    : text(
                                        'دفعة مقدمة متاحة للمورد',
                                        'Available supplier advance',
                                    )
                            }
                            icon={
                                Wallet
                            }
                        >
                            <div className="space-y-2 p-4">
                                <p className="text-xs leading-5 text-slate-500">
                                    {text(
                                        'هذه مبالغ دُفعت سابقاً ولم تُخصص بالكامل. يمكنك استخدامها على هذه الفاتورة بدون تسجيل قبض أو دفع جديد.',
                                        'These are previously posted amounts that were not fully allocated. Apply them here without recording new cash.',
                                    )}
                                </p>

                                {availableCredits.map(
                                    credit => (
                                        <div
                                            key={
                                                credit.id
                                            }
                                            className="flex flex-col gap-3 rounded-[12px] border border-emerald-100 bg-emerald-50/60 p-3 sm:flex-row sm:items-center sm:justify-between"
                                        >
                                            <div className="text-xs">
                                                <strong className="text-[#123d78]">
                                                    {
                                                        credit.number
                                                    }
                                                </strong>

                                                <p className="mt-1 text-[10px] text-slate-500">
                                                    {
                                                        credit.movement_date
                                                    }
                                                    {' · '}
                                                    {
                                                        credit.method
                                                    }
                                                </p>

                                                <p className="mt-1 font-semibold text-emerald-700">
                                                    {text(
                                                        'المتاح: ',
                                                        'Available: ',
                                                    )}
                                                    <Money
                                                        value={
                                                            credit.available
                                                        }
                                                        currency={
                                                            credit.currency
                                                        }
                                                        compact
                                                    />
                                                </p>
                                            </div>

                                            <button
                                                type="button"
                                                className={
                                                    financePrimary
                                                }
                                                disabled={
                                                    busy
                                                }
                                                onClick={() =>
                                                    void applyCredit(
                                                        credit,
                                                    )
                                                }
                                            >
                                                {text(
                                                    'استخدام الرصيد',
                                                    'Apply credit',
                                                )}
                                            </button>
                                        </div>
                                    ),
                                )}
                            </div>
                        </FPanel>
                    )}

                    <div className="grid gap-4 lg:grid-cols-2">
                        <FPanel
                            title={
                                sales
                                    ? text(
                                        'المدفوعات المرتبطة بالفاتورة',
                                        'Payments linked to invoice',
                                    )
                                    : text(
                                        'السداد المرتبط بالفاتورة',
                                        'Payments linked to invoice',
                                    )
                            }
                            icon={
                                Wallet
                            }
                        >
                            <div className="p-4">
                                {document.allocations.length
                                    ? (
                                        <div className="space-y-2">
                                            {document.allocations.map(
                                                allocation => (
                                                    <div
                                                        key={
                                                            allocation.id
                                                        }
                                                        className="flex items-center justify-between gap-3 rounded-[12px] bg-[#f7faff] p-3 text-xs"
                                                    >
                                                        <div>
                                                            <strong className="text-[#1265d8]">
                                                                {
                                                                    allocation.cash_number
                                                                }
                                                            </strong>

                                                            <p className="mt-1 text-[10px] text-slate-400">
                                                                {
                                                                    allocation.movement_date
                                                                }
                                                                {' · '}
                                                                {
                                                                    allocation.method
                                                                }
                                                            </p>
                                                        </div>

                                                        <Money
                                                            value={
                                                                allocation.amount
                                                            }
                                                            currency={
                                                                document.currency
                                                            }
                                                        />
                                                    </div>
                                                ),
                                            )}
                                        </div>
                                    )
                                    : (
                                        <p className="text-xs text-slate-400">
                                            {text(
                                                'لا توجد حركات نقدية مرتبطة بعد.',
                                                'No linked cash movements yet.',
                                            )}
                                        </p>
                                    )}
                            </div>
                        </FPanel>

                        <FPanel
                            title={text(
                                'سجل التدقيق',
                                'Audit trail',
                            )}
                            icon={
                                ShieldCheck
                            }
                        >
                            <div className="max-h-72 space-y-3 overflow-y-auto p-4">
                                {audit.length
                                    ? audit.map(
                                        event => (
                                            <div
                                                key={
                                                    event.id
                                                }
                                                className="border-s border-blue-200 ps-3 text-xs"
                                            >
                                                <strong className="text-[#173f78]">
                                                    {
                                                        event.action
                                                    }
                                                </strong>

                                                <p className="mt-1 text-[10px] text-slate-400">
                                                    {
                                                        event.created_at
                                                        ?? '—'
                                                    }
                                                </p>

                                                {event.reason && (
                                                    <p className="mt-1 text-[10px] leading-5 text-slate-500">
                                                        {
                                                            event.reason
                                                        }
                                                    </p>
                                                )}
                                            </div>
                                        ),
                                    )
                                    : (
                                        <p className="text-xs text-slate-400">
                                            {text(
                                                'لا يوجد سجل بعد.',
                                                'No audit events yet.',
                                            )}
                                        </p>
                                    )}
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
                                    'Customer information',
                                )
                                : text(
                                    'معلومات المورد',
                                    'Supplier information',
                                )
                        }
                        icon={
                            Building2
                        }
                    >
                        <div className="space-y-2 p-4 text-xs">
                            <strong className="block text-base text-[#123d78]">
                                {
                                    document.party_detail
                                        ?.name
                                    ?? '—'
                                }
                            </strong>

                            <p className="text-slate-500">
                                {
                                    document.party_detail
                                        ?.phone
                                    ?? '—'
                                }
                            </p>

                            <p className="text-slate-500">
                                {
                                    document.party_detail
                                        ?.email
                                    ?? '—'
                                }
                            </p>

                            <p className="text-slate-500">
                                {
                                    document.party_detail
                                        ?.tax_number
                                    ?? '—'
                                }
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
                            <SummaryLine
                                label={text(
                                    'المجموع الفرعي',
                                    'Subtotal',
                                )}
                                value={
                                    document.subtotal
                                }
                                currency={
                                    document.currency
                                }
                            />

                            <SummaryLine
                                label={text(
                                    'الخصم',
                                    'Discount',
                                )}
                                value={
                                    document.discount_total
                                }
                                currency={
                                    document.currency
                                }
                                className="text-red-500"
                            />

                            <SummaryLine
                                label={text(
                                    'الضريبة',
                                    'Tax',
                                )}
                                value={
                                    document.tax_total
                                }
                                currency={
                                    document.currency
                                }
                            />

                            <SummaryLine
                                label={text(
                                    'الشحن',
                                    'Shipping',
                                )}
                                value={
                                    document.shipping_total
                                }
                                currency={
                                    document.currency
                                }
                            />

                            <div className="border-t border-[#e6eef8] pt-3">
                                <SummaryLine
                                    label={text(
                                        'إجمالي الفاتورة',
                                        'Invoice total',
                                    )}
                                    value={
                                        document.total
                                    }
                                    currency={
                                        document.currency
                                    }
                                    className="text-[#1265d8]"
                                    strong
                                />
                            </div>

                            <SummaryLine
                                label={sales
                                    ? text(
                                        'المبلغ المحصل',
                                        'Collected',
                                    )
                                    : text(
                                        'المبلغ المدفوع',
                                        'Paid',
                                    )}
                                value={
                                    document.paid_total
                                }
                                currency={
                                    document.currency
                                }
                                className="text-emerald-600"
                            />

                            <SummaryLine
                                label={text(
                                    'المتبقي',
                                    'Outstanding',
                                )}
                                value={
                                    document.balance_due
                                }
                                currency={
                                    document.currency
                                }
                                className="text-red-600"
                            />

                            {Number(
                                document.credit_total,
                            ) > 0 && (
                                <SummaryLine
                                    label={text(
                                        'رصيد دائن',
                                        'Credit',
                                    )}
                                    value={
                                        document.credit_total
                                    }
                                    currency={
                                        document.currency
                                    }
                                    className="text-violet-600"
                                />
                            )}
                        </div>
                    </FPanel>

                    {document.warnings.length > 0 && (
                        <div className="rounded-[18px] border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-800">
                            <div className="flex items-center gap-2 font-bold">
                                <AlertTriangle
                                    size={
                                        16
                                    }
                                />

                                {text(
                                    'تنبيهات الأسعار',
                                    'Price warnings',
                                )}
                            </div>

                            <ul className="mt-2 space-y-1">
                                {document.warnings.map(
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
                        </div>
                    )}

                    {document.corrected_from_id && (
                        <div className="rounded-[18px] border border-violet-200 bg-violet-50 p-4 text-xs leading-5 text-violet-800">
                            <div className="flex items-center gap-2 font-bold">
                                <ArrowLeftRight
                                    size={
                                        15
                                    }
                                />

                                {text(
                                    'نسخة تصحيح',
                                    'Correction revision',
                                )}
                            </div>

                            <p className="mt-2">
                                {text(
                                    'هذه النسخة مرتبطة بالمستند الأصلي رقم ',
                                    'This revision is linked to source document #',
                                )}
                                {
                                    document.corrected_from_id
                                }
                                .
                            </p>
                        </div>
                    )}
                </aside>
            </div>

            <FulfillmentPanel
                documentId={document.id}
                canManage={canCopy}
                ar={ar}
            />

            <RecordCollaborationPanel
                type="document"
                recordId={document.id}
                ar={ar}
                title={text(
                    'تعليقات ومرفقات الفاتورة',
                    'Invoice comments & attachments',
                )}
            />
        </div>

            <InvoicePrintView
                document={document}
                lookups={lookups}
                ar={ar}
            />
        </>
    );
}

function InvoicePrintView({
    document,
    lookups,
    ar,
}: {
    document: DocumentDetailType;
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;
    const invoice = lookups.settings.invoice;
    const organization = lookups.settings.organization;
    const columns = invoice.columns;
    const paperSize = invoice.paper_size === 'letter'
        ? 'Letter'
        : 'A4';
    const margin = invoice.margins === 'compact'
        ? '8mm'
        : '14mm';

    const template =
        document.kind === 'purchase_invoice'
            ? invoice.purchase_template
            : invoice.template;
    const accentColor = invoice.accent_color || '#2563EB';

    const templateClass = {
        professional: 'border-t-[6px]',
        classic: 'border-t-2 border-slate-800',
        modern: 'border-s-8',
        simple: '',
    }[template];

    const templateStyle =
        template === 'professional'
            ? { borderTopColor: accentColor }
            : template === 'modern'
                ? { borderInlineStartColor: accentColor }
                : undefined;

    const headerAlignment = invoice.logo_position === 'center'
        ? 'items-center text-center'
        : invoice.logo_position === 'end'
            ? 'items-end text-end'
            : 'items-start text-start';

    return (
        <div
            dir={ar ? 'rtl' : 'ltr'}
            className="ac-invoice-print hidden bg-white text-[#172b4d] print:block"
        >
            <style>
                {[
                    '@media print {',
                    '@page { size: ' + paperSize + '; margin: ' + margin + '; }',
                    'html, body { background: white !important; }',
                    'body * { visibility: hidden !important; }',
                    '.ac-invoice-print, .ac-invoice-print * { visibility: visible !important; }',
                    '.ac-invoice-print { display: block !important; position: absolute !important; inset: 0 !important; width: 100% !important; }',
                    '}',
                ].join(' ')}
            </style>

            <article
                className={['mx-auto bg-white p-2', templateClass].join(' ')}
                style={templateStyle}
            >
                <header className={['flex flex-col gap-3', headerAlignment].join(' ')}>
                    {invoice.show_logo && (
                        <div>
                            {organization.logo_url && (
                                <img
                                    src={organization.logo_url}
                                    alt={organization.trade_name || organization.name}
                                    className="mb-2 max-h-16 max-w-[180px] object-contain"
                                />
                            )}
                            <div
                                className="text-2xl font-extrabold"
                                style={{ color: accentColor }}
                            >
                                {organization.trade_name || organization.name}
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                                {organization.legal_name}
                            </div>
                        </div>
                    )}

                    {invoice.show_contact && (
                        <div className="text-[10px] leading-5 text-slate-500">
                            {[organization.address, organization.city, organization.country]
                                .filter(Boolean)
                                .join(' · ')}
                            {(organization.phone || organization.support_email) && <br />}
                            {[organization.phone, organization.support_email, organization.website]
                                .filter(Boolean)
                                .join(' · ')}
                            {organization.commercial_registration && (
                                <>
                                    <br />
                                    {text('السجل التجاري', 'Registration')}: {organization.commercial_registration}
                                </>
                            )}
                        </div>
                    )}

                    {invoice.show_tax_number && organization.vat_number && (
                        <div className="text-[10px] text-slate-500">
                            {text('الرقم الضريبي', 'VAT')}: {organization.vat_number}
                        </div>
                    )}
                </header>

                <div className="my-5 flex items-end justify-between gap-4 border-b border-slate-200 pb-4">
                    <div>
                        <h1 className="text-xl font-bold">
                            {document.kind === 'sale_invoice'
                                ? text('فاتورة بيع', 'Sales invoice')
                                : text('فاتورة شراء', 'Purchase invoice')}
                        </h1>
                        <p className="mt-1 text-xs text-slate-500">
                            {document.number}
                        </p>
                    </div>
                    <div className="text-end text-[10px] leading-5 text-slate-500">
                        <div>{text('تاريخ الإصدار', 'Issue date')}: {document.issue_date}</div>
                        {document.due_date && (
                            <div>{text('تاريخ الاستحقاق', 'Due date')}: {document.due_date}</div>
                        )}
                    </div>
                </div>

                <div className="mb-5 rounded-lg bg-slate-50 p-3 text-[10px] leading-5">
                    <strong className="block text-xs text-slate-700">
                        {document.party?.name ?? text('بدون طرف', 'No party')}
                    </strong>
                    {document.party_detail?.tax_number && (
                        <span className="text-slate-500">
                            {text('الرقم الضريبي', 'Tax number')}: {document.party_detail.tax_number}
                        </span>
                    )}
                </div>

                <table className="w-full border-collapse text-[10px]">
                    <thead>
                        <tr className="border-y border-slate-200 bg-slate-50">
                            {columns.includes('sku') && <th className="px-2 py-2 text-start">{text('الصنف', 'SKU')}</th>}
                            {columns.includes('description') && <th className="px-2 py-2 text-start">{text('الوصف', 'Description')}</th>}
                            {columns.includes('quantity') && <th className="px-2 py-2 text-start">{text('الكمية', 'Qty')}</th>}
                            {columns.includes('unit_price') && <th className="px-2 py-2 text-start">{text('سعر الوحدة', 'Unit price')}</th>}
                            {columns.includes('discount') && <th className="px-2 py-2 text-start">{text('الخصم', 'Discount')}</th>}
                            {columns.includes('tax') && <th className="px-2 py-2 text-start">{text('الضريبة', 'Tax')}</th>}
                            {columns.includes('total') && <th className="px-2 py-2 text-start">{text('الإجمالي', 'Total')}</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {document.lines.map((line) => (
                            <tr key={line.id ?? line.description} className="border-b border-slate-100">
                                {columns.includes('sku') && <td className="px-2 py-2">{line.sku || '—'}</td>}
                                {columns.includes('description') && <td className="px-2 py-2">{line.description}</td>}
                                {columns.includes('quantity') && <td className="px-2 py-2">{line.quantity} {line.unit}</td>}
                                {columns.includes('unit_price') && <td className="px-2 py-2"><Money value={line.unit_price} currency={document.currency} compact /></td>}
                                {columns.includes('discount') && <td className="px-2 py-2"><Money value={line.line_discount ?? 0} currency={document.currency} compact /></td>}
                                {columns.includes('tax') && <td className="px-2 py-2"><Money value={line.line_tax ?? 0} currency={document.currency} compact /></td>}
                                {columns.includes('total') && <td className="px-2 py-2 font-semibold"><Money value={line.line_total ?? 0} currency={document.currency} compact /></td>}
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="mt-5 ms-auto w-full max-w-[320px] space-y-2 text-[10px]">
                    <SummaryLine label={text('المجموع الفرعي', 'Subtotal')} value={document.subtotal} currency={document.currency} />
                    <SummaryLine label={text('الخصم', 'Discount')} value={document.discount_total} currency={document.currency} />
                    <SummaryLine label={text('الضريبة', 'Tax')} value={document.tax_total} currency={document.currency} />
                    <SummaryLine label={text('الشحن', 'Shipping')} value={document.shipping_total} currency={document.currency} />
                    <div className="border-t border-slate-300 pt-2">
                        <SummaryLine label={text('الإجمالي', 'Total')} value={document.total} currency={document.currency} strong />
                    </div>
                </div>

                {invoice.show_notes && document.notes && (
                    <div className="mt-6 rounded-lg border border-slate-200 p-3 text-[10px] leading-5">
                        <strong>{text('ملاحظات', 'Notes')}</strong>
                        <p className="mt-1 whitespace-pre-wrap text-slate-600">{document.notes}</p>
                    </div>
                )}

                {organization.invoice_footer && (
                    <footer className="mt-8 border-t border-slate-200 pt-4 text-center text-[9px] leading-5 text-slate-500">
                        {organization.invoice_footer}
                    </footer>
                )}
            </article>
        </div>
    );
}

function inActiveStatus(
    status: string,
): boolean {
    return [
        'issued',
        'partially_paid',
        'paid',
        'overpaid',
    ].includes(
        status,
    );
}

function InfoCard({
    label,
    children,
}: {
    label: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-[16px] border border-[#dbe6f5] bg-white p-4">
            <p className="text-[10px] text-slate-400">
                {
                    label
                }
            </p>

            <div className="mt-2 text-sm font-semibold text-[#163d77]">
                {
                    children
                }
            </div>
        </div>
    );
}

function SummaryLine({
    label,
    value,
    currency,
    className = '',
    strong = false,
}: {
    label: string;
    value: string;
    currency: string;
    className?: string;
    strong?: boolean;
}) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-slate-500">
                {
                    label
                }
            </span>

            <span
                className={
                    (
                        strong
                            ? 'text-base font-bold '
                            : 'font-semibold '
                    )
                    + className
                }
            >
                <Money
                    value={
                        value
                    }
                    currency={
                        currency
                    }
                />
            </span>
        </div>
    );
}
