<?php

namespace App\Support;

use InvalidArgumentException;

final class MeasurementUnits
{
    /**
     * Standard measurement units supported by automatic conversion.
     *
     * Package units such as sack, drum, box, or pallet are deliberately not
     * global units because their conversion factor belongs to the individual
     * Product, for example "one drum = 250 kg".
     *
     * @var array<string, array{dimension:string,factor:int}>
     */
    private const DEFINITIONS = [
        'g' => [
            'dimension' => 'mass',
            'factor' => 1,
        ],

        'kg' => [
            'dimension' => 'mass',
            'factor' => 1000,
        ],

        't' => [
            'dimension' => 'mass',
            'factor' => 1000000,
        ],

        'ml' => [
            'dimension' => 'volume',
            'factor' => 1,
        ],

        'L' => [
            'dimension' => 'volume',
            'factor' => 1000,
        ],

        'mm' => [
            'dimension' => 'length',
            'factor' => 1,
        ],

        'cm' => [
            'dimension' => 'length',
            'factor' => 10,
        ],

        'm' => [
            'dimension' => 'length',
            'factor' => 1000,
        ],

        'piece' => [
            'dimension' => 'count',
            'factor' => 1,
        ],
    ];

    /**
     * Common English and Arabic aliases normalized at the API boundary.
     *
     * @var array<string, string>
     */
    private const ALIASES = [
        'g' => 'g',
        'gram' => 'g',
        'grams' => 'g',
        'غ' => 'g',
        'غم' => 'g',
        'غرام' => 'g',
        'جرام' => 'g',

        'kg' => 'kg',
        'kgs' => 'kg',
        'kilogram' => 'kg',
        'kilograms' => 'kg',
        'كغ' => 'kg',
        'كغم' => 'kg',
        'كيلو' => 'kg',
        'كيلوغرام' => 'kg',

        't' => 't',
        'ton' => 't',
        'tons' => 't',
        'tonne' => 't',
        'tonnes' => 't',
        'طن' => 't',

        'ml' => 'ml',
        'milliliter' => 'ml',
        'milliliters' => 'ml',
        'millilitre' => 'ml',
        'millilitres' => 'ml',
        'مل' => 'ml',

        'l' => 'L',
        'liter' => 'L',
        'liters' => 'L',
        'litre' => 'L',
        'litres' => 'L',
        'لتر' => 'L',

        'mm' => 'mm',
        'millimeter' => 'mm',
        'millimeters' => 'mm',

        'cm' => 'cm',
        'centimeter' => 'cm',
        'centimeters' => 'cm',

        'm' => 'm',
        'meter' => 'm',
        'meters' => 'm',
        'metre' => 'm',
        'metres' => 'm',

        'piece' => 'piece',
        'pieces' => 'piece',
        'pc' => 'piece',
        'pcs' => 'piece',
        'قطعة' => 'piece',
    ];

    /**
     * Normalize a known measurement unit while preserving custom units.
     */
    public static function normalizeUnit(
        string $unit,
    ): string {
        $trimmed =
            trim(
                $unit,
            );

        if ($trimmed === '') {
            throw new InvalidArgumentException(
                'Measurement unit cannot be empty.',
            );
        }

        $key =
            strtolower(
                $trimmed,
            );

        return self::ALIASES[
            $key
        ]
            ?? $trimmed;
    }

    /**
     * Determine whether two units represent the same physical dimension.
     *
     * Unknown custom units are compatible only with themselves.
     */
    public static function areCompatible(
        string $left,
        string $right,
    ): bool {
        $left =
            self::normalizeUnit(
                $left,
            );

        $right =
            self::normalizeUnit(
                $right,
            );

        if (
            strcasecmp(
                $left,
                $right,
            ) === 0
        ) {
            return true;
        }

        $leftDefinition =
            self::DEFINITIONS[
                $left
            ]
            ?? null;

        $rightDefinition =
            self::DEFINITIONS[
                $right
            ]
            ?? null;

        return $leftDefinition !== null
            && $rightDefinition !== null
            && $leftDefinition[
                'dimension'
            ] ===
                $rightDefinition[
                    'dimension'
                ];
    }

    /**
     * Return the standard compatible units for one stock unit.
     *
     * @return list<string>
     */
    public static function compatibleUnits(
        string $stockUnit,
    ): array {
        $normalized =
            self::normalizeUnit(
                $stockUnit,
            );

        $definition =
            self::DEFINITIONS[
                $normalized
            ]
            ?? null;

        if ($definition === null) {
            return [
                $stockUnit,
            ];
        }

        return collect(
            self::DEFINITIONS,
        )
            ->filter(
                fn (
                    array $candidate,
                ): bool => $candidate[
                        'dimension'
                    ] ===
                    $definition[
                        'dimension'
                    ],
            )
            ->keys()
            ->values()
            ->all();
    }

    /**
     * Convert a high-precision Recipe rate between compatible units.
     *
     * Both input and output use decimal(22,8)-compatible precision. Arithmetic
     * remains integer based so financial/Inventory logic never depends on
     * binary floating point.
     */
    public static function convertRecipeRate(
        string $quantity,
        string $fromUnit,
        string $toUnit,
    ): string {
        $from =
            self::normalizeUnit(
                $fromUnit,
            );

        $to =
            self::normalizeUnit(
                $toUnit,
            );

        if (
            strcasecmp(
                $from,
                $to,
            ) === 0
        ) {
            return RecipeQuantity::fromScaled(
                RecipeQuantity::toScaled(
                    $quantity,
                ),
            );
        }

        if (
            ! self::areCompatible(
                $from,
                $to,
            )
        ) {
            throw new InvalidArgumentException(
                'Incompatible measurement units.',
            );
        }

        $fromDefinition =
            self::DEFINITIONS[
                $from
            ];

        $toDefinition =
            self::DEFINITIONS[
                $to
            ];

        $scaled =
            RecipeQuantity::toScaled(
                $quantity,
            );

        $negative =
            str_starts_with(
                $scaled,
                '-',
            );

        if ($negative) {
            $scaled =
                substr(
                    $scaled,
                    1,
                );
        }

        $multiplied =
            self::multiplyUnsignedByInt(
                $scaled,
                $fromDefinition[
                    'factor'
                ],
            );

        [
            $quotient,
            $remainder,
        ] =
            self::divideUnsignedByInt(
                $multiplied,
                $toDefinition[
                    'factor'
                ],
            );

        if (
            $remainder * 2 >=
            $toDefinition[
                'factor'
            ]
        ) {
            $quotient =
                self::incrementUnsignedInteger(
                    $quotient,
                );
        }

        return RecipeQuantity::fromScaled(
            $negative
            && $quotient !== '0'
                ? '-'.$quotient
                : $quotient,
        );
    }

    /**
     * Convert an operational quantity into the existing four-decimal stock
     * precision used by Inventory balances and movements.
     *
     * Example: 150 g becomes 0.1500 kg.
     */
    public static function convertInventoryQuantity(
        string $quantity,
        string $fromUnit,
        string $toUnit,
    ): string {
        $converted =
            self::convertRecipeRate(
                $quantity,
                $fromUnit,
                $toUnit,
            );

        $scaled =
            RecipeQuantity::toScaled(
                $converted,
            );

        $negative =
            str_starts_with(
                $scaled,
                '-',
            );

        if ($negative) {
            $scaled =
                substr(
                    $scaled,
                    1,
                );
        }

        [
            $inventoryUnits,
            $remainder,
        ] =
            self::divideUnsignedByInt(
                $scaled,
                10000,
            );

        if (
            $remainder >=
            5000
        ) {
            $inventoryUnits =
                self::incrementUnsignedInteger(
                    $inventoryUnits,
                );
        }

        if (
            strlen(
                $inventoryUnits,
            ) > 18
        ) {
            throw new InvalidArgumentException(
                'Converted Inventory quantity is too large.',
            );
        }

        $units =
            (int) $inventoryUnits;

        if ($negative) {
            $units =
                -$units;
        }

        return InventoryQuantity::fromUnits(
            $units,
        );
    }

    /**
     * Multiply one unsigned arbitrary-length integer string by a small integer.
     */
    private static function multiplyUnsignedByInt(
        string $value,
        int $multiplier,
    ): string {
        if (
            $multiplier < 0
            || preg_match(
                '/^\d+$/',
                $value,
            ) !== 1
        ) {
            throw new InvalidArgumentException(
                'Invalid integer multiplication.',
            );
        }

        if (
            $value === '0'
            || $multiplier === 0
        ) {
            return '0';
        }

        $carry = 0;

        $result = '';

        for (
            $index =
                strlen(
                    $value,
                ) - 1;
            $index >= 0;
            $index--
        ) {
            $current =
                ((int) $value[
                    $index
                ] * $multiplier)
                + $carry;

            $result =
                (string) (
                    $current
                    % 10
                )
                .$result;

            $carry =
                intdiv(
                    $current,
                    10,
                );
        }

        while (
            $carry > 0
        ) {
            $result =
                (string) (
                    $carry
                    % 10
                )
                .$result;

            $carry =
                intdiv(
                    $carry,
                    10,
                );
        }

        return ltrim(
            $result,
            '0',
        ) ?: '0';
    }

    /**
     * Divide one unsigned arbitrary-length integer by a positive small integer.
     *
     * @return array{0:string,1:int}
     */
    private static function divideUnsignedByInt(
        string $value,
        int $divisor,
    ): array {
        if (
            $divisor <= 0
            || preg_match(
                '/^\d+$/',
                $value,
            ) !== 1
        ) {
            throw new InvalidArgumentException(
                'Invalid integer division.',
            );
        }

        $quotient = '';

        $remainder = 0;

        foreach (
            str_split(
                $value,
            ) as $digit
        ) {
            $current =
                ($remainder * 10)
                + (int) $digit;

            $quotient .=
                (string) intdiv(
                    $current,
                    $divisor,
                );

            $remainder =
                $current
                % $divisor;
        }

        $quotient =
            ltrim(
                $quotient,
                '0',
            );

        return [
            $quotient === ''
                ? '0'
                : $quotient,

            $remainder,
        ];
    }

    /**
     * Increment one unsigned arbitrary-length integer string.
     */
    private static function incrementUnsignedInteger(
        string $value,
    ): string {
        $digits =
            str_split(
                $value,
            );

        for (
            $index =
                count(
                    $digits,
                ) - 1;
            $index >= 0;
            $index--
        ) {
            if (
                $digits[
                    $index
                ] !== '9'
            ) {
                $digits[
                    $index
                ] =
                    (string) (
                        (int) $digits[
                            $index
                        ]
                        + 1
                    );

                return implode(
                    '',
                    $digits,
                );
            }

            $digits[
                $index
            ] = '0';
        }

        return '1'
            .implode(
                '',
                $digits,
            );
    }
}
