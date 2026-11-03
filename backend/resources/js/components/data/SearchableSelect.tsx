import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Check, ChevronDown, Search, X } from 'lucide-react';

import { AnchoredPanel } from '@/components/data/AnchoredPanel';
import { Select } from '@/components/ui/Select';

export type SearchableOption = {
    value: string;
    label: string;
    /** Secondary line shown under the label (SKU, unit, price...). */
    hint?: string;
    /** Extra text that is searchable but not displayed. */
    keywords?: string;
};

type SearchableSelectProps = {
    options: SearchableOption[];
    value: string;
    onChange: (value: string) => void;
    /** Label of the "nothing selected" entry; omit to hide it. */
    emptyLabel?: string;
    placeholder?: string;
    searchPlaceholder?: string;
    noResultsLabel?: string;
    ar?: boolean;
    className?: string;
    disabled?: boolean;
};

const MAX_RENDERED = 80;

function normalize(value: string): string {
    return value
        .toLowerCase()
        .replace(/[ً-ٰٟ]/g, '')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .trim();
}

function Highlight({ text, query }: { text: string; query: string }) {
    const index = query ? normalize(text).indexOf(query) : -1;

    if (index < 0 || normalize(text).length !== text.length) {
        return <>{text}</>;
    }

    return (
        <>
            {text.slice(0, index)}
            <mark className="rounded-[4px] bg-[var(--ac-accent-soft)] px-0.5 text-inherit">
                {text.slice(index, index + query.length)}
            </mark>
            {text.slice(index + query.length)}
        </>
    );
}

/**
 * A searchable replacement for the native `<Select>`: a trigger that opens a
 * floating panel with a search field, a keyboard-navigable list and the
 * selected item ticked. Search ignores Arabic diacritics and alef/ya/ta-marbuta
 * variants, and matches the label, hint and extra keywords.
 */
export function SearchableSelect({
    options,
    value,
    onChange,
    emptyLabel,
    placeholder,
    searchPlaceholder,
    noResultsLabel,
    ar = false,
    className = '',
    disabled = false,
}: SearchableSelectProps) {
    const anchorRef = useRef<HTMLButtonElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(0);
    const [width, setWidth] = useState(360);

    const selected = options.find((option) => option.value === value) ?? null;
    const needle = normalize(query);

    const items = useMemo(() => {
        const matches = needle
            ? options.filter((option) =>
                normalize(`${option.label} ${option.hint ?? ''} ${option.keywords ?? ''}`).includes(needle),
            )
            : options;
        const list: SearchableOption[] = matches.slice(0, MAX_RENDERED);

        return emptyLabel !== undefined && ! needle
            ? [{ value: '', label: emptyLabel }, ...list]
            : list;
    }, [options, needle, emptyLabel]);

    const hiddenCount = Math.max(
        0,
        (needle
            ? options.filter((option) =>
                normalize(`${option.label} ${option.hint ?? ''} ${option.keywords ?? ''}`).includes(needle),
            ).length
            : options.length) - MAX_RENDERED,
    );

    useEffect(() => {
        setActive(0);
    }, [needle]);

    useEffect(() => {
        if (! open) {
            return;
        }

        const index = Math.max(0, items.findIndex((item) => item.value === value));

        setActive(index);
        inputRef.current?.focus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        listRef.current
            ?.querySelector<HTMLElement>('[data-active="true"]')
            ?.scrollIntoView({ block: 'nearest' });
    }, [active, open]);

    function openPanel(): void {
        if (disabled) {
            return;
        }

        setWidth(Math.max(280, anchorRef.current?.getBoundingClientRect().width ?? 360));
        setQuery('');
        setOpen(true);
    }

    function close(): void {
        setOpen(false);
        anchorRef.current?.focus();
    }

    function choose(item: SearchableOption): void {
        onChange(item.value);
        close();
    }

    function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((current) => Math.min(items.length - 1, current + 1));
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((current) => Math.max(0, current - 1));
        } else if (event.key === 'Enter') {
            event.preventDefault();

            if (items[active]) {
                choose(items[active]);
            }
        } else if (event.key === 'Tab') {
            setOpen(false);
        }
    }

    const listId = useRef(`ss-${Math.random().toString(36).slice(2, 8)}`).current;

    return (
        <>
            <button
                ref={anchorRef}
                type="button"
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openPanel())}
                onKeyDown={(event) => {
                    if (! open && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
                        event.preventDefault();
                        openPanel();
                    }
                }}
                className={[
                    'flex min-h-[46px] w-full items-center justify-between gap-2 rounded-[10px] border bg-[var(--ac-bg)] px-3 py-2 text-start text-sm text-[var(--ac-text)] outline-none transition',
                    open
                        ? 'border-[var(--ac-accent)] bg-[var(--ac-surface)] ring-4 ring-[var(--ac-accent)]/10'
                        : 'border-[var(--ac-line)] hover:border-[var(--ac-line-strong)] focus-visible:border-[var(--ac-accent)] focus-visible:ring-4 focus-visible:ring-[var(--ac-accent)]/10',
                    'disabled:cursor-not-allowed disabled:bg-[var(--ac-surface-soft)] disabled:text-[var(--ac-text-muted)]',
                    className,
                ].join(' ')}
            >
                <span className="min-w-0 flex-1">
                    {selected ? (
                        <>
                            <span className="block truncate font-semibold">{selected.label}</span>
                            {selected.hint && (
                                <span className="block truncate text-[11px] font-normal text-[var(--ac-text-muted)]">
                                    {selected.hint}
                                </span>
                            )}
                        </>
                    ) : (
                        <span className="block truncate font-normal text-[var(--ac-text-muted)]">
                            {emptyLabel ?? placeholder ?? ''}
                        </span>
                    )}
                </span>
                <ChevronDown
                    size={16}
                    aria-hidden
                    className={'shrink-0 text-[var(--ac-text-muted)] transition-transform ' + (open ? 'rotate-180' : '')}
                />
            </button>

            <AnchoredPanel
                anchorRef={anchorRef}
                open={open}
                onClose={() => setOpen(false)}
                width={width}
                className="overflow-hidden rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] shadow-[var(--ac-shadow-panel)]"
            >
                <div className="sticky top-0 z-10 border-b border-[var(--ac-line)] bg-[var(--ac-surface)] p-2">
                    <div className="relative">
                        <Search
                            size={15}
                            aria-hidden
                            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                        />
                        <input
                            ref={inputRef}
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            onKeyDown={onSearchKeyDown}
                            placeholder={searchPlaceholder ?? (ar ? 'ابحث بالاسم أو الرمز…' : 'Search by name or SKU…')}
                            aria-label={searchPlaceholder ?? (ar ? 'بحث' : 'Search')}
                            aria-controls={listId}
                            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
                            className="h-10 w-full rounded-[10px] border border-[var(--ac-line)] bg-[var(--ac-bg)] ps-9 pe-9 text-sm text-[var(--ac-text)] outline-none placeholder:text-[var(--ac-text-faint)] focus:border-[var(--ac-accent)] focus:ring-4 focus:ring-[var(--ac-accent)]/10"
                        />
                        {query && (
                            <button
                                type="button"
                                onClick={() => {
                                    setQuery('');
                                    inputRef.current?.focus();
                                }}
                                aria-label={ar ? 'مسح البحث' : 'Clear search'}
                                className="absolute end-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded-full text-[var(--ac-text-muted)] hover:bg-[var(--ac-surface-soft)]"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>

                <ul
                    ref={listRef}
                    id={listId}
                    role="listbox"
                    className="max-h-[min(340px,50vh)] overflow-y-auto p-1.5"
                >
                    {items.length === 0 && (
                        <li className="px-3 py-6 text-center text-sm text-[var(--ac-text-muted)]">
                            {noResultsLabel ?? (ar ? 'لا توجد نتائج مطابقة' : 'No matching results')}
                        </li>
                    )}

                    {items.map((item, index) => {
                        const isSelected = item.value === value;
                        const isActive = index === active;

                        return (
                            <li
                                key={item.value || '__empty'}
                                id={`${listId}-${index}`}
                                role="option"
                                aria-selected={isSelected}
                                data-active={isActive}
                                onMouseEnter={() => setActive(index)}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => choose(item)}
                                className={[
                                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-[10px] px-3 py-2 text-sm transition-colors',
                                    isActive ? 'bg-[var(--ac-accent-soft)]' : '',
                                    isSelected ? 'font-semibold text-[var(--ac-accent)]' : 'text-[var(--ac-text)]',
                                    item.value === '' ? 'italic text-[var(--ac-text-muted)]' : '',
                                ].join(' ')}
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate">
                                        <Highlight text={item.label} query={needle} />
                                    </span>
                                    {item.hint && (
                                        <span className="block truncate text-[11px] font-normal text-[var(--ac-text-muted)]">
                                            <Highlight text={item.hint} query={needle} />
                                        </span>
                                    )}
                                </span>
                                {isSelected && <Check size={15} aria-hidden className="shrink-0" />}
                            </li>
                        );
                    })}

                    {hiddenCount > 0 && (
                        <li className="px-3 py-2 text-center text-[11px] text-[var(--ac-text-muted)]">
                            {ar
                                ? `+${hiddenCount} نتيجة أخرى — اكتب المزيد لتضييق البحث`
                                : `+${hiddenCount} more — keep typing to narrow down`}
                        </li>
                    )}
                </ul>
            </AnchoredPanel>
        </>
    );
}
