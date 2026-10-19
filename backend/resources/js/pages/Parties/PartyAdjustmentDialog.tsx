import { ModalPortal } from '@/components/feedback/ModalPortal';
import { ApiError, apiRequest } from '@/lib/http';
import { ArrowDownLeft, ArrowLeft, ArrowRight, ArrowUpRight, X } from 'lucide-react';
import { useEffect, useState } from 'react';

type OpenInvoice = { id: number; number: string; balance_due: string; issue_date?: string | null };

type Side = 'customer' | 'supplier';
type Direction = 'owed_to_us' | 'we_owe';

type Props = {
    partyId: number;
    partyName: string;
    roles: string[];
    canSales: boolean;
    canPurchases: boolean;
    positions: { customer: string; supplier: string };
    currency: string;
    locale: string;
    ar: boolean;
    onClose: () => void;
    onSaved: () => void;
};

const REASONS: Array<[string, string]> = [
    ['فرق أسعار', 'Price difference'],
    ['فرق وزن', 'Weight difference'],
    ['خصم متفق عليه', 'Agreed discount'],
    ['بضاعة تالفة', 'Damaged goods'],
];

function todayValue(): string {
    const now = new Date();

    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

/**
 * "قيد فروقات": records a balance difference with a Party (price, weight,
 * agreed discount...). It moves only the Party balance, not stock or cash.
 */
export function PartyAdjustmentDialog({
    partyId,
    partyName,
    roles,
    canSales,
    canPurchases,
    positions,
    currency,
    locale,
    ar,
    onClose,
    onSaved,
}: Props) {
    const text = (arabic: string, english: string): string => (ar ? arabic : english);
    const sides: Side[] = (['customer', 'supplier'] as Side[]).filter(
        (side) => roles.includes(side) && (side === 'customer' ? canSales : canPurchases),
    );
    const isDual = roles.includes('customer') && roles.includes('supplier');

    const [side, setSide] = useState<Side | null>(sides.length === 1 ? sides[0] : null);
    const [direction, setDirection] = useState<Direction>('owed_to_us');
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(todayValue());
    const [reasonIndex, setReasonIndex] = useState<number>(0);
    const [otherReason, setOtherReason] = useState('');
    const [showPreview, setShowPreview] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [invoices, setInvoices] = useState<OpenInvoice[]>([]);
    const [documentId, setDocumentId] = useState('');
    const chosenInvoice = invoices.find((invoice) => String(invoice.id) === documentId) ?? null;

    useEffect(() => {
        setDocumentId('');
        setInvoices([]);

        if (side === null) {
            return;
        }

        let cancelled = false;
        const params = new URLSearchParams({
            kind: side === 'customer' ? 'sale_invoice' : 'purchase_invoice',
            open_only: '1',
            per_page: '100',
            party_id: String(partyId),
        });

        apiRequest<{ data: OpenInvoice[] }>('/api/finance/documents?' + params.toString())
            .then((response) => {
                if (! cancelled) {
                    setInvoices(response.data);
                }
            })
            .catch(() => undefined);

        return () => {
            cancelled = true;
        };
    }, [side, partyId]);

    function chooseInvoice(value: string): void {
        setDocumentId(value);

        if (value === '' || side === null) {
            return;
        }

        setDirection(side === 'customer' ? 'we_owe' : 'owed_to_us');
        setReasonIndex(2);
    }

    const isOther = reasonIndex === REASONS.length;
    const reason = isOther ? otherReason.trim() : text(REASONS[reasonIndex][0], REASONS[reasonIndex][1]);
    const value = Number(amount) || 0;

    /* Positive: the Party owes us. Negative: we owe the Party. */
    const before = isDual
        ? Number(positions.customer) - Number(positions.supplier)
        : roles.includes('supplier')
            ? -Number(positions.supplier)
            : Number(positions.customer);
    const after = before + (direction === 'owed_to_us' ? value : -value);

    const money = (number: number): string =>
        new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 2 }).format(Math.abs(number));

    const balanceText = (number: number): string => {
        if (Math.abs(number) < 0.005) {
            return text('صفر', 'Settled');
        }

        return (number > 0 ? text('لي عليه ', 'Owes you ') : text('له علي ', 'You owe ')) + money(number);
    };

    async function submit(): Promise<void> {
        if (busy) {
            return;
        }

        if (side === null) {
            setError(text('اختر الحساب: حساب الزبون أو حساب المورد.', 'Choose the customer or supplier account.'));

            return;
        }

        if (value <= 0) {
            setError(text('اكتب مبلغ أكبر من صفر.', 'Enter an amount greater than zero.'));

            return;
        }

        if (reason === '') {
            setError(text('اكتب السبب.', 'Enter the reason.'));

            return;
        }

        setBusy(true);
        setError('');

        try {
            await apiRequest('/api/parties/' + String(partyId) + '/adjustments', {
                method: 'POST',
                body: JSON.stringify({
                    side,
                    direction,
                    amount: String(value),
                    adjustment_date: date,
                    reason,
                    financial_document_id: documentId === '' ? null : Number(documentId),
                }),
            });
            onSaved();
        } catch (failure) {
            setError(failure instanceof ApiError && failure.message ? failure.message : text('تعذر حفظ القيد.', 'The entry could not be saved.'));
        } finally {
            setBusy(false);
        }
    }

    const directionButton = (key: Direction, label: string, Icon: typeof ArrowDownLeft) => (
        <button
            type="button"
            onClick={() => setDirection(key)}
            aria-pressed={direction === key}
            className={[
                'flex h-12 flex-1 items-center justify-center gap-2 rounded-[12px] border text-sm font-bold transition',
                direction === key
                    ? key === 'owed_to_us'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-600'
                        : 'border-amber-500 bg-amber-500/10 text-amber-600'
                    : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
            ].join(' ')}
        >
            <Icon size={16} />
            {label}
        </button>
    );

    const Arrow = ar ? ArrowLeft : ArrowRight;

    return (
        <ModalPortal>
        <div className="fixed inset-0 z-[260] flex items-center justify-center bg-black/45 p-3" role="dialog" aria-modal="true">
            <div
                dir={ar ? 'rtl' : 'ltr'}
                className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-[22px] border border-[var(--ac-line-strong)] bg-[var(--ac-surface)] shadow-2xl"
            >
                <div className="sticky top-0 z-[2] flex items-center justify-between gap-4 border-b border-[var(--ac-line)] bg-[var(--ac-surface)] px-5 py-4">
                    <h2 className="text-lg font-bold text-[var(--ac-text)]">
                        {text('قيد فروقات مع ', 'Difference with ') + partyName}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={text('إغلاق', 'Close')}
                        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--ac-line)] text-[var(--ac-text-muted)]"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="space-y-4 p-5">
                    {isDual && (
                        <div>
                            <span className="mb-1.5 block text-xs font-semibold text-[var(--ac-text-soft)]">{text('على أي حساب؟', 'Which account?')}</span>
                            <div className="flex gap-2">
                                {sides.map((key) => (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => setSide(key)}
                                        aria-pressed={side === key}
                                        className={[
                                            'h-10 flex-1 rounded-[11px] border text-xs font-semibold transition',
                                            side === key
                                                ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                                : 'border-[var(--ac-line)] text-[var(--ac-text-soft)]',
                                        ].join(' ')}
                                    >
                                        {key === 'customer' ? text('حساب الزبون', 'Customer account') : text('حساب المورد', 'Supplier account')}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {invoices.length > 0 && (
                        <label className="block">
                            <span className="mb-1.5 block text-xs font-semibold text-[var(--ac-text-soft)]">
                                {text('خصم على فاتورة (اختياري)', 'Discount on an invoice (optional)')}
                            </span>
                            <select
                                value={documentId}
                                onChange={(event) => chooseInvoice(event.target.value)}
                                className="h-11 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                            >
                                <option value="">{text('بدون ربط بفاتورة', 'Not linked to an invoice')}</option>
                                {invoices.map((invoice) => (
                                    <option key={invoice.id} value={invoice.id}>
                                        {invoice.number + ' · ' + text('المتبقي ', 'Open ') + money(Number(invoice.balance_due))}
                                    </option>
                                ))}
                            </select>
                            {chosenInvoice && (
                                <small className="mt-1 block text-[11px] text-[var(--ac-text-muted)]">
                                    {text(
                                        'الخصم بينزل من الفاتورة وبيسكّرها لو غطّى المتبقي، بدون ما تفتح تصحيح.',
                                        'The discount reduces this invoice and closes it if it covers the open amount, without a correction.',
                                    )}
                                </small>
                            )}
                        </label>
                    )}

                    {! chosenInvoice && (
                        <div className="flex gap-2">
                            {directionButton('owed_to_us', text('لي عليه', 'They owe me'), ArrowDownLeft)}
                            {directionButton('we_owe', text('له علي', 'I owe them'), ArrowUpRight)}
                        </div>
                    )}

                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[var(--ac-text-soft)]">{text('المبلغ *', 'Amount *')}</span>
                        <input
                            type="number"
                            min="0"
                            step="0.01"
                            max={chosenInvoice ? chosenInvoice.balance_due : undefined}
                            inputMode="decimal"
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            placeholder="0.00"
                            autoFocus
                            className="h-14 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-4 text-2xl font-bold tabular-nums text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)] focus:ring-2 focus:ring-[var(--ac-accent)]/10"
                        />
                    </label>

                    <div>
                        <span className="mb-1.5 block text-xs font-semibold text-[var(--ac-text-soft)]">{text('السبب', 'Reason')}</span>
                        <div className="flex flex-wrap gap-1.5">
                            {[...REASONS, ['سبب آخر…', 'Other…'] as [string, string]].map(([arabic, english], index) => (
                                <button
                                    key={arabic}
                                    type="button"
                                    onClick={() => setReasonIndex(index)}
                                    aria-pressed={reasonIndex === index}
                                    className={[
                                        'rounded-full border px-3 py-1.5 text-xs transition',
                                        reasonIndex === index
                                            ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                            : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
                                    ].join(' ')}
                                >
                                    {text(arabic, english)}
                                </button>
                            ))}
                        </div>
                        {isOther && (
                            <input
                                value={otherReason}
                                onChange={(event) => setOtherReason(event.target.value)}
                                maxLength={160}
                                placeholder={text('اكتب السبب', 'Type the reason')}
                                autoFocus
                                className="mt-2 h-11 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                            />
                        )}
                    </div>

                    <label className="block">
                        <span className="mb-1.5 block text-xs font-semibold text-[var(--ac-text-soft)]">{text('التاريخ', 'Date')}</span>
                        <input
                            type="date"
                            value={date}
                            max={todayValue()}
                            onChange={(event) => setDate(event.target.value)}
                            className="h-11 w-full rounded-[11px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                        />
                    </label>

                    <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--ac-text-soft)]">
                        <input
                            type="checkbox"
                            checked={showPreview}
                            onChange={(event) => setShowPreview(event.target.checked)}
                            className="size-4 accent-[var(--ac-accent-strong)]"
                        />
                        {text('شوف الرصيد قبل وبعد', 'Show the balance before and after')}
                    </label>

                    {showPreview && (
                        <div>
                            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center">
                                <div className="rounded-[12px] bg-[var(--ac-bg)] p-2.5">
                                    <small className="block text-[11px] text-[var(--ac-text-muted)]">{text('قبل', 'Before')}</small>
                                    <b className="text-sm tabular-nums text-[var(--ac-text)]">{balanceText(before)}</b>
                                </div>
                                <Arrow size={16} className="text-[var(--ac-text-muted)]" />
                                <div className="rounded-[12px] bg-[var(--ac-bg)] p-2.5">
                                    <small className="block text-[11px] text-[var(--ac-text-muted)]">{text('بعد', 'After')}</small>
                                    <b className="text-sm tabular-nums text-[var(--ac-text)]">{balanceText(after)}</b>
                                </div>
                            </div>

                            <p className="mt-3 text-[11px] text-[var(--ac-text-muted)]">{text('هيك رح يطلع بكشف الحساب:', 'This is how it will show on the statement:')}</p>
                            <div className="mt-1.5 overflow-hidden rounded-[12px] border border-[var(--ac-line)] text-[11px]">
                                <div className="grid grid-cols-[84px_1fr_80px_110px] gap-2 bg-[var(--ac-surface-soft)] px-3 py-2 font-semibold text-[var(--ac-text-muted)]">
                                    <span>{text('التاريخ', 'Date')}</span>
                                    <span>{text('البيان', 'Details')}</span>
                                    <span>{text('المبلغ', 'Amount')}</span>
                                    <span>{text('الرصيد', 'Balance')}</span>
                                </div>
                                <div className="grid grid-cols-[84px_1fr_80px_110px] items-center gap-2 px-3 py-2 text-[var(--ac-text-soft)]">
                                    <span className="tabular-nums">{date}</span>
                                    <span className="truncate">
                                        <span className="me-1 rounded-full bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-500">{text('فروقات', 'Difference')}</span>
                                        {reason || '…'}
                                    </span>
                                    <span className="tabular-nums">{(direction === 'we_owe' ? '−' : '+') + money(value)}</span>
                                    <span className="tabular-nums">{balanceText(after)}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="rounded-[12px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
                    )}

                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="inline-flex h-10 items-center rounded-[11px] border border-[var(--ac-line)] px-4 text-xs font-semibold text-[var(--ac-text-soft)]"
                        >
                            {text('إلغاء', 'Cancel')}
                        </button>
                        <button
                            type="button"
                            disabled={busy}
                            onClick={() => void submit()}
                            className="inline-flex h-10 items-center rounded-[11px] border border-[var(--ac-accent)] bg-[var(--ac-accent)] px-5 text-xs font-bold text-white transition hover:brightness-110 disabled:opacity-50"
                        >
                            {busy ? text('جارٍ الحفظ…', 'Saving…') : text('اعتماد', 'Post')}
                        </button>
                    </div>
                </div>
            </div>
        </div>
        </ModalPortal>
    );
}
