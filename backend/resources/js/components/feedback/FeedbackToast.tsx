import { t, useLocale } from '@/lib/i18n';
import {
    AlertCircle,
    CheckCircle2,
    X,
} from 'lucide-react';

export type FeedbackTone =
    | 'success'
    | 'error' | 'warning' | 'info';

type FeedbackToastProps = {
    message: string | null;

    tone?: FeedbackTone | undefined;

    actionLabel?: string | undefined;

    onAction?: (() => void | Promise<void>) | undefined;

    onDismiss: () => void;
};

/**
 * Render lightweight application feedback without interrupting the user's
 * operating flow.
 */
export function FeedbackToast({
    message,
    tone = 'success',
    actionLabel,
    onAction,
    onDismiss,
}: FeedbackToastProps) {
    useLocale();
    if (! message) {
        return null;
    }

    const success =
        tone === 'success';

    return (
        <div
            role={tone === 'error' ? 'alert' : 'status'} aria-live={tone === 'error' ? 'assertive' : 'polite'} aria-atomic="true"
            className="fixed bottom-4 start-3 end-3 z-[160] motion-safe:animate-[fadeIn_180ms_ease-out] sm:bottom-6 sm:start-auto sm:end-6 sm:w-[380px]"
            style={{
                bottom:
                    'max(1rem, env(safe-area-inset-bottom))',
            }}
        >
            <div className="flex items-start gap-3 rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-4 shadow-[var(--ac-shadow-panel)]">
                <div
                    className={[
                        'flex size-9 shrink-0 items-center justify-center rounded-[13px]',
                        success
                            ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                            : tone === 'warning' ? 'bg-amber-50 text-amber-800' : tone === 'info' ? 'bg-blue-50 text-blue-800' : 'bg-[var(--ac-danger)]/8 text-[var(--ac-danger)]',
                    ].join(' ')}
                >
                    {success ? (
                        <CheckCircle2
                            size={17}
                        />
                    ) : (
                        <AlertCircle
                            size={17}
                        />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <p className="break-words pt-1 text-sm font-medium leading-5 text-[var(--ac-text)]">
                        {message}
                    </p>

                    {actionLabel && onAction && (
                        <button
                            type="button"
                            onClick={() => void onAction()}
                            className="mt-2 rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] px-3 py-1.5 text-xs font-bold text-[var(--ac-accent)] transition hover:border-[var(--ac-accent)]"
                        >
                            {actionLabel}
                        </button>
                    )}
                </div>

                <button
                    type="button"
                    aria-label={t('common.dismiss')}
                    onClick={onDismiss}
                    className="flex size-8 shrink-0 items-center justify-center rounded-[11px] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)]"
                >
                    <X size={15} />
                </button>
            </div>
        </div>
    );
}