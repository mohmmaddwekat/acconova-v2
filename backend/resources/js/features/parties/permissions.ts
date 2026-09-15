import type { OrganizationRole } from '@/types/app';

/**
 * Determine whether the current role should see create/edit Party controls.
 *
 * Laravel policies remain the real security boundary.
 */
export function canEditParties(
    role: OrganizationRole | undefined,
): boolean {
    return [
        'owner',
        'admin',
        'manager',
        'accountant',
    ].includes(role ?? '');
}

/**
 * Determine whether the current role should see archive/restore controls.
 */
export function canArchiveParties(
    role: OrganizationRole | undefined,
): boolean {
    return [
        'owner',
        'admin',
        'manager',
    ].includes(role ?? '');
}
