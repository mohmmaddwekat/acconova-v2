<?php

namespace Database\Factories;

use App\Models\Party;
use App\Models\PartySettlement;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PartySettlement>
 */
class PartySettlementFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'party_id' => Party::factory(),
            'amount' => '100.0000',
            'currency' => 'ILS',
            'settlement_date' => now()->toDateString(),
            'agreement_reference' => 'AGR-'.fake()->unique()->numerify('####'),
            'agreement_date' => now()->toDateString(),
            'agreement_notes' => null,
            'status' => PartySettlement::STATUS_PENDING,
            'requested_by' => User::factory(),
        ];
    }

    public function posted(): static
    {
        return $this->state(fn (): array => [
            'status' => PartySettlement::STATUS_POSTED,
            'approved_by' => User::factory(),
            'approved_at' => now(),
        ]);
    }
}
