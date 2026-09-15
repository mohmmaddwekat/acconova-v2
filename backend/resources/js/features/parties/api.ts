import type {
    Party,
    PartyIndexResponse,
    PartyRole,
    PartyType,
} from '@/features/parties/types';
import { apiRequest } from '@/lib/http';

export type PartyStatus =
    | 'active'
    | 'deleted';

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
 * Load Parties for the active tenant with optional search and lifecycle state.
 *
 * @param search Optional server-side Party search.
 * @param status Active or archived Party records.
 */
export async function fetchParties(
    search = '',
    status: PartyStatus = 'active',
): Promise<PartyIndexResponse> {
    const query = new URLSearchParams({
        per_page: '50',
        status,
    });

    if (search.trim()) {
        query.set(
            'search',
            search.trim(),
        );
    }

    return apiRequest<PartyIndexResponse>(
        `/api/parties?${query.toString()}`,
    );
}

/**
 * Create a Party inside the currently active Laravel tenant.
 *
 * @param payload Party form data.
 */
export async function createParty(
    payload: PartyPayload,
): Promise<Party> {
    const response = await apiRequest<{
        data: Party;
    }>('/api/parties', {
        method: 'POST',
        body: JSON.stringify(payload),
    });

    return response.data;
}

/**
 * Update one active Party.
 *
 * @param partyId Party identifier.
 * @param payload New Party values.
 */
export async function updateParty(
    partyId: number,
    payload: PartyPayload,
): Promise<Party> {
    const response = await apiRequest<{
        data: Party;
    }>(`/api/parties/${partyId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
    });

    return response.data;
}

/**
 * Soft-delete one Party while keeping its historical record.
 *
 * @param partyId Party identifier.
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
 *
 * @param partyId Party identifier.
 */
export async function restoreParty(
    partyId: number,
): Promise<Party> {
    const response = await apiRequest<{
        data: Party;
    }>(
        `/api/parties/${partyId}/restore`,
        {
            method: 'POST',
        },
    );

    return response.data;
}
