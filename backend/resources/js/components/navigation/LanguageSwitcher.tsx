import {
    Check,
    ChevronDown,
    Globe2,
    Search,
    X,
} from 'lucide-react';
import {
    useEffect,
    useMemo,
    useRef,
    useState,
} from 'react';

import {
    t,
    useLocale,
} from '@/lib/i18n';
import {
    locales,
    setLocale,
    type Locale,
} from '@/lib/locale';

/**
 * Render a fixed-size language control that scales to many locales.
 *
 * The top bar always shows only the current locale. Additional languages live
 * inside a searchable picker, so adding languages never increases shell width.
 */
export function LanguageSwitcher() {
    const locale =
        useLocale();

    const [
        open,
        setOpen,
    ] =
        useState(
            false,
        );

    const [
        query,
        setQuery,
    ] =
        useState(
            '',
        );

    const containerRef =
        useRef<HTMLDivElement>(
            null,
        );

    const entries =
        Object.entries(
            locales,
        ) as [
            Locale,
            (typeof locales)[Locale],
        ][];

    const filteredEntries =
        useMemo(
            () => {
                const normalized =
                    query
                        .trim()
                        .toLocaleLowerCase();

                if (
                    normalized ===
                    ''
                ) {
                    return entries;
                }

                return entries.filter(
                    ([
                        code,
                        details,
                    ]) =>
                        code
                            .toLocaleLowerCase()
                            .includes(
                                normalized,
                            ) ||
                        details.label
                            .toLocaleLowerCase()
                            .includes(
                                normalized,
                            ),
                );
            },
            [
                entries,
                query,
            ],
        );

    useEffect(() => {
        if (
            ! open
        ) {
            setQuery(
                '',
            );

            return;
        }

        /**
         * Close the picker when interaction leaves the language control.
         */
        function handlePointerDown(
            event: MouseEvent,
        ): void {
            if (
                containerRef.current &&
                ! containerRef.current.contains(
                    event.target as Node,
                )
            ) {
                setOpen(
                    false,
                );
            }
        }

        /**
         * Provide consistent keyboard dismissal in the global shell.
         */
        function handleKeyDown(
            event: KeyboardEvent,
        ): void {
            if (
                event.key ===
                'Escape'
            ) {
                setOpen(
                    false,
                );
            }
        }

        document.addEventListener(
            'mousedown',
            handlePointerDown,
        );

        window.addEventListener(
            'keydown',
            handleKeyDown,
        );

        return () => {
            document.removeEventListener(
                'mousedown',
                handlePointerDown,
            );

            window.removeEventListener(
                'keydown',
                handleKeyDown,
            );
        };
    }, [
        open,
    ]);

    /**
     * Persist one locale then close the picker without touching workspace data.
     */
    function chooseLocale(
        nextLocale: Locale,
    ): void {
        setLocale(
            nextLocale,
        );

        setOpen(
            false,
        );
    }

    return (
        <div
            ref={
                containerRef
            }
            className="relative"
        >
            <button
                type="button"
                aria-expanded={
                    open
                }
                aria-haspopup="listbox"
                aria-label={t(
                    'common.language',
                )}
                onClick={() =>
                    setOpen(
                        (
                            current,
                        ) =>
                            ! current,
                    )
                }
                className={[
                    'group flex h-10 items-center gap-2 rounded-[14px] border bg-white px-2.5 shadow-[var(--ac-shadow-soft)] transition duration-200 hover:-translate-y-px active:translate-y-0 motion-reduce:transform-none',
                    open
                        ? 'border-[var(--ac-accent)] ring-4 ring-[var(--ac-accent-soft)]'
                        : 'border-[var(--ac-line)] hover:border-[var(--ac-line-strong)]',
                ].join(
                    ' ',
                )}
            >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-[10px] bg-[var(--ac-surface-strong)] text-[var(--ac-text-soft)] transition group-hover:bg-[var(--ac-accent-soft)] group-hover:text-[var(--ac-accent-strong)]">
                    <Globe2
                        size={
                            14
                        }
                    />
                </span>

                <span className="hidden max-w-24 truncate text-[11px] font-semibold text-[var(--ac-text)] sm:block">
                    {
                        locales[
                            locale
                        ].label
                    }
                </span>

                <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-[var(--ac-text-soft)] sm:hidden">
                    {
                        locale
                    }
                </span>

                <ChevronDown
                    size={
                        13
                    }
                    className={[
                        'text-[var(--ac-text-muted)] transition-transform duration-200',
                        open
                            ? 'rotate-180'
                            : '',
                    ].join(
                        ' ',
                    )}
                />
            </button>

            {open && (
                <div className="absolute end-0 top-[calc(100%+0.65rem)] z-[100] w-[min(19rem,calc(100vw-1.5rem))] overflow-hidden rounded-[22px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-panel)] motion-safe:animate-[fadeIn_160ms_ease-out]">
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--ac-line)] px-3.5 py-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                <Globe2
                                    size={
                                        15
                                    }
                                />
                            </span>

                            <div className="min-w-0">
                                <p className="text-xs font-semibold text-[var(--ac-text)]">
                                    {t(
                                        'common.language',
                                    )}
                                </p>

                                <p className="mt-0.5 truncate text-[10px] text-[var(--ac-text-muted)]">
                                    {
                                        locales[
                                            locale
                                        ].label
                                    }
                                </p>
                            </div>
                        </div>

                        <button
                            type="button"
                            aria-label={t(
                                'common.close',
                            )}
                            onClick={() =>
                                setOpen(
                                    false,
                                )
                            }
                            className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-bg-soft)] hover:text-[var(--ac-text)]"
                        >
                            <X
                                size={
                                    14
                                }
                            />
                        </button>
                    </div>

                    {entries.length >
                        6 && (
                        <div className="border-b border-[var(--ac-line)] p-2.5">
                            <div className="relative">
                                <Search
                                    size={
                                        14
                                    }
                                    className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                />

                                <input
                                    value={
                                        query
                                    }
                                    aria-label={t(
                                        'common.language',
                                    )}
                                    onChange={(
                                        event,
                                    ) =>
                                        setQuery(
                                            event
                                                .target
                                                .value,
                                        )
                                    }
                                    className="h-10 w-full rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] ps-9 pe-3 text-xs outline-none transition focus:border-[var(--ac-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                />
                            </div>
                        </div>
                    )}

                    <div
                        role="listbox"
                        aria-label={t(
                            'common.language',
                        )}
                        className="max-h-[min(360px,60dvh)] overflow-y-auto p-1.5"
                    >
                        {filteredEntries.map(
                            ([
                                value,
                                details,
                            ]) => {
                                const active =
                                    value ===
                                    locale;

                                return (
                                    <button
                                        key={
                                            value
                                        }
                                        type="button"
                                        role="option"
                                        aria-selected={
                                            active
                                        }
                                        onClick={() =>
                                            chooseLocale(
                                                value,
                                            )
                                        }
                                        className={[
                                            'group flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-start transition duration-150',
                                            active
                                                ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                : 'text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)]',
                                        ].join(
                                            ' ',
                                        )}
                                    >
                                        <span
                                            className={[
                                                'flex size-8 shrink-0 items-center justify-center rounded-[10px] text-[9px] font-bold uppercase tracking-[0.05em]',
                                                active
                                                    ? 'bg-white text-[var(--ac-accent-strong)] shadow-sm'
                                                    : 'bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]',
                                            ].join(
                                                ' ',
                                            )}
                                        >
                                            {
                                                value
                                            }
                                        </span>

                                        <span className="min-w-0 flex-1 truncate text-xs font-semibold">
                                            {
                                                details.label
                                            }
                                        </span>

                                        {active && (
                                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--ac-accent)] text-white">
                                                <Check
                                                    size={
                                                        12
                                                    }
                                                />
                                            </span>
                                        )}
                                    </button>
                                );
                            },
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
