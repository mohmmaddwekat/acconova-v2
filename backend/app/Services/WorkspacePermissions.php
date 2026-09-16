<?php

namespace App\Services;

use App\Models\Membership;
use App\Models\Party;
use App\Models\PaymentPlan;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Models\WorkspaceRole;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Model;

class WorkspacePermissions
{
    public const KEYS = ['products.view', 'products.manage', 'products.archive', 'parties.view', 'parties.manage', 'parties.archive', 'inventory.view', 'inventory.manage', 'payments.view', 'payments.manage', 'staff.view', 'staff.manage', 'staff.pay'];

    public static function custom(int $userId, int $organizationId): ?WorkspaceRole
    {
        $membership = Membership::withoutGlobalScopes()->where('organization_id', $organizationId)->where('user_id', $userId)->first();
        if (! $membership || in_array($membership->role->value, ['owner', 'admin'], true) || ! $membership->workspace_role_id) {
            return null;
        }

        return WorkspaceRole::withoutGlobalScopes()->where('organization_id', $organizationId)->where('is_custom', true)->find($membership->workspace_role_id);
    }

    public static function decide(User $user, string $ability, array $arguments): ?bool
    {
        try {
            $context = app(TenantContext::class);
            $id = $context->id();
        } catch (\LogicException) {
            return null;
        }
        $role = self::custom($user->id, $id);
        if (! $role) {
            return null;
        }
        $subject = $arguments[0] ?? null;
        $class = is_object($subject) ? get_class($subject) : $subject;
        $module = match ($class) {
            Product::class => 'products',Party::class => 'parties',Warehouse::class => 'inventory',PaymentPlan::class => 'payments',default => null
        };
        if (! $module) {
            return null;
        }
        if ($subject instanceof Model && (int) $subject->organization_id !== $id) {
            return false;
        }
        $permission = match ($ability) {
            'view','viewAny' => $module.'.view','create','update' => $module.'.manage','delete','restore' => $module === 'inventory' ? 'inventory.manage' : $module.'.archive','manageInventory' => 'inventory.manage',default => null
        };

        return $permission !== null && in_array($permission, $role->permissions, true);
    }
}
