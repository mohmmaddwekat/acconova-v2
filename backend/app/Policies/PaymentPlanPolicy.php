<?php

namespace App\Policies;

use App\Enums\OrganizationRole;
use App\Models\PaymentPlan;
use App\Models\User;
use App\Tenancy\TenantContext;

class PaymentPlanPolicy
{
    public function viewAny(User $user): bool
    {
        return in_array(app(TenantContext::class)->role(), [
            OrganizationRole::Owner, OrganizationRole::Admin, OrganizationRole::Manager, OrganizationRole::Accountant,
        ], true);
    }

    public function create(User $user): bool
    {
        return $this->viewAny($user);
    }

    public function update(User $user, PaymentPlan $plan): bool
    {
        return $this->viewAny($user) && (int) $plan->organization_id === app(TenantContext::class)->id();
    }
}
