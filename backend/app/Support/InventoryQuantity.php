<?php

namespace App\Support;

use InvalidArgumentException;

final class InventoryQuantity
{
    private const SCALE =
        10000;

    /**
     * Convert one decimal(18,4)-compatible quantity into exact scaled units.
     *
     * Using integers keeps stock arithmetic exact without introducing
     * floating-point rounding into inventory balances.
     */
    public static function toUnits(
        string|int|float $quantity,
    ): int {
        $normalized =
            trim(
                (string) $quantity,
            );

        if (
            preg_match(
                '/^-?\d{1,14}(?:\.\d{1,4})?$/',
                $normalized,
            ) !== 1
        ) {
            throw new InvalidArgumentException(
                'Invalid inventory quantity.',
            );
        }

        $negative =
            str_starts_with(
                $normalized,
                '-',
            );

        if ($negative) {
            $normalized =
                substr(
                    $normalized,
                    1,
                );
        }

        [
            $whole,
            $fraction,
        ] =
            array_pad(
                explode(
                    '.',
                    $normalized,
                    2,
                ),
                2,
                '',
            );

        $fraction =
            str_pad(
                $fraction,
                4,
                '0',
                STR_PAD_RIGHT,
            );

        $units =
            ((int) $whole
                * self::SCALE)
            + (int) $fraction;

        return $negative
            ? -$units
            : $units;
    }

    /**
     * Convert exact scaled inventory units into a decimal(18,4) string.
     */
    public static function fromUnits(
        int $units,
    ): string {
        $negative =
            $units < 0;

        $absolute =
            abs(
                $units,
            );

        $whole =
            intdiv(
                $absolute,
                self::SCALE,
            );

        $fraction =
            $absolute
            % self::SCALE;

        return (
            $negative
            ? '-'
            : ''
        )
            .$whole
            .'.'
            .str_pad(
                (string) $fraction,
                4,
                '0',
                STR_PAD_LEFT,
            );
    }
}
