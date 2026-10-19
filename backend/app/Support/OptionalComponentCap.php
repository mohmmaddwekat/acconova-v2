<?php

namespace App\Support;

use App\Models\InventoryBalance;

class OptionalComponentCap
{
    /**
     * Limit a required quantity to what is in stock when the recipe component
     * is optional (e.g. a filler that is consumed only while it lasts).
     * Mandatory components are returned unchanged so shortages still surface.
     */
    public static function apply(int $rawMaterialId, string $required, bool $isOptional): string
    {
        if (! $isOptional) {
            return $required;
        }

        $available = InventoryQuantity::toUnits(
            (string) InventoryBalance::query()->where('product_id', $rawMaterialId)->sum('on_hand'),
        );

        return InventoryQuantity::fromUnits(
            min(InventoryQuantity::toUnits($required), max(0, $available)),
        );
    }
}
