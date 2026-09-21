import { apiRequest } from '@/lib/http';
import { AppShell } from '@/layouts/AppShell';
import { useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import {
    Head,
    Link,
    usePage,
} from '@inertiajs/react';
import {
    Check,
    ClipboardList,
    FilePlus2,
    Plus,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type RequisitionRow = {
    id: number;
    number: string;
    product_id: number | null;
    product_name: string | null;
    sku: string | null;
    description: string;
    quantity: string;
    expected_unit_cost: string | null;
    preferred_supplier_id: number | null;
    supplier_name: string | null;
    needed_by: string | null;
    status: string;
    note: string | null;
    requested_by_name: string | null;
    reviewed_by_name: string | null;
    converted_document_id: number | null;
    converted_document_number: string | null;
    created_at: string;
};

type OptionProduct = {
    id: number;
    name: string;
    sku: string | null;
    unit: string | null;
    cost_price: string | null;
    track_inventory: boolean;
};

type ReqResponse = {
    data: RequisitionRow[];
    options: {
        products: OptionProduct[];
        suppliers: Array<{
            id: number;
            name: string;
        }>;
    };
};

export default function PurchaseRequisitions() {
    const ar = useLocale() === 'ar';
    const {
        workspace,
    } = usePage<AppPageProps>().props;
    const activeOrganization =
        workspace.activeOrganization;
    const role =
        activeOrganization?.role
        ?? '';
    const canReview =
        activeOrganization?.permissions
            ? activeOrganization.permissions.includes(
                'finance.purchases.manage',
            )
            : [
                'owner',
                'admin',
                'manager',
                'accountant',
            ].includes(role);

    const [
        response,
        setResponse,
    ] = useState<ReqResponse | null>(
        null,
    );
    const [
        status,
        setStatus,
    ] = useState('all');
    const [
        productId,
        setProductId,
    ] = useState('');
    const [
        description,
        setDescription,
    ] = useState('');
    const [
        quantity,
        setQuantity,
    ] = useState('1');
    const [
        expectedCost,
        setExpectedCost,
    ] = useState('');
    const [
        supplierId,
        setSupplierId,
    ] = useState('');
    const [
        neededBy,
        setNeededBy,
    ] = useState('');
    const [
        note,
        setNote,
    ] = useState('');
    const [
        busy,
        setBusy,
    ] = useState(false);
    const [
        loading,
        setLoading,
    ] = useState(true);
    const [
        error,
        setError,
    ] = useState('');

    const text = (
        arabic: string,
        english: string,
    ): string =>
        ar
            ? arabic
            : english;

    async function load(): Promise<void> {
        setLoading(true);
        setError('');

        try {
            const next =
                await apiRequest<ReqResponse>(
                    '/api/purchase-requisitions?status='
                    + encodeURIComponent(
                        status,
                    ),
                );

            setResponse(next);
        } catch {
            setError(
                text(
                    'تعذر تحميل طلبات الشراء.',
                    'Purchase requisitions could not be loaded.',
                ),
            );
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [
        status,
    ]);

    const selectedProduct =
        useMemo(
            () =>
                response?.options.products.find(
                    item =>
                        String(
                            item.id,
                        ) ===
                        productId,
                )
                ?? null,
            [
                response,
                productId,
            ],
        );

    function selectProduct(
        value: string,
    ): void {
        setProductId(
            value,
        );

        const product =
            response?.options.products.find(
                item =>
                    String(
                        item.id,
                    ) ===
                    value,
            );

        if (product) {
            setDescription(
                product.name,
            );

            if (
                product.cost_price
            ) {
                setExpectedCost(
                    product.cost_price,
                );
            }
        }
    }

    async function create(): Promise<void> {
        if (
            busy
            || ! description.trim()
            || Number(
                quantity,
            ) <= 0
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/purchase-requisitions',
                {
                    method:
                        'POST',
                    body:
                        JSON.stringify(
                            {
                                product_id:
                                    productId
                                        ? Number(
                                            productId,
                                        )
                                        : null,
                                description:
                                    description.trim(),
                                quantity,
                                expected_unit_cost:
                                    expectedCost
                                        || null,
                                preferred_supplier_id:
                                    supplierId
                                        ? Number(
                                            supplierId,
                                        )
                                        : null,
                                needed_by:
                                    neededBy
                                    || null,
                                note:
                                    note.trim()
                                    || null,
                            },
                        ),
                },
            );

            setProductId('');
            setDescription('');
            setQuantity('1');
            setExpectedCost('');
            setSupplierId('');
            setNeededBy('');
            setNote('');
            await load();
        } catch {
            setError(
                text(
                    'تعذر إنشاء طلب الشراء.',
                    'Purchase requisition could not be created.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function review(
        id: number,
        decision:
            | 'approved'
            | 'rejected',
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/purchase-requisitions/'
                + String(
                    id,
                )
                + '/review',
                {
                    method:
                        'PATCH',
                    body:
                        JSON.stringify(
                            {
                                decision,
                            },
                        ),
                },
            );

            await load();
        } catch {
            setError(
                text(
                    'تعذر تسجيل القرار.',
                    'Decision could not be saved.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function convert(
        id: number,
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            const result =
                await apiRequest<{
                    data: {
                        document_id: number;
                    };
                }>(
                    '/api/purchase-requisitions/'
                    + String(
                        id,
                    )
                    + '/convert',
                    {
                        method:
                            'POST',
                    },
                );

            window.location.assign(
                '/app/invoices/purchases/'
                + String(
                    result.data
                        .document_id,
                ),
            );
        } catch {
            setError(
                text(
                    'تعذر إنشاء مسودة فاتورة الشراء. تأكد من تحديد المنتج والمورد.',
                    'Purchase invoice draft could not be created. Make sure product and supplier are set.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    return (
        <AppShell>
            <Head
                title={
                    text(
                        'طلبات الشراء — AccoNova',
                        'Purchase Requisitions — AccoNova',
                    )
                }
            />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <ClipboardList
                                size={
                                    18
                                }
                            />
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                                {text(
                                    'طلبات الشراء',
                                    'Purchase requisitions',
                                )}
                            </h1>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-soft)]">
                                {text(
                                    'الموظف يطلب المادة أولاً، ثم تتم الموافقة، وبعدها فقط يمكن تحويل الطلب إلى مسودة فاتورة شراء للمراجعة.',
                                    'Request the item first, approve it, then convert the approved request into a purchase invoice draft for review.',
                                )}
                            </p>
                        </div>
                    </div>

                    <select
                        value={
                            status
                        }
                        onChange={
                            event =>
                                setStatus(
                                    event
                                        .target
                                        .value,
                                )
                        }
                        className="h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs"
                    >
                        <option value="all">
                            {text(
                                'الكل',
                                'All',
                            )}
                        </option>
                        <option value="pending">
                            {text(
                                'بانتظار الموافقة',
                                'Pending',
                            )}
                        </option>
                        <option value="approved">
                            {text(
                                'موافق عليه',
                                'Approved',
                            )}
                        </option>
                        <option value="rejected">
                            {text(
                                'مرفوض',
                                'Rejected',
                            )}
                        </option>
                        <option value="converted">
                            {text(
                                'تم التحويل',
                                'Converted',
                            )}
                        </option>
                    </select>
                </div>

                <section className="mt-6 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]">
                    <h2 className="text-sm font-bold">
                        {text(
                            'طلب جديد',
                            'New request',
                        )}
                    </h2>

                    <div className="mt-4 grid gap-2 lg:grid-cols-3">
                        <select
                            value={
                                productId
                            }
                            onChange={
                                event =>
                                    selectProduct(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        >
                            <option value="">
                                {text(
                                    'منتج اختياري',
                                    'Optional product',
                                )}
                            </option>
                            {response?.options.products.map(
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
                            value={
                                description
                            }
                            onChange={
                                event =>
                                    setDescription(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            placeholder={
                                text(
                                    'وصف المطلوب',
                                    'Requested item description',
                                )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        />

                        <select
                            value={
                                supplierId
                            }
                            onChange={
                                event =>
                                    setSupplierId(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        >
                            <option value="">
                                {text(
                                    'مورد مفضل اختياري',
                                    'Optional preferred supplier',
                                )}
                            </option>
                            {response?.options.suppliers.map(
                                supplier => (
                                    <option
                                        key={
                                            supplier.id
                                        }
                                        value={
                                            supplier.id
                                        }
                                    >
                                        {
                                            supplier.name
                                        }
                                    </option>
                                ),
                            )}
                        </select>

                        <input
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            value={
                                quantity
                            }
                            onChange={
                                event =>
                                    setQuantity(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            placeholder={
                                selectedProduct?.unit
                                    ? text(
                                        'الكمية '
                                            + selectedProduct.unit,
                                        'Qty '
                                            + selectedProduct.unit,
                                    )
                                    : text(
                                        'الكمية',
                                        'Quantity',
                                    )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        />

                        <input
                            type="number"
                            min="0"
                            step="0.0001"
                            value={
                                expectedCost
                            }
                            onChange={
                                event =>
                                    setExpectedCost(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            placeholder={
                                text(
                                    'تكلفة متوقعة',
                                    'Expected unit cost',
                                )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        />

                        <input
                            type="date"
                            value={
                                neededBy
                            }
                            onChange={
                                event =>
                                    setNeededBy(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        />

                        <input
                            value={
                                note
                            }
                            onChange={
                                event =>
                                    setNote(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            placeholder={
                                text(
                                    'ملاحظة',
                                    'Note',
                                )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs lg:col-span-2"
                        />

                        <button
                            type="button"
                            disabled={
                                busy
                            }
                            onClick={() =>
                                void create()
                            }
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-[11px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-50"
                        >
                            <Plus
                                size={
                                    13
                                }
                            />
                            {text(
                                'إرسال الطلب',
                                'Submit request',
                            )}
                        </button>
                    </div>
                </section>

                {error && (
                    <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                        {
                            error
                        }
                    </div>
                )}

                <section className="mt-5 overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-soft)]">
                    {loading ? (
                        <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {text(
                                'جارٍ التحميل...',
                                'Loading...',
                            )}
                        </div>
                    ) : ! response?.data.length ? (
                        <div className="p-12 text-center text-sm text-[var(--ac-text-muted)]">
                            {text(
                                'لا توجد طلبات شراء.',
                                'No purchase requisitions.',
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1120px] text-xs">
                                <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                    <tr>
                                        {[
                                            text(
                                                'الطلب',
                                                'Request',
                                            ),
                                            text(
                                                'الصنف',
                                                'Item',
                                            ),
                                            text(
                                                'الكمية',
                                                'Quantity',
                                            ),
                                            text(
                                                'المورد',
                                                'Supplier',
                                            ),
                                            text(
                                                'مطلوب قبل',
                                                'Needed by',
                                            ),
                                            text(
                                                'الحالة',
                                                'Status',
                                            ),
                                            text(
                                                'إجراء',
                                                'Action',
                                            ),
                                        ].map(
                                            label => (
                                                <th
                                                    key={
                                                        label
                                                    }
                                                    className="px-4 py-3 text-start font-semibold"
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
                                    {response.data.map(
                                        row => (
                                            <tr
                                                key={
                                                    row.id
                                                }
                                                className="border-t border-[var(--ac-line)]"
                                            >
                                                <td className="px-4 py-3">
                                                    <strong className="text-[var(--ac-accent)]">
                                                        {
                                                            row.number
                                                        }
                                                    </strong>
                                                    <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                        {
                                                            row.requested_by_name
                                                            ?? '—'
                                                        }
                                                    </p>
                                                </td>

                                                <td className="px-4 py-3">
                                                    {
                                                        row.product_name
                                                        ?? row.description
                                                    }
                                                    {row.product_name
                                                        && row.description !==
                                                            row.product_name
                                                        ? (
                                                            <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                                {
                                                                    row.description
                                                                }
                                                            </p>
                                                        )
                                                        : null}
                                                </td>

                                                <td className="px-4 py-3 font-semibold">
                                                    {Number(
                                                        row.quantity,
                                                    ).toLocaleString()}
                                                </td>

                                                <td className="px-4 py-3">
                                                    {
                                                        row.supplier_name
                                                        ?? '—'
                                                    }
                                                </td>

                                                <td className="px-4 py-3">
                                                    {
                                                        row.needed_by
                                                        ?? '—'
                                                    }
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span className="rounded-full bg-[var(--ac-bg-soft)] px-2.5 py-1 text-[9px] font-semibold">
                                                        {
                                                            row.status
                                                        }
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {row.status ===
                                                            'pending'
                                                            && canReview && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            void review(
                                                                                row.id,
                                                                                'approved',
                                                                            )
                                                                        }
                                                                        className="inline-flex h-8 items-center gap-1 rounded-[9px] bg-emerald-50 px-2.5 text-[10px] font-semibold text-emerald-700"
                                                                    >
                                                                        <Check
                                                                            size={
                                                                                11
                                                                            }
                                                                        />
                                                                        {text(
                                                                            'موافقة',
                                                                            'Approve',
                                                                        )}
                                                                    </button>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            void review(
                                                                                row.id,
                                                                                'rejected',
                                                                            )
                                                                        }
                                                                        className="inline-flex h-8 items-center gap-1 rounded-[9px] bg-red-50 px-2.5 text-[10px] font-semibold text-red-700"
                                                                    >
                                                                        <X
                                                                            size={
                                                                                11
                                                                            }
                                                                        />
                                                                        {text(
                                                                            'رفض',
                                                                            'Reject',
                                                                        )}
                                                                    </button>
                                                                </>
                                                            )}

                                                        {row.status ===
                                                            'approved' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void convert(
                                                                            row.id,
                                                                        )
                                                                    }
                                                                    className="inline-flex h-8 items-center gap-1 rounded-[9px] bg-[var(--ac-accent-soft)] px-2.5 text-[10px] font-semibold text-[var(--ac-accent)]"
                                                                >
                                                                    <FilePlus2
                                                                        size={
                                                                            11
                                                                        }
                                                                    />
                                                                    {text(
                                                                        'إنشاء مسودة شراء',
                                                                        'Create purchase draft',
                                                                    )}
                                                                </button>
                                                            )}

                                                        {row.converted_document_id && (
                                                            <Link
                                                                href={
                                                                    '/app/invoices/purchases/'
                                                                    + String(
                                                                        row.converted_document_id,
                                                                    )
                                                                }
                                                                className="inline-flex h-8 items-center rounded-[9px] border border-[var(--ac-line)] px-2.5 text-[10px] font-semibold"
                                                            >
                                                                {row.converted_document_number
                                                                    ?? text(
                                                                        'فتح الفاتورة',
                                                                        'Open invoice',
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
                    )}
                </section>
            </main>
        </AppShell>
    );
}
