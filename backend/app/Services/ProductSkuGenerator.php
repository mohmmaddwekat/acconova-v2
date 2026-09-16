<?php

namespace App\Services;

use App\Models\Product;

class ProductSkuGenerator
{
    private const SEQUENCE_NAME =
        'product_sku';

    private const PREFIX =
        'SKU-';

    private const MINIMUM_DIGITS =
        3;

    /**
     * Build the Product SKU generator around the generic organization
     * sequence service so invoices and other identifiers can reuse the same
     * concurrency-safe foundation later.
     */
    public function __construct(
        private readonly OrganizationSequenceService $sequences,
    ) {}

    /**
     * Generate the next organization-local SKU.
     *
     * Examples: SKU-001, SKU-002, ... SKU-999, SKU-1000.
     */
    public function next(): string
    {
        $number =
            $this->sequences->next(
                self::SEQUENCE_NAME,
                fn (): int => $this->existingMaximum(),
            );

        return $this->format(
            $number,
        );
    }

    /**
     * Observe an externally supplied SKU such as an imported legacy value.
     *
     * If SKU-050 is imported, the next generated value becomes SKU-051.
     */
    public function observe(
        ?string $sku,
    ): void {
        if ($sku === null) {
            return;
        }

        $sku =
            strtoupper(
                trim(
                    $sku,
                ),
            );

        if (
            preg_match(
                '/^SKU-(\d+)$/',
                $sku,
                $matches,
            ) !== 1
        ) {
            return;
        }

        $this->sequences->observe(
            self::SEQUENCE_NAME,
            (int) $matches[1],
            fn (): int => $this->existingMaximum(),
        );
    }

    /**
     * Format one numeric SKU without placing an artificial upper limit on the
     * catalog.
     */
    private function format(
        int $number,
    ): string {
        return self::PREFIX
            .str_pad(
                (string) $number,
                self::MINIMUM_DIGITS,
                '0',
                STR_PAD_LEFT,
            );
    }

    /**
     * Bootstrap a sequence from existing and archived Product records.
     *
     * This allows the feature to be introduced safely into an existing
     * workspace that already contains SKU-001...SKU-006.
     */
    private function existingMaximum(): int
    {
        return Product::query()
            ->withTrashed()
            ->whereNotNull(
                'sku',
            )
            ->where(
                'sku',
                'like',
                'SKU-%',
            )
            ->pluck(
                'sku',
            )
            ->reduce(
                /**
                 * Extract the highest standard AccoNova SKU suffix.
                 */
                function (
                    int $maximum,
                    mixed $sku,
                ): int {
                    $value =
                        strtoupper(
                            trim(
                                (string) $sku,
                            ),
                        );

                    if (
                        preg_match(
                            '/^SKU-(\d+)$/',
                            $value,
                            $matches,
                        ) !== 1
                    ) {
                        return $maximum;
                    }

                    return max(
                        $maximum,
                        (int) $matches[1],
                    );
                },
                0,
            );
    }
}
