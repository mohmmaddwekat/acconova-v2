import { ModalPortal } from '@/components/feedback/ModalPortal';
import { ApiError, apiRequest } from '@/lib/http';
import { X } from 'lucide-react';
import { useState } from 'react';

type Props = {
    partyId: number;
    adjustmentId: number;
    reference: string;
    initialAmount: string;
    initialDate: string;
    initialReason: string;
    ar: boolean;
    onClose: () => void;
    onSaved: () => void;
};

const todayValue = (): string => {
    const now = new Date();

    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
};

/**
 * Corrects the amount, date or wording of a difference entry ("قيد فروقات") in
 * place, instead of voiding it and typing it again.
 */
export function PartyAdjustmentEditDialog({ partyId, adjustmentId, reference, initialAmount, initialDate, initialReason, ar, onClose, onSaved }: Props) {
    const text = (arabic: string, english: string): string => (ar ? arabic : english);
    const [amount, setAmount] = useState(String(Number(initialAmount)));
    const [date, setDate] = useState(initialDate);
    const [reason, setReason] = useState(initialReason);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    async function save(): Promise<void> {
        setBusy(true);
        setError('');

        try {
            await apiRequest('/api/parties/' + String(partyId) + '/adjustments/' + String(adjustmentId), {
                method: 'PATCH',
                body: JSON.stringify({ amount, adjustment_date: date, reason: reason.trim() || undefined }),
            });
            onSaved();
            onClose();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : (ar ? 'تعذّر تعديل القيد.' : 'Could not edit the entry.'));
        } finally {
            setBusy(false);
        }
    }

    return (
        <ModalPortal>
            <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true">
                <div className="w-full max-w-md overflow-hidden rounded-t-[26px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-2xl sm:rounded-[26px]">
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] p-4">
                        <strong className="text-base">{text('تعديل قيد الفروقات ', 'Edit difference entry ')}{reference}</strong>
                        <button type="button" onClick={onClose} aria-label={text('إغلاق', 'Close')} className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)]"><X size={16} /></button>
                    </div>
                    <div className="space-y-3 p-4">
                        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
                        <label className="block text-xs font-semibold text-[var(--ac-text-muted)]">
                            {text('المبلغ', 'Amount')}
                            <input
                                type="number"
                                min="0.0001"
                                step="0.01"
                                dir="ltr"
                                className="mt-1 h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                            />
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
                        <p className="text-[11px] text-[var(--ac-text-muted)]">
                            {text('التعديل يُسجَّل في سجل التدقيق بالقيم قبل وبعد. إن كان القيد خصماً على فاتورة فلا يزيد عن المتبقي عليها.', 'The change is kept in the audit log with before and after values. A discount on an invoice cannot exceed what is left on it.')}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button type="button" onClick={onClose} className="min-h-10 rounded-[12px] border border-[var(--ac-line)] px-4 text-sm font-bold">{text('إلغاء', 'Cancel')}</button>
                            <button type="button" disabled={busy || Number(amount) <= 0} onClick={() => void save()} className="min-h-10 rounded-[12px] bg-[var(--ac-accent)] px-4 text-sm font-bold text-white disabled:opacity-50">
                                {busy ? text('جارٍ الحفظ…', 'Saving…') : text('حفظ التعديل', 'Save changes')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </ModalPortal>
    );
}
