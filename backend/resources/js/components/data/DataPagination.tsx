import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { t, useLocale } from '@/lib/i18n';
import { Select } from '@/components/ui/Select';

type DataPaginationProps = {
    page: number;
    lastPage: number;
    perPage: number;
    total: number;
    loading?: boolean;
    onPageChange: (page: number) => void;
    onPerPageChange: (perPage: number) => void;
};

const perPageOptions = [25, 50, 100];

const buttonClass =
    'inline-flex h-10 min-w-10 items-center justify-center gap-1.5 rounded-[12px] px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 max-sm:size-11 max-sm:px-0';

/**
 * Shared AccoNova pagination: a range counter with a progress bar, previous and
 * next buttons around a "page X of Y" field that jumps straight to a page, and
 * the page-size selector.
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
    const ar = useLocale() === 'ar';
    const [jump, setJump] = useState(String(page));

    useEffect(() => {
        setJump(String(page));
    }, [page]);

    const firstRecord = total === 0 ? 0 : (page - 1) * perPage + 1;
    const lastRecord = Math.min(page * perPage, total);
    const progress = total === 0 ? 0 : Math.round((lastRecord / total) * 100);
    const sizes = perPageOptions.includes(perPage)
        ? perPageOptions
        : [...perPageOptions, perPage].sort((a, b) => a - b);

    function commitJump(): void {
        const target = Math.min(
            Math.max(1, Number.parseInt(jump, 10) || page),
            Math.max(1, lastPage),
        );

        setJump(String(target));

        if (target !== page) {
            onPageChange(target);
        }
    }

    return (
        <footer className="grid gap-3 border-t border-[var(--ac-line)] bg-[var(--ac-surface)] px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-6 lg:px-6">
            <div className="grid min-w-0 gap-1.5">
                <span className="text-xs text-[var(--ac-text-muted)]">
                    {t('pagination.range', {
                        first: firstRecord,
                        last: lastRecord,
                        total,
                    })}
                </span>
                <span
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={progress}
                    className="block h-1.5 overflow-hidden rounded-full bg-[var(--ac-bg-soft)]"
                >
                    <span
                        className="block h-full rounded-full bg-[var(--ac-accent)] transition-[width] duration-200"
                        style={{ width: `${progress}%` }}
                    />
                </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-end">
                <button
                    type="button"
                    aria-label={t('pagination.previous')}
                    disabled={loading || page <= 1}
                    onClick={() => onPageChange(Math.max(1, page - 1))}
                    className={`${buttonClass} bg-[var(--ac-accent-solid)] text-[var(--ac-accent-solid-text)]`}
                >
                    <ChevronLeft size={16} className="rtl:rotate-180" />
                    <span className="max-sm:hidden">{t('pagination.previous')}</span>
                </button>

                <label className="inline-flex items-center gap-2 text-xs text-[var(--ac-text-muted)]">
                    {ar ? 'صفحة' : 'Page'}
                    <input
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={lastPage}
                        value={jump}
                        disabled={loading}
                        onChange={event => setJump(event.target.value)}
                        onBlur={commitJump}
                        onKeyDown={event => {
                            if (event.key === 'Enter') {
                                event.preventDefault();
                                commitJump();
                            }
                        }}
                        aria-label={ar ? 'رقم الصفحة' : 'Page number'}
                        className="h-10 w-16 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] text-center text-xs font-semibold text-[var(--ac-text)] outline-none focus:border-[var(--ac-accent)]"
                    />
                    {ar ? 'من' : 'of'}
                    <span className="font-semibold tabular-nums text-[var(--ac-text)]">
                        {lastPage}
                    </span>
                </label>

                <button
                    type="button"
                    aria-label={t('pagination.next')}
                    disabled={loading || page >= lastPage}
                    onClick={() => onPageChange(Math.min(lastPage, page + 1))}
                    className={`${buttonClass} bg-[var(--ac-accent-solid)] text-[var(--ac-accent-solid-text)]`}
                >
                    <span className="max-sm:hidden">{t('pagination.next')}</span>
                    <ChevronRight size={16} className="rtl:rotate-180" />
                </button>

                <label className="inline-flex items-center gap-2 text-xs text-[var(--ac-text-muted)]">
                    <span className="max-sm:hidden">{t('ui.rows')}</span>
                    <Select
                        value={perPage}
                        disabled={loading}
                        onChange={event => onPerPageChange(Number(event.target.value))}
                        className="h-10 rounded-[12px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-3 text-xs font-semibold text-[var(--ac-text)] outline-none"
                    >
                        {sizes.map(size => (
                            <option key={size} value={size}>
                                {size}
                            </option>
                        ))}
                    </Select>
                </label>
            </div>
        </footer>
    );
}
