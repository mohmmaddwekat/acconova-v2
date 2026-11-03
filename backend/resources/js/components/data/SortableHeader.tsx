import { AnchoredPanel } from '@/components/data/AnchoredPanel';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Filter,
    X,
} from 'lucide-react';
import {
    createContext,
    useContext,
    useEffect,
    useRef,
    useState,
} from 'react';
import type { ReactNode } from 'react';
import { Select } from '@/components/ui/Select';

/** Lets a column filter close its panel once the visitor applies it. */
const CloseFilterContext = createContext<() => void>(() => undefined);

export type SortDirection = 'asc' | 'desc';

export type TableSort = {
    key: string;
    direction: SortDirection;
} | null;

/**
 * Header click order: ascending, then descending, then back to the default
 * order of the list.
 */
export function nextSort(current: TableSort, key: string): TableSort {
    if (! current || current.key !== key) {
        return { key, direction: 'asc' };
    }

    return current.direction === 'asc'
        ? { key, direction: 'desc' }
        : null;
}

const fieldClass =
    'h-9 w-full rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]';

/**
 * A table header cell with an optional sort toggle and an optional column
 * filter that opens in a small panel under the header.
 */
export function SortableTh({
    label,
    sortKey,
    sort,
    onSort,
    filter,
    filterActive = false,
    ar,
    className = '',
}: {
    label: string;
    sortKey?: string;
    sort: TableSort;
    onSort: (sort: TableSort) => void;
    filter?: ReactNode;
    filterActive?: boolean;
    ar: boolean;
    className?: string;
}) {
    const [open, setOpen] = useState(false);
    const anchorRef = useRef<HTMLDivElement>(null);
    const active = sortKey !== undefined && sort?.key === sortKey ? sort : null;

    return (
        <th
            aria-sort={
                active
                    ? (active.direction === 'asc' ? 'ascending' : 'descending')
                    : undefined
            }
            className={['px-3 text-start font-semibold', className].join(' ')}
        >
            <div ref={anchorRef} className="flex items-center gap-1">
                {sortKey ? (
                    <button
                        type="button"
                        onClick={() => onSort(nextSort(sort, sortKey))}
                        className={[
                            'inline-flex items-center gap-1 rounded-md py-0.5 font-semibold transition hover:text-[var(--ac-accent)]',
                            active ? 'text-[var(--ac-accent)]' : '',
                        ].join(' ')}
                        title={ar ? 'ترتيب' : 'Sort'}
                    >
                        {label}
                        {active
                            ? (active.direction === 'asc'
                                ? <ArrowUp size={12} />
                                : <ArrowDown size={12} />)
                            : <ArrowUpDown size={12} className="opacity-40" />}
                    </button>
                ) : (
                    <span>{label}</span>
                )}

                {filter && (
                    <>
                        <button
                            type="button"
                            onClick={() => setOpen((value) => ! value)}
                            aria-label={ar ? 'فلترة العمود' : 'Filter column'}
                            title={ar ? 'فلترة' : 'Filter'}
                            className={[
                                'relative flex size-6 items-center justify-center rounded-md transition hover:bg-[var(--ac-accent-soft)]',
                                filterActive ? 'text-[var(--ac-accent)]' : 'opacity-50 hover:opacity-100',
                            ].join(' ')}
                        >
                            <Filter size={12} />
                            {filterActive && (
                                <span className="absolute -end-0.5 -top-0.5 size-1.5 rounded-full bg-[var(--ac-accent)]" />
                            )}
                        </button>

                        <AnchoredPanel
                            anchorRef={anchorRef}
                            open={open}
                            onClose={() => setOpen(false)}
                            width={260}
                            className="rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] p-3 text-start font-normal text-[var(--ac-text)] shadow-[0_18px_50px_rgba(1,20,35,.2)]"
                        >
                            <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                    <strong className="text-xs">{label}</strong>
                                    <button
                                        type="button"
                                        onClick={() => setOpen(false)}
                                        aria-label={ar ? 'إغلاق' : 'Close'}
                                        className="flex size-6 items-center justify-center rounded-md text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <CloseFilterContext.Provider value={() => setOpen(false)}>
                                    {filter}
                                </CloseFilterContext.Provider>
                            </div>
                        </AnchoredPanel>
                    </>
                )}
            </div>
        </th>
    );
}

const applyButton =
    'h-8 rounded-[10px] bg-[var(--ac-accent-solid)] px-3 text-[11px] font-semibold text-[var(--ac-accent-solid-text)] disabled:opacity-50';

/**
 * Keeps what is being typed in a draft and only applies it on "Apply" or
 * Enter, so the list does not reload for every keystroke or half-entered date.
 */
function useDraft<T>(applied: T) {
    const [draft, setDraft] = useState<T>(applied);

    useEffect(() => {
        setDraft(applied);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(applied)]);

    return [draft, setDraft] as const;
}

export function ColumnFilterText({
    value,
    onChange,
    placeholder,
    ar,
}: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    ar: boolean;
}) {
    const close = useContext(CloseFilterContext);
    const [draft, setDraft] = useDraft(value);

    function apply(next: string): void {
        onChange(next);
        close();
    }

    return (
        <form
            className="space-y-2"
            onSubmit={(event) => {
                event.preventDefault();
                apply(draft);
            }}
        >
            <input
                type="search"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder={placeholder ?? (ar ? 'اكتب للبحث' : 'Type to search')}
                className={fieldClass}
                autoFocus
            />
            <div className="flex items-center justify-between gap-2">
                <button type="submit" className={applyButton}>
                    {ar ? 'تطبيق' : 'Apply'}
                </button>
                {(value || draft) && (
                    <button
                        type="button"
                        onClick={() => {
                            setDraft('');
                            apply('');
                        }}
                        className="text-[11px] font-semibold text-[var(--ac-danger)]"
                    >
                        {ar ? 'مسح' : 'Clear'}
                    </button>
                )}
            </div>
        </form>
    );
}

export function ColumnFilterRange({
    from,
    to,
    onChange,
    type,
    ar,
}: {
    from: string;
    to: string;
    onChange: (from: string, to: string) => void;
    type: 'number' | 'date';
    ar: boolean;
}) {
    const close = useContext(CloseFilterContext);
    const [draft, setDraft] = useDraft({ from, to });
    const reversed = draft.from !== ''
        && draft.to !== ''
        && (type === 'date'
            ? draft.to < draft.from
            : Number(draft.to) < Number(draft.from));

    function apply(nextFrom: string, nextTo: string): void {
        onChange(nextFrom, nextTo);
        close();
    }

    return (
        <form
            className="space-y-2"
            onSubmit={(event) => {
                event.preventDefault();

                if (! reversed) {
                    apply(draft.from, draft.to);
                }
            }}
        >
            <label className="block text-[11px] text-[var(--ac-text-muted)]">
                {type === 'date' ? (ar ? 'من تاريخ' : 'From') : (ar ? 'من' : 'Min')}
                <input
                    type={type}
                    value={draft.from}
                    onChange={(event) => setDraft({ ...draft, from: event.target.value })}
                    className={fieldClass + ' mt-1'}
                />
            </label>
            <label className="block text-[11px] text-[var(--ac-text-muted)]">
                {type === 'date' ? (ar ? 'إلى تاريخ' : 'To') : (ar ? 'إلى' : 'Max')}
                <input
                    type={type}
                    value={draft.to}
                    onChange={(event) => setDraft({ ...draft, to: event.target.value })}
                    className={fieldClass + ' mt-1'}
                />
            </label>
            {reversed && (
                <p className="text-[11px] text-[var(--ac-danger)]">
                    {type === 'date'
                        ? (ar ? 'تاريخ النهاية قبل البداية.' : 'The end date is before the start.')
                        : (ar ? 'الحد الأعلى أقل من الأدنى.' : 'The maximum is below the minimum.')}
                </p>
            )}
            <div className="flex items-center justify-between gap-2">
                <button type="submit" className={applyButton} disabled={reversed}>
                    {ar ? 'تطبيق' : 'Apply'}
                </button>
                {(from || to || draft.from || draft.to) && (
                    <button
                        type="button"
                        onClick={() => {
                            setDraft({ from: '', to: '' });
                            apply('', '');
                        }}
                        className="text-[11px] font-semibold text-[var(--ac-danger)]"
                    >
                        {ar ? 'مسح' : 'Clear'}
                    </button>
                )}
            </div>
        </form>
    );
}

export function ColumnFilterSelect({
    value,
    options,
    onChange,
    allLabel,
}: {
    value: string;
    options: [string, string][];
    onChange: (value: string) => void;
    allLabel: string;
}) {
    const close = useContext(CloseFilterContext);

    return (
        <Select
            value={value}
            onChange={(event) => {
                onChange(event.target.value);
                close();
            }}
            className={fieldClass}
        >
            <option value="">{allLabel}</option>
            {options.map(([optionValue, optionLabel]) => (
                <option key={optionValue} value={optionValue}>
                    {optionLabel}
                </option>
            ))}
        </Select>
    );
}