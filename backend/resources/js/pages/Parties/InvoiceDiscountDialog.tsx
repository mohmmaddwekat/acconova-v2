import { ModalPortal } from '@/components/feedback/ModalPortal';
import { ApiError, apiRequest } from '@/lib/http';
import { X } from 'lucide-react';
import { useState } from 'react';

type Props = {
    partyId: number;
    documentId: number;
    reference: string;
    remaining: string;
    currency: string;
    ar: boolean;
    onClose: () => void;
    onSaved: () => void;
    initialDate?: string;
};

const todayValue = (): string => {
    const now = new Date();

    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};

/**
 * A discount on one invoice, added straight from the statement row: type the amount
 * (or take everything that is left) and the invoice goes down by it.
 */
export function InvoiceDiscountDialog({ partyId, documentId, reference, remaining, currency, ar, onClose, onSaved, initialDate }: Props) {
    const text = (arabic: string, english: string): string => (ar ? arabic : english);
    const left = Number(remaining) || 0;
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(initialDate && initialDate <= todayValue() ? initialDate : todayValue());
    const [reason, setReason] = useState(ar ? 'خصم متفق عليه' : 'Agreed discount');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const typed = Number(amount) || 0;
    const money = (value: number): string => value.toLocaleString('en', { maximumFractionDigits: 2 });

    async function save(): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest('/api/parties/' + String(partyId) + '/adjustments', {
                method: 'POST',
                body: JSON.stringify({
                    financial_document_id: documentId,
                    direction: 'owed_to_us',
                    amount,
                    adjustment_date: date,
                    reason: reason.trim() || (ar ? 'خصم متفق عليه' : 'Agreed discount'),
                }),
            });
            onSaved();
            onClose();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : (ar ? 'تعذّر تسجيل الخصم.' : 'Could not save the discount.'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
                <div className="w-full max-w-md overflow-hidden rounded-t-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-2xl sm:rounded-[26px]">
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] p-4">
                        <strong className="text-base">{text('خصم على الفاتورة ', 'Discount on invoice ')}{reference}</strong>
                        <button type="button" onClick={onClose} aria-label={text('إغلاق', 'Close')} className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)]"><X size={16} /></button>
                    </div>
                    <div className="space-y-3 p-4">
                        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
                        <p className="rounded-xl bg-[var(--ac-bg-soft)] px-3 py-2 text-xs">
                            {text('المتبقي على الفاتورة: ', 'Left on the invoice: ')}<b>{money(left)} {currency}</b>
                        </p>
                        <label className="block text-xs font-semibold text-[var(--ac-text-muted)]">
                            {text('مبلغ الخصم', 'Discount amount')}
                            <div className="mt-1 flex gap-2">
                                <input
                                    type="number"
                                    min="0.0001"
                                    step="0.01"
                                    dir="ltr"
                                    autoFocus
                                    className="h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                    value={amount}
                                    onChange={(event) => setAmount(event.target.value)}
                                />
                                <button type="button" onClick={() => setAmount(String(left))} className="shrink-0 rounded-[12px] border border-[var(--ac-line)] px-3 text-xs font-bold text-[var(--ac-accent)]">
                                    {text('كل المتبقي', 'All that is left')}
                                </button>
                            </div>
                        </label>
                        <label className="block text-xs font-semibold text-[var(--ac-text-muted)]">
                            {text('التاريخ', 'Date')}
                            <input
                                type="date"
                                max={todayValue()}
                                min="2000-01-01"
                                dir="ltr"
                                className="mt-1 h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                value={date}
                                onChange={(event) => setDate(event.target.value)}
                            />
                        </label>
                        <label className="block text-xs font-semibold text-[var(--ac-text-muted)]">
                            {text('السبب', 'Reason')}
                            <input
                                maxLength={160}
                                className="mt-1 h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                            />
                        </label>
                        {typed > 0 && (
                            <p className="text-[11px] text-[var(--ac-text-muted)]">
                                {typed > left + 0.005
                                    ? text('الخصم أكبر من المتبقي.', 'The discount is more than what is left.')
                                    : typed >= left - 0.005
                                        ? text('الفاتورة تُغلق بالكامل.', 'The invoice will be closed.')
                                        : text('يبقى على الفاتورة: ', 'Left after: ') + money(left - typed) + ' ' + currency}
                            </p>
                        )}
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="min-h-10 rounded-[12px] border border-[var(--ac-line)] px-4 text-sm font-bold">{text('إلغاء', 'Cancel')}</button>
                            <button type="button" disabled={busy || typed <= 0 || typed > left + 0.005} onClick={() => void save()} className="min-h-10 rounded-[12px] bg-[var(--ac-accent)] px-4 text-sm font-bold text-white disabled:opacity-50">
                                {busy ? text('جارٍ الحفظ…', 'Saving…') : text('حفظ الخصم', 'Save discount')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}
