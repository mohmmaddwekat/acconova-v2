import { useDialog } from '@/components/feedback/useDialog';
import { Banknote, CheckCircle2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CashForm } from './CashForm';
import type { CashDetail, FinanceLookups } from './types';

type SavedPayment = {
    id: number;
    number: string | null;
    amount: string;
    posted: boolean;
};

/**
 * Record receipts (sales invoices) or payments (purchase invoices) without
 * leaving the invoice list. One payment can settle several invoices of the
 * same party, and the dialog stays open after every save so many payments can
 * be entered in a row; the list behind it refreshes each time.
 */
export function PaymentDialog({
    direction,
    lookups,
    ar,
    defaultPartyId = null,
    onClose,
    onChanged,
}: {
    direction: 'incoming' | 'outgoing';
    lookups: FinanceLookups;
    ar: boolean;
    defaultPartyId?: number | null;
    onClose: () => void;
    onChanged: () => void;
}) {
    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;
    const incoming = direction === 'incoming';
    const [formKey, setFormKey] = useState(0);
    const [saved, setSaved] = useState<SavedPayment[]>([]);
    const surface = useDialog(true, onClose);
    const scroller = useRef<HTMLDivElement | null>(null);

    function handleSaved(movement: CashDetail, posted: boolean): void {
        setSaved((current) => [
            {
                id: movement.id,
                number: movement.number ?? null,
                amount: movement.amount,
                posted,
            },
            ...current,
        ]);
        setFormKey((value) => value + 1);
        onChanged();
        scroller.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    return createPortal(
        <div
            ref={scroller}
            className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/30 p-3 backdrop-blur-sm sm:p-6"
        >
            <section
                ref={surface}
                role="dialog"
                aria-modal="true"
                aria-labelledby="payment-dialog-title"
                className="w-full max-w-5xl rounded-[24px] border border-[var(--ac-line)] bg-[var(--ac-bg)] p-4 shadow-2xl sm:p-6"
            >
                <header className="mb-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <Banknote size={18} />
                        </span>
                        <div>
                            <h2 id="payment-dialog-title" className="text-sm font-bold">
                                {incoming
                                    ? text('إضافة مقبوض', 'Add receipt')
                                    : text('إضافة دفعة', 'Add payment')}
                            </h2>
                            <p className="mt-0.5 text-[11px] text-[var(--ac-text-muted)]">
                                {text(
                                    'اختر الطرف ثم وزّع المبلغ على فاتورة أو أكثر. تبقى النافذة مفتوحة بعد الحفظ لإضافة المزيد.',
                                    'Pick the party, then split the amount over one or more invoices. The window stays open after saving so you can add more.',
                                )}
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={text('إغلاق', 'Close')}
                        className="flex size-9 items-center justify-center rounded-xl border border-[var(--ac-line)] text-[var(--ac-text-muted)] hover:border-[var(--ac-accent)]"
                    >
                        <X size={18} />
                    </button>
                </header>

                {saved.length > 0 && (
                    <ul
                        role="status"
                        className="mb-4 space-y-1.5 rounded-[14px] border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs"
                    >
                        {saved.map((payment) => (
                            <li key={payment.id} className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                <span className="font-semibold">
                                    {payment.number ?? '#' + String(payment.id)}
                                </span>
                                <span className="text-[var(--ac-text-muted)]">
                                    {payment.amount}
                                    {' · '}
                                    {payment.posted
                                        ? text('معتمد', 'Posted')
                                        : text('مسودة', 'Draft')}
                                </span>
                                <a
                                    href={(incoming ? '/app/receipts/' : '/app/payments/') + String(payment.id)}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="ms-auto text-[var(--ac-accent)] underline"
                                >
                                    {text('عرض', 'Open')}
                                </a>
                            </li>
                        ))}
                    </ul>
                )}

                <CashForm
                    key={formKey}
                    direction={direction}
                    lookups={lookups}
                    ar={ar}
                    embedded
                    defaultPartyId={defaultPartyId}
                    onSaved={handleSaved}
                />
            </section>
        </div>,
        document.body,
    );
}
