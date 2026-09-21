<?php

namespace App\Services;

use App\Models\OrganizationSequence;
use App\Tenancy\TenantContext;
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

            $preferences = app(
                TenantContext::class,
            )->organization()->preferences ?? [];

            $patternKey = match ($name) {
                'sales_invoice' =>
                    'invoice_number_pattern',
                'purchase_invoice' =>
                    'purchase_number_pattern',
                'cash_receipts' =>
                    'receipt_number_pattern',
                'cash_payments' =>
                    'payment_number_pattern',
                default => null,
            };

            $pattern = $patternKey
                ? (
                    $preferences[$patternKey]
                    ?? '{PREFIX}-{YYYY}-{SEQ:4}'
                )
                : '{PREFIX}-{YYYY}-{SEQ:4}';

            return $this->renderPattern(
                (string) $pattern,
                $prefix,
                (int) $sequence->current_value,
            );
        }, 3);
    }

    private function renderPattern(
        string $pattern,
        string $prefix,
        int $sequence,
    ): string {
        $rendered = strtr(
            $pattern,
            [
                '{PREFIX}' => $prefix,
                '{YYYY}' => now()->format('Y'),
                '{YY}' => now()->format('y'),
                '{MM}' => now()->format('m'),
                '{DD}' => now()->format('d'),
                '{SEQ}' => (string) $sequence,
            ],
        );

        return preg_replace_callback(
            '/\\{SEQ:(\\d{1,2})\\}/',
            fn (array $match): string =>
                str_pad(
                    (string) $sequence,
                    max(
                        1,
                        min(
                            12,
                            (int) $match[1],
                        ),
                    ),
                    '0',
                    STR_PAD_LEFT,
                ),
            $rendered,
        ) ?? $rendered;
    }
}
