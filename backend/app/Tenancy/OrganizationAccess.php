<?php

namespace App\Tenancy;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;

final class OrganizationAccess
{
    public const string SESSION_KEY = 'active_organization_id';

    public function resolve(User $user, int $organizationId, TenantContext $context, bool $lock = false): void
    {
        $context->clear();
        $organization = Organization::query()->whereKey($organizationId)
            ->when($lock, fn ($query) => $query->lockForUpdate())
            ->firstOrFail();
        $membership = $organization->users()->where('users.id', $user->id)->firstOrFail();

        $context->set($organization, OrganizationRole::from($membership->pivot->role));
    }
}
