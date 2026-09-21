import { apiRequest } from '@/lib/http';
import { AppShell } from '@/layouts/AppShell';
import { useLocale } from '@/lib/i18n';
import type { AppPageProps } from '@/types/app';
import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    ArrowRightLeft,
    Check,
    PackageCheck,
    Plus,
    Send,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type TransferRow = {
    id: number;
    product_id: number;
    product_name: string;
    sku: string | null;
    source_warehouse_id: number;
    source_warehouse_name: string;
    destination_warehouse_id: number;
    destination_warehouse_name: string;
    quantity: string;
    status: string;
    note: string | null;
    requested_by_name: string | null;
    approved_by_name: string | null;
    approved_at: string | null;
    shipped_at: string | null;
    received_at: string | null;
    created_at: string;
};

type ProductOption = {
    id: number;
    name: string;
    sku: string | null;
    unit: string | null;
};

type WarehouseOption = {
    id: number;
    name: string;
    code: string;
};

type TransferResponse = {
    data: TransferRow[];
    options: {
        products: ProductOption[];
        warehouses: WarehouseOption[];
    };
};

export default function InventoryTransfers() {
    const ar = useLocale() === 'ar';
    const {
        workspace,
    } = usePage<AppPageProps>().props;
    const role =
        workspace.activeOrganization?.role
        ?? '';
    const canApprove =
        [
            'owner',
            'admin',
            'manager',
        ].includes(role);

    const [
        response,
        setResponse,
    ] = useState<TransferResponse | null>(
        null,
    );
    const [
        status,
        setStatus,
    ] = useState('all');
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
        productId,
        setProductId,
    ] = useState('');
    const [
        sourceId,
        setSourceId,
    ] = useState('');
    const [
        destinationId,
        setDestinationId,
    ] = useState('');
    const [
        quantity,
        setQuantity,
    ] = useState('');
    const [
        note,
        setNote,
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
                await apiRequest<TransferResponse>(
                    '/api/inventory/transfer-requests?status='
                    + encodeURIComponent(
                        status,
                    ),
                );

            setResponse(next);
        } catch {
            setError(
                text(
                    'تعذر تحميل تحويلات المستودعات.',
                    'Warehouse transfers could not be loaded.',
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

    async function create(): Promise<void> {
        if (
            busy
            || ! productId
            || ! sourceId
            || ! destinationId
            || Number(
                quantity,
            ) <= 0
        ) {
            return;
        }

        if (
            sourceId ===
            destinationId
        ) {
            setError(
                text(
                    'المستودع المصدر والوجهة يجب أن يكونا مختلفين.',
                    'Source and destination warehouses must be different.',
                ),
            );
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/inventory/transfer-requests',
                {
                    method:
                        'POST',
                    body:
                        JSON.stringify(
                            {
                                product_id:
                                    Number(
                                        productId,
                                    ),
                                source_warehouse_id:
                                    Number(
                                        sourceId,
                                    ),
                                destination_warehouse_id:
                                    Number(
                                        destinationId,
                                    ),
                                quantity,
                                note:
                                    note.trim()
                                    || null,
                            },
                        ),
                },
            );

            setProductId('');
            setSourceId('');
            setDestinationId('');
            setQuantity('');
            setNote('');
            await load();
        } catch {
            setError(
                text(
                    'تعذر إنشاء طلب التحويل.',
                    'Transfer request could not be created.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function transition(
        id: number,
        action:
            | 'approve'
            | 'reject'
            | 'ship'
            | 'receive',
    ): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/inventory/transfer-requests/'
                + String(
                    id,
                ),
                {
                    method:
                        'PATCH',
                    body:
                        JSON.stringify(
                            {
                                action,
                            },
                        ),
                },
            );

            await load();
        } catch {
            setError(
                text(
                    'تعذر تنفيذ خطوة التحويل. تحقق من الصلاحية والكمية المتاحة.',
                    'Transfer step failed. Check permissions and available stock.',
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
                        'تحويلات المستودعات — AccoNova',
                        'Warehouse Transfers — AccoNova',
                    )
                }
            />

            <main className="mx-auto w-full max-w-[1680px] px-3 py-5 sm:px-5 sm:py-8 lg:px-8 lg:py-10">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="flex size-11 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <ArrowRightLeft
                                size={
                                    18
                                }
                            />
                        </div>

                        <div>
                            <h1 className="text-2xl font-semibold tracking-[-0.04em] sm:text-3xl">
                                {text(
                                    'تحويلات المستودعات',
                                    'Warehouse transfers',
                                )}
                            </h1>

                            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--ac-text-soft)]">
                                {text(
                                    'طلب → موافقة → شحن → استلام. المخزون الفعلي يتغير فقط عند الاستلام حتى لا تؤثر الطلبات المرفوضة أو غير المكتملة على دفتر المخزون.',
                                    'Request → approval → ship → receive. Physical inventory is posted only on receipt so rejected or incomplete requests never mutate the stock ledger.',
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
                                'كل الحالات',
                                'All statuses',
                            )}
                        </option>
                        <option value="requested">
                            {text(
                                'بانتظار الموافقة',
                                'Requested',
                            )}
                        </option>
                        <option value="approved">
                            {text(
                                'موافق عليه',
                                'Approved',
                            )}
                        </option>
                        <option value="shipped">
                            {text(
                                'تم الشحن',
                                'Shipped',
                            )}
                        </option>
                        <option value="received">
                            {text(
                                'تم الاستلام',
                                'Received',
                            )}
                        </option>
                        <option value="rejected">
                            {text(
                                'مرفوض',
                                'Rejected',
                            )}
                        </option>
                    </select>
                </div>

                <section className="mt-6 rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-soft)]">
                    <h2 className="text-sm font-bold">
                        {text(
                            'طلب تحويل جديد',
                            'New transfer request',
                        )}
                    </h2>

                    <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,.8fr)_minmax(0,.8fr)_130px_minmax(0,.8fr)_auto]">
                        <select
                            value={
                                productId
                            }
                            onChange={
                                event =>
                                    setProductId(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        >
                            <option value="">
                                {text(
                                    'اختر المنتج',
                                    'Choose product',
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

                        <select
                            value={
                                sourceId
                            }
                            onChange={
                                event =>
                                    setSourceId(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        >
                            <option value="">
                                {text(
                                    'من مستودع',
                                    'From warehouse',
                                )}
                            </option>
                            {response?.options.warehouses.map(
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

                        <select
                            value={
                                destinationId
                            }
                            onChange={
                                event =>
                                    setDestinationId(
                                        event
                                            .target
                                            .value,
                                    )
                            }
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
                        >
                            <option value="">
                                {text(
                                    'إلى مستودع',
                                    'To warehouse',
                                )}
                            </option>
                            {response?.options.warehouses.map(
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
                            className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs"
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
                                'طلب',
                                'Request',
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
                                'لا توجد طلبات تحويل.',
                                'No transfer requests.',
                            )}
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1040px] text-xs">
                                <thead className="bg-[var(--ac-surface-soft)] text-[var(--ac-text-muted)]">
                                    <tr>
                                        {[
                                            text(
                                                'المنتج',
                                                'Product',
                                            ),
                                            text(
                                                'المسار',
                                                'Route',
                                            ),
                                            text(
                                                'الكمية',
                                                'Quantity',
                                            ),
                                            text(
                                                'الحالة',
                                                'Status',
                                            ),
                                            text(
                                                'الطلب',
                                                'Requested',
                                            ),
                                            text(
                                                'الإجراءات',
                                                'Actions',
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
                                                    <strong>
                                                        {
                                                            row.product_name
                                                        }
                                                    </strong>
                                                    <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                                        {row.sku
                                                            ?? '—'}
                                                    </p>
                                                </td>

                                                <td className="px-4 py-3">
                                                    {
                                                        row.source_warehouse_name
                                                    }
                                                    {' → '}
                                                    {
                                                        row.destination_warehouse_name
                                                    }
                                                </td>

                                                <td className="px-4 py-3 font-semibold">
                                                    {Number(
                                                        row.quantity,
                                                    ).toLocaleString()}
                                                </td>

                                                <td className="px-4 py-3">
                                                    <span className="rounded-full bg-[var(--ac-bg-soft)] px-2.5 py-1 text-[9px] font-semibold">
                                                        {
                                                            row.status
                                                        }
                                                    </span>
                                                </td>

                                                <td className="px-4 py-3 text-[10px] text-[var(--ac-text-muted)]">
                                                    {
                                                        row.requested_by_name
                                                        ?? '—'
                                                    }
                                                    <br />
                                                    {
                                                        row.created_at
                                                    }
                                                </td>

                                                <td className="px-4 py-3">
                                                    <div className="flex flex-wrap gap-2">
                                                        {row.status ===
                                                            'requested'
                                                            && canApprove && (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() =>
                                                                            void transition(
                                                                                row.id,
                                                                                'approve',
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
                                                                            void transition(
                                                                                row.id,
                                                                                'reject',
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
                                                                        void transition(
                                                                            row.id,
                                                                            'ship',
                                                                        )
                                                                    }
                                                                    className="inline-flex h-8 items-center gap-1 rounded-[9px] bg-amber-50 px-2.5 text-[10px] font-semibold text-amber-800"
                                                                >
                                                                    <Send
                                                                        size={
                                                                            11
                                                                        }
                                                                    />
                                                                    {text(
                                                                        'تسجيل الشحن',
                                                                        'Mark shipped',
                                                                    )}
                                                                </button>
                                                            )}

                                                        {row.status ===
                                                            'shipped' && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() =>
                                                                        void transition(
                                                                            row.id,
                                                                            'receive',
                                                                        )
                                                                    }
                                                                    className="inline-flex h-8 items-center gap-1 rounded-[9px] bg-[var(--ac-accent-soft)] px-2.5 text-[10px] font-semibold text-[var(--ac-accent)]"
                                                                >
                                                                    <PackageCheck
                                                                        size={
                                                                            11
                                                                        }
                                                                    />
                                                                    {text(
                                                                        'استلام وترحيل المخزون',
                                                                        'Receive & post stock',
                                                                    )}
                                                                </button>
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
