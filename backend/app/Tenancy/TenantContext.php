<?php

namespace App\Tenancy;

use App\Enums\OrganizationRole;
use App\Models\Organization;
use LogicException;

final class TenantContext
{
    private ?Organization $organization = null;

    private ?OrganizationRole $role = null;

    public function set(Organization $organization, OrganizationRole $role): void
    {
        $this->organization = $organization;
        $this->role = $role;
    }

    public function organization(): Organization
    {
        return $this->organization ?? throw new LogicException('An explicit tenant context is required.');
    }

    public function id(): int
    {
        return $this->organization()->id;
    }

    public function role(): OrganizationRole
    {
        return $this->role ?? throw new LogicException('An explicit tenant context is required.');
    }

    public function clear(): void
    {
        $this->organization = null;
        $this->role = null;
    }
}
