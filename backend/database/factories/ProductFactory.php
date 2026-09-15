<?php

namespace Database\Factories;

use App\Enums\ProductType;
use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Product>
 */
class ProductFactory extends Factory
{
    protected $model = Product::class;

    /**
     * Generate realistic catalog data for automated tests.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'type' => fake()->randomElement([
                ProductType::Product,
                ProductType::Service,
            ]),

            'name' => fake()->words(
                3,
                true,
            ),

            'sku' => strtoupper(
                fake()->unique()->bothify(
                    'SKU-####-??',
                ),
            ),

            'description' => fake()->sentence(),

            'unit' => 'unit',

            'unit_price' => fake()->randomFloat(
                2,
                1,
                5000,
            ),

            'cost_price' => fake()->randomFloat(
                2,
                0,
                2500,
            ),

            'tax_rate' => 0,
        ];
    }
}
