import {
    ArrowDownAZ,
    ArrowUpAZ,
    Building2,
    Check,
    Filter,
    History,
    RotateCcw,
    UserRound,
    X,
} from 'lucide-react';
import {
    useEffect,
    useRef,
    useState,
    type ReactNode,
} from 'react';

import type {
    PartyLifecycle,
    PartySort,
} from '@/features/parties/api';
import type {
    PartyRole,
    PartyType,
} from '@/features/parties/types';

export type PartyFilterState = {
    role?: PartyRole;

    type?: PartyType;

    status: PartyLifecycle;

    sort: PartySort;
};

type PartyFilterPopoverProps = {
    value: PartyFilterState;

    onChange: (
        filters: PartyFilterState,
    ) => void;
};

/**
 * Count Party filters that differ from the default active alphabetical view.
 */
export function countPartyFilters(
    filters: PartyFilterState,
): number {
    let count = 0;

    if (filters.role) {
        count++;
    }

    if (filters.type) {
        count++;
    }

    if (
        filters.status !==
        'active'
    ) {
        count++;
    }

    if (
        filters.sort !==
        'name_asc'
    ) {
        count++;
    }

    return count;
}

/**
 * Render AccoNova's responsive Party filtering surface.
 *
 * Phones use a bottom sheet, tablet and compact laptop widths use a centered
 * dialog, and wide desktop screens use an anchored popover beside the trigger.
 */
export function PartyFilterPopover({
    value,
    onChange,
}: PartyFilterPopoverProps) {
    const [open, setOpen] =
        useState(false);

    const [
        draft,
        setDraft,
    ] =
        useState<PartyFilterState>(
            value,
        );

    const containerRef =
        useRef<HTMLDivElement>(
            null,
        );

    const count =
        countPartyFilters(
            value,
        );

    useEffect(() => {
        if (open) {
            setDraft(
                value,
            );
        }
    }, [
        open,
        value,
    ]);

    useEffect(() => {
        if (! open) {
            return;
        }

        /**
         * Close the wide-desktop anchored popover when clicking elsewhere.
         *
         * Tablet and mobile modes have their own explicit backdrop.
         */
        function handlePointerDown(
            event: MouseEvent,
        ): void {
            if (
                window.innerWidth <
                1280
            ) {
                return;
            }

            if (
                containerRef.current &&
                ! containerRef.current.contains(
                    event.target as Node,
                )
            ) {
                setOpen(false);
            }
        }

        /**
         * Let users close every filter presentation with the Escape key.
         */
        function handleKeyDown(
            event: KeyboardEvent,
        ): void {
            if (
                event.key ===
                'Escape'
            ) {
                setOpen(false);
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
     * Restore the normal Party index filtering defaults.
     */
    function reset(): void {
        setDraft({
            status: 'active',
            sort: 'name_asc',
        });
    }

    /**
     * Commit the current draft filters and close the filter surface.
     */
    function apply(): void {
        onChange(
            draft,
        );

        setOpen(false);
    }

    return (
        <div
            ref={containerRef}
            className="relative min-w-0"
        >
            <button
                type="button"
                aria-expanded={open}
                onClick={() =>
                    setOpen(
                        (
                            current,
                        ) =>
                            ! current,
                    )
                }
                className={[
                    'relative flex h-11 w-full min-w-0 items-center justify-center gap-2 rounded-[14px] border px-4 text-sm font-semibold transition sm:w-auto',
                    open ||
                    count > 0
                        ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                        : 'border-[var(--ac-line)] bg-white text-[var(--ac-text)] hover:border-[var(--ac-line-strong)] hover:shadow-[var(--ac-shadow-soft)]',
                ].join(' ')}
            >
                <Filter
                    size={15}
                    className="shrink-0"
                />

                <span>
                    Filters
                </span>

                {count > 0 && (
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-[var(--ac-accent-strong)] text-[9px] font-bold text-white">
                        {count}
                    </span>
                )}
            </button>

            {open && (
                <>
                    {/*
                     * Mobile and tablet/compact-laptop modes use a real
                     * viewport backdrop. Wide desktops intentionally do not,
                     * because the filter becomes a lightweight anchored popover.
                     */}
                    <button
                        type="button"
                        aria-label="Close filters"
                        onClick={() =>
                            setOpen(
                                false,
                            )
                        }
                        className="fixed inset-0 z-[129] bg-[var(--ac-text)]/20 backdrop-blur-[2px] xl:hidden"
                    />

                    <section
                        className={[
                            /*
                             * Mobile:
                             * bottom sheet spanning the viewport width.
                             */
                            'fixed inset-x-0 bottom-0 z-[130] max-h-[88dvh] overflow-hidden rounded-t-[28px] border border-[var(--ac-line)] bg-white shadow-[var(--ac-shadow-panel)]',

                            /*
                             * Tablet / compact laptop:
                             * centered dialog so it can never fall off-screen.
                             */
                            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-1/2 sm:w-[min(560px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-[26px]',

                            /*
                             * Wide desktop:
                             * anchored popover beside the Filters button.
                             */
                            'xl:absolute xl:left-auto xl:right-0 xl:top-[calc(100%+0.65rem)] xl:w-[440px] xl:max-w-[calc(100vw-2rem)] xl:translate-x-0 xl:translate-y-0 xl:rounded-[22px]',
                        ].join(' ')}
                    >
                        <header className="flex items-center justify-between border-b border-[var(--ac-line)] px-5 py-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <div className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                                    <Filter
                                        size={15}
                                    />
                                </div>

                                <div className="min-w-0">
                                    <p className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                                        Refine view
                                    </p>

                                    <h2 className="mt-0.5 truncate text-lg font-semibold tracking-[-0.035em]">
                                        Filter relationships
                                    </h2>
                                </div>
                            </div>

                            <button
                                type="button"
                                aria-label="Close filters"
                                onClick={() =>
                                    setOpen(
                                        false,
                                    )
                                }
                                className="flex size-9 shrink-0 items-center justify-center rounded-[12px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)] transition hover:bg-[var(--ac-surface-strong)] hover:text-[var(--ac-text)]"
                            >
                                <X
                                    size={16}
                                />
                            </button>
                        </header>

                        <div className="max-h-[calc(88dvh-146px)] overflow-y-auto overscroll-contain p-4 sm:max-h-[min(68dvh,650px)] sm:p-5 xl:max-h-[70vh]">
                            <div className="grid gap-5 sm:gap-6">
                                <FilterSection
                                    title="Relationship"
                                >
                                    <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
                                        <ChoiceButton
                                            active={
                                                ! draft.role
                                            }
                                            onClick={() =>
                                                setDraft(
                                                    {
                                                        ...draft,
                                                        role: undefined,
                                                    },
                                                )
                                            }
                                        >
                                            Everyone
                                        </ChoiceButton>

                                        <ChoiceButton
                                            active={
                                                draft.role ===
                                                'customer'
                                            }
                                            onClick={() =>
                                                setDraft(
                                                    {
                                                        ...draft,
                                                        role: 'customer',
                                                    },
                                                )
                                            }
                                        >
                                            Customers
                                        </ChoiceButton>

                                        <ChoiceButton
                                            active={
                                                draft.role ===
                                                'supplier'
                                            }
                                            onClick={() =>
                                                setDraft(
                                                    {
                                                        ...draft,
                                                        role: 'supplier',
                                                    },
                                                )
                                            }
                                        >
                                            Suppliers
                                        </ChoiceButton>
                                    </div>
                                </FilterSection>

                                <FilterSection
                                    title="Entity type"
                                >
                                    <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
                                        <ChoiceButton
                                            active={
                                                ! draft.type
                                            }
                                            onClick={() =>
                                                setDraft(
                                                    {
                                                        ...draft,
                                                        type: undefined,
                                                    },
                                                )
                                            }
                                        >
                                            All types
                                        </ChoiceButton>

                                        <ChoiceButton
                                            icon={
                                                UserRound
                                            }
                                            active={
                                                draft.type ===
                                                'person'
                                            }
                                            onClick={() =>
                                                setDraft(
                                                    {
                                                        ...draft,
                                                        type: 'person',
                                                    },
                                                )
                                            }
                                        >
                                            People
                                        </ChoiceButton>

                                        <ChoiceButton
                                            icon={
                                                Building2
                                            }
                                            active={
                                                draft.type ===
                                                'company'
                                            }
                                            onClick={() =>
                                                setDraft(
                                                    {
                                                        ...draft,
                                                        type: 'company',
                                                    },
                                                )
                                            }
                                        >
                                            Companies
                                        </ChoiceButton>
                                    </div>
                                </FilterSection>

                                <div className="grid gap-5 sm:grid-cols-2 sm:gap-4">
                                    <FilterSection
                                        title="Lifecycle"
                                    >
                                        <div className="grid gap-2">
                                            <ChoiceButton
                                                active={
                                                    draft.status ===
                                                    'active'
                                                }
                                                onClick={() =>
                                                    setDraft(
                                                        {
                                                            ...draft,
                                                            status: 'active',
                                                        },
                                                    )
                                                }
                                            >
                                                Active
                                            </ChoiceButton>

                                            <ChoiceButton
                                                icon={
                                                    History
                                                }
                                                active={
                                                    draft.status ===
                                                    'deleted'
                                                }
                                                onClick={() =>
                                                    setDraft(
                                                        {
                                                            ...draft,
                                                            status: 'deleted',
                                                        },
                                                    )
                                                }
                                            >
                                                Archived
                                            </ChoiceButton>
                                        </div>
                                    </FilterSection>

                                    <FilterSection
                                        title="Sort"
                                    >
                                        <div className="grid gap-2">
                                            <ChoiceButton
                                                icon={
                                                    ArrowDownAZ
                                                }
                                                active={
                                                    draft.sort ===
                                                    'name_asc'
                                                }
                                                onClick={() =>
                                                    setDraft(
                                                        {
                                                            ...draft,
                                                            sort: 'name_asc',
                                                        },
                                                    )
                                                }
                                            >
                                                Name A–Z
                                            </ChoiceButton>

                                            <ChoiceButton
                                                icon={
                                                    ArrowUpAZ
                                                }
                                                active={
                                                    draft.sort ===
                                                    'name_desc'
                                                }
                                                onClick={() =>
                                                    setDraft(
                                                        {
                                                            ...draft,
                                                            sort: 'name_desc',
                                                        },
                                                    )
                                                }
                                            >
                                                Name Z–A
                                            </ChoiceButton>

                                            <ChoiceButton
                                                active={
                                                    draft.sort ===
                                                    'newest'
                                                }
                                                onClick={() =>
                                                    setDraft(
                                                        {
                                                            ...draft,
                                                            sort: 'newest',
                                                        },
                                                    )
                                                }
                                            >
                                                Newest
                                            </ChoiceButton>

                                            <ChoiceButton
                                                active={
                                                    draft.sort ===
                                                    'oldest'
                                                }
                                                onClick={() =>
                                                    setDraft(
                                                        {
                                                            ...draft,
                                                            sort: 'oldest',
                                                        },
                                                    )
                                                }
                                            >
                                                Oldest
                                            </ChoiceButton>
                                        </div>
                                    </FilterSection>
                                </div>
                            </div>
                        </div>

                        <footer
                            className="grid grid-cols-2 gap-2 border-t border-[var(--ac-line)] bg-[var(--ac-surface-soft)] p-4"
                            style={{
                                paddingBottom:
                                    'max(1rem, env(safe-area-inset-bottom))',
                            }}
                        >
                            <button
                                type="button"
                                onClick={
                                    reset
                                }
                                className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-[14px] border border-[var(--ac-line)] bg-white px-3 text-sm font-semibold text-[var(--ac-text-soft)] transition hover:border-[var(--ac-line-strong)]"
                            >
                                <RotateCcw
                                    size={14}
                                    className="shrink-0"
                                />

                                <span className="truncate">
                                    Reset
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={
                                    apply
                                }
                                className="flex h-11 min-w-0 items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-3 text-sm font-semibold text-white shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--ac-shadow-panel)]"
                            >
                                <Check
                                    size={14}
                                    className="shrink-0"
                                />

                                <span className="truncate">
                                    Apply filters
                                </span>
                            </button>
                        </footer>
                    </section>
                </>
            )}
        </div>
    );
}

type FilterSectionProps = {
    title: string;

    children: ReactNode;
};

/**
 * Render one clearly separated filter category.
 */
function FilterSection({
    title,
    children,
}: FilterSectionProps) {
    return (
        <section className="min-w-0">
            <p className="mb-2.5 text-[9px] font-semibold uppercase tracking-[0.15em] text-[var(--ac-text-muted)]">
                {title}
            </p>

            {children}
        </section>
    );
}

type ChoiceButtonProps = {
    active: boolean;

    onClick: () => void;

    children: string;

    icon?: typeof UserRound;
};

/**
 * Render one responsive filter choice with a clear selected state.
 */
function ChoiceButton({
    active,
    onClick,
    children,
    icon: Icon,
}: ChoiceButtonProps) {
    return (
        <button
            type="button"
            onClick={
                onClick
            }
            className={[
                'flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-[12px] border px-2.5 py-2 text-[11px] font-semibold transition',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                    : 'border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)] hover:bg-[var(--ac-bg-soft)]',
            ].join(' ')}
        >
            {Icon && (
                <Icon
                    size={13}
                    className="shrink-0"
                />
            )}

            <span className="min-w-0 truncate">
                {children}
            </span>
        </button>
    );
}