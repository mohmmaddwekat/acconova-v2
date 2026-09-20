<?php

namespace App\Services;

use App\Models\OrganizationSequence;
use Illuminate\Support\Facades\DB;

class FinanceNumberService
{
    public function next(string $name, string $prefix): string
    {
        return DB::transaction(function () use ($name, $prefix): string {
            OrganizationSequence::query()->firstOrCreate(
                ['name' => $name],
                ['current_value' => 0],
            );

            $sequence = OrganizationSequence::query()
                ->where('name', $name)
                ->lockForUpdate()
                ->firstOrFail();

            $sequence->current_value = (int) $sequence->current_value + 1;
            $sequence->save();

            return sprintf(
                '%s-%s-%04d',
                $prefix,
                now()->format('Y'),
                $sequence->current_value,
            );
        }, 3);
    }
}
