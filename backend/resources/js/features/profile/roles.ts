const labels: Record<string, [string, string]> = {
    owner: ['مالك', 'Owner'],
    admin: ['مدير', 'Admin'],
    manager: ['مشرف', 'Manager'],
    accountant: ['محاسب', 'Accountant'],
    employee: ['موظف', 'Employee'],
};

/**
 * Human-readable workspace role.
 */
export function roleLabel(role: string | null | undefined, ar: boolean): string {
    if (! role) {
        return '—';
    }

    const pair = labels[role];

    return pair ? pair[ar ? 0 : 1] : role;
}
