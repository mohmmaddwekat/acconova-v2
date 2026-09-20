import {
    Archive,
    RotateCcw,
    Trash2,
    X,
} from 'lucide-react';
import {
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import {
    createPortal,
} from 'react-dom';

import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    useDialog,
} from './useDialog';

export const CONFIRMATION_DELAY_SECONDS =
    5;

type ConfirmDialogProps = {
    open: boolean;

    title: string;

    description: string;

    confirmLabel: string;

    tone?:
        | 'warning'
        | 'danger'
        | 'positive';

    busy?: boolean;

    onCancel: () => void;

    onConfirm:
        () =>
            | void
            | Promise<void>;
};

/**
 * Render a portal-backed confirmation surface with a five-second safety delay.
 *
 * Portal rendering keeps destructive confirmations above every feature drawer
 * and prevents AppShell layout ancestors from clipping the modal.
 */
export function ConfirmDialog({
    open,
    title,
    description,
    confirmLabel,
    tone = 'warning',
    busy = false,
    onCancel,
    onConfirm,
}: ConfirmDialogProps) {
    useLocale();

    const id =
        useId();

    const [
        remaining,
        setRemaining,
    ] =
        useState(
            CONFIRMATION_DELAY_SECONDS,
        );

    const submitted =
        useRef(
            false,
        );

    const deadline =
        useRef(
            0,
        );

    const ref =
        useDialog(
            open,
            onCancel,
            busy,
        );

    useEffect(() => {
        submitted.current =
            false;

        setRemaining(
            CONFIRMATION_DELAY_SECONDS,
        );

        if (
            ! open
        ) {
            return;
        }

        deadline.current =
            Date.now()
            +
            CONFIRMATION_DELAY_SECONDS
                * 1000;

        const timer =
            window.setInterval(
                () =>
                    setRemaining(
                        Math.max(
                            0,
                            Math.ceil(
                                (
                                    deadline.current
                                    -
                                    Date.now()
                                )
                                / 1000,
                            ),
                        ),
                    ),
                200,
            );

        return () =>
            window.clearInterval(
                timer,
            );
    }, [
        open,
    ]);

    useEffect(() => {
        if (
            ! busy
        ) {
            submitted.current =
                false;
        }
    }, [
        busy,
    ]);

    if (
        ! open ||
        typeof document ===
            'undefined'
    ) {
        return null;
    }

    const Icon =
        tone ===
        'positive'
            ? RotateCcw
            : tone ===
                'danger'
              ? Trash2
              : Archive;

    const color =
        tone ===
        'positive'
            ? 'bg-emerald-50 text-emerald-800'
            : tone ===
                'danger'
              ? 'bg-red-50 text-red-800'
              : 'bg-amber-50 text-amber-900';

    const surface = (
        <div className="fixed inset-0 z-[320] flex items-end justify-center sm:items-center sm:p-5">
            <button
                type="button"
                aria-label={t(
                    'common.close',
                )}
                className="absolute inset-0 bg-black/25 backdrop-blur-[3px]"
                onClick={() => {
                    if (
                        ! busy
                    ) {
                        onCancel();
                    }
                }}
            />

            <section
                ref={
                    ref
                }
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${id}-title`}
                aria-describedby={`${id}-description`}
                aria-busy={
                    busy
                }
                className="relative max-h-[90dvh] w-full overflow-y-auto rounded-t-[28px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[var(--ac-shadow-panel)] sm:max-w-[460px] sm:rounded-[26px] sm:p-6"
            >
                <div className="flex items-center justify-between">
                    <div
                        className={`rounded-2xl p-3 ${color}`}
                    >
                        <Icon
                            size={
                                20
                            }
                        />
                    </div>

                    <button
                        type="button"
                        aria-label={t(
                            'common.close',
                        )}
                        disabled={
                            busy
                        }
                        onClick={
                            onCancel
                        }
                        className="flex size-11 items-center justify-center rounded-xl hover:bg-[var(--ac-surface-soft)]"
                    >
                        <X
                            size={
                                18
                            }
                        />
                    </button>
                </div>

                <h2
                    id={`${id}-title`}
                    className="mt-5 break-words text-2xl font-semibold"
                >
                    {
                        title
                    }
                </h2>

                <p
                    id={`${id}-description`}
                    className="mt-3 break-words text-sm leading-6 text-[var(--ac-text-soft)]"
                >
                    {
                        description
                    }
                </p>

                <div className="mt-6 flex flex-wrap justify-end gap-2">
                    <button
                        type="button"
                        disabled={
                            busy
                        }
                        onClick={
                            onCancel
                        }
                        className="min-h-11 rounded-xl px-4 py-2 text-sm font-semibold hover:bg-[var(--ac-surface-soft)]"
                    >
                        {t(
                            'common.cancel',
                        )}
                    </button>

                    <button
                        type="button"
                        disabled={
                            busy ||
                            remaining >
                                0
                        }
                        onClick={() => {
                            if (
                                busy ||
                                submitted.current ||
                                Date.now() <
                                    deadline.current
                            ) {
                                return;
                            }

                            submitted.current =
                                true;

                            void onConfirm();
                        }}
                        className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50 ${color}`}
                    >
                        {busy
                            ? t(
                                  'common.working',
                              )
                            : remaining >
                                0
                              ? t(
                                    'confirm.countdown',
                                    {
                                        action:
                                            confirmLabel,

                                        seconds:
                                            remaining,
                                    },
                                )
                              : confirmLabel}
                    </button>
                </div>
            </section>
        </div>
    );

    return createPortal(
        surface,
        document.body,
    );
}