<?php

namespace App\Actions\Parties;

use App\Models\Party;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

class BulkPartyAction
{
    /**
     * Build the bulk Party operation from the existing single-record domain
     * actions so events, locking, and restoration behavior stay consistent.
     */
    public function __construct(
        private readonly DeleteParty $deleteParty,
        private readonly RestoreParty $restoreParty,
    ) {}

    /**
     * Archive or restore an authorized Party collection atomically.
     *
     * @param  Collection<int, Party>  $parties
     */
    public function execute(
        Collection $parties,
        string $action,
    ): int {
        if (
            ! in_array(
                $action,
                [
                    'archive',
                    'restore',
                ],
                true,
            )
        ) {
            throw new InvalidArgumentException(
                'Unsupported bulk Party action.',
            );
        }

        return DB::transaction(
            function () use (
                $parties,
                $action,
            ): int {
                foreach (
                    $parties as $party
                ) {
                    if (
                        $action ===
                        'archive'
                    ) {
                        $this->deleteParty
                            ->execute(
                                $party,
                            );

                        continue;
                    }

                    $this->restoreParty
                        ->execute(
                            $party,
                        );
                }

                return $parties
                    ->count();
            },
        );
    }
}
