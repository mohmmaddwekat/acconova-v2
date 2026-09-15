import {
    Archive,
    RotateCcw,
    X,
} from 'lucide-react';
import {
    useEffect,
} from 'react';

type ConfirmDialogTone =
    | 'danger'
    | 'positive';

type ConfirmDialogProps = {
    open: boolean;

    title: string;
    description: string;

    confirmLabel: string;

    tone?: ConfirmDialogTone;

    busy?: boolean;

    onCancel: () => void;

    onConfirm: () => void;
};

/**
 * Render a reusable confirmation surface for important business actions.
 *
 * The dialog supports keyboard dismissal, mobile layouts, destructive actions,
 * and positive recovery actions without tying itself to a specific feature.
 */
export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    tone = 'danger',
    busy = false,
    onCancel,
    onConfirm,
}: ConfirmDialogProps) {
    useEffect(() => {
        if (! open) {
            return;
        }

        /**
         * Close the confirmation dialog when Escape is pressed.
         */
        function handleKeyDown(
            event: KeyboardEvent,
        ): void {
            if (
                event.key === 'Escape'
                && ! busy
            ) {
                onCancel();
            }
        }

        window.addEventListener(
            'keydown',
            handleKeyDown,
        );

        return () => {
            window.removeEventListener(
                'keydown',
                handleKeyDown,
            );
        };
    }, [
        busy,
        onCancel,
        open,
    ]);

    if (! open) {
        return null;
    }

    const positive =
        tone === 'positive';

    return (
        <div
            role="presentation"
            className="fixed inset-0 z-[140] flex items-end justify-center p-0 sm:items-center sm:p-5"
        >
            <button
                type="button"
                aria-label="Close confirmation"
                onClick={() => {
                    if (! busy) {
                        onCancel();
                    }
                }}
                className="absolute inset-0 bg-[var(--ac-text)]/25 backdrop-blur-[3px]"
            />

            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="confirm-dialog-title"
                className="relative z-10 w-full overflow-hidden rounded-t-[28px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-panel)] sm:max-w-[460px] sm:rounded-[26px]"
            >
                <div className="p-5 sm:p-6">
                    <div className="flex items-start justify-between gap-5">
                        <div
                            className={[
                                'flex size-11 shrink-0 items-center justify-center rounded-[16px]',
                                positive
                                    ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                    : 'bg-[var(--ac-danger)]/8 text-[var(--ac-danger)]',
                            ].join(' ')}
                        >
                            {positive ? (
                                <RotateCcw
                                    size={18}
                                />
                            ) : (
                                <Archive
                                    size={18}
                                />
                            )}
                        </div>

                        <button
                            type="button"
                            disabled={busy}
                            onClick={onCancel}
                            className="flex size-9 shrink-0 items-center justify-center rounded-[13px] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] disabled:opacity-40"
                        >
                            <X size={17} />
                        </button>
                    </div>

                    <h2
                        id="confirm-dialog-title"
                        className="mt-6 text-2xl font-semibold tracking-[-0.045em] text-[var(--ac-text)]"
                    >
                        {title}
                    </h2>

                    <p className="mt-2 text-sm leading-6 text-[var(--ac-text-soft)]">
                        {description}
                    </p>
                </div>

                <footer className="grid grid-cols-2 gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4 sm:flex sm:justify-end">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onCancel}
                        className="h-11 rounded-[14px] px-5 text-sm font-semibold text-[var(--ac-text-soft)] transition hover:bg-white disabled:opacity-40"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={onConfirm}
                        className={[
                            'h-11 rounded-[14px] px-5 text-sm font-semibold transition disabled:opacity-50',
                            positive
                                ? 'bg-[var(--ac-accent-strong)] text-white'
                                : 'bg-[var(--ac-text)] text-white',
                        ].join(' ')}
                    >
                        {busy
                            ? 'Working…'
                            : confirmLabel}
                    </button>
                </footer>
            </section>
        </div>
    );
}