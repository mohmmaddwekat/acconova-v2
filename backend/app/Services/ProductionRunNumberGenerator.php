<?php

namespace App\Services;

use App\Models\ProductionRun;

class ProductionRunNumberGenerator
{
    public function __construct(
        private readonly OrganizationSequenceService $sequences,
    ) {}

    /**
     * Generate a monotonic organization-scoped production-run number.
     */
    public function next(): string
    {
        $number =
            $this->sequences->next(
                'production_run',
                fn (): int => $this->currentMaximum(),
            );

        return 'PR-'
            .str_pad(
                (string) $number,
                6,
                '0',
                STR_PAD_LEFT,
            );
    }

    /**
     * Recover the highest legacy number if sequence metadata is missing.
     */
    private function currentMaximum(): int
    {
        return ProductionRun::withTrashed()
            ->pluck('run_number')
            ->reduce(
                function (
                    int $maximum,
                    string $number,
                ): int {
                    if (
                        preg_match(
                            '/^PR-(\d+)$/',
                            $number,
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
