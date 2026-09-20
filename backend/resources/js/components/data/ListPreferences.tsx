import {
    Columns3,
    GripVertical,
    Rows3,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

export type ListDensity =
    | 'comfortable'
    | 'compact';

export type ListColumn = {
    key: string;
    label: string;
    defaultVisible?: boolean;
};

type StoredPreferences = {
    order: string[];
    hidden: string[];
    density: ListDensity;
};

function readPreferences(
    storageKey: string,
    columns: ListColumn[],
): StoredPreferences {
    const fallback: StoredPreferences = {
        order: columns.map((column) => column.key),
        hidden: columns
            .filter((column) => column.defaultVisible === false)
            .map((column) => column.key),
        density: 'comfortable',
    };

    if (typeof window === 'undefined') {
        return fallback;
    }

    try {
        const raw = window.localStorage.getItem(storageKey);
        if (! raw) {
            return fallback;
        }

        const parsed = JSON.parse(raw) as Partial<StoredPreferences>;
        const known = new Set(columns.map((column) => column.key));
        const order = [
            ...(parsed.order ?? []).filter((key) => known.has(key)),
            ...columns
                .map((column) => column.key)
                .filter((key) => ! (parsed.order ?? []).includes(key)),
        ];

        return {
            order,
            hidden: (parsed.hidden ?? []).filter((key) => known.has(key)),
            density: parsed.density === 'compact'
                ? 'compact'
                : 'comfortable',
        };
    } catch {
        return fallback;
    }
}

export function useListPreferences(
    storageKey: string,
    columns: ListColumn[],
) {
    const columnsSignature = useMemo(
        () => columns.map((column) => [
            column.key,
            column.label,
            column.defaultVisible,
        ]),
        [columns],
    );

    const [
        preferences,
        setPreferences,
    ] = useState<StoredPreferences>(() =>
        readPreferences(storageKey, columns),
    );

    useEffect(() => {
        setPreferences(
            readPreferences(storageKey, columns),
        );
    }, [
        storageKey,
        JSON.stringify(columnsSignature),
    ]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        try {
            window.localStorage.setItem(
                storageKey,
                JSON.stringify(preferences),
            );
        } catch {
            // User preferences are best-effort and must not block the list.
        }
    }, [
        storageKey,
        preferences,
    ]);

    const visibleKeys = preferences.order.filter(
        (key) => ! preferences.hidden.includes(key),
    );

    return {
        order: preferences.order,
        visibleKeys,
        hidden: preferences.hidden,
        density: preferences.density,
        setOrder: (order: string[]) =>
            setPreferences((current) => ({
                ...current,
                order,
            })),
        toggleColumn: (key: string) =>
            setPreferences((current) => {
                const hidden = current.hidden.includes(key)
                    ? current.hidden.filter((item) => item !== key)
                    : [...current.hidden, key];

                // Never allow the user to hide every data column.
                if (hidden.length >= columns.length) {
                    return current;
                }

                return {
                    ...current,
                    hidden,
                };
            }),
        setDensity: (density: ListDensity) =>
            setPreferences((current) => ({
                ...current,
                density,
            })),
        reset: () =>
            setPreferences(
                readPreferences(
                    storageKey + ':reset:' + Date.now(),
                    columns,
                ),
            ),
    };
}

export function ListPreferencesControl({
    columns,
    order,
    hidden,
    density,
    onOrderChange,
    onToggleColumn,
    onDensityChange,
    ar,
}: {
    columns: ListColumn[];
    order: string[];
    hidden: string[];
    density: ListDensity;
    onOrderChange: (order: string[]) => void;
    onToggleColumn: (key: string) => void;
    onDensityChange: (density: ListDensity) => void;
    ar: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [dragging, setDragging] = useState<string | null>(null);
    const byKey = new Map(
        columns.map((column) => [column.key, column]),
    );

    function moveBefore(
        source: string,
        target: string,
    ): void {
        if (source === target) {
            return;
        }

        const next = order.filter((key) => key !== source);
        const targetIndex = next.indexOf(target);

        if (targetIndex < 0) {
            next.push(source);
        } else {
            next.splice(targetIndex, 0, source);
        }

        onOrderChange(next);
    }

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((value) => ! value)}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface-soft)]"
            >
                <Columns3 size={14} />
                {ar ? 'الأعمدة والعرض' : 'Columns & view'}
            </button>

            {open && (
                <div className="absolute end-0 top-12 z-[80] w-[300px] rounded-[18px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 shadow-[0_22px_60px_rgba(1,20,35,.2)]">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-xs font-bold text-[var(--ac-text)]">
                                {ar ? 'تخصيص الجدول' : 'Customize table'}
                            </p>
                            <p className="mt-1 text-[10px] text-[var(--ac-text-muted)]">
                                {ar
                                    ? 'اسحب الأعمدة لترتيبها وأخفِ ما لا تحتاجه.'
                                    : 'Drag columns to reorder and hide what you do not need.'}
                            </p>
                        </div>

                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="flex size-8 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className="mt-3 space-y-1">
                        {order.map((key) => {
                            const column = byKey.get(key);
                            if (! column) {
                                return null;
                            }

                            return (
                                <div
                                    key={key}
                                    draggable
                                    onDragStart={() => setDragging(key)}
                                    onDragEnd={() => setDragging(null)}
                                    onDragOver={(event) => event.preventDefault()}
                                    onDrop={() => {
                                        if (dragging) {
                                            moveBefore(dragging, key);
                                        }
                                        setDragging(null);
                                    }}
                                    className={[
                                        'flex items-center gap-2 rounded-[11px] border px-2 py-2',
                                        dragging === key
                                            ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)]'
                                            : 'border-transparent hover:bg-[var(--ac-surface-soft)]',
                                    ].join(' ')}
                                >
                                    <GripVertical
                                        size={13}
                                        className="cursor-grab text-[var(--ac-text-muted)]"
                                    />

                                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={! hidden.includes(key)}
                                            onChange={() => onToggleColumn(key)}
                                            className="accent-[var(--ac-accent)]"
                                        />
                                        <span className="truncate text-[11px] font-medium text-[var(--ac-text-soft)]">
                                            {column.label}
                                        </span>
                                    </label>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-3 border-t border-[var(--ac-line)] pt-3">
                        <p className="mb-2 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ac-text-muted)]">
                            <Rows3 size={13} />
                            {ar ? 'كثافة الصفوف' : 'Row density'}
                        </p>

                        <div className="grid grid-cols-2 gap-2">
                            {([
                                ['comfortable', ar ? 'مريح' : 'Comfortable'],
                                ['compact', ar ? 'مضغوط' : 'Compact'],
                            ] as const).map(([value, label]) => (
                                <button
                                    key={value}
                                    type="button"
                                    aria-pressed={density === value}
                                    onClick={() => onDensityChange(value)}
                                    className={[
                                        'h-9 rounded-[10px] border text-[10px] font-semibold transition',
                                        density === value
                                            ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent)]'
                                            : 'border-[var(--ac-line)] text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]',
                                    ].join(' ')}
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
