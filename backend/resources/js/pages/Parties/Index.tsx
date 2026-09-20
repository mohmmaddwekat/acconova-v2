import { useLocale } from '@/lib/i18n';
import { t } from '@/lib/i18n';
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

import { DataPagination } from '@/components/data/DataPagination';
import {
    AdvancedFilterBuilder,
    type AdvancedFilterCondition,
} from '@/components/data/AdvancedFilterBuilder';
import { BulkEditDialog } from '@/components/data/BulkEditDialog';
import {
    ListPreferencesControl,
    useListPreferences,
    type ListColumn,
} from '@/components/data/ListPreferences';
import { SavedViews } from '@/components/data/SavedViews';
import { SmartEmptyState } from '@/components/data/SmartEmptyState';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { useToast } from '@/components/feedback/ToastProvider';
import {
    archiveParty,
    bulkPartyAction,
    fetchParties,
    fetchParty,
    restoreParty,
    updateParty,
    type PartyBulkAction,
    type PartyFilters,
    type PartyPayload,
} from '@/features/parties/api';
import { PartyBulkActionBar } from '@/features/parties/components/PartyBulkActionBar';
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

type PendingBulkAction = {
    action: PartyBulkAction;

    ids: number[];
};

/**
 * Resolve the document language used by exports.
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
 * Render the complete AccoNova Party operating workspace.
 *
 * This index combines responsive pagination, live search, advanced filters,
 * full-dataset export, bulk import, Party details, internal notes, and atomic
 * multi-record archive or restore operations.
 */
export default function PartiesIndex() {
    const { workspace } = usePage<AppPageProps>().props;
    return <PartiesWorkspace key={workspace.activeOrganization?.id ?? 'none'} />;
}

/** Reset transient records, dialogs and selections when the authorized workspace changes. */
function PartiesWorkspace() {
    const ar = useLocale() === 'ar';
    const {
        workspace,
    } = usePage<AppPageProps>().props;

    const activeOrganization =
        workspace.activeOrganization;

    const activeRole =
        activeOrganization?.role;

    const allowCreate = activeOrganization?.permissions ? activeOrganization.permissions.some(p=>['parties.manage','parties.create'].includes(p)) : canEditParties(activeRole);
    const allowEdit = activeOrganization?.permissions ? activeOrganization.permissions.some(p=>['parties.manage','parties.update'].includes(p)) : canEditParties(activeRole);

    const allowArchive = activeOrganization?.permissions ? activeOrganization.permissions.includes('parties.archive') : canArchiveParties(activeRole);

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

    const [
        advancedConditions,
        setAdvancedConditions,
    ] = useState<AdvancedFilterCondition[]>([]);

    const [bulkEditOpen, setBulkEditOpen] =
        useState(false);

    const [page, setPage] =
        useState(1);

    const [perPage, setPerPage] =
        useState(25);

    const [
        selectedIds,
        setSelectedIds,
    ] =
        useState<Set<number>>(
            new Set(),
        );

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
        pendingBulk,
        setPendingBulk,
    ] =
        useState<PendingBulkAction | null>(
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

    const { showToast } = useToast();

    /*
     * Global search / quick-create deep links are intentionally handled by the
     * destination page so the same editor/detail drawer is reused everywhere.
     */
    useEffect(() => {
        if (
            typeof window === 'undefined'
            || ! activeOrganization
        ) {
            return;
        }

        const url = new URL(window.location.href);
        const createRequested =
            url.searchParams.get('create') === '1';
        const focusId =
            Number(url.searchParams.get('focus') ?? 0);

        if (createRequested && allowCreate) {
            openCreate();
            url.searchParams.delete('create');
            window.history.replaceState({}, '', url);
        }

        if (Number.isInteger(focusId) && focusId > 0) {
            url.searchParams.delete('focus');
            window.history.replaceState({}, '', url);

            void fetchParty(focusId)
                .then((party) => {
                    setDetailParty(party);
                })
                .catch(() => {
                    setError(
                        ar
                            ? 'تعذر فتح الجهة المطلوبة.'
                            : 'The requested Party could not be opened.',
                    );
                });
        }
    }, [
        activeOrganization?.id,
        allowCreate,
        ar,
    ]);

    const partyColumns: ListColumn[] = [
        {
            key: 'identity',
            label: ar ? 'الجهة' : 'Party',
        },
        {
            key: 'contact',
            label: ar ? 'التواصل' : 'Contact',
        },
        {
            key: 'location',
            label: ar ? 'الموقع' : 'Location',
        },
        {
            key: 'actions',
            label: ar ? 'الإجراءات' : 'Actions',
        },
    ];

    const listPreferences = useListPreferences(
        `acconova:list-preferences:parties:${activeOrganization?.id ?? 'none'}`,
        partyColumns,
    );

    const advancedFilterValues = advancedConditions.reduce(
        (result, condition) => {
            const value = condition.value.trim();

            if (! value) {
                return result;
            }

            if (condition.field === 'city') {
                result.city = value;
            }

            if (condition.field === 'country_code') {
                result.country_code = value;
            }

            return result;
        },
        {} as Pick<PartyFilters, 'city' | 'country_code'>,
    );

    const partyFilters:
        PartyFilters = {
        search,

        role:
            filters.role,

        type:
            filters.type,

        contact:
            filters.contact,

        status:
            filters.status,

        sort:
            filters.sort,

        ...advancedFilterValues,

        page,

        perPage,

        locale:
            currentLocale(),
    };

    /**
     * Load the current Party page from Laravel.
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
                            : t('ui.acconova_could_not_load_your_relationships'),
                    );
                } finally {
                    setLoading(
                        false,
                    );
                }
            },
            [
                activeOrganization,
                filters.contact,
                filters.role,
                filters.sort,
                filters.status,
                filters.type,
                page,
                perPage,
                search,
                advancedFilterValues.city,
                advancedFilterValues.country_code,
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
        /*
         * Selection intentionally belongs to one visible view. Changing
         * search, filtering, page, or page size clears it so hidden records
         * are never modified accidentally.
         */
        setSelectedIds(
            new Set(),
        );
    }, [
        filters,
        page,
        perPage,
        search,
    ]);





    /**
     * Reset the live Party search.
     */
    function clearSearch(): void {
        setDraftSearch('');
        setSearch('');
        setPage(1);
    }

    /**
     * Apply advanced Party filters.
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
     * Change page size and return to page one.
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
     * Open the Party context surface.
     */
    function openDetail(
        party: Party,
    ): void {
        setDetailParty(
            party,
        );
    }

    /**
     * Reflect an inline Party detail update and refresh the list data.
     */
    function handlePartyChanged(
        party: Party,
    ): void {
        setDetailParty(
            party,
        );

        void loadParties();
    }

    /**
     * Toggle one Party selection.
     */
    function handleSelectionChange(
        party: Party,
        selected: boolean,
    ): void {
        setSelectedIds(
            (
                current,
            ) => {
                const next =
                    new Set(
                        current,
                    );

                if (selected) {
                    next.add(
                        party.id,
                    );
                } else {
                    next.delete(
                        party.id,
                    );
                }

                return next;
            },
        );
    }

    function partyPayload(
        party: Party,
        patch: Partial<Party> = {},
    ): PartyPayload {
        return {
            type: party.type,
            ...(party.type === 'company'
                ? {
                    company_name:
                        patch.company_name
                        ?? party.company_name
                        ?? '',
                }
                : {
                    name:
                        patch.name
                        ?? party.name
                        ?? '',
                }),
            email:
                patch.email !== undefined
                    ? patch.email
                    : party.email,
            phone:
                patch.phone !== undefined
                    ? patch.phone
                    : party.phone,
            tax_number:
                patch.tax_number !== undefined
                    ? patch.tax_number
                    : party.tax_number,
            address_line_1:
                patch.address_line_1 !== undefined
                    ? patch.address_line_1
                    : party.address_line_1,
            address_line_2:
                patch.address_line_2 !== undefined
                    ? patch.address_line_2
                    : party.address_line_2,
            city:
                patch.city !== undefined
                    ? patch.city
                    : party.city,
            state:
                patch.state !== undefined
                    ? patch.state
                    : party.state,
            postal_code:
                patch.postal_code !== undefined
                    ? patch.postal_code
                    : party.postal_code,
            country_code:
                patch.country_code !== undefined
                    ? patch.country_code
                    : party.country_code,
            roles: party.roles,
        };
    }

    async function inlineUpdateParty(
        party: Party,
        patch: Partial<Party>,
    ): Promise<void> {
        if (! allowEdit) {
            return;
        }

        try {
            const updated = await updateParty(
                party.id,
                partyPayload(
                    party,
                    patch,
                ),
            );

            setResponse((current) =>
                current
                    ? {
                        ...current,
                        data: current.data.map((item) =>
                            item.id === updated.id
                                ? updated
                                : item,
                        ),
                    }
                    : current,
            );

            if (detailParty?.id === updated.id) {
                setDetailParty(updated);
            }

            showToast(
                ar
                    ? 'تم تحديث الجهة مباشرة.'
                    : 'Party updated inline.',
            );
        } catch (exception) {
            showToast(
                exception instanceof ApiError
                    ? exception.message
                    : t('errors.unexpected'),
                'error',
            );
            throw exception;
        }
    }

    async function applyBulkEdit(
        patch: Record<string, string>,
    ): Promise<void> {
        if (! allowEdit || actionBusy) {
            return;
        }

        const selected = (response?.data ?? []).filter(
            (party) => selectedIds.has(party.id),
        );

        if (! selected.length) {
            return;
        }

        setActionBusy(true);

        try {
            await Promise.all(
                selected.map((party) =>
                    updateParty(
                        party.id,
                        partyPayload(
                            party,
                            {
                                city:
                                    patch.city
                                    ?? party.city,
                                state:
                                    patch.state
                                    ?? party.state,
                                country_code:
                                    patch.country_code
                                    ?? party.country_code,
                            },
                        ),
                    ),
                ),
            );

            setBulkEditOpen(false);
            setSelectedIds(new Set());
            await loadParties();

            showToast(
                ar
                    ? `تم تعديل ${selected.length} جهة.`
                    : `Updated ${selected.length} Parties.`,
            );
        } catch (exception) {
            showToast(
                exception instanceof ApiError
                    ? exception.message
                    : t('errors.unexpected'),
                'error',
            );
        } finally {
            setActionBusy(false);
        }
    }

    const parties =
        response?.data ?? [];

    const total =
        response?.meta.total ??
        0;

    const currentPage =
        response?.meta
            .current_page ?? 1;

    const lastPage =
        response?.meta
            .last_page ?? 1;

    const selectedCount =
        selectedIds.size;

    const allPageSelected =
        parties.length > 0 &&
        parties.every(
            (
                party,
            ) =>
                selectedIds.has(
                    party.id,
                ),
        );

    /**
     * Select or unselect every record on the currently visible page.
     */
    function toggleCurrentPageSelection(): void {
        setSelectedIds(
            (
                current,
            ) => {
                const next =
                    new Set(
                        current,
                    );

                if (
                    allPageSelected
                ) {
                    parties.forEach(
                        (
                            party,
                        ) =>
                            next.delete(
                                party.id,
                            ),
                    );
                } else {
                    parties.forEach(
                        (
                            party,
                        ) =>
                            next.add(
                                party.id,
                            ),
                    );
                }

                return next;
            },
        );
    }

    /**
     * Ask for confirmation before archiving one Party.
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
     * Ask for confirmation before restoring one Party.
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
     * Execute one confirmed Party lifecycle action.
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

                const archivedParty =
                    pendingAction.party;

                showToast(
                    t('ui.relationship_archived_historical_data_remains_preserved'),
                    'success',
                    {
                        label:
                            ar
                                ? 'تراجع'
                                : 'Undo',
                        run:
                            async () => {
                                await restoreParty(
                                    archivedParty.id,
                                );
                                await loadParties();
                            },
                    },
                    8000,
                );
            } else {
                await restoreParty(
                    pendingAction
                        .party.id,
                );

                showToast(
                    t('ui.relationship_restored_to_the_active_ledger'),
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
                    : t('ui.acconova_could_not_complete_this_action'),
                'error',
            );
        } finally {
            setActionBusy(
                false,
            );
        }
    }

    /**
     * Open bulk-action confirmation for all selected visible records.
     */
    function requestBulkAction(): void {
        if (
            selectedIds.size ===
            0
        ) {
            return;
        }

        setPendingBulk({
            action:
                filters.status ===
                'deleted'
                    ? 'restore'
                    : 'archive',

            ids:
                Array.from(
                    selectedIds,
                ),
        });
    }

    /**
     * Execute one confirmed bulk Party action.
     */
    async function confirmBulkAction(): Promise<void> {
        if (
            ! pendingBulk ||
            actionBusy
        ) {
            return;
        }

        setActionBusy(true);

        try {
            const result =
                await bulkPartyAction(
                    pendingBulk.action,
                    pendingBulk.ids,
                );

            if (
                pendingBulk.action ===
                'archive'
            ) {
                const archivedIds =
                    [
                        ...pendingBulk.ids,
                    ];

                showToast(
                    t('parties.bulkArchived', { count: result.affected }),
                    'success',
                    {
                        label:
                            ar
                                ? 'تراجع'
                                : 'Undo',
                        run:
                            async () => {
                                await bulkPartyAction(
                                    'restore',
                                    archivedIds,
                                );
                                await loadParties();
                            },
                    },
                    8000,
                );
            } else {
                showToast(
                    t('parties.bulkRestored', { count: result.affected }),
                );
            }

            setSelectedIds(
                new Set(),
            );

            setPendingBulk(null);

            await loadParties();
        } catch (exception) {
            showToast(
                exception instanceof
                ApiError
                    ? exception.message
                    : t('ui.acconova_could_not_complete_the_bulk_action'),
                'error',
            );
        } finally {
            setActionBusy(
                false,
            );
        }
    }

    const activeFilterCount =
        countPartyFilters(
            filters,
        );

    const pendingLabel =
        pendingAction?.party
            .type === 'company'
            ? pendingAction.party
                  .company_name
            : pendingAction?.party
                  .name;

    return (
        <AppShell>
            <Head title={t('ui.relationships_acconova')} />

            <main className="mx-auto w-full max-w-[1680px] min-w-0 px-3 py-5 sm:px-5 sm:py-7 lg:px-8 lg:py-9 2xl:px-10">
                <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_290px] xl:gap-8">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="relative flex size-2">
                                <span className="absolute inline-flex size-full motion-safe:animate-ping rounded-full bg-[var(--ac-accent)] opacity-30" />

                                <span className="relative inline-flex size-2 rounded-full bg-[var(--ac-accent)]" />
                            </span>

                            <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-[var(--ac-accent-strong)] sm:text-[10px]">
                                {t('ui.relationship_ledger')}
                            </p>
                        </div>

                        <h1 className="mt-3 max-w-[800px] text-[2rem] font-medium leading-[0.94] tracking-[-0.055em] sm:text-[2.8rem] md:text-[3.5rem] lg:text-[4rem] xl:text-[4.7rem]">
                            {t('ui.know_who_your_business_moves_with')}
                        </h1>

                        <p className="mt-4 max-w-[650px] text-[13px] leading-5 text-[var(--ac-text-soft)] sm:text-sm sm:leading-6">
                            {t('ui.search_filter_import_export_maintain_notes_and_manage_customers_and_suppliers_from_on')}
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
                                {t('ui.matching_view')}
                            </p>

                            <p className="mt-1 text-xl font-semibold tracking-[-0.04em]">
                                {total}{' '}
                                {t('ui.relationship')}
                            </p>

                            <p className="mt-1 truncate text-[11px] text-[var(--ac-text-muted)]">
                                {activeOrganization
                                    ? t('workspace.inside', { name: activeOrganization.name })
                                    : t('ui.no_workspace_selected')}
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
                                        className="absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--ac-text-muted)]"
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
                                        placeholder={t('ui.search_name_email_phone_tax_number_city')}
                                        className="h-11 w-full rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-bg)] ps-10 pe-11 text-sm outline-none transition placeholder:text-[var(--ac-text-faint)] focus:border-[var(--ac-accent)] focus:bg-white focus:ring-4 focus:ring-[var(--ac-accent-soft)]"
                                    />

                                    {draftSearch && (
                                        <button
                                            type="button"
                                            aria-label={t('ui.clear_search')}
                                            onClick={
                                                clearSearch
                                            }
                                            className="absolute end-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-[10px] text-[var(--ac-text-muted)]"
                                        >
                                            <X
                                                size={14}
                                            />
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

                                    <AdvancedFilterBuilder
                                        ar={ar}
                                        value={advancedConditions}
                                        onChange={(next) => {
                                            setAdvancedConditions(next);
                                            setPage(1);
                                        }}
                                        fields={[
                                            {
                                                key: 'city',
                                                label: ar ? 'المدينة' : 'City',
                                                type: 'text',
                                                operators: ['contains', 'equals'],
                                            },
                                            {
                                                key: 'country_code',
                                                label: ar ? 'رمز الدولة' : 'Country code',
                                                type: 'text',
                                                operators: ['equals'],
                                                placeholder: 'PS / JO / US',
                                            },
                                        ]}
                                    />

                                    <ListPreferencesControl
                                        columns={partyColumns}
                                        order={listPreferences.order}
                                        hidden={listPreferences.hidden}
                                        density={listPreferences.density}
                                        onOrderChange={listPreferences.setOrder}
                                        onToggleColumn={listPreferences.toggleColumn}
                                        onDensityChange={listPreferences.setDensity}
                                        ar={ar}
                                    />

                                    <SavedViews
                                        storageKey={`acconova:saved-views:parties:${activeOrganization?.id ?? 'none'}`}
                                        ar={ar}
                                        value={{
                                            search,
                                            filters,
                                            perPage,
                                            advancedConditions,
                                        }}
                                        onApply={(saved) => {
                                            setDraftSearch(saved.search);
                                            setSearch(saved.search);
                                            setFilters(saved.filters);
                                            setPerPage(saved.perPage);
                                            setAdvancedConditions(
                                                saved.advancedConditions ?? [],
                                            );
                                            setPage(1);
                                        }}
                                    />

                                    {allowEdit && selectedIds.size > 0 && filters.status !== 'deleted' && (
                                        <button
                                            type="button"
                                            onClick={() => setBulkEditOpen(true)}
                                            className="inline-flex h-10 items-center rounded-[12px] border border-[var(--ac-accent)] bg-[var(--ac-accent-soft)] px-3 text-[11px] font-semibold text-[var(--ac-accent)]"
                                        >
                                            {ar
                                                ? `تعديل جماعي (${selectedIds.size})`
                                                : `Bulk edit (${selectedIds.size})`}
                                        </button>
                                    )}

                                    <PartyDataActions
                                        filters={
                                            partyFilters
                                        }
                                        canImport={allowEdit && allowCreate}
                                        onImport={() =>
                                            setImportOpen(
                                                true,
                                            )
                                        }
                                    />
                                </div>

                                {allowCreate && (
                                    <button
                                        type="button"
                                        onClick={
                                            openCreate
                                        }
                                        className="flex h-11 w-full items-center justify-center gap-2 rounded-[14px] bg-[var(--ac-text)] px-5 text-sm font-semibold text-white shadow-[var(--ac-shadow-soft)] transition hover:-translate-y-0.5 xl:w-auto"
                                    >
                                        <Plus
                                            size={16}
                                        />

                                        {t('ui.new_relationship')}
                                    </button>
                                )}
                            </div>

                            {(search ||
                                activeFilterCount >
                                    0) && (
                                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-[var(--ac-text-muted)]">
                                    <span>
                                        {t('ui.view_refined_by')}
                                    </span>

                                    {search && (
                                        <span className="rounded-full bg-[var(--ac-bg-soft)] px-2.5 py-1 font-semibold text-[var(--ac-text-soft)]">
                                            “{search}”
                                        </span>
                                    )}

                                    {activeFilterCount >
                                        0 && (
                                        <span className="rounded-full bg-[var(--ac-accent-soft)] px-2.5 py-1 font-semibold text-[var(--ac-accent-strong)]">
                                            {t('count.filters', { count: activeFilterCount })}
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
                            <SmartEmptyState
                                icon={UsersRound}
                                title={t('ui.no_relationships_match_this_view')}
                                description={t('ui.clear_the_search_adjust_the_filters_or_import_existing_business_data')}
                                primary={allowCreate ? (
                                    <button
                                        type="button"
                                        onClick={openCreate}
                                        className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-[var(--ac-accent-solid)] px-5 text-sm font-semibold text-[var(--ac-accent-solid-text)]"
                                    >
                                        <Plus size={15} />
                                        {t('ui.new_relationship')}
                                    </button>
                                ) : undefined}
                                secondary={(allowEdit && allowCreate) ? (
                                    <button
                                        type="button"
                                        onClick={() => setImportOpen(true)}
                                        className="inline-flex h-11 items-center rounded-[14px] border border-[var(--ac-line)] bg-[var(--ac-surface)] px-5 text-sm font-semibold text-[var(--ac-text-soft)]"
                                    >
                                        {ar ? 'استيراد Excel / CSV' : 'Import Excel / CSV'}
                                    </button>
                                ) : undefined}
                            />
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
                                            selected={selectedIds.has(
                                                party.id,
                                            )}
                                            selectable={
                                                allowArchive
                                            }
                                            canEdit={
                                                allowEdit
                                            }
                                            canArchive={
                                                allowArchive
                                            }
                                            columnOrder={
                                                listPreferences.order
                                            }
                                            hiddenColumns={
                                                listPreferences.hidden
                                            }
                                            density={
                                                listPreferences.density
                                            }
                                            onInlineUpdate={
                                                inlineUpdateParty
                                            }
                                            onSelectionChange={
                                                handleSelectionChange
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
                    onChanged={
                        handlePartyChanged
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
                                ? t('ui.relationship_updated_successfully')
                                : t('ui.relationship_added_successfully'),
                        );

                        void loadParties();
                    }}
                />

                <BulkEditDialog
                    open={bulkEditOpen}
                    title={
                        ar
                            ? 'تعديل الجهات المحددة'
                            : 'Edit selected Parties'
                    }
                    description={
                        ar
                            ? 'اكتب فقط بيانات الموقع التي تريد توحيدها على السجلات المحددة.'
                            : 'Fill only the location fields you want to apply to the selected records.'
                    }
                    fields={[
                        {
                            key: 'city',
                            label: ar ? 'المدينة' : 'City',
                        },
                        {
                            key: 'state',
                            label: ar ? 'المحافظة / الولاية' : 'State / region',
                        },
                        {
                            key: 'country_code',
                            label: ar ? 'رمز الدولة' : 'Country code',
                            placeholder: 'PS / JO / US',
                        },
                    ]}
                    busy={actionBusy}
                    ar={ar}
                    onClose={() => setBulkEditOpen(false)}
                    onApply={applyBulkEdit}
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
                            t('import.complete', result),
                        );

                        void loadParties();
                    }}
                />

                <PartyBulkActionBar
                    selectedCount={
                        selectedCount
                    }
                    action={
                        filters.status ===
                        'deleted'
                            ? 'restore'
                            : 'archive'
                    }
                    allPageSelected={
                        allPageSelected
                    }
                    onTogglePage={
                        toggleCurrentPageSelection
                    }
                    onClear={() =>
                        setSelectedIds(
                            new Set(),
                        )
                    }
                    onAction={
                        requestBulkAction
                    }
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
                            ? t('ui.restore_this_relationship')
                            : t('ui.archive_this_relationship')
                    }
                    description={
                        pendingAction
                            ?.kind ===
                        'restore'
                            ? t('parties.restoreDescription', { name: pendingLabel ?? t('ui.this_relationship') })
                            : t('parties.archiveDescription', { name: pendingLabel ?? t('ui.this_relationship') })
                    }
                    confirmLabel={
                        pendingAction
                            ?.kind ===
                        'restore'
                            ? t('ui.restore')
                            : t('ui.archive')
                    }
                    tone={
                        pendingAction
                            ?.kind ===
                        'restore'
                            ? 'positive'
                            : 'warning'
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

                <ConfirmDialog
                    open={
                        pendingBulk !==
                        null
                    }
                    title={
                        pendingBulk
                            ?.action ===
                        'restore'
                            ? t('ui.restore_selected_relationships')
                            : t('ui.archive_selected_relationships')
                    }
                    description={
                        pendingBulk
                            ?.action ===
                        'restore'
                            ? t('parties.bulkRestoreDescription', { count: pendingBulk.ids.length })
                            : t('parties.bulkArchiveDescription', { count: pendingBulk?.ids.length ?? 0 })
                    }
                    confirmLabel={
                        pendingBulk
                            ?.action ===
                        'restore'
                            ? t('ui.restore_selected')
                            : t('ui.archive_selected')
                    }
                    tone={
                        pendingBulk
                            ?.action ===
                        'restore'
                            ? 'positive'
                            : 'warning'
                    }
                    busy={
                        actionBusy
                    }
                    onCancel={() => {
                        if (
                            ! actionBusy
                        ) {
                            setPendingBulk(
                                null,
                            );
                        }
                    }}
                    onConfirm={() =>
                        void confirmBulkAction()
                    }
                />
            </main>
        </AppShell>
    );
}
