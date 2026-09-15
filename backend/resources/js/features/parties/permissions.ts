import type {
    OrganizationRole,
} from '@/types/app';

/**
 * Determine whether the organization role can create or edit Parties.
 *
 * This controls UI visibility only. Laravel policies remain the actual
 * authorization boundary on the server.
 */
export function canEditParties(
    role: OrganizationRole | undefined,
): boolean {
    return [
        'owner',
        'admin',
        'manager',
        'accountant',
    ].includes(
        role ?? '',
    );
}

/**
 * Determine whether the organization role can archive or restore Parties.
 *
 * Laravel remains responsible for enforcing the same permission server-side.
 */
export function canArchiveParties(
    role: OrganizationRole | undefined,
): boolean {
    return [
        'owner',
        'admin',
        'manager',
    ].includes(
        role ?? '',
    );
}
