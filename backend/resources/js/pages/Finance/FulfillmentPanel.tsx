import { apiRequest } from '@/lib/http';
import {
    CheckCircle2,
    PackageCheck,
    Plus,
    Trash2,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type FulfillmentEvent = {
    id: number;
    quantity: string;
    occurred_on: string;
    note: string | null;
    created_by: number | null;
    created_at: string;
};

type FulfillmentLine = {
    line_id: number;
    description: string;
    sku: string | null;
    unit: string | null;
    quantity: string;
    fulfilled_quantity: string;
    remaining_quantity: string;
    status: 'pending' | 'partial' | 'complete';
    events: FulfillmentEvent[];
};

type FulfillmentResponse = {
    mode: 'delivery' | 'receipt';
    lines: FulfillmentLine[];
};

function todayValue(): string {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    const local = new Date(
        date.getTime() - offset * 60 * 1000,
    );

    return local.toISOString().slice(0, 10);
}

export function FulfillmentPanel({
    documentId,
    canManage,
    ar,
}: {
    documentId: number;
    canManage: boolean;
    ar: boolean;
}) {
    const [data, setData] = useState<FulfillmentResponse | null>(null);
    const [busy, setBusy] = useState(false);
    const [lineId, setLineId] = useState('');
    const [quantity, setQuantity] = useState('');
    const [occurredOn, setOccurredOn] = useState(todayValue());
    const [note, setNote] = useState('');
    const [error, setError] = useState('');

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    async function load(): Promise<void> {
        const response = await apiRequest<{ data: FulfillmentResponse }>(
            '/api/finance/documents/'
            + String(documentId)
            + '/fulfillments',
        );

        setData(response.data);
    }

    useEffect(() => {
        const controller = new AbortController();

        apiRequest<{ data: FulfillmentResponse }>(
            '/api/finance/documents/'
            + String(documentId)
            + '/fulfillments',
            {
                signal: controller.signal,
            },
        )
            .then((response) => {
                setData(response.data);
            })
            .catch(() => {
                if (! controller.signal.aborted) {
                    setError(
                        text(
                            'تعذر تحميل حالة التسليم أو الاستلام.',
                            'Fulfillment status could not be loaded.',
                        ),
                    );
                }
            });

        return () => controller.abort();
    }, [documentId, ar]);

    const openLines = useMemo(
        () =>
            data?.lines.filter(
                (line) =>
                    Number(line.remaining_quantity) > 0.00005,
            ) ?? [],
        [data],
    );

    async function add(): Promise<void> {
        if (
            busy
            || ! lineId
            || Number(quantity) <= 0
        ) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            const response = await apiRequest<{ data: FulfillmentResponse }>(
                '/api/finance/documents/'
                + String(documentId)
                + '/fulfillments',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        line_id: Number(lineId),
                        quantity,
                        occurred_on: occurredOn,
                        note: note.trim() || null,
                    }),
                },
            );

            setData(response.data);
            setLineId('');
            setQuantity('');
            setNote('');
        } catch {
            setError(
                text(
                    'تعذر تسجيل الكمية. تأكد أنها لا تتجاوز الكمية المتبقية.',
                    'Quantity could not be recorded. Make sure it does not exceed the remaining amount.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function remove(id: number): Promise<void> {
        if (busy) {
            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/finance/documents/'
                + String(documentId)
                + '/fulfillments/'
                + String(id),
                {
                    method: 'DELETE',
                },
            );
            await load();
        } catch {
            setError(
                text(
                    'تعذر حذف حركة التسليم أو الاستلام.',
                    'Fulfillment entry could not be removed.',
                ),
            );
        } finally {
            setBusy(false);
        }
    }

    if (! data || data.lines.length === 0) {
        return null;
    }

    const delivery = data.mode === 'delivery';

    return (
        <section className="rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                    <PackageCheck size={17} />
                </div>
                <div>
                    <h3 className="text-sm font-bold text-[var(--ac-text)]">
                        {delivery
                            ? text('تتبع التسليم الجزئي', 'Partial delivery tracking')
                            : text('تتبع الاستلام الجزئي', 'Partial receipt tracking')}
                    </h3>
                    <p className="mt-1 text-[10px] leading-5 text-[var(--ac-text-muted)]">
                        {text(
                            'هذا تتبع تشغيلي للكميات فقط ولا يغير قيمة الفاتورة أو القيود أو المخزون تلقائياً.',
                            'This is operational quantity tracking only; it does not automatically change invoice totals, accounting entries, or inventory balances.',
                        )}
                    </p>
                </div>
            </div>

            {error && (
                <div className="mt-3 rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                </div>
            )}

            {canManage && openLines.length > 0 && (
                <div className="mt-4 grid gap-2 lg:grid-cols-[minmax(0,1fr)_120px_150px_minmax(0,.8fr)_auto]">
                    <select
                        value={lineId}
                        onChange={(event) => {
                            const next = event.target.value;
                            setLineId(next);

                            const line = openLines.find(
                                (item) =>
                                    String(item.line_id) === next,
                            );

                            if (line) {
                                setQuantity(line.remaining_quantity);
                            }
                        }}
                        className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                    >
                        <option value="">
                            {text('اختر البند', 'Choose line')}
                        </option>
                        {openLines.map((line) => (
                            <option
                                key={line.line_id}
                                value={line.line_id}
                            >
                                {line.description}
                                {' · '}
                                {text('متبقي', 'remaining')} {Number(line.remaining_quantity).toLocaleString()}
                            </option>
                        ))}
                    </select>

                    <input
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        placeholder={text('الكمية', 'Quantity')}
                        className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                    />

                    <input
                        type="date"
                        value={occurredOn}
                        onChange={(event) => setOccurredOn(event.target.value)}
                        className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                    />

                    <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder={text('ملاحظة اختيارية', 'Optional note')}
                        className="h-10 rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)]"
                    />

                    <button
                        type="button"
                        disabled={
                            busy
                            || ! lineId
                            || Number(quantity) <= 0
                        }
                        onClick={() => void add()}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-[11px] bg-[var(--ac-accent-solid)] px-3 text-xs font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-45"
                    >
                        <Plus size={13} />
                        {text('تسجيل', 'Record')}
                    </button>
                </div>
            )}

            <div className="mt-4 space-y-3">
                {data.lines.map((line) => {
                    const ordered = Number(line.quantity);
                    const fulfilled = Number(line.fulfilled_quantity);
                    const percentage = ordered > 0
                        ? Math.min(
                            fulfilled / ordered * 100,
                            100,
                        )
                        : 0;

                    return (
                        <div
                            key={line.line_id}
                            className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold text-[var(--ac-text)]">
                                        {line.description}
                                    </p>
                                    <p className="mt-1 text-[9px] text-[var(--ac-text-muted)]">
                                        {line.sku ? line.sku + ' · ' : ''}
                                        {text('المطلوب', 'ordered')} {Number(line.quantity).toLocaleString()}
                                        {' · '}
                                        {delivery
                                            ? text('المسلّم', 'delivered')
                                            : text('المستلم', 'received')} {Number(line.fulfilled_quantity).toLocaleString()}
                                        {' · '}
                                        {text('المتبقي', 'remaining')} {Number(line.remaining_quantity).toLocaleString()}
                                        {line.unit ? ' ' + line.unit : ''}
                                    </p>
                                </div>

                                <span
                                    className={[
                                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-semibold',
                                        line.status === 'complete'
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : line.status === 'partial'
                                                ? 'bg-amber-100 text-amber-700'
                                                : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                                    ].join(' ')}
                                >
                                    {line.status === 'complete' && (
                                        <CheckCircle2 size={11} />
                                    )}
                                    {line.status === 'complete'
                                        ? text('مكتمل', 'Complete')
                                        : line.status === 'partial'
                                            ? text('جزئي', 'Partial')
                                            : text('بانتظار التنفيذ', 'Pending')}
                                </span>
                            </div>

                            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--ac-line)]">
                                <div
                                    className="h-full rounded-full bg-[var(--ac-accent)] transition-[width]"
                                    style={{
                                        width: percentage.toFixed(1) + '%',
                                    }}
                                />
                            </div>

                            {line.events.length > 0 && (
                                <div className="mt-3 space-y-1">
                                    {line.events.map((event) => (
                                        <div
                                            key={event.id}
                                            className="flex items-center gap-3 rounded-[10px] bg-[var(--ac-surface)] px-2.5 py-2 text-[10px]"
                                        >
                                            <strong className="text-[var(--ac-text)]">
                                                {Number(event.quantity).toLocaleString()}
                                                {line.unit ? ' ' + line.unit : ''}
                                            </strong>
                                            <span className="text-[var(--ac-text-muted)]">
                                                {event.occurred_on}
                                            </span>
                                            <span className="min-w-0 flex-1 truncate text-[var(--ac-text-muted)]">
                                                {event.note ?? ''}
                                            </span>
                                            {canManage && (
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() => void remove(event.id)}
                                                    className="flex size-7 items-center justify-center rounded-[8px] text-[var(--ac-text-muted)] hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
}
