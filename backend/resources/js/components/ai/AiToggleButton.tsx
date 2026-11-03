import { Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useLocale } from '@/lib/i18n';

export const aiToggleEvent = 'acconova:ai-toggle';
export const aiStateEvent = 'acconova:ai-state';

/**
 * Navbar button that opens or closes the docked AccoNova AI panel.
 *
 * The panel lives in AiSidekick; the two talk through window events so the
 * navbar does not need to know about the assistant's state.
 */
export function AiToggleButton() {
    const ar = useLocale() === 'ar';
    const [open, setOpen] = useState(false);
    const [available, setAvailable] = useState(false);

    useEffect(() => {
        const handleState = (event: Event): void => {
            const detail = (event as CustomEvent<{
                open: boolean;
                available: boolean;
            }>).detail;

            setOpen(detail.open);
            setAvailable(detail.available);
        };

        window.addEventListener(aiStateEvent, handleState);
        window.dispatchEvent(new CustomEvent('acconova:ai-sync'));

        return () => window.removeEventListener(aiStateEvent, handleState);
    }, []);

    if (! available) {
        return null;
    }

    return (
        <button
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent(aiToggleEvent))}
            aria-pressed={open}
            title={ar ? 'اسأل AccoNova AI' : 'Ask AccoNova AI'}
            className={[
                'inline-flex h-10 items-center gap-2 rounded-full border px-3 text-xs font-semibold transition',
                open
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                    : 'border-[var(--ac-line)] bg-[var(--ac-surface)] text-[var(--ac-text)] hover:bg-[var(--ac-surface-soft)]',
            ].join(' ')}
        >
            <Sparkles size={15} className="text-[var(--ac-accent)]" />
            <span className="hidden sm:inline">AccoNova AI</span>
        </button>
    );
}
