import {
    Check,
    Pencil,
    X,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';

export function InlineEditValue({
    value,
    display,
    editable,
    type = 'text',
    inputMode,
    onSave,
    className = '',
    emptyLabel = '—',
}: {
    value: string;
    display?: ReactNode;
    editable: boolean;
    type?: 'text' | 'number' | 'email' | 'tel';
    inputMode?: 'decimal' | 'numeric' | 'email' | 'tel' | 'text';
    onSave: (value: string) => void | Promise<void>;
    className?: string;
    emptyLabel?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const [busy, setBusy] = useState(false);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (! editing) {
            setDraft(value);
        }
    }, [
        value,
        editing,
    ]);

    useEffect(() => {
        if (editing) {
            inputRef.current?.focus();
            inputRef.current?.select();
        }
    }, [
        editing,
    ]);

    async function save(): Promise<void> {
        if (busy) {
            return;
        }

        if (draft === value) {
            setEditing(false);
            return;
        }

        setBusy(true);

        try {
            await onSave(draft);
            setEditing(false);
        } finally {
            setBusy(false);
        }
    }

    if (editing) {
        return (
            <span className="flex min-w-0 items-center gap-1.5">
                <input
                    ref={inputRef}
                    type={type}
                    inputMode={inputMode}
                    value={draft}
                    disabled={busy}
                    onChange={(event) => setDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            event.preventDefault();
                            void save();
                        }

                        if (event.key === 'Escape') {
                            event.preventDefault();
                            setDraft(value);
                            setEditing(false);
                        }
                    }}
                    className="h-8 min-w-0 flex-1 rounded-[9px] border border-[var(--ac-accent)] bg-[var(--ac-surface)] px-2 text-xs text-[var(--ac-text)] outline-none"
                />

                <button
                    type="button"
                    disabled={busy}
                    onClick={() => void save()}
                    className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)] disabled:opacity-50"
                >
                    <Check size={12} />
                </button>

                <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                        setDraft(value);
                        setEditing(false);
                    }}
                    className="flex size-8 shrink-0 items-center justify-center rounded-[9px] text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]"
                >
                    <X size={12} />
                </button>
            </span>
        );
    }

    return (
        <span className={['group/inline flex min-w-0 items-center gap-1.5', className].join(' ')}>
            <span className="min-w-0 flex-1 truncate">
                {display ?? (value || emptyLabel)}
            </span>

            {editable && (
                <button
                    type="button"
                    aria-label="Edit inline"
                    onClick={() => setEditing(true)}
                    className="flex size-7 shrink-0 items-center justify-center rounded-[8px] text-[var(--ac-text-muted)] opacity-0 transition hover:bg-[var(--ac-accent-soft)] hover:text-[var(--ac-accent)] group-hover/inline:opacity-100 focus:opacity-100"
                >
                    <Pencil size={11} />
                </button>
            )}
        </span>
    );
}
