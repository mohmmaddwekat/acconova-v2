import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    Plus,
    Search,
    UsersRound,
    X,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useState,
} from 'react';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import {
    FeedbackToast,
    type FeedbackTone,
} from '@/components/feedback/FeedbackToast';
import { DataPagination } from '@/components/data/DataPagination';
import {
    archiveParty,
    fetchParties,
    restoreParty,
    type PartyFilters,
} from '@/features/parties/api';
import { PartyDataActions } from '@/features/parties/components/PartyDataActions';
import { PartyDetailDrawer } from '@/features/parties/components/PartyDetailDrawer';
import { PartyEditorDrawer } from '@/features/parties/components/PartyEditorDrawer';
import {
    countPartyFilters,
    PartyFilterPopover,
    type PartyFilterState,
} from '@/features/parties/components/PartyFilterPopover';
import { PartyImportDialog } from '@/features/parties/components/PartyImportDialog';
import { PartyListItem } from '@/features/parties/components/PartyListItem';
import {
    canArchiveParties,
    canEditParties,
} from '@/features/parties/permissions';
import type {
    Party,
    PartyIndexResponse,
} from '@/features/parties/types';
import { ApiError } from '@/lib/http';
import { AppShell } from '@/layouts/AppShell';
import type {
    AppPageProps,
} from '@/types/app';

type PendingAction = {
    kind:
        | 'archive'
        | 'restore';

    party: Party;
};

type ToastState = {
    message: string;

    tone: FeedbackTone;
};

/**
 * Resolve the current document language for exports without assuming English.
 */
function currentLocale(): string {
    if (
        typeof document ===
        'undefined'
    ) {
        return 'en';
    }

    return (
        document.documentElement
            .lang || 'en'
    );
}

/**
 * Render AccoNova's complete relationship index workspace.
 *
 * Search is debounced, filters live in a responsive popover, pagination is
 * server-side, exports include every filtered row, and spreadsheet imports
 * support preview and duplicate handling.
 */
export default function PartiesIndex() {
    const {
        workspace,
    } = usePage<AppPageProps>().props;

    const activeOrganization =
        workspace.activeOrganization;

    const activeRole =
        activeOrganization?.role;

    const allowEdit =
        canEditParties(
            activeRole,
        );

    const allowArchive =
        canArchiveParties(
            activeRole,
        );

    const [
        response,
        setResponse,
    ] =
        useState<PartyIndexResponse | null>(
            null,
        );

    const [loading, setLoading] =
        useState(false);

    const [error, setError] =
        useState<string | null>(
            null,
        );

    const [
        draftSearch,
        setDraftSearch,
    ] = useState('');

    const [search, setSearch] =
        useState('');

    const [
        filters,
        setFilters,
    ] =
        useState<PartyFilterState>({
            status: 'active',
            sort: 'name_asc',
        });

    const [page, setPage] =
        useState(1);

    const [perPage, setPerPage] =
        useState(25);

    const [
        editorOpen,
        setEditorOpen,
    ] = useState(false);

    const [
        editingParty,
        setEditingParty,
    ] =
        useState<Party | null>(
            null,
        );

    const [
        detailParty,
        setDetailParty,
    ] =
        useState<Party | null>(
            null,
        );

    const [
        pendingAction,
        setPendingAction,
    ] =
        useState<PendingAction | null>(
            null,
        );

    const [
        actionBusy,
        setActionBusy,
    ] = useState(false);

    const [
        importOpen,
        setImportOpen,
    ] = useState(false);

    const [
        toast,
        setToast,
    ] =
        useState<ToastState | null>(
            null,
        );

    /**
     * Build the complete Party list/export filter contract.
     */
    const partyFilters:
        PartyFilters = {
        search,
        role:
            filters.role,
        type:
            filters.type,
        status:
            filters.status,
        sort:
            filters.sort,
        page,
        perPage,
        locale:
            currentLocale(),
    };

    /**
     * Load one Party page from the active tenant.
     */
    const loadParties =
        useCallback(
            async (): Promise<void> => {
                if (
                    ! activeOrganization
                ) {
                    setResponse(null);

                    return;
                }

                setLoading(true);
                setError(null);

                try {
                    const data =
                        await fetchParties(
                            partyFilters,
                        );

                    setResponse(
                        data,
                    );
                } catch (
                    exception
                ) {
                    setError(
                        exception instanceof
                        ApiError
                            ? exception.message
                            : 'AccoNova could not load your relationships.',
                    );
                } finally {
                    setLoading(
                        false,
                    );
                }
            },
            [
                activeOrganization,
                filters.role,
                filters.sort,
                filters.status,
                filters.type,
                page,
                perPage,
                search,
            ],
        );

    useEffect(() => {
        void loadParties();
    }, [
        loadParties,
    ]);

    useEffect(() => {
        const timeout =
            window.setTimeout(
                () => {
                    const nextSearch =
                        draftSearch.trim();

                    if (
                        nextSearch !==
                        search
                    ) {
                        setSearch(
                            nextSearch,
                        );

                        setPage(1);
                    }
                },
                350,
            );

        return () => {
            window.clearTimeout(
                timeout,
            );
        };
    }, [
        draftSearch,
        search,
    ]);

    useEffect(() => {
        if (! toast) {
            return;
        }

        const timeout =
            window.setTimeout(
                () => {
                    setToast(null);
                },
                3600,
            );

        return () => {
            window.clearTimeout(
                timeout,
            );
        };
    }, [
        toast,
    ]);

    /**
     * Surface temporary application feedback.
     */
    function showToast(
        message: string,
        tone: FeedbackTone = 'success',
    ): void {
        setToast({
            message,
            tone,
        });
    }

    /**
     * Reset the live search immediately.
     */
    function clearSearch(): void {
        setDraftSearch('');
        setSearch('');
        setPage(1);
    }

    /**
     * Apply popup filters and restart pagination.
     */
    function applyFilters(
        nextFilters: PartyFilterState,
    ): void {
        setFilters(
            nextFilters,
        );

        setPage(1);
    }

    /**
     * Change page size and return to the first page.
     */
    function changePerPage(
        nextPerPage: number,
    ): void {
        setPerPage(
            nextPerPage,
        );

        setPage(1);
    }

    /**
     * Open the clean Party creation editor.
     */
    function openCreate(): void {
        setDetailParty(null);
        setEditingParty(null);
        setEditorOpen(true);
    }

    /**
     * Open one Party for editing.
     */
    function openEdit(
        party: Party,
    ): void {
        setDetailParty(null);
        setEditingParty(
            party,
        );
        setEditorOpen(true);
    }

    /**
     * Open one Party context surface.
     */
    function openDetail(
        party: Party,
    ): void {
        setDetailParty(
            party,
        );
    }

    /**
     * Ask for confirmation before archiving a Party.
     */
    function requestArchive(
        party: Party,
    ): void {
        setPendingAction({
            kind: 'archive',
            party,
        });
    }

    /**
     * Ask for confirmation before restoring a Party.
     */
    function requestRestore(
        party: Party,
    ): void {
        setPendingAction({
            kind: 'restore',
            party,
        });
    }

    /**
     * Execute the confirmed archive or restore action.
     */
    async function confirmPendingAction(): Promise<void> {
        if (
            ! pendingAction ||
            actionBusy
        ) {
            return;
        }

        setActionBusy(true);

        try {
            if (
                pendingAction.kind ===
                'archive'
            ) {
                await archiveParty(
                    pendingAction
                        .party.id,
                );

                showToast(
                    'Relationship archived. Historical data remains preserved.',
                );
            } else {
                await restoreParty(
                    pendingAction
                        .party.id,
                );

                showToast(
                    'Relationship restored to the active ledger.',
                );
            }

            setDetailParty(null);
            setPendingAction(null);

            await loadParties();
        } catch (exception) {
            showToast(
                exception instanceof
                ApiError
                    ? exception.message
                    : 'AccoNova could not complete this action.',
                'error',
            );
        } finally {
            setActionBusy(
                false,
            );
        }
    }

    const parties =
        response?.data ?? [];

    const total =
        response?.meta.total ?? 0;

    const currentPage =
        response?.meta
            .current_page ?? 1;

    const lastPage =
        response?.meta
            .last_page ?? 1;

    const activeFilterCount =
        countPartyFilters(
            filters,
        );

    const pendingLabel =
        pendingAction?.party.type ===
        'company'
            ? pendingAction.party
                  .company_name
            : pendingAction?.party.name;

    return (
        <AppShell>
            <Head title="Relationships · AccoNova" />

            <main className="mx-auto w-full max-w-[1680px] min-w-0 px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-9 2xl:px-10">
                <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_290px] xl:gap-8">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--ac-accent)] opacity-30" />

                                <span className="relative inline-flex size-2 rounded-full bg-[var(--ac-accent)]" />
                            </span>

                            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-accent-strong)] sm:text-[10px]">
                                Relationship ledger
                            </p>
                        </div>

                        <h1 className="mt-3 max-w-[800px] text-[2rem] font-medium leading-[0.94] tracking-[-0.055em] sm:text-[2.8rem] md:text-[3.5rem] lg:text-[4rem] xl:text-[4.7rem]">
                            Know who your business
                            moves with.
                        </h1>

                        <p className="mt-4 max-w-[650px] text-[13px] leading-5 text-[var(--ac-text-soft)] sm:text-sm sm:leading-6">
                            Search, filter, import,
                            export, and maintain
                            every customer and
                            supplier from one
                            reusable business
                            identity.
                        </p>
                    </div>

                    <div className="flex items-center gap-3 rounded-[20px] border border-[var(--ac-line)] bg-white p-4 shadow-[var(--ac-shadow-soft)] xl:flex-col xl:items-start xl:justify-end xl:p-5">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-[14px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]">
                            <UsersRound
                                size={17}
                            />
                        </div>

                        <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                Matching view
                            </p>

                            <p className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                                {total}{' '}
                                relationships
                            </p>

                            <p className="mt-1 truncate text-[11px] text-[var(--ac-text-muted)]">
                                {activeOrganization
                                    ? `Inside ${activeOrganization.name}`
                                    : 'No workspace selected'}
                            </p>
                        </div>
                    </div>
                </section>

                {activeOrganization && (
                    <section className="mt-7 overflow-visible rounded-[22px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] shadow-[var(--ac-shadow-soft)] lg:mt-10 lg:rounded-[28px]">
                        <div className="rounded-t-[22px] border-b border-[var(--ac-line)] bg-white p-3 sm:p-5 lg:rounded-t-[28px] lg:p-6">
                            <div className="grid gap-2 xl:grid-cols-[minmax(260px,1fr)_auto_auto] xl:items-center">
                                <div className="relative">
                                    <Search
                                        size={15}
                                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
                                    />

                                    <input
                                        value={
                                            draftSearch
                                        }
                                        onChange={(
                                            event,
                                        ) =>
                                            setDraftSearch(
                                                event
                                                    .target
                                                    .value,
                                            )
                                        }
                                        placeholder="Search name, email, phone, tax number, city…"
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] pl-10 pr-11 text-sm outline-none transition placeholder:text-[var(--ac-text-faint)] focus:border-[var(--ac-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                    />

                                    {draftSearch && (
                                        <button
                                            type="button"
                                            aria-label="Clear search"
                                            onClick={
                                                clearSearch
                                            }
                                            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)] transition hover:bg-white"
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 sm:flex">
                                    <PartyFilterPopover
                                        value={
                                            filters
                                        }
                                        onChange={
                                            applyFilters
                                        }
                                    />

                                    <PartyDataActions
                                        filters={
                                            partyFilters
                                        }
                                        canImport={
                                            allowEdit
                                        }
                                        onImport={() =>
                                            setImportOpen(
                                                true,
                                            )
                                        }
                                    />
                                </div>

                                {allowEdit && (
                                    <button
                                        type="button"
                                        onClick={
                                            openCreate
                                        }
                                        className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-0.5 hover:shadow-[var(--ac-shadow-panel)] xl:w-auto"
                                    >
                                        <Plus size={16} />

                                        New relationship
                                    </button>
                                )}
                            </div>

                            {(search ||
                                activeFilterCount >
                                    0) && (
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ac-text-muted)]">
                                    <span>
                                        View refined by
                                    </span>

                                    {search && (
                                        <span className="rounded-full bg-[var(--ac-bg-soft)] px-2.5 py-1 font-semibold text-[var(--ac-text-soft)]">
                                            “{search}”
                                        </span>
                                    )}

                                    {activeFilterCount >
                                        0 && (
                                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 font-semibold text-[var(--ac-accent-strong)]">
                                            {
                                                activeFilterCount
                                            }{' '}
                                            filters
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {error && (
                            <div className="border-b border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 px-4 py-3 text-sm text-[var(--ac-danger)]">
                                {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="space-y-3 p-3 lg:space-y-0 lg:p-0">
                                {[
                                    1,
                                    2,
                                    3,
                                    4,
                                ].map(
                                    (
                                        item,
                                    ) => (
                                        <div
                                            key={
                                                item
                                            }
                                            className="h-[165px] animate-pulse rounded-[20px] border border-[var(--ac-line)] bg-white/60 lg:h-[90px] lg:rounded-none lg:border-x-0 lg:border-t-0"
                                        />
                                    ),
                                )}
                            </div>
                        ) : parties.length ===
                          0 ? (
                            <div className="px-4 py-16 text-center sm:py-20">
                                <div className="mx-auto flex size-12 items-center justify-center rounded-[18px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)]">
                                    <UsersRound
                                        size={19}
                                    />
                                </div>

                                <h2 className="mt-5 text-xl font-semibold tracking-[-0.04em]">
                                    No relationships
                                    match this view.
                                </h2>

                                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ac-text-soft)]">
                                    Clear the search or
                                    adjust the filters,
                                    or import your
                                    existing business
                                    data in bulk.
                                </p>
                            </div>
                        ) : (
                            <div>
                                {parties.map(
                                    (
                                        party,
                                    ) => (
                                        <PartyListItem
                                            key={
                                                party.id
                                            }
                                            party={
                                                party
                                            }
                                            canEdit={
                                                allowEdit
                                            }
                                            canArchive={
                                                allowArchive
                                            }
                                            onView={
                                                openDetail
                                            }
                                            onEdit={
                                                openEdit
                                            }
                                            onArchive={
                                                requestArchive
                                            }
                                            onRestore={
                                                requestRestore
                                            }
                                        />
                                    ),
                                )}
                            </div>
                        )}

                        <DataPagination
                            page={
                                currentPage
                            }
                            lastPage={
                                lastPage
                            }
                            perPage={
                                perPage
                            }
                            total={
                                total
                            }
                            loading={
                                loading
                            }
                            onPageChange={
                                setPage
                            }
                            onPerPageChange={
                                changePerPage
                            }
                        />
                    </section>
                )}

                <PartyDetailDrawer
                    open={
                        detailParty !==
                        null
                    }
                    party={
                        detailParty
                    }
                    canEdit={
                        allowEdit
                    }
                    canArchive={
                        allowArchive
                    }
                    onClose={() =>
                        setDetailParty(
                            null,
                        )
                    }
                    onEdit={
                        openEdit
                    }
                    onArchive={
                        requestArchive
                    }
                    onRestore={
                        requestRestore
                    }
                />

                <PartyEditorDrawer
                    open={
                        editorOpen
                    }
                    party={
                        editingParty
                    }
                    onClose={() => {
                        setEditorOpen(
                            false,
                        );

                        setEditingParty(
                            null,
                        );
                    }}
                    onSaved={() => {
                        showToast(
                            editingParty
                                ? 'Relationship updated successfully.'
                                : 'Relationship added successfully.',
                        );

                        void loadParties();
                    }}
                />

                <PartyImportDialog
                    open={
                        importOpen
                    }
                    onClose={() =>
                        setImportOpen(
                            false,
                        )
                    }
                    onImported={(
                        result,
                    ) => {
                        setPage(1);

                        showToast(
                            `Import complete: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped.`,
                        );

                        void loadParties();
                    }}
                />

                <ConfirmDialog
                    open={
                        pendingAction !==
                        null
                    }
                    title={
                        pendingAction
                            ?.kind ===
                        'restore'
                            ? 'Restore this relationship?'
                            : 'Archive this relationship?'
                    }
                    description={
                        pendingAction
                            ?.kind ===
                        'restore'
                            ? `${pendingLabel ?? 'This relationship'} will return to the active ledger.`
                            : `${pendingLabel ?? 'This relationship'} will leave the active ledger while historical data remains preserved.`
                    }
                    confirmLabel={
                        pendingAction
                            ?.kind ===
                        'restore'
                            ? 'Restore'
                            : 'Archive'
                    }
                    tone={
                        pendingAction
                            ?.kind ===
                        'restore'
                            ? 'positive'
                            : 'danger'
                    }
                    busy={
                        actionBusy
                    }
                    onCancel={() => {
                        if (
                            ! actionBusy
                        ) {
                            setPendingAction(
                                null,
                            );
                        }
                    }}
                    onConfirm={() =>
                        void confirmPendingAction()
                    }
                />

                <FeedbackToast
                    message={
                        toast?.message ??
                        null
                    }
                    tone={
                        toast?.tone
                    }
                    onDismiss={() =>
                        setToast(
                            null,
                        )
                    }
                />
            </main>
        </AppShell>
    );
}