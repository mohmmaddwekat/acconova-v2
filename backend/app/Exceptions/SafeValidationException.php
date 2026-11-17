<?php

namespace App\Exceptions;

use App\Support\InventoryQuantity;
use Illuminate\Validation\ValidationException;

class SafeValidationException extends ValidationException
{
    /**
     * Stable, explicitly allowlisted business-validation codes keyed by field.
     *
     * @var array<string, list<string>>
     */
    public array $safeErrorCodes = [];

    /**
     * Build one translated business-validation error without exposing internal
     * exception text to API consumers.
     */
    public static function forField(string $field, string $code, array $replace = [], ?string $messageKey = null): self
    {
        /** @var self $exception */
        $exception = self::withMessages([
            $field => [
                __('feedback.'.($messageKey ?? $code), $replace),
            ],
        ]);

        $exception->safeErrorCodes = [
            $field => [
                $code,
            ],
        ];

        return $exception;
    }

    /**
     * Not enough stock: names the product and warehouse and states what is available and what was needed.
     * The stable code stays `inventory_insufficient_stock`.
     */
    public static function insufficientStock(string $product, string $warehouse, int $availableUnits, int $requiredUnits): self
    {
        $trim = fn (int $units): string => rtrim(rtrim(InventoryQuantity::fromUnits($units), '0'), '.') ?: '0';

        return self::forField('inventory', 'inventory_insufficient_stock', [
            'product' => $product,
            'warehouse' => $warehouse,
            'available' => $trim(max($availableUnits, 0)),
            'required' => $trim($requiredUnits),
        ], 'inventory_insufficient_stock_item');
    }
}
