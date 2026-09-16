<?php

namespace App\Services;

use App\Models\OrganizationSequence;
use App\Tenancy\TenantContext;
use Closure;
use Illuminate\Support\Facades\DB;

class OrganizationSequenceService
{
    /**
     * Return the next monotonic value for one organization-scoped sequence.
     *
     * A database row lock prevents two concurrent requests from receiving the
     * same number when multiple team members create records simultaneously.
     */
    public function next(
        string $name,
        Closure $initialValue,
    ): int {
        return DB::transaction(
            function () use (
                $name,
                $initialValue,
            ): int {
                $sequence =
                    $this->lockedSequence(
                        $name,
                        $initialValue,
                    );

                $next =
                    $sequence->current_value
                    + 1;

                $sequence->forceFill([
                    'current_value' => $next,
                ])->save();

                return $next;
            },
            3,
        );
    }

    /**
     * Move a sequence forward when an imported/manual legacy identifier is
     * ahead of the current generated counter.
     *
     * The counter is never moved backwards.
     */
    public function observe(
        string $name,
        int $value,
        Closure $initialValue,
    ): void {
        if ($value < 1) {
            return;
        }

        DB::transaction(
            function () use (
                $name,
                $value,
                $initialValue,
            ): void {
                $sequence =
                    $this->lockedSequence(
                        $name,
                        $initialValue,
                    );

                if (
                    $value <=
                    $sequence->current_value
                ) {
                    return;
                }

                $sequence->forceFill([
                    'current_value' => $value,
                ])->save();
            },
            3,
        );
    }

    /**
     * Resolve and lock one tenant sequence, creating it safely when this is
     * the organization's first generated identifier of that type.
     */
    private function lockedSequence(
        string $name,
        Closure $initialValue,
    ): OrganizationSequence {
        $sequence =
            OrganizationSequence::query()
                ->where(
                    'name',
                    $name,
                )
                ->lockForUpdate()
                ->first();

        if ($sequence) {
            return $sequence;
        }

        $organizationId =
            app(
                TenantContext::class,
            )->id();

        $initial =
            max(
                0,
                (int) $initialValue(),
            );

        /*
         * insertOrIgnore makes first-use initialization safe when two requests
         * race to create the same sequence row.
         */
        DB::table(
            'organization_sequences',
        )->insertOrIgnore([
            'organization_id' => $organizationId,

            'name' => $name,

            'current_value' => $initial,

            'created_at' => now(),

            'updated_at' => now(),
        ]);

        $sequence =
            OrganizationSequence::query()
                ->where(
                    'name',
                    $name,
                )
                ->lockForUpdate()
                ->firstOrFail();

        /*
         * A competing initializer may have discovered a higher legacy value.
         * Never move the shared counter backwards.
         */
        if (
            $sequence->current_value <
            $initial
        ) {
            $sequence->forceFill([
                'current_value' => $initial,
            ])->save();
        }

        return $sequence;
    }
}
