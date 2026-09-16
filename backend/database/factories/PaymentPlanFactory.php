<?php

namespace Database\Factories;

use App\Models\PaymentPlan;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PaymentPlan>
 */
class PaymentPlanFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'title' => 'Internet', 'direction' => 'outgoing', 'amount' => '100.0000',
            'currency' => 'ILS', 'frequency' => 'monthly', 'next_due_on' => '2026-01-31',
            'anchor_day' => 31, 'reminder_days' => 3, 'counterparty' => null, 'active' => true,
        ];
    }
}
