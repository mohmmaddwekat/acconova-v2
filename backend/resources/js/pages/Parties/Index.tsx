import {
    Head,
    usePage,
} from '@inertiajs/react';
import {
    ArrowLeft,
    ArrowRight,
    Building2,
    Plus,
    Search,
    UserRound,
    UsersRound,
    X,
} from 'lucide-react';
import {
    useCallback,
    useEffect,
    useState,
    type FormEvent,
} from 'react';

import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import {
    FeedbackToast,
    type FeedbackTone,
} from '@/components/feedback/FeedbackToast';
import {
    archiveParty,
    fetchParties,
    restoreParty,
    type PartyLifecycle,
} from '@/features/parties/api';
import { PartyDetailDrawer } from '@/features/parties/components/PartyDetailDrawer';
import { PartyEditorDrawer } from '@/features/parties/components/PartyEditorDrawer';
import { PartyListItem } from '@/features/parties/components/PartyListItem';
import {
    canArchiveParties,
    canEditParties,
} from '@/features/parties/permissions';
import type {
    Party,
    PartyIndexResponse,
    PartyRole,
    PartyType,
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
 * Render AccoNova's tenant-scoped relationship operating surface.
 *
 * The workspace combines search, business-role filtering, entity-type
 * filtering, lifecycle management, detail context, editing, and responsive
 * feedback without navigating away from the business ledger.
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
        useState<string | null>(null);

    const [
        draftSearch,
        setDraftSearch,
    ] = useState('');

    const [search, setSearch] =
        useState('');

    const [role, setRole] =
        useState<PartyRole | undefined>();

    const [partyType, setPartyType] =
        useState<PartyType | undefined>();

    const [status, setStatus] =
        useState<PartyLifecycle>(
            'active',
        );

    const [page, setPage] =
        useState(1);

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
        toast,
        setToast,
    ] =
        useState<ToastState | null>(
            null,
        );

    /**
     * Load the selected Party view from the active organization.
     */
    const loadParties =
        useCallback(
            async (): Promise<void> => {
                if (
                    ! activeOrganization
                ) {
                    setResponse(null);
                    setLoading(false);

                    return;
                }

                setLoading(true);
                setError(null);

                try {
                    const data =
                        await fetchParties(
                            {
                                search,
                                role,
                                type: partyType,
                                status,
                                page,
                            },
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
                page,
                partyType,
                role,
                search,
                status,
            ],
        );

    useEffect(() => {
        void loadParties();
    }, [
        loadParties,
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
                3400,
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
     * Surface a short-lived business operation result.
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
     * Submit the current search term to Laravel.
     */
    function handleSearch(
        event: FormEvent<HTMLFormElement>,
    ): void {
        event.preventDefault();

        const nextSearch =
            draftSearch.trim();

        setPage(1);

        if (
            nextSearch === search
        ) {
            void loadParties();

            return;
        }

        setSearch(
            nextSearch,
        );
    }

    /**
     * Clear both draft and active search state.
     */
    function clearSearch(): void {
        setDraftSearch('');
        setSearch('');
        setPage(1);
    }

    /**
     * Start a clean Party creation flow.
     */
    function openCreate(): void {
        setDetailParty(null);
        setEditingParty(null);
        setEditorOpen(true);
    }

    /**
     * Open one Party inside the shared editor.
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
     * Open one Party inside its read-oriented context surface.
     */
    function openDetail(
        party: Party,
    ): void {
        setDetailParty(
            party,
        );
    }

    /**
     * Request confirmation before archiving a business relationship.
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
     * Request confirmation before restoring an archived relationship.
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
     * Execute the confirmed archive or restore operation.
     */
    async function confirmPendingAction(): Promise<void> {
        if (
            ! pendingAction ||
            actionBusy
        ) {
            return;
        }

        setActionBusy(true);
        setError(null);

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
                    'Relationship archived. Historical business data remains preserved.',
                );
            } else {
                await restoreParty(
                    pendingAction
                        .party.id,
                );

                showToast(
                    'Relationship restored and returned to the active ledger.',
                );
            }

            setDetailParty(null);
            setPendingAction(null);

            await loadParties();
        } catch (exception) {
            const message =
                exception instanceof
                ApiError
                    ? exception.message
                    : 'AccoNova could not complete this relationship action.';

            showToast(
                message,
                'error',
            );
        } finally {
            setActionBusy(false);
        }
    }

    /**
     * Change lifecycle status and restart pagination.
     */
    function changeStatus(
        nextStatus: PartyLifecycle,
    ): void {
        setStatus(
            nextStatus,
        );

        setPage(1);
    }

    /**
     * Change relationship-role filtering and restart pagination.
     */
    function changeRole(
        nextRole:
            | PartyRole
            | undefined,
    ): void {
        setRole(
            nextRole,
        );

        setPage(1);
    }

    /**
     * Change person/company filtering and restart pagination.
     */
    function changePartyType(
        nextType:
            | PartyType
            | undefined,
    ): void {
        setPartyType(
            nextType,
        );

        setPage(1);
    }

    const parties =
        response?.data ?? [];

    const total =
        response?.meta.total ?? 0;

    const currentPage =
        response?.meta.current_page ??
        1;

    const lastPage =
        response?.meta.last_page ??
        1;

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
                <section className="grid min-w-0 gap-5 lg:gap-8 xl:grid-cols-[minmax(0,1fr)_290px]">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full animate-ping rounded-full bg-[var(--ac-accent)] opacity-30" />

                                <span className="relative inline-flex size-2 rounded-full bg-[var(--ac-accent)]" />
                            </span>

                            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-accent-strong)] sm:text-[10px] sm:tracking-[0.24em]">
                                Relationship ledger
                            </p>
                        </div>

                        <h1 className="mt-3 max-w-[780px] text-[2rem] font-medium leading-[0.94] tracking-[-0.055em] text-[var(--ac-text)] sm:text-[2.7rem] md:text-[3.4rem] lg:text-[4rem] xl:text-[4.7rem]">
                            Know who your business
                            moves with.
                        </h1>

                        <p className="mt-4 max-w-[620px] text-[13px] leading-5 text-[var(--ac-text-soft)] sm:mt-5 sm:text-sm sm:leading-6">
                            Customers and suppliers
                            share one reusable
                            business identity,
                            ready for future quotes,
                            invoices, payments,
                            and automation.
                        </p>
                    </div>

                    <div className="group relative flex min-w-0 items-center gap-3 overflow-hidden rounded-[18px] border border-[var(--ac-line)] bg-white px-4 py-3 shadow-[var(--ac-shadow-soft)] transition duration-300 hover:-translate-y-1 hover:shadow-[var(--ac-shadow-panel)] sm:rounded-[22px] sm:px-5 sm:py-4 xl:flex-col xl:items-start xl:justify-end xl:gap-4 xl:p-5">
                        <div className="absolute -right-10 -top-12 size-32 rounded-full bg-[var(--ac-accent)]/[0.07] blur-2xl transition duration-500 group-hover:scale-125" />

                        <div className="relative flex size-9 shrink-0 items-center justify-center rounded-[13px] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)] sm:size-10 sm:rounded-[14px]">
                            <UsersRound
                                size={17}
                            />
                        </div>

                        <div className="relative min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                Current view
                            </p>

                            <p className="mt-0.5 text-lg font-semibold tracking-[-0.04em] text-[var(--ac-text)] sm:text-xl">
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

                {! activeOrganization ? (
                    <section className="mt-6 rounded-[20px] border border-dashed border-[var(--ac-line-strong)] bg-white/70 px-4 py-12 text-center sm:mt-8 sm:rounded-[28px] sm:px-6 sm:py-16">
                        <p className="text-lg font-semibold tracking-[-0.03em]">
                            No active workspace.
                        </p>

                        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--ac-text-soft)]">
                            Select a workspace
                            before working with
                            relationship data.
                        </p>
                    </section>
                ) : (
                    <section className="mt-6 min-w-0 overflow-hidden rounded-[20px] border border-[var(--ac-line)] bg-[var(--ac-surface-soft)] shadow-[var(--ac-shadow-soft)] sm:mt-8 sm:rounded-[26px] lg:mt-10">
                        <div className="border-b border-[var(--ac-line)] bg-white p-3 sm:p-5 lg:p-6">
                            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-3">
                                <form
                                    onSubmit={
                                        handleSearch
                                    }
                                    className="relative min-w-0"
                                >
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
                                        placeholder="Search name, email, phone, tax number…"
                                        className="h-11 w-full min-w-0 rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] pl-10 pr-11 text-sm outline-none transition placeholder:text-[var(--ac-text-faint)] focus:border-[var(--ac-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
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
                                            <X
                                                size={
                                                    14
                                                }
                                            />
                                        </button>
                                    )}
                                </form>

                                {allowEdit && (
                                    <button
                                        type="button"
                                        onClick={
                                            openCreate
                                        }
                                        className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white shadow-[var(--ac-shadow-soft)] transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--ac-shadow-panel)] active:scale-[0.99] sm:w-auto"
                                    >
                                        <Plus
                                            size={
                                                16
                                            }
                                        />

                                        New relationship
                                    </button>
                                )}
                            </div>

                            <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
                                <div className="grid min-w-0 gap-4">
                                    <FilterGroup
                                        label="Relationship"
                                    >
                                        <FilterButton
                                            active={
                                                role ===
                                                undefined
                                            }
                                            onClick={() =>
                                                changeRole(
                                                    undefined,
                                                )
                                            }
                                        >
                                            Everyone
                                        </FilterButton>

                                        <FilterButton
                                            active={
                                                role ===
                                                'customer'
                                            }
                                            onClick={() =>
                                                changeRole(
                                                    'customer',
                                                )
                                            }
                                        >
                                            Customers
                                        </FilterButton>

                                        <FilterButton
                                            active={
                                                role ===
                                                'supplier'
                                            }
                                            onClick={() =>
                                                changeRole(
                                                    'supplier',
                                                )
                                            }
                                        >
                                            Suppliers
                                        </FilterButton>
                                    </FilterGroup>

                                    <FilterGroup
                                        label="Entity type"
                                    >
                                        <FilterButton
                                            active={
                                                partyType ===
                                                undefined
                                            }
                                            onClick={() =>
                                                changePartyType(
                                                    undefined,
                                                )
                                            }
                                        >
                                            All types
                                        </FilterButton>

                                        <FilterButton
                                            active={
                                                partyType ===
                                                'person'
                                            }
                                            onClick={() =>
                                                changePartyType(
                                                    'person',
                                                )
                                            }
                                            icon={
                                                UserRound
                                            }
                                        >
                                            People
                                        </FilterButton>

                                        <FilterButton
                                            active={
                                                partyType ===
                                                'company'
                                            }
                                            onClick={() =>
                                                changePartyType(
                                                    'company',
                                                )
                                            }
                                            icon={
                                                Building2
                                            }
                                        >
                                            Companies
                                        </FilterButton>
                                    </FilterGroup>
                                </div>

                                <div>
                                    <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                                        Lifecycle
                                    </p>

                                    <div className="grid w-full grid-cols-2 rounded-[13px] bg-[var(--ac-bg-soft)] p-1 xl:w-auto">
                                        <StatusButton
                                            active={
                                                status ===
                                                'active'
                                            }
                                            onClick={() =>
                                                changeStatus(
                                                    'active',
                                                )
                                            }
                                        >
                                            Active
                                        </StatusButton>

                                        <StatusButton
                                            active={
                                                status ===
                                                'deleted'
                                            }
                                            onClick={() =>
                                                changeStatus(
                                                    'deleted',
                                                )
                                            }
                                        >
                                            Archived
                                        </StatusButton>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {error && (
                            <div className="border-b border-[var(--ac-danger)]/15 bg-[var(--ac-danger)]/5 px-4 py-3 text-xs leading-5 text-[var(--ac-danger)] sm:px-6 sm:text-sm">
                                {error}
                            </div>
                        )}

                        {loading ? (
                            <div className="space-y-3 p-3 sm:p-4 lg:space-y-0 lg:p-0">
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
                            <div className="px-4 py-14 text-center sm:px-6 sm:py-20">
                                <div className="mx-auto flex size-11 items-center justify-center rounded-[16px] bg-[var(--ac-bg-soft)] text-[var(--ac-text-muted)] sm:size-12 sm:rounded-[18px]">
                                    <UsersRound
                                        size={
                                            19
                                        }
                                    />
                                </div>

                                <h2 className="mt-4 text-lg font-semibold tracking-[-0.04em] sm:mt-5 sm:text-xl">
                                    {status ===
                                    'deleted'
                                        ? 'Nothing archived in this view.'
                                        : search
                                          ? 'No matching relationships.'
                                          : 'Your relationship ledger is empty.'}
                                </h2>

                                <p className="mx-auto mt-2 max-w-md text-[13px] leading-5 text-[var(--ac-text-soft)] sm:text-sm sm:leading-6">
                                    {search
                                        ? 'Clear the search or adjust your filters to widen the view.'
                                        : 'Add customers and suppliers once, then reuse their identity across future business activity.'}
                                </p>
                            </div>
                        ) : (
                            <div className="min-w-0 py-0.5 lg:py-0">
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

                        {lastPage > 1 && (
                            <footer className="grid gap-3 border-t border-[var(--ac-line)] bg-white px-4 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-5 lg:px-6">
                                <p className="text-center text-xs text-[var(--ac-text-muted)] sm:text-left">
                                    Page{' '}
                                    {
                                        currentPage
                                    }{' '}
                                    of{' '}
                                    {
                                        lastPage
                                    }
                                </p>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        disabled={
                                            currentPage <=
                                            1
                                        }
                                        onClick={() =>
                                            setPage(
                                                (
                                                    value,
                                                ) =>
                                                    Math.max(
                                                        1,
                                                        value -
                                                            1,
                                                    ),
                                            )
                                        }
                                        className="flex h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] px-3 text-xs font-semibold disabled:opacity-40"
                                    >
                                        <ArrowLeft
                                            size={
                                                14
                                            }
                                        />

                                        Previous
                                    </button>

                                    <button
                                        type="button"
                                        disabled={
                                            currentPage >=
                                            lastPage
                                        }
                                        onClick={() =>
                                            setPage(
                                                (
                                                    value,
                                                ) =>
                                                    Math.min(
                                                        lastPage,
                                                        value +
                                                            1,
                                                    ),
                                            )
                                        }
                                        className="flex h-10 items-center justify-center gap-2 rounded-[13px] border border-[var(--ac-line)] px-3 text-xs font-semibold disabled:opacity-40"
                                    >
                                        Next

                                        <ArrowRight
                                            size={
                                                14
                                            }
                                        />
                                    </button>
                                </div>
                            </footer>
                        )}
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
                                : 'New relationship added to this workspace.',
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
                            ? `${pendingLabel ?? 'This relationship'} will return to the active business ledger.`
                            : `${pendingLabel ?? 'This relationship'} will leave the active ledger, but its historical data will remain preserved.`
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

type FilterGroupProps = {
    label: string;

    children:
        React.ReactNode;
};

/**
 * Render one horizontally scrollable Party filtering dimension.
 */
function FilterGroup({
    label,
    children,
}: FilterGroupProps) {
    return (
        <div className="min-w-0">
            <p className="mb-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-[var(--ac-text-muted)]">
                {label}
            </p>

            <div className="-mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {children}
            </div>
        </div>
    );
}

type FilterButtonProps = {
    active: boolean;

    onClick: () => void;

    children: string;

    icon?: typeof UserRound;
};

/**
 * Render one non-wrapping Party filter control.
 */
function FilterButton({
    active,
    onClick,
    children,
    icon: Icon,
}: FilterButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[11px] font-semibold transition duration-200 sm:px-4 sm:text-xs',
                active
                    ? 'border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] text-[var(--ac-accent-strong)]'
                    : 'border-[var(--ac-line)] bg-white text-[var(--ac-text-soft)] hover:border-[var(--ac-line-strong)]',
            ].join(' ')}
        >
            {Icon && (
                <Icon
                    size={13}
                />
            )}

            {children}
        </button>
    );
}

type StatusButtonProps = {
    active: boolean;

    onClick: () => void;

    children: string;
};

/**
 * Render one Party lifecycle-state segment.
 */
function StatusButton({
    active,
    onClick,
    children,
}: StatusButtonProps) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={[
                'rounded-[10px] px-4 py-2 text-[11px] font-semibold transition sm:text-xs',
                active
                    ? 'bg-white text-[var(--ac-text)] shadow-sm'
                    : 'text-[var(--ac-text-muted)]',
            ].join(' ')}
        >
            {children}
        </button>
    );
}