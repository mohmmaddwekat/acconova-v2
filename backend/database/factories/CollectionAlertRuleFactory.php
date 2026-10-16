<?php

namespace Database\Factories;

use App\Models\CollectionAlertRule;
use App\Tenancy\TenantContext;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<CollectionAlertRule>
 */
class CollectionAlertRuleFactory extends Factory
{
    public function definition(): array
    {
        return [
            'organization_id' => app(TenantContext::class)->id(),
            'kind' => CollectionAlertRule::KIND_OVERDUE,
            'enabled' => true,
            'threshold_days' => 7,
            'min_amount' => '0.0000',
            'repeat_after_days' => 7,
            'approved_channels' => ['call'],
        ];
    }
}
