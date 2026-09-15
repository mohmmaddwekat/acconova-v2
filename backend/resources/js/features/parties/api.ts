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

export type PartyFilters = {
    search?: string;

    role?: PartyRole;

    type?: PartyType;

    status?: PartyLifecycle;

    page?: number;
};

export type PartyPayload = {
    type: PartyType;

    name?: string;

    company_name?: string;

    email: string | null;

    phone: string | null;

    tax_number: string | null;

    address_line_1: string | null;

    address_line_2: string | null;

    city: string | null;

    state: string | null;

    postal_code: string | null;

    country_code: string | null;

    roles: PartyRole[];
};

/**
 * Load a filtered tenant-scoped page of Parties.
 *
 * Search, entity type, relationship role, lifecycle status, and pagination
 * remain server-side so large workspaces do not require downloading every
 * relationship into the browser.
 */
export async function fetchParties(
    filters: PartyFilters = {},
): Promise<PartyIndexResponse> {
    const query =
        new URLSearchParams();

    query.set(
        'per_page',
        '25',
    );

    query.set(
        'status',
        filters.status ?? 'active',
    );

    query.set(
        'page',
        String(
            filters.page ?? 1,
        ),
    );

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

    return apiRequest<PartyIndexResponse>(
        `/api/parties?${query.toString()}`,
    );
}

/**
 * Create one Party inside the active organization.
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

                body: JSON.stringify(
                    payload,
                ),
            },
        );

    return response.data;
}

/**
 * Update one active tenant-scoped Party.
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

                body: JSON.stringify(
                    payload,
                ),
            },
        );

    return response.data;
}

/**
 * Soft-delete one Party while preserving its historical business identity.
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
 * Restore one previously archived Party.
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