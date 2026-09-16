import {
    Check,
    ChevronDown,
    RotateCcw,
    SlidersHorizontal,
    X,
    type LucideIcon,
} from 'lucide-react';
import {
    useEffect,
    useId,
    useState,
    type ReactNode,
} from 'react';

import {
    useDialog,
} from '@/components/feedback/useDialog';
import {
    t,
    useLocale,
} from '@/lib/i18n';

export type FilterDialogSection = {
    id: string;

    title: string;

    summary: string;

    icon: LucideIcon;

    active?: boolean;

    content: ReactNode;
};

type FilterDialogProps = {
    open: boolean;

    title: string;

    eyebrow: string;

    activeCount: number;

    sections: FilterDialogSection[];

    onClose: () => void;

    onReset: () => void;
};

/**
 * Render AccoNova's scalable filtering workspace.
 *
 * Desktop uses category navigation beside one focused filter panel. Phones use
 * a compact category picker above the same focused content, preventing future
 * filter dimensions from turning the dialog into a long wall of controls.
 */
export function FilterDialog({
    open,
    title,
    eyebrow,
    activeCount,
    sections,
    onClose,
    onReset,
}: FilterDialogProps) {
    useLocale();

    const titleId =
        useId();

    const dialogRef =
        useDialog(
            open,
            onClose,
        );

    const [
        selectedSectionId,
        setSelectedSectionId,
    ] =
        useState(
            sections[0]?.id ??
                '',
        );

    const [
        mobileSectionMenuOpen,
        setMobileSectionMenuOpen,
    ] =
        useState(
            false,
        );

    useEffect(() => {
        if (
            ! open
        ) {
            return;
        }

        const preferredSection =
            sections.find(
                (
                    section,
                ) =>
                    section.active,
            ) ??
            sections[0];

        setSelectedSectionId(
            (
                current,
            ) =>
                sections.some(
                    (
                        section,
                    ) =>
                        section.id ===
                        current,
                )
                    ? current
                    : (
                          preferredSection
                              ?.id ??
                          ''
                      ),
        );

        setMobileSectionMenuOpen(
            false,
        );
    }, [
        open,
    ]);

    const currentSection =
        sections.find(
            (
                section,
            ) =>
                section.id ===
                selectedSectionId,
        ) ??
        sections[0];

    if (
        ! open ||
        ! currentSection
    ) {
        return null;
    }

    const CurrentIcon =
        currentSection.icon;

    /**
     * Change the focused filtering category without changing filter values.
     */
    function chooseSection(
        id: string,
    ): void {
        setSelectedSectionId(
            id,
        );

        setMobileSectionMenuOpen(
            false,
        );
    }

    return (
        <div className="fixed inset-0 z-[135] flex items-end justify-center sm:items-center sm:p-4">
            <button
                type="button"
                aria-label={t(
                    'ui.close_filters',
                )}
                onClick={
                    onClose
                }
                className="absolute inset-0 bg-[var(--ac-text)]/22 backdrop-blur-[4px]"
            />

            <section
                ref={
                    dialogRef
                }
                role="dialog"
                aria-modal="true"
                aria-labelledby={
                    titleId
                }
                className="relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[28px] border border-white/70 bg-white shadow-[0_28px_90px_rgba(23,35,30,0.18)] motion-safe:animate-[fadeIn_180ms_ease-out] sm:w-[min(880px,calc(100vw-2rem))] sm:rounded-[30px]"
            >
                <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--ac-line)] bg-white px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="relative flex size-11 shrink-0 items-center justify-center rounded-[15px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <SlidersHorizontal
                                size={
                                    17
                                }
                            />

                            {activeCount >
                                0 && (
                                <span className="absolute -end-1 -top-1 flex size-5 items-center justify-center rounded-full border-2 border-white bg-[var(--ac-accent)] text-[8px] font-bold text-white">
                                    {
                                        activeCount
                                    }
                                </span>
                            )}
                        </div>

                        <div className="min-w-0">
                            <p className="truncate text-[9px] font-semibold uppercase tracking-[0.16em] text-[var(--ac-text-muted)]">
                                {
                                    eyebrow
                                }
                            </p>

                            <h2
                                id={
                                    titleId
                                }
                                className="mt-0.5 truncate text-lg font-semibold tracking-[-0.035em] text-[var(--ac-text)] sm:text-xl"
                            >
                                {
                                    title
                                }
                            </h2>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1.5">
                        <button
                            type="button"
                            disabled={
                                activeCount ===
                                0
                            }
                            onClick={
                                onReset
                            }
                            className="group flex h-9 items-center justify-center gap-1.5 rounded-[12px] border border-[var(--ac-line)] bg-white px-2.5 text-[11px] font-semibold text-[var(--ac-text-soft)] transition duration-200 hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-surface-soft)] hover:text-[var(--ac-text)] disabled:cursor-default disabled:opacity-30"
                        >
                            <RotateCcw
                                size={
                                    13
                                }
                                className="transition-transform duration-200 group-hover:-rotate-45 motion-reduce:transform-none"
                            />

                            <span className="hidden min-[390px]:inline">
                                {t(
                                    'ui.reset',
                                )}
                            </span>
                        </button>

                        <button
                            type="button"
                            aria-label={t(
                                'ui.close_filters',
                            )}
                            onClick={
                                onClose
                            }
                            className="flex size-9 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)] active:scale-95"
                        >
                            <X
                                size={
                                    16
                                }
                            />
                        </button>
                    </div>
                </header>

                {/* Mobile category picker */}
                <div className="relative border-b border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 md:hidden">
                    <button
                        type="button"
                        aria-expanded={
                            mobileSectionMenuOpen
                        }
                        onClick={() =>
                            setMobileSectionMenuOpen(
                                (
                                    current,
                                ) =>
                                    ! current,
                            )
                        }
                        className="flex min-h-12 w-full items-center gap-3 rounded-[15px] border border-[var(--ac-line)] bg-white px-3 text-start shadow-[var(--ac-shadow-soft)]"
                    >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-[11px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <CurrentIcon
                                size={
                                    14
                                }
                            />
                        </span>

                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-[var(--ac-text)]">
                                {
                                    currentSection.title
                                }
                            </span>

                            <span className="mt-0.5 block truncate text-[10px] text-[var(--ac-text-muted)]">
                                {
                                    currentSection.summary
                                }
                            </span>
                        </span>

                        <ChevronDown
                            size={
                                15
                            }
                            className={[
                                'shrink-0 text-[var(--ac-text-muted)] transition-transform duration-200',
                                mobileSectionMenuOpen
                                    ? 'rotate-180'
                                    : '',
                            ].join(
                                ' ',
                            )}
                        />
                    </button>

                    {mobileSectionMenuOpen && (
                        <div className="absolute inset-x-3 top-[calc(100%-0.25rem)] z-20 max-h-[46dvh] overflow-y-auto rounded-[17px] border border-[var(--ac-line)] bg-white p-1.5 shadow-[var(--ac-shadow-panel)]">
                            {sections.map(
                                (
                                    section,
                                ) => {
                                    const Icon =
                                        section.icon;

                                    const selected =
                                        section.id ===
                                        currentSection.id;

                                    return (
                                        <button
                                            key={
                                                section.id
                                            }
                                            type="button"
                                            onClick={() =>
                                                chooseSection(
                                                    section.id,
                                                )
                                            }
                                            className={[
                                                'flex w-full items-center gap-3 rounded-[13px] px-3 py-2.5 text-start transition',
                                                selected
                                                    ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                    : 'text-[var(--ac-text-soft)] hover:bg-[var(--ac-surface-soft)]',
                                            ].join(
                                                ' ',
                                            )}
                                        >
                                            <span className="flex size-8 shrink-0 items-center justify-center rounded-[10px] bg-white shadow-sm">
                                                <Icon
                                                    size={
                                                        13
                                                    }
                                                />
                                            </span>

                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-xs font-semibold">
                                                    {
                                                        section.title
                                                    }
                                                </span>

                                                <span className="mt-0.5 block truncate text-[10px] opacity-70">
                                                    {
                                                        section.summary
                                                    }
                                                </span>
                                            </span>

                                            {section.active && (
                                                <span className="size-2 shrink-0 rounded-full bg-[var(--ac-accent)]" />
                                            )}
                                        </button>
                                    );
                                },
                            )}
                        </div>
                    )}
                </div>

                <div className="grid min-h-0 flex-1 md:grid-cols-[230px_minmax(0,1fr)]">
                    {/* Desktop category navigator */}
                    <nav
                        aria-label={t(
                            'ui.filters',
                        )}
                        className="hidden min-h-0 border-e border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-3 md:block"
                    >
                        <div className="grid gap-1">
                            {sections.map(
                                (
                                    section,
                                ) => {
                                    const Icon =
                                        section.icon;

                                    const selected =
                                        section.id ===
                                        currentSection.id;

                                    return (
                                        <button
                                            key={
                                                section.id
                                            }
                                            type="button"
                                            aria-pressed={
                                                selected
                                            }
                                            onClick={() =>
                                                chooseSection(
                                                    section.id,
                                                )
                                            }
                                            className={[
                                                'group flex min-h-[58px] w-full items-center gap-3 rounded-[15px] px-3 text-start transition duration-200',
                                                selected
                                                    ? 'bg-white text-[var(--ac-text)] shadow-[var(--ac-shadow-soft)]'
                                                    : 'text-[var(--ac-text-soft)] hover:bg-white/70 hover:text-[var(--ac-text)]',
                                            ].join(
                                                ' ',
                                            )}
                                        >
                                            <span
                                                className={[
                                                    'flex size-9 shrink-0 items-center justify-center rounded-[12px] transition',
                                                    selected
                                                        ? 'bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                                                        : 'bg-white text-[var(--ac-text-muted)] group-hover:text-[var(--ac-text-soft)]',
                                                ].join(
                                                    ' ',
                                                )}
                                            >
                                                <Icon
                                                    size={
                                                        14
                                                    }
                                                />
                                            </span>

                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-2">
                                                    <span className="truncate text-xs font-semibold">
                                                        {
                                                            section.title
                                                        }
                                                    </span>

                                                    {section.active && (
                                                        <span className="size-1.5 shrink-0 rounded-full bg-[var(--ac-accent)]" />
                                                    )}
                                                </span>

                                                <span className="mt-1 block truncate text-[10px] text-[var(--ac-text-muted)]">
                                                    {
                                                        section.summary
                                                    }
                                                </span>
                                            </span>
                                        </button>
                                    );
                                },
                            )}
                        </div>
                    </nav>

                    <div className="min-h-0 overflow-y-auto p-3 sm:p-5">
                        <div className="mx-auto max-w-[600px]">
                            <div className="hidden items-center gap-3 border-b border-[var(--ac-line)] pb-4 md:flex">
                                <div className="flex size-10 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                    <CurrentIcon
                                        size={
                                            16
                                        }
                                    />
                                </div>

                                <div className="min-w-0">
                                    <h3 className="text-base font-semibold tracking-[-0.025em] text-[var(--ac-text)]">
                                        {
                                            currentSection.title
                                        }
                                    </h3>

                                    <p className="mt-0.5 truncate text-[11px] text-[var(--ac-text-muted)]">
                                        {
                                            currentSection.summary
                                        }
                                    </p>
                                </div>
                            </div>

                            <div className="mt-1 md:mt-5">
                                {
                                    currentSection.content
                                }
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}

type FilterChoiceProps = {
    active: boolean;

    onClick: () => void;

    children: ReactNode;

    icon?: LucideIcon;
};

/**
 * Render one calm filter value inside the currently focused category.
 *
 * Only the selected option receives accent treatment so larger option lists
 * remain easy to scan instead of becoming a grid of competing cards.
 */
export function FilterChoice({
    active,
    onClick,
    children,
    icon: Icon,
}: FilterChoiceProps) {
    return (
        <button
            type="button"
            aria-pressed={
                active
            }
            onClick={
                onClick
            }
            className={[
                'group flex min-h-12 w-full items-center gap-3 rounded-[13px] border px-3 py-2.5 text-start transition duration-200',
                active
                    ? 'border-[var(--ac-accent)]/45 bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                    : 'border-transparent bg-[var(--ac-surface-soft)] text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)] hover:bg-white hover:text-[var(--ac-text)]',
            ].join(
                ' ',
            )}
        >
            {Icon && (
                <span
                    className={[
                        'flex size-8 shrink-0 items-center justify-center rounded-[11px] transition',
                        active
                            ? 'bg-white text-[var(--ac-accent-strong)] shadow-sm'
                            : 'bg-white text-[var(--ac-text-muted)]',
                    ].join(
                        ' ',
                    )}
                >
                    <Icon
                        size={
                            14
                        }
                    />
                </span>
            )}

            <span className="min-w-0 flex-1 text-xs font-semibold">
                {
                    children
                }
            </span>

            <span
                aria-hidden="true"
                className={[
                    'flex size-5 shrink-0 items-center justify-center rounded-full transition',
                    active
                        ? 'bg-[var(--ac-accent)] text-white'
                        : 'border border-[var(--ac-line-strong)] bg-white text-transparent',
                ].join(
                    ' ',
                )}
            >
                <Check
                    size={
                        11
                    }
                />
            </span>
        </button>
    );
}
