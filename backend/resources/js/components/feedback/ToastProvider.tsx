import { createContext, useCallback, useContext, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { FeedbackToast, type FeedbackTone } from './FeedbackToast';

type ToastAction = {
    label: string;
    run: () => void | Promise<void>;
};

type Toast = {
    id: number;
    message: string;
    tone: FeedbackTone;
    action?: ToastAction;
    duration?: number;
};

type ToastApi = {
    showToast: (
        message: string,
        tone?: FeedbackTone,
        action?: ToastAction,
        duration?: number,
    ) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** Own one application-wide queue so navigation and drawers share feedback timing. */
export function ToastProvider({ children }: PropsWithChildren) {
    const [queue, setQueue] = useState<Toast[]>([]);
    const nextId = useRef(0);

    const showToast = useCallback((
        message: string,
        tone: FeedbackTone = 'success',
        action?: ToastAction,
        duration?: number,
    ) => {
        setQueue((current) => [
            ...current.slice(-4),
            {
                id: ++nextId.current,
                message,
                tone,
                action,
                duration,
            },
        ]);
    }, []);

    const current = queue[0];
    const dismiss = useCallback(
        () => setQueue((items) => items.slice(1)),
        [],
    );

    useEffect(() => {
        if (! current) {
            return;
        }

        const timer = window.setTimeout(
            dismiss,
            current.duration
                ?? (
                    current.tone === 'error'
                        ? 9000
                        : current.action
                            ? 8000
                            : 5000
                ),
        );

        return () => window.clearTimeout(timer);
    }, [current, dismiss]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <FeedbackToast
                key={current?.id ?? 0}
                message={current?.message ?? null}
                tone={current?.tone}
                actionLabel={current?.action?.label}
                onAction={current?.action
                    ? async () => {
                        await current.action?.run();
                        dismiss();
                    }
                    : undefined}
                onDismiss={dismiss}
            />
        </ToastContext.Provider>
    );
}

/** Publish feedback without duplicating timers or toast markup in feature pages. */
export function useToast(): ToastApi {
    const context = useContext(ToastContext);

    if (! context) {
        throw new Error('ToastProvider is required.');
    }

    return context;
}
