<?php

namespace Tests\Unit;

use App\Support\MeasurementUnits;
use App\Support\ProductionConsumption;
use PHPUnit\Framework\TestCase;

class MeasurementUnitsTest extends TestCase
{
    /**
     * Verify a gram-level Recipe rate normalizes exactly into kg.
     */
    public function test_gram_recipe_rate_converts_to_kilograms(): void
    {
        $this->assertSame(
            '0.00042857',
            MeasurementUnits::convertRecipeRate(
                '0.42857143',
                'g',
                'kg',
            ),
        );
    }

    /**
     * Verify a known 150 g batch remains 0.1500 kg in physical Inventory.
     */
    public function test_grams_convert_to_inventory_kilograms(): void
    {
        $this->assertSame(
            '0.1500',
            MeasurementUnits::convertInventoryQuantity(
                '150',
                'g',
                'kg',
            ),
        );
    }

    /**
     * Verify a high-precision Recipe rate produces the expected batch total.
     */
    public function test_high_precision_recipe_rate_recovers_batch_consumption(): void
    {
        $this->assertSame(
            '0.1500',
            ProductionConsumption::calculate(
                '350.0000',
                '0.00042857',
            ),
        );
    }

    /**
     * Verify kg may be displayed back in grams without changing quantity.
     */
    public function test_kilograms_convert_back_to_grams(): void
    {
        $this->assertSame(
            '150.00000000',
            MeasurementUnits::convertRecipeRate(
                '0.15000000',
                'kg',
                'g',
            ),
        );
    }
}
