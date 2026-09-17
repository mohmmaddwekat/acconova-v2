<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

class ProductionConsumption
{
    /** Multiply fixed-point quantities without floating point or integer overflow; round up stock consumption. */
    public static function calculate(string $output, string $rate): string
    {
        $a = (string) InventoryQuantity::toUnits($output);
        $b = (string) InventoryQuantity::toUnits($rate);
        $digits = array_fill(0, strlen($a) + strlen($b), 0);
        for ($i = strlen($a) - 1; $i >= 0; $i--) {
            for ($j = strlen($b) - 1; $j >= 0; $j--) {
                $digits[$i + $j + 1] += (int) $a[$i] * (int) $b[$j];
            }
        }
        for ($i = count($digits) - 1; $i > 0; $i--) {
            $digits[$i - 1] += intdiv($digits[$i], 10);
            $digits[$i] %= 10;
        }
        $product = str_pad(ltrim(implode('', $digits), '0'), 5, '0', STR_PAD_LEFT);
        $whole = ltrim(substr($product, 0, -4), '0');
        $whole = $whole === '' ? '0' : $whole;
        if (strlen($whole) > 18) {
            throw ValidationException::withMessages(['materials' => ['Consumption exceeds the supported stock quantity.']]);
        }
        $units = (int) $whole + ((int) substr($product, -4) > 0 ? 1 : 0);
        if ($units <= 0 || $units > 999999999999999999) {
            throw ValidationException::withMessages(['materials' => ['Consumption must be within the supported stock quantity.']]);
        }

        return InventoryQuantity::fromUnits($units);
    }
}
