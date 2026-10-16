<?php

namespace Database\Factories;

use App\Models\CollectionAlert;
use App\Models\Party;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CollectionAlert>
 */
class CollectionAlertFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'party_id' => Party::factory(),
            'kind' => 'overdue',
            'status' => CollectionAlert::STATUS_OPEN,
            'severity' => 'warning',
            'reason' => ['code' => 'overdue'],
            'outstanding' => '100.0000',
            'overdue_amount' => '100.0000',
            'days_late' => 10,
            'next_action' => 'contact_customer',
            'first_raised_at' => now(),
        ];
    }
}
