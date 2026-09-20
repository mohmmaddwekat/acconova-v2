import type {
    Party,
    PartyIndexResponse,
    PartyRole,
    PartyType,
} from '@/features/parties/types';
import { apiRequest } from '@/lib/http';

export type PartyLifecycle =
    | 'active'
    | 'deleted';

export type PartySort =
    | 'name_asc'
    | 'name_desc'
    | 'newest'
    | 'oldest';

export type PartyContactQuality =
    | 'missing_email'
    | 'missing_phone'
    | 'missing_both'
    | 'complete';

export type PartyFilters = {
    search?: string;

    role?: PartyRole;

    type?: PartyType;

    status?: PartyLifecycle;

    contact?: PartyContactQuality;

    city?: string;

    country_code?: string;

    sort?: PartySort;

    page?: number;

    perPage?: number;

    locale?: string;
};

export type PartyPayload = {
    type: PartyType;

    name?: string;

    company_name?: string;

    email: string | null;

    phone: string | null;

    tax_number: string | null;

    address_line_1:
        | string
        | null;

    address_line_2:
        | string
        | null;

    city:
        | string
        | null;

    state:
        | string
        | null;

    postal_code:
        | string
        | null;

    country_code:
        | string
        | null;

    roles: PartyRole[];
};

export type PartyImportDuplicateMode =
    | 'skip'
    | 'update';

export type PartyImportPreview = {
    total_rows: number;

    valid_rows: number;

    duplicate_rows: number;

    error_rows: number;

    sample: Array<{
        row: number;

        name:
            | string
            | null;

        email:
            | string
            | null;

        status:
            | 'create'
            | 'update'
            | 'skip';
    }>;

    errors: Array<{
        row: number;

        message: string;
    }>;
};

export type PartyImportResult = {
    created: number;

    updated: number;

    skipped: number;

    total: number;
};

export type PartyBulkAction =
    | 'archive'
    | 'restore';

export type PartyBulkResult = {
    action: PartyBulkAction;

    affected: number;
};

/**
 * Build the shared Party query string used by listing and exports.
 */
export function buildPartyQuery(
    filters: PartyFilters,
    includePagination = true,
): string {
    const query =
        new URLSearchParams();

    if (
        filters.search?.trim()
    ) {
        query.set(
            'search',
            filters.search.trim(),
        );
    }

    if (filters.role) {
        query.set(
            'role',
            filters.role,
        );
    }

    if (filters.type) {
        query.set(
            'type',
            filters.type,
        );
    }

    if (filters.contact) {
        query.set(
            'contact',
            filters.contact,
        );
    }

    if (filters.city?.trim()) {
        query.set('city', filters.city.trim());
    }

    if (filters.country_code?.trim()) {
        query.set('country_code', filters.country_code.trim());
    }

    query.set(
        'status',
        filters.status ??
            'active',
    );

    query.set(
        'sort',
        filters.sort ??
            'name_asc',
    );

    if (filters.locale) {
        query.set(
            'locale',
            filters.locale,
        );
    }

    if (includePagination) {
        query.set(
            'page',
            String(
                filters.page ??
                    1,
            ),
        );

        query.set(
            'per_page',
            String(
                filters.perPage ??
                    25,
            ),
        );
    }

    return query.toString();
}

/**
 * Load one server-side paginated Party view.
 */
export async function fetchParties(
    filters: PartyFilters = {},
): Promise<PartyIndexResponse> {
    return apiRequest<PartyIndexResponse>(
        `/api/parties?${buildPartyQuery(filters)}`,
    );
}

/**
 * Build a full-dataset Party export URL without pagination.
 */
export function partyExportUrl(
    format:
        | 'xlsx'
        | 'pdf'
        | 'print',
    filters: PartyFilters,
): string {
    return `/api/parties/export/${format}?${buildPartyQuery(filters, false)}`;
}

/**
 * Return the Party spreadsheet-template download URL.
 */
export function partyImportTemplateUrl(): string {
    return '/api/parties/import-template';
}

/**
 * Preview a Party workbook without changing database state.
 */
export async function previewPartyImport(
    file: File,
    duplicateMode: PartyImportDuplicateMode,
): Promise<PartyImportPreview> {
    const data =
        new FormData();

    data.append(
        'file',
        file,
    );

    data.append(
        'duplicate_mode',
        duplicateMode,
    );

    return apiRequest<PartyImportPreview>(
        '/api/parties/import/preview',
        {
            method: 'POST',
            body: data,
        },
    );
}

/**
 * Commit one validated Party workbook.
 */
export async function importPartyWorkbook(
    file: File,
    duplicateMode: PartyImportDuplicateMode,
): Promise<PartyImportResult> {
    const data =
        new FormData();

    data.append(
        'file',
        file,
    );

    data.append(
        'duplicate_mode',
        duplicateMode,
    );

    const response =
        await apiRequest<{
            data: PartyImportResult;
        }>(
            '/api/parties/import',
            {
                method: 'POST',
                body: data,
            },
        );

    return response.data;
}

/**
 * Create one Party in the active organization.
 */
export async function createParty(
    payload: PartyPayload,
): Promise<Party> {
    const response =
        await apiRequest<{
            data: Party;
        }>(
            '/api/parties',
            {
                method: 'POST',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Update one active Party.
 */
export async function updateParty(
    partyId: number,
    payload: PartyPayload,
): Promise<Party> {
    const response =
        await apiRequest<{
            data: Party;
        }>(
            `/api/parties/${partyId}`,
            {
                method: 'PATCH',

                body:
                    JSON.stringify(
                        payload,
                    ),
            },
        );

    return response.data;
}

/**
 * Update one active Party's internal workspace notes.
 */
export async function updatePartyNotes(
    partyId: number,
    notes: string,
): Promise<Party> {
    const response =
        await apiRequest<{
            data: Party;
        }>(
            `/api/parties/${partyId}/notes`,
            {
                method: 'PATCH',

                body:
                    JSON.stringify({
                        notes:
                            notes.trim() ||
                            null,
                    }),
            },
        );

    return response.data;
}

/**
 * Archive one Party.
 */
export async function archiveParty(
    partyId: number,
): Promise<void> {
    await apiRequest<void>(
        `/api/parties/${partyId}`,
        {
            method: 'DELETE',
        },
    );
}

/**
 * Restore one archived Party.
 */
export async function restoreParty(
    partyId: number,
): Promise<Party> {
    const response =
        await apiRequest<{
            data: Party;
        }>(
            `/api/parties/${partyId}/restore`,
            {
                method: 'POST',
            },
        );

    return response.data;
}

/**
 * Archive or restore multiple selected Parties in one atomic operation.
 */
export async function bulkPartyAction(
    action: PartyBulkAction,
    partyIds: number[],
): Promise<PartyBulkResult> {
    const response =
        await apiRequest<{
            data: PartyBulkResult;
        }>(
            '/api/parties/bulk',
            {
                method: 'POST',

                body:
                    JSON.stringify({
                        action,
                        party_ids:
                            partyIds,
                    }),
            },
        );

    return response.data;
}

/**
 * Load one Party by id for deep links such as global search results.
 */
export async function fetchParty(
    partyId: number,
): Promise<Party> {
    const response =
        await apiRequest<{
            data: Party;
        }>(
            `/api/parties/${partyId}`,
        );

    return response.data;
}
