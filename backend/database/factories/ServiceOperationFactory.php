<?php

namespace Database\Factories;

use App\Models\Party;
use App\Models\Product;
use App\Models\ServiceOperation;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ServiceOperation>
 */
class ServiceOperationFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'product_id' => Product::factory()->state(['type' => 'service', 'unit' => 'hour']),
            'party_id' => Party::factory()->person()->afterCreating(function (Party $party): void {
                $party->roles()->create(['role' => 'customer']);
            }),
            'service_name' => fn (array $attributes): string => Product::findOrFail($attributes['product_id'])->name,
            'customer_name' => fn (array $attributes): string => Party::findOrFail($attributes['party_id'])->name,
            'unit' => 'hour',
            'performed_on' => fake()->date(),
            'quantity' => '2.0000',
            'unit_price' => '50.0000',
            'subtotal' => '100.0000',
            'notes' => null,
        ];
    }
}
