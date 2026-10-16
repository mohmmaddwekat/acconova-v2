<?php

namespace Database\Factories;

use App\Models\CreditPolicy;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CreditPolicy>
 */
class CreditPolicyFactory extends Factory
{
    public function definition(): array
    {
        return ['organization_id' => app(TenantContext::class)->id()];
    }
}
