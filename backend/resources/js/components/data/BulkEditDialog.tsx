import {
    PencilLine,
    X,
} from 'lucide-react';
import {
    useEffect,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

export type BulkEditField = {
    key: string;
    label: string;
    placeholder?: string;
    type?: 'text' | 'number';
};

export function BulkEditDialog({
    open,
    title,
    description,
    fields,
    busy,
    ar,
    onClose,
    onApply,
}: {
    open: boolean;
    title: string;
    description: string;
    fields: BulkEditField[];
    busy: boolean;
    ar: boolean;
    onClose: () => void;
    onApply: (patch: Record<string, string>) => void | Promise<void>;
}) {
    const [values, setValues] = useState<Record<string, string>>({});

    useEffect(() => {
        if (open) {
            setValues({});
        }
    }, [open]);

    if (! open || typeof document === 'undefined') {
        return null;
    }

    const surface = (
        <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
            <button
                type="button"
                aria-label={ar ? 'إغلاق' : 'Close'}
                onClick={busy ? undefined : onClose}
                className="absolute inset-0 bg-[var(--ac-text)]/30 backdrop-blur-[3px]"
            />

            <section
                role="dialog"
                aria-modal="true"
                className="relative z-10 w-full max-w-lg rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-5 shadow-[0_30px_90px_rgba(1,20,35,.28)]"
            >
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <div className="flex size-10 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]">
                            <PencilLine size={17} />
                        </div>
                        <h2 className="mt-3 text-lg font-bold text-[var(--ac-text)]">
                            {title}
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-[var(--ac-text-muted)]">
                            {description}
                        </p>
                    </div>

                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="flex size-9 items-center justify-center rounded-[11px] text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)] disabled:opacity-50"
                    >
                        <X size={15} />
                    </button>
                </div>

                <div className="mt-5 space-y-3">
                    {fields.map((field) => (
                        <label
                            key={field.key}
                            className="block text-[11px] font-semibold text-[var(--ac-text-soft)]"
                        >
                            {field.label}
                            <input
                                type={field.type ?? 'text'}
                                value={values[field.key] ?? ''}
                                placeholder={
                                    field.placeholder
                                    ?? (ar
                                        ? 'اتركه فارغاً لعدم التغيير'
                                        : 'Leave blank to keep unchanged')
                                }
                                onChange={(event) =>
                                    setValues((current) => ({
                                        ...current,
                                        [field.key]: event.target.value,
                                    }))}
                                className="mt-1.5 h-11 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-bg)] px-3 text-sm text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                            />
                        </label>
                    ))}
                </div>

                <div className="mt-6 flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={busy}
                        onClick={onClose}
                        className="h-10 rounded-[11px] border border-[var(--ac-line)] px-4 text-xs font-semibold text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]"
                    >
                        {ar ? 'إلغاء' : 'Cancel'}
                    </button>
                    <button
                        type="button"
                        disabled={
                            busy
                            || ! Object.values(values).some(
                                (value) => value.trim() !== '',
                            )
                        }
                        onClick={() =>
                            void onApply(
                                Object.fromEntries(
                                    Object.entries(values)
                                        .filter(([, value]) => value.trim() !== '')
                                        .map(([key, value]) => [key, value.trim()]),
                                ),
                            )}
                        className="h-10 rounded-[11px] bg-[var(--ac-accent-solid)] px-4 text-xs font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-45"
                    >
                        {busy
                            ? (ar ? 'جارٍ التطبيق…' : 'Applying…')
                            : (ar ? 'تطبيق على المحدد' : 'Apply to selected')}
                    </button>
                </div>
            </section>
        </div>
    );

    return createPortal(surface, document.body);
}
