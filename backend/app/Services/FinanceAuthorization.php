<?php

namespace App\Services;

use App\Models\User;
use App\Tenancy\TenantContext;

class FinanceAuthorization
{
    public static function allows(User $user, string $permission): bool
    {
        $context = app(TenantContext::class);
        $role = $context->role()->value;

        if (in_array($role, ['owner', 'admin'], true)) {
            return true;
        }

        $custom = WorkspacePermissions::custom($user->id, $context->id());

        if ($custom) {
            return in_array($permission, $custom->permissions, true);
        }

        if (in_array($role, ['manager', 'accountant'], true)) {
            return str_starts_with($permission, 'finance.');
        }

        return false;
    }

    public static function authorize(User $user, string $permission): void
    {
        abort_unless(self::allows($user, $permission), 403);
    }
}
