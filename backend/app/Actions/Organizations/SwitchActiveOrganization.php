<?php

namespace App\Actions\Organizations;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use App\Models\User;
use App\Tenancy\OrganizationAccess;
use App\Tenancy\TenantContext;

class SwitchActiveOrganization
{
    /**
     * Resolve and verify an organization for the user, return the verified
     * organization and role, and guarantee TenantContext cleanup afterward.
     *
     * @return array{
     *     organization: Organization,
     *     role: OrganizationRole
     * }
     */
    public function execute(
        User $user,
        int $organizationId,
    ): array {
        $context = app(TenantContext::class);

        try {
            app(OrganizationAccess::class)->resolve(
                $user,
                $organizationId,
                $context,
            );

            return [
                'organization' => $context->organization(),
                'role' => $context->role(),
            ];
        } finally {
            /*
             * This action is not executed behind ResolveOrganization, so it
             * must guarantee that tenant state never leaks into later work.
             */
            $context->clear();
        }
    }
}
