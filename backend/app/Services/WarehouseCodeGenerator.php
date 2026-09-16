<?php

namespace App\Services;

use App\Models\Warehouse;
use Illuminate\Support\Collection;

class WarehouseCodeGenerator
{
    private const SEQUENCE_NAME =
        'warehouse_code';

    private const PREFIX =
        'WH-';

    private const MINIMUM_DIGITS =
        3;

    /**
     * Reuse the organization sequence engine for warehouse identifiers.
     */
    public function __construct(
        private readonly OrganizationSequenceService $sequences,
    ) {}

    /**
     * Generate the next workspace-local warehouse code.
     *
     * Codes are monotonic and are never reused after archival.
     */
    public function next(): string
    {
        $number =
            $this->sequences->next(
                self::SEQUENCE_NAME,
                fn (): int => $this->existingMaximum(),
            );

        return self::PREFIX
            .str_pad(
                (string) $number,
                self::MINIMUM_DIGITS,
                '0',
                STR_PAD_LEFT,
            );
    }

    /**
     * Bootstrap the sequence from pre-existing active and archived locations
     * without loading a large warehouse dataset into memory.
     */
    private function existingMaximum(): int
    {
        $maximum = 0;

        Warehouse::query()
            ->withTrashed()
            ->select([
                'id',
                'code',
            ])
            ->where(
                'code',
                'like',
                self::PREFIX.'%',
            )
            ->chunkById(
                500,
                /**
                 * Inspect one bounded warehouse batch.
                 */
                function (
                    Collection $warehouses,
                ) use (
                    &$maximum,
                ): void {
                    foreach (
                        $warehouses as $warehouse
                    ) {
                        if (
                            preg_match(
                                '/^WH-(\d+)$/',
                                strtoupper(
                                    trim(
                                        (string) $warehouse->code,
                                    ),
                                ),
                                $matches,
                            ) !== 1
                        ) {
                            continue;
                        }

                        $maximum =
                            max(
                                $maximum,
                                (int) $matches[1],
                            );
                    }
                },
            );

        return $maximum;
    }
}
