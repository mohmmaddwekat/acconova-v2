<?php

namespace App\Support;

use Illuminate\Validation\ValidationException;

class ProductionConsumption
{
    /**
     * Multiply two decimal(18,4) quantities using fixed-point arithmetic.
     *
     * The exact product carries eight decimal places. Inventory stores four,
     * so the result is rounded half-up instead of always rounding upward.
     * Waste must remain an explicit production rule, never hidden rounding.
     */
    public static function calculate(
        string $output,
        string $rate,
    ): string {
        $left =
            (string) InventoryQuantity::toUnits(
                $output,
            );

        $right =
            (string) InventoryQuantity::toUnits(
                $rate,
            );

        if (
            str_starts_with(
                $left,
                '-',
            )
            || str_starts_with(
                $right,
                '-',
            )
        ) {
            throw ValidationException::withMessages([
                'materials' => [
                    __('production.quantity_positive'),
                ],
            ]);
        }

        $product =
            self::multiplyUnsignedIntegers(
                $left,
                $right,
            );

        /*
         * Both operands are scaled by 10,000. Dividing by 10,000 returns the
         * final scaled stock units. The remainder decides half-up rounding.
         */
        $product =
            str_pad(
                $product,
                5,
                '0',
                STR_PAD_LEFT,
            );

        $quotient =
            ltrim(
                substr(
                    $product,
                    0,
                    -4,
                ),
                '0',
            );

        $quotient =
            $quotient === ''
            ? '0'
            : $quotient;

        $remainder =
            (int) substr(
                $product,
                -4,
            );

        if (
            $remainder >=
            5000
        ) {
            $quotient =
                self::incrementUnsignedInteger(
                    $quotient,
                );
        }

        if (
            strlen(
                $quotient,
            ) > 18
        ) {
            throw ValidationException::withMessages([
                'materials' => [
                    __('production.quantity_too_large'),
                ],
            ]);
        }

        $units =
            (int) $quotient;

        if (
            $units <= 0
            || $units >
            999999999999999999
        ) {
            throw ValidationException::withMessages([
                'materials' => [
                    __('production.quantity_positive'),
                ],
            ]);
        }

        return InventoryQuantity::fromUnits(
            $units,
        );
    }

    /**
     * Multiply arbitrarily large unsigned integer strings without floats.
     */
    private static function multiplyUnsignedIntegers(
        string $left,
        string $right,
    ): string {
        $digits =
            array_fill(
                0,
                strlen(
                    $left,
                )
                    + strlen(
                        $right,
                    ),
                0,
            );

        for (
            $i =
                strlen(
                    $left,
                )
                - 1;
            $i >= 0;
            $i--
        ) {
            for (
                $j =
                    strlen(
                        $right,
                    )
                    - 1;
                $j >= 0;
                $j--
            ) {
                $digits[$i
                    + $j
                    + 1] +=
                    (int) $left[$i]
                    * (int) $right[$j];
            }
        }

        for (
            $i =
                count(
                    $digits,
                )
                - 1;
            $i > 0;
            $i--
        ) {
            $digits[$i - 1] +=
                intdiv(
                    $digits[$i],
                    10,
                );

            $digits[$i] %=
                10;
        }

        $result =
            ltrim(
                implode(
                    '',
                    $digits,
                ),
                '0',
            );

        return $result === ''
            ? '0'
            : $result;
    }

    /**
     * Increment one non-negative integer string without risking overflow.
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
                )
                - 1;
            $index >= 0;
            $index--
        ) {
            if (
                $digits[$index] !==
                '9'
            ) {
                $digits[$index] =
                    (string) (
                        (int) $digits[$index]
                        + 1
                    );

                return implode(
                    '',
                    $digits,
                );
            }

            $digits[$index] =
                '0';
        }

        return '1'
            .implode(
                '',
                $digits,
            );
    }
}
