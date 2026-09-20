import {
    BookmarkPlus,
    Trash2,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useState,
} from 'react';

type SavedView<T> = {
    id: string;
    name: string;
    value: T;
    createdAt: string;
};

export function SavedViews<T>({
    storageKey,
    value,
    onApply,
    ar,
}: {
    storageKey: string;
    value: T;
    onApply: (value: T) => void;
    ar: boolean;
}) {
    const [views, setViews] = useState<SavedView<T>[]>([]);

    const text = (arabic: string, english: string): string =>
        ar ? arabic : english;

    useEffect(() => {
        try {
            const stored = window.localStorage.getItem(storageKey);
            if (! stored) {
                setViews([]);
                return;
            }

            const parsed = JSON.parse(stored) as SavedView<T>[];
            setViews(Array.isArray(parsed) ? parsed : []);
        } catch {
            setViews([]);
        }
    }, [storageKey]);

    const serializedValue = useMemo(
        () => JSON.stringify(value),
        [value],
    );

    function persist(next: SavedView<T>[]): void {
        setViews(next);

        try {
            window.localStorage.setItem(
                storageKey,
                JSON.stringify(next),
            );
        } catch {
            // A full/blocked localStorage must never break the working list.
        }
    }

    function saveCurrent(): void {
        const fallback = text(
            'عرض محفوظ ' + String(views.length + 1),
            'Saved view ' + String(views.length + 1),
        );

        const entered = window.prompt(
            text('اسم العرض المحفوظ', 'Saved view name'),
            fallback,
        );

        const name = entered?.trim();
        if (! name) {
            return;
        }

        const next: SavedView<T> = {
            id: String(Date.now()) + '-' + Math.random().toString(36).slice(2),
            name,
            value: JSON.parse(serializedValue) as T,
            createdAt: new Date().toISOString(),
        };

        persist([
            next,
            ...views.filter((view) => view.name !== name),
        ].slice(0, 12));
    }

    function remove(id: string): void {
        persist(
            views.filter((view) => view.id !== id),
        );
    }

    return (
        <div className="flex flex-wrap items-center gap-2">
            <button
                type="button"
                onClick={saveCurrent}
                className="inline-flex h-10 items-center gap-2 rounded-[12px] border border-dashed border-[var(--ac-line-strong)] bg-[var(--ac-surface)] px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-accent)] hover:bg-[var(--ac-accent-soft)] hover:text-[var(--ac-accent)]"
            >
                <BookmarkPlus size={14} />
                {text('حفظ العرض', 'Save view')}
            </button>

            {views.map((view) => (
                <span
                    key={view.id}
                    className="inline-flex h-10 items-center overflow-hidden rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)]"
                >
                    <button
                        type="button"
                        onClick={() => onApply(view.value)}
                        title={view.createdAt}
                        className="h-full max-w-44 truncate px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]"
                    >
                        {view.name}
                    </button>

                    <button
                        type="button"
                        aria-label={text('حذف العرض', 'Delete view')}
                        onClick={() => remove(view.id)}
                        className="flex h-full w-8 items-center justify-center border-s border-[var(--ac-line)] text-[var(--ac-text-muted)] transition hover:bg-red-50 hover:text-red-600"
                    >
                        <Trash2 size={12} />
                    </button>
                </span>
            ))}
        </div>
    );
}
