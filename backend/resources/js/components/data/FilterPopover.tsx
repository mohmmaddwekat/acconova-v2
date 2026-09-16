import { Filter, RotateCcw, X, type LucideIcon } from 'lucide-react';
import {
    useEffect,
    useRef,
    type PropsWithChildren,
    type ReactNode,
} from 'react';

import { t, useLocale } from '@/lib/i18n';

type FilterPopoverProps = PropsWithChildren<{
    open: boolean;
    title: string;
    eyebrow: string;
    activeCount: number;
    onOpenChange: (open: boolean) => void;
    onReset: () => void;
}>;

/**
 * Render AccoNova's shared responsive filter surface.
 *
 * Phones use a bottom sheet, medium screens use a centered dialog, and wide
 * desktops keep the surface anchored beside the Filters trigger. Filters are
 * applied by feature controls immediately, so users never have to scroll to a
 * footer just to confirm a selection.
 */
export function FilterPopover({
    open,
    title,
    eyebrow,
    activeCount,
    onOpenChange,
    onReset,
    children,
}: FilterPopoverProps) {
    useLocale();
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        /** Close the anchored desktop popover when interaction moves outside. */
        function handlePointerDown(event: MouseEvent): void {
            if (window.innerWidth < 1280) {
                return;
            }

            if (
                containerRef.current &&
                !containerRef.current.contains(event.target as Node)
            ) {
                onOpenChange(false);
            }
        }

        /** Close every presentation with Escape without changing filters. */
        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                onOpenChange(false);
            }
        }

        document.addEventListener('mousedown', handlePointerDown);
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [open, onOpenChange]);

    return (
        <div ref={containerRef} className="relative min-w-0">
            <button
                type="button"
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => onOpenChange(!open)}
                className={[
                    'group flex h-11 w-full items-center justify-center gap-2 rounded-[14px] border px-4 text-sm font-semibold transition duration-200 sm:w-auto',
                    'motion-safe:hover:-translate-y-0.5 active:translate-y-0',
                    open || activeCount > 0
                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] shadow-[var(--ac-shadow-control)]'
                        : 'border-[var(--ac-line)] bg-white text-[var(--ac-text)] shadow-[var(--ac-shadow-control)] hover:border-[var(--ac-line-strong)]',
                ].join(' ')}
            >
                <Filter
                    size={15}
                    className="transition-transform duration-200 group-hover:rotate-[-6deg] rtl:group-hover:rotate-[6deg]"
                />

                {t('ui.filters')}

                {activeCount > 0 && (
                    <span className="flex size-5 items-center justify-center rounded-full bg-[var(--ac-accent-strong)] text-[9px] font-bold text-white shadow-sm">
                        {activeCount}
                    </span>
                )}
            </button>

            {open && (
                <>
                    <button
                        type="button"
                        aria-label={t('ui.close_filters')}
                        onClick={() => onOpenChange(false)}
                        className="fixed inset-0 z-[129] bg-[var(--ac-text)]/18 backdrop-blur-[2px] xl:hidden"
                    />

                    <section
                        role="dialog"
                        aria-label={title}
                        className={[
                            'fixed inset-x-0 bottom-0 z-[130] max-h-[92dvh] overflow-hidden rounded-t-[28px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-float)]',
                            'motion-safe:animate-[ac-popover-in_180ms_ease-out]',
                            'sm:inset-x-auto sm:bottom-auto sm:start-1/2 sm:top-1/2 sm:w-[min(680px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[26px] rtl:sm:translate-x-1/2',
                            'xl:absolute xl:start-auto xl:end-0 xl:top-[calc(100%+0.7rem)] xl:w-[620px] xl:max-w-[calc(100vw-2rem)] xl:translate-x-0 xl:translate-y-0 xl:rounded-[24px] rtl:xl:translate-x-0',
                        ].join(' ')}
                    >
                        <div
                            aria-hidden="true"
                            className="pointer-events-none absolute -end-16 -top-20 size-48 rounded-full bg-[var(--ac-accent)]/10 blur-3xl"
                        />

                        <header className="relative flex items-center justify-between gap-3 border-b border-[var(--ac-line)] px-4 py-4 sm:px-5">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] shadow-inner">
                                    <Filter size={16} />
                                </div>

                                <div className="min-w-0">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-muted)]">
                                        {eyebrow}
                                    </p>

                                    <h2 className="mt-0.5 truncate text-lg font-semibold tracking-[-0.035em] text-[var(--ac-text)] sm:text-xl">
                                        {title}
                                    </h2>
                                </div>
                            </div>

                            <div className="flex shrink-0 items-center gap-2">
                                <button
                                    type="button"
                                    disabled={activeCount === 0}
                                    onClick={onReset}
                                    className="flex min-h-9 items-center gap-2 rounded-[12px] border border-[var(--ac-line)] bg-white px-3 text-[11px] font-semibold text-[var(--ac-text-soft)] shadow-[var(--ac-shadow-control)] transition hover:border-[var(--ac-line-strong)] hover:text-[var(--ac-text)] disabled:cursor-default disabled:opacity-35"
                                >
                                    <RotateCcw size={13} />
                                    <span className="hidden min-[390px]:inline">
                                        {t('ui.reset')}
                                    </span>
                                </button>

                                <button
                                    type="button"
                                    aria-label={t('ui.close_filters')}
                                    onClick={() => onOpenChange(false)}
                                    className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)]"
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </header>

                        <div className="relative max-h-[calc(92dvh-78px)] overflow-y-auto overscroll-contain p-3.5 sm:max-h-[min(72dvh,700px)] sm:p-5 xl:max-h-[min(74vh,720px)]">
                            <div className="grid gap-3">{children}</div>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}

type FilterGroupProps = PropsWithChildren<{
    title: string;
    className?: string;
}>;

/** Render one visually distinct filtering dimension. */
export function FilterGroup({
    title,
    className = '',
    children,
}: FilterGroupProps) {
    return (
        <section
            className={[
                'relative overflow-hidden rounded-[18px] border border-[var(--ac-line)] bg-gradient-to-b from-white to-[var(--ac-surface-soft)] p-3.5 shadow-[var(--ac-shadow-control)] sm:p-4',
                className,
            ].join(' ')}
        >
            <div className="mb-3 flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-[var(--ac-accent)]" />
                <p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-[var(--ac-text-muted)]">
                    {title}
                </p>
            </div>

            {children}
        </section>
    );
}

type FilterOptionProps = {
    active: boolean;
    onClick: () => void;
    children: ReactNode;
    icon?: LucideIcon;
};

/** Render one immediately-applied filter choice with clear selected feedback. */
export function FilterOption({
    active,
    onClick,
    children,
    icon: Icon,
}: FilterOptionProps) {
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={[
                'group flex min-h-10 min-w-0 items-center gap-2 rounded-[12px] border px-3 py-2 text-start text-[11px] font-semibold transition duration-150',
                'motion-safe:hover:-translate-y-0.5 active:translate-y-0',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] shadow-[0_0_0_3px_rgba(67,201,154,0.08)]'
                    : 'border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)] hover:text-[var(--ac-text)] hover:shadow-[var(--ac-shadow-control)]',
            ].join(' ')}
        >
            {Icon && (
                <Icon
                    size={14}
                    className="shrink-0 transition-transform duration-150 group-hover:scale-105"
                />
            )}

            <span className="min-w-0 flex-1 break-words">{children}</span>

            <span
                aria-hidden="true"
                className={[
                    'size-1.5 shrink-0 rounded-full transition',
                    active
                        ? 'bg-[var(--ac-accent)] shadow-[0_0_0_3px_rgba(67,201,154,0.12)]'
                        : 'bg-transparent',
                ].join(' ')}
            />
        </button>
    );
}
