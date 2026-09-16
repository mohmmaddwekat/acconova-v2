<?php

namespace Database\Factories;

use App\Models\PaymentPlan;
use App\Models\PaymentRecord;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<PaymentRecord>
 */
class PaymentRecordFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'payment_plan_id' => PaymentPlan::factory(),
            'title' => 'Internet', 'direction' => 'outgoing', 'amount' => '100.0000',
            'currency' => 'ILS', 'due_on' => '2026-01-31', 'paid_on' => '2026-01-31',
            'counterparty' => 'Online provider', 'method' => 'electronic', 'notes' => null,
        ];
    }
}
