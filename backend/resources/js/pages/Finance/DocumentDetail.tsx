import { apiRequest } from '@/lib/http';
import { Link } from '@inertiajs/react';
import {
    AlertTriangle,
    ArrowLeftRight,
    Banknote,
    Building2,
    CalendarDays,
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
        sales
            ? lookups.permissions.cash_receive
            : lookups.permissions.cash_pay;

    async function correct(): Promise<void> {
        if (
            busy
            || ! canCorrect
        ) {
            return;
        }

        const reason =
            window.prompt(
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
        <div className="space-y-4">
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
