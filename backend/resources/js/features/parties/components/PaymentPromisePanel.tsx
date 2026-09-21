import { ApiError, apiRequest } from '@/lib/http';
import {
    CalendarClock,
    Check,
    Plus,
    RotateCcw,
} from 'lucide-react';
import {
    type FormEvent,
    useCallback,
    useEffect,
    useState,
} from 'react';

type PaymentPromise = {
    id: number;
    party_id: number;
    financial_document_id: number | null;
    document_number: string | null;
    amount: string;
    promised_on: string;
    status: 'open' | 'fulfilled' | 'missed' | 'cancelled';
    note: string | null;
    fulfilled_at: string | null;
};

type InvoiceOption = {
    id: number;
    number: string;
    balance_due: string;
    status: string;
};

export function PaymentPromisePanel({
    partyId,
    ar,
    invoices,
}: {
    partyId: number;
    ar: boolean;
    invoices: InvoiceOption[];
}) {
    const [promises, setPromises] = useState<PaymentPromise[]>([]);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [forbidden, setForbidden] = useState(false);
    const [error, setError] = useState('');
    const [amount, setAmount] = useState('');
    const [promisedOn, setPromisedOn] = useState('');
    const [invoiceId, setInvoiceId] = useState('');
    const [note, setNote] = useState('');

    const load = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError('');

        try {
            const response = await apiRequest<{
                data: PaymentPromise[];
            }>(
                '/api/operations/promises?party_id='
                + String(partyId),
            );

            setPromises(response.data);
            setForbidden(false);
        } catch (failure) {
            if (
                failure instanceof ApiError
                && failure.status === 403
            ) {
                setForbidden(true);
                return;
            }

            setError(
                ar
                    ? 'تعذر تحميل وعود الدفع.'
                    : 'Payment promises could not be loaded.',
            );
        } finally {
            setLoading(false);
        }
    }, [partyId, ar]);

    useEffect(() => {
        void load();
    }, [load]);

    if (forbidden) {
        return null;
    }

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
                '/api/operations/promises',
                {
                    method: 'POST',
                    body: JSON.stringify({
                        party_id: partyId,
                        financial_document_id:
                            invoiceId
                                ? Number(invoiceId)
                                : null,
                        amount,
                        promised_on: promisedOn,
                        note:
                            note.trim()
                            || null,
                    }),
                },
            );

            setAmount('');
            setPromisedOn('');
            setInvoiceId('');
            setNote('');
            await load();
        } catch (failure) {
            setError(
                failure instanceof ApiError
                    ? failure.message
                    : (
                        ar
                            ? 'تعذر حفظ وعد الدفع.'
                            : 'The payment promise could not be saved.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    async function setStatus(
        promiseId: number,
        status: 'fulfilled' | 'missed' | 'cancelled',
    ): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest(
                '/api/operations/promises/'
                + String(promiseId),
                {
                    method: 'PATCH',
                    body: JSON.stringify({
                        status,
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
                            ? 'تعذر تحديث وعد الدفع.'
                            : 'The payment promise could not be updated.'
                    ),
            );
        } finally {
            setBusy(false);
        }
    }

    const openInvoices = invoices.filter(
        invoice =>
            invoice.status === 'issued'
            || invoice.status === 'partially_paid',
    );

    return (
        <div className="mt-3 rounded-[16px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                    <CalendarClock
                        size={15}
                        className="mt-0.5 text-[var(--ac-accent)]"
                    />

                    <div>
                        <p className="text-[10px] font-bold text-[var(--ac-text)]">
                            {ar
                                ? 'وعود الدفع'
                                : 'Payment promises'}
                        </p>
                        <p className="mt-1 text-[9px] leading-4 text-[var(--ac-text-muted)]">
                            {ar
                                ? 'سجل متى وعد العميل بالدفع، ثم تابع إن تم الوفاء بالوعد أو فات موعده.'
                                : 'Record when the customer promised to pay, then track whether the promise was fulfilled or missed.'}
                        </p>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-3 rounded-[11px] border border-red-300/40 bg-red-500/10 px-3 py-2 text-[10px] text-red-300">
                    {error}
                </div>
            )}

            <form
                onSubmit={(event) => void submit(event)}
                className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
            >
                <label>
                    <span className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                        {ar ? 'المبلغ' : 'Amount'}
                    </span>
                    <input
                        required
                        type="number"
                        min="0.0001"
                        step="0.0001"
                        value={amount}
                        onChange={event =>
                            setAmount(event.target.value)
                        }
                        className="mt-1 h-9 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    />
                </label>

                <label>
                    <span className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                        {ar ? 'موعد الدفع' : 'Promise date'}
                    </span>
                    <input
                        required
                        type="date"
                        value={promisedOn}
                        onChange={event =>
                            setPromisedOn(event.target.value)
                        }
                        className="mt-1 h-9 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    />
                </label>

                <label>
                    <span className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                        {ar
                            ? 'الفاتورة (اختياري)'
                            : 'Invoice (optional)'}
                    </span>
                    <select
                        value={invoiceId}
                        onChange={event =>
                            setInvoiceId(event.target.value)
                        }
                        className="mt-1 h-9 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    >
                        <option value="">
                            {ar
                                ? 'وعد عام على الحساب'
                                : 'General account promise'}
                        </option>

                        {openInvoices.map(invoice => (
                            <option
                                key={invoice.id}
                                value={invoice.id}
                            >
                                {invoice.number}
                                {' · '}
                                {Number(
                                    invoice.balance_due,
                                ).toLocaleString()}
                            </option>
                        ))}
                    </select>
                </label>

                <label>
                    <span className="text-[9px] font-semibold text-[var(--ac-text-muted)]">
                        {ar ? 'ملاحظة' : 'Note'}
                    </span>
                    <input
                        value={note}
                        onChange={event =>
                            setNote(event.target.value)
                        }
                        className="mt-1 h-9 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    />
                </label>

                <div className="sm:col-span-2 xl:col-span-4">
                    <button
                        type="submit"
                        disabled={busy}
                        className="inline-flex h-9 items-center gap-2 rounded-[11px] border border-[var(--ac-accent)] bg-transparent px-3 text-[10px] font-bold text-[var(--ac-accent)] transition hover:bg-[var(--ac-accent-soft)] disabled:opacity-50"
                    >
                        <Plus size={13} />
                        {ar
                            ? 'تسجيل وعد الدفع'
                            : 'Add payment promise'}
                    </button>
                </div>
            </form>

            <div className="mt-4 space-y-2">
                {loading ? (
                    <p className="py-3 text-center text-[10px] text-[var(--ac-text-muted)]">
                        {ar ? 'جارٍ التحميل…' : 'Loading…'}
                    </p>
                ) : promises.length === 0 ? (
                    <p className="py-3 text-center text-[10px] text-[var(--ac-text-muted)]">
                        {ar
                            ? 'لا توجد وعود دفع مسجلة.'
                            : 'No payment promises recorded.'}
                    </p>
                ) : promises.slice(0, 8).map(promise => (
                    <div
                        key={promise.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-[var(--ac-surface-soft)] px-3 py-2"
                    >
                        <div className="min-w-0">
                            <p className="text-[10px] font-semibold text-[var(--ac-text)]">
                                {Number(
                                    promise.amount,
                                ).toLocaleString()}
                                {' · '}
                                {promise.promised_on}
                                {promise.document_number
                                    ? ' · ' + promise.document_number
                                    : ''}
                            </p>

                            <p className="mt-0.5 text-[9px] text-[var(--ac-text-muted)]">
                                {promise.status}
                                {promise.note
                                    ? ' · ' + promise.note
                                    : ''}
                            </p>
                        </div>

                        {! [
                            'fulfilled',
                            'cancelled',
                        ].includes(promise.status) && (
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        void setStatus(
                                            promise.id,
                                            'fulfilled',
                                        )
                                    }
                                    className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-emerald-500/50 px-2 text-[9px] font-semibold text-emerald-400"
                                >
                                    <Check size={11} />
                                    {ar ? 'تم الدفع' : 'Fulfilled'}
                                </button>

                                <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() =>
                                        void setStatus(
                                            promise.id,
                                            'missed',
                                        )
                                    }
                                    className="inline-flex h-8 items-center gap-1 rounded-[10px] border border-amber-500/50 px-2 text-[9px] font-semibold text-amber-400"
                                >
                                    <RotateCcw size={11} />
                                    {ar ? 'فات الموعد' : 'Missed'}
                                </button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}
