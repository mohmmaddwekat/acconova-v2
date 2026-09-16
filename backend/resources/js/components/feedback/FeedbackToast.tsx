import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';

import { t, useLocale } from '@/lib/i18n';

export type FeedbackTone = 'success' | 'error' | 'warning' | 'info';

type FeedbackToastProps = {
    message: string | null;
    tone?: FeedbackTone;
    onDismiss: () => void;
};

/**
 * Render application feedback as a calm floating status card.
 *
 * The toast stays compact on phones, anchors to the logical end on larger
 * screens, and announces errors assertively without exposing technical text.
 */
export function FeedbackToast({
    message,
    tone = 'success',
    onDismiss,
}: FeedbackToastProps) {
    useLocale();

    if (!message) {
        return null;
    }

    const presentation = {
        success: {
            icon: CheckCircle2,
            iconClass:
                'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]',
            edgeClass: 'bg-[var(--ac-accent)]',
        },
        error: {
            icon: AlertCircle,
            iconClass: 'bg-[var(--ac-danger)]/8 text-[var(--ac-danger)]',
            edgeClass: 'bg-[var(--ac-danger)]',
        },
        warning: {
            icon: TriangleAlert,
            iconClass: 'bg-amber-50 text-amber-800',
            edgeClass: 'bg-[var(--ac-warning)]',
        },
        info: {
            icon: Info,
            iconClass: 'bg-blue-50 text-blue-800',
            edgeClass: 'bg-[var(--ac-info)]',
        },
    }[tone];

    const Icon = presentation.icon;

    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'}
            aria-live={tone === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
            className="fixed bottom-4 start-3 end-3 z-[160] motion-safe:animate-[ac-toast-in_180ms_ease-out] sm:bottom-6 sm:start-auto sm:end-6 sm:w-[390px]"
            style={{
                bottom: 'max(1rem, env(safe-area-inset-bottom))',
            }}
        >
            <div className="relative overflow-hidden rounded-[19px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-float)]">
                <span
                    aria-hidden="true"
                    className={[
                        'absolute inset-y-0 start-0 w-1',
                        presentation.edgeClass,
                    ].join(' ')}
                />

                <div className="flex items-start gap-3 ps-1">
                    <div
                        className={[
                            'flex size-9 shrink-0 items-center justify-center rounded-[13px]',
                            presentation.iconClass,
                        ].join(' ')}
                    >
                        <Icon size={17} />
                    </div>

                    <p className="min-w-0 flex-1 break-words pt-1 text-sm font-medium leading-5 text-[var(--ac-text)]">
                        {message}
                    </p>

                    <button
                        type="button"
                        aria-label={t('common.dismiss')}
                        onClick={onDismiss}
                        className="flex size-8 shrink-0 items-center justify-center rounded-[11px] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>
        </div>
    );
}
