<?php

namespace Database\Factories;

use App\Models\PartyAdjustment;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PartyAdjustment>
 */
class PartyAdjustmentFactory extends Factory
{
    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'number' => 'ADJ-'.fake()->unique()->numberBetween(1000, 999999),
            'side' => 'customer',
            'direction' => PartyAdjustment::DIRECTION_OWED_TO_US,
            'amount' => fake()->randomFloat(2, 10, 1000),
            'currency' => 'ILS',
            'adjustment_date' => now()->toDateString(),
            'reason' => 'فرق أسعار',
            'status' => PartyAdjustment::STATUS_POSTED,
        ];
    }
}
