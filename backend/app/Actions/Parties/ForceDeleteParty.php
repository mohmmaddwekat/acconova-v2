<?php

namespace App\Actions\Parties;

use App\Exceptions\SafeValidationException;
use App\Models\Party;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

class ForceDeleteParty
{
    /**
     * Permanently delete one archived Party only when protected database
     * references allow it.
     *
     * When invoices and payments arrive their foreign keys must restrict Party
     * deletion so a customer can never disappear beneath financial history.
     */
    public function execute(
        Party $party,
    ): void {
        if (
            ! $party->trashed()
        ) {
            throw SafeValidationException::forField(
                'record',
                'permanent_delete_requires_archive',
            );
        }

        try {
            DB::transaction(
                function () use (
                    $party,
                ): void {
                    $party
                        ->forceDelete();
                },
                3,
            );
        } catch (
            QueryException $exception
        ) {
            report(
                $exception,
            );

            throw SafeValidationException::forField(
                'record',
                'permanent_delete_blocked',
            );
        }
    }
}
