import { useKeepOpenPreference } from '@/components/data/KeepOpenToggle';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import { CashForm } from './CashForm';
import type { CashDetail, FinanceLookups } from './types';

type SavedMovement = {
    id: number;
    number: string | null;
    amount: string;
    posted: boolean;
};

/**
 * The add-receipt / add-payment page: with "stay open" on it keeps the page after
 * every save and starts a fresh form, listing what was just saved.
 */
export function CashCreateStay({
    direction,
    lookups,
    ar,
}: {
    direction: 'incoming' | 'outgoing';
    lookups: FinanceLookups;
    ar: boolean;
}) {
    const text = (arabic: string, english: string): string => (ar ? arabic : english);
    const incoming = direction === 'incoming';
    const [formKey, setFormKey] = useState(0);
    const [saved, setSaved] = useState<SavedMovement[]>([]);
    const [keepOpen, setKeepOpen] = useKeepOpenPreference('cash-' + direction);

    function handleSaved(movement: CashDetail, posted: boolean): void {
        if (! keepOpen) {
            window.location.assign((incoming ? '/app/receipts/' : '/app/payments/') + String(movement.id));

            return;
        }

        setSaved((current) => [
            { id: movement.id, number: movement.number ?? null, amount: movement.amount, posted },
            ...current,
        ]);
        setFormKey((value) => value + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    return (
        <div>
            {saved.length > 0 && (
                <ul
                    role="status"
                    className="mb-4 space-y-1.5 rounded-[14px] border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs"
                >
                    {saved.map((movement) => (
                        <li key={movement.id} className="flex items-center gap-2">
                            <CheckCircle2 size={14} className="text-emerald-600" />
                            <span className="font-semibold">{movement.number ?? '#' + String(movement.id)}</span>
                            <span className="text-[var(--ac-text-muted)]">
                                {movement.amount}
                                {' · '}
                                {movement.posted ? text('معتمد', 'Posted') : text('مسودة', 'Draft')}
                            </span>
                            <a
                                href={(incoming ? '/app/receipts/' : '/app/payments/') + String(movement.id)}
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
                onSaved={handleSaved}
                keepOpen={keepOpen}
                onKeepOpenChange={setKeepOpen}
            />
        </div>
    );
}
