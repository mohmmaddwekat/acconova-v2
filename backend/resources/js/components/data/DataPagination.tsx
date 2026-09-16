import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
import {
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';

type PaginationToken =
    | number
    | 'start-gap'
    | 'end-gap';

type DataPaginationProps = {
    page: number;

    lastPage: number;

    perPage: number;

    total: number;

    loading?: boolean;

    onPageChange: (
        page: number,
    ) => void;

    onPerPageChange: (
        perPage: number,
    ) => void;
};

/**
 * Build a compact page-number window around the current page.
 */
function paginationTokens(
    page: number,
    lastPage: number,
): PaginationToken[] {
    if (
        lastPage <= 7
    ) {
        return Array.from(
            {
                length:
                    lastPage,
            },
            (
                _,
                index,
            ) => index + 1,
        );
    }

    const tokens:
        PaginationToken[] = [
            1,
        ];

    if (
        page > 4
    ) {
        tokens.push(
            'start-gap',
        );
    }

    const start =
        Math.max(
            2,
            page - 1,
        );

    const end =
        Math.min(
            lastPage - 1,
            page + 1,
        );

    for (
        let value = start;
        value <= end;
        value++
    ) {
        tokens.push(
            value,
        );
    }

    if (
        page < lastPage - 3
    ) {
        tokens.push(
            'end-gap',
        );
    }

    tokens.push(
        lastPage,
    );

    return tokens;
}

/**
 * Render the shared responsive AccoNova pagination experience.
 *
 * Mobile screens receive compact previous/next controls while wider screens
 * add page numbers, row ranges, and page-size selection.
 */
export function DataPagination({
    page,
    lastPage,
    perPage,
    total,
    loading = false,
    onPageChange,
    onPerPageChange,
}: DataPaginationProps) {
    useLocale();
    const firstRecord =
        total === 0
            ? 0
            : (
                page - 1
            ) *
                perPage +
              1;

    const lastRecord =
        Math.min(
            page * perPage,
            total,
        );

    const tokens =
        paginationTokens(
            page,
            lastPage,
        );

    return (
        <footer className="grid gap-4 border-t border-[var(--ac-line)] bg-white px-4 py-4 sm:px-5 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:px-6">
            <div className="text-center text-xs text-[var(--ac-text-muted)] lg:text-start">
                {t('pagination.range', { first: firstRecord, last: lastRecord, total })}
            </div>

            <div className="flex items-center justify-center gap-1">
                <button aria-label={t('pagination.previous')} type="button"
                    disabled={
                        loading ||
                        page <= 1
                    }
                    onClick={() =>
                        onPageChange(
                            Math.max(
                                1,
                                page - 1,
                            ),
                        )
                    }
                    className="flex size-10 items-center justify-center rounded-[13px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-bg-soft)] disabled:opacity-35"
                >
                    <ChevronLeft className="rtl:rotate-180"
                        size={16}
                    />
                </button>

                <div className="hidden items-center gap-1 sm:flex">
                    {tokens.map(
                        (
                            token,
                        ) => {
                            if (
                                typeof token
                                !== 'number'
                            ) {
                                return (
                                    <span
                                        key={
                                            token
                                        }
                                        className="flex size-9 items-center justify-center text-xs text-[var(--ac-text-muted)]"
                                    >
                                        …
                                    </span>
                                );
                            }

                            return (
                                <button
                                    type="button"
                                    key={
                                        token
                                    }
                                    disabled={
                                        loading
                                    }
                                    onClick={() =>
                                        onPageChange(
                                            token,
                                        )
                                    }
                                    className={[
                                        'flex size-10 items-center justify-center rounded-[13px] text-xs font-semibold transition',
                                        token ===
                                        page
                                            ? 'bg-[var(--ac-text)] text-white shadow-[var(--ac-shadow-soft)]'
                                            : 'text-[var(--ac-text-soft)] hover:bg-[var(--ac-bg-soft)]',
                                    ].join(
                                        ' ',
                                    )}
                                >
                                    {
                                        token
                                    }
                                </button>
                            );
                        },
                    )}
                </div>

                <span className="min-w-20 text-center text-xs font-semibold text-[var(--ac-text-soft)] sm:hidden">
                    {page} /{' '}
                    {lastPage}
                </span>

                <button aria-label={t('pagination.next')} type="button" disabled={loading || page >=
                            lastPage
                    }
                    onClick={() =>
                        onPageChange(
                            Math.min(
                                lastPage,
                                page + 1,
                            ),
                        )
                    }
                    className="flex size-10 items-center justify-center rounded-[13px] border border-[var(--ac-line)] text-[var(--ac-text-soft)] transition hover:bg-[var(--ac-bg-soft)] disabled:opacity-35"
                >
                    <ChevronRight className="rtl:rotate-180"
                        size={16}
                    />
                </button>
            </div>

            <label className="flex items-center justify-center gap-2 text-xs text-[var(--ac-text-muted)] lg:justify-end">
                {t('ui.rows')}

                <select
                    value={
                        perPage
                    }
                    disabled={
                        loading
                    }
                    onChange={(
                        event,
                    ) =>
                        onPerPageChange(
                            Number(
                                event
                                    .target
                                    .value,
                            ),
                        )
                    }
                    className="h-10 rounded-[12px] border border-[var(--ac-line)] bg-white px-3 font-semibold text-[var(--ac-text)] outline-none"
                >
                    <option
                        value={
                            25
                        }
                    >
                        25
                    </option>

                    <option
                        value={
                            50
                        }
                    >
                        50
                    </option>

                    <option
                        value={
                            100
                        }
                    >
                        100
                    </option>
                </select>
            </label>
        </footer>
    );
}