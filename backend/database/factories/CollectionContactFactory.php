<?php

namespace Database\Factories;

use App\Models\CollectionContact;
use App\Models\Party;
use App\Models\User;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CollectionContact>
 */
class CollectionContactFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'party_id' => Party::factory(),
            'user_id' => User::factory(),
            'channel' => 'call',
            'outcome' => 'reached',
            'note' => null,
            'contacted_at' => now(),
            'next_contact_on' => null,
        ];
    }
}
