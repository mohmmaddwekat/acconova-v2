import type {
    OrganizationRole,
} from '@/types/app';

/**
 * Determine whether the current role may create or edit catalog items.
 */
export function canEditProducts(
    role:
        | OrganizationRole
        | undefined,
): boolean {
    return role === 'owner' ||
        role === 'admin' ||
        role === 'manager' ||
        role === 'accountant';
}

/**
 * Determine whether the current role may archive or restore catalog items.
 */
export function canArchiveProducts(
    role:
        | OrganizationRole
        | undefined,
): boolean {
    return role === 'owner' ||
        role === 'admin' ||
        role === 'manager';
}