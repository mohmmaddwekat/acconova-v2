<?php

namespace Database\Factories;

use App\Models\CreditDecision;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CreditDecision>
 */
class CreditDecisionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'party_id' => Party::factory(),
            'recommended' => 'credit',
            'decision' => 'credit',
            'overrides_recommendation' => false,
            'snapshot' => [],
            'decided_by' => User::factory(),
            'decided_at' => now(),
        ];
    }
}
