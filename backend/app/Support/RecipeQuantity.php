<?php

namespace App\Support;

use InvalidArgumentException;

final class RecipeQuantity
{
    public const DECIMALS = 8;

    /**
     * Convert one decimal Recipe rate into an exact scaled integer string.
     *
     * Recipe rates need more precision than physical Inventory balances because
     * a tiny per-piece consumption such as 150 g / 350 pieces becomes
     * 0.00042857 kg per piece.
     */
    public static function toScaled(
        string|int|float $quantity,
    ): string {
        $normalized =
            trim(
                (string) $quantity,
            );

        if (
            preg_match(
                '/^-?\d{1,14}(?:\.\d{1,8})?$/',
                $normalized,
            ) !== 1
        ) {
            throw new InvalidArgumentException(
                'Invalid Recipe quantity.',
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
                self::DECIMALS,
                '0',
                STR_PAD_RIGHT,
            );

        $scaled =
            ltrim(
                $whole
                    .$fraction,
                '0',
            );

        $scaled =
            $scaled === ''
            ? '0'
            : $scaled;

        return $negative
            && $scaled !== '0'
            ? '-'.$scaled
            : $scaled;
    }

    /**
     * Convert an exact scaled Recipe integer string back into decimal(22,8).
     */
    public static function fromScaled(
        string $units,
    ): string {
        $units =
            trim(
                $units,
            );

        if (
            preg_match(
                '/^-?\d+$/',
                $units,
            ) !== 1
        ) {
            throw new InvalidArgumentException(
                'Invalid scaled Recipe quantity.',
            );
        }

        $negative =
            str_starts_with(
                $units,
                '-',
            );

        if ($negative) {
            $units =
                substr(
                    $units,
                    1,
                );
        }

        $units =
            ltrim(
                $units,
                '0',
            );

        $units =
            $units === ''
            ? '0'
            : $units;

        $padded =
            str_pad(
                $units,
                self::DECIMALS + 1,
                '0',
                STR_PAD_LEFT,
            );

        $whole =
            substr(
                $padded,
                0,
                -self::DECIMALS,
            );

        $fraction =
            substr(
                $padded,
                -self::DECIMALS,
            );

        return (
            $negative
            && $units !== '0'
            ? '-'
            : ''
        )
            .$whole
            .'.'
            .$fraction;
    }

    /**
     * Determine whether a Recipe decimal is strictly positive.
     */
    public static function isPositive(
        string|int|float $quantity,
    ): bool {
        $scaled =
            self::toScaled(
                $quantity,
            );

        return $scaled !== '0'
            && ! str_starts_with(
                $scaled,
                '-',
            );
    }
}
