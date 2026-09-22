<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class NotificationRuleService
{
    /**
     * Decide whether a notification should be delivered to a specific user.
     *
     * Rules are opt-in filters. If no rule targets this notification kind or
     * category, delivery is allowed. When one or more rules target the event,
     * every matching rule must pass.
     *
     * @param  array<string, mixed>  $data
     */
    public function allows(
        int $organizationId,
        int $userId,
        string $kind,
        string $category,
        array $data,
    ): bool {
        $rules = DB::table(
            'notification_rules',
        )
            ->where(
                'organization_id',
                $organizationId,
            )
            ->where(
                'user_id',
                $userId,
            )
            ->where(
                'active',
                true,
            )
            ->where(
                function ($query) use (
                    $kind,
                    $category,
                ): void {
                    $query
                        ->where(
                            function ($inner) use (
                                $kind,
                            ): void {
                                $inner
                                    ->whereNull(
                                        'kind',
                                    )
                                    ->orWhere(
                                        'kind',
                                        $kind,
                                    );
                            },
                        )
                        ->where(
                            function ($inner) use (
                                $category,
                            ): void {
                                $inner
                                    ->whereNull(
                                        'category',
                                    )
                                    ->orWhere(
                                        'category',
                                        $category,
                                    );
                            },
                        );
                },
            )
            ->get();

        if ($rules->isEmpty()) {
            return true;
        }

        foreach ($rules as $rule) {
            $actual = $this->valueFor(
                (string) $rule->field,
                $data,
            );

            if (
                $actual === null
                || ! $this->matches(
                    $actual,
                    (string) $rule->operator,
                    (string) $rule->threshold,
                )
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * @param  array<string, mixed>  $data
     */
    private function valueFor(
        string $field,
        array $data,
    ): float|string|null {
        $candidate = match ($field) {
            'amount' => $data['amount_value']
                ?? $data['amount']
                ?? null,
            'stock_quantity' => $data['stock_quantity']
                ?? $data['amount_value']
                ?? $data['amount']
                ?? null,
            'invoice_total' => $data['invoice_total']
                ?? $data['total']
                ?? $data['amount_value']
                ?? null,
            'count' => $data['count']
                ?? null,
            default => null,
        };

        if (
            is_int($candidate)
            || is_float($candidate)
        ) {
            return (float) $candidate;
        }

        if (! is_string($candidate)) {
            return null;
        }

        if (is_numeric($candidate)) {
            return (float) $candidate;
        }

        if (
            preg_match(
                '/-?\d+(?:[.,]\d+)?/',
                $candidate,
                $matches,
            )
        ) {
            return (float) str_replace(
                ',',
                '.',
                $matches[0],
            );
        }

        return trim(
            $candidate,
        );
    }

    private function matches(
        float|string $actual,
        string $operator,
        string $threshold,
    ): bool {
        if (
            is_numeric($actual)
            && is_numeric($threshold)
        ) {
            $left = (float) $actual;
            $right = (float) $threshold;

            return match ($operator) {
                'gt' => $left > $right,
                'gte' => $left >= $right,
                'lt' => $left < $right,
                'lte' => $left <= $right,
                'eq' => abs(
                    $left - $right,
                ) < 0.00005,
                default => false,
            };
        }

        return $operator === 'eq'
            && mb_strtolower(
                (string) $actual,
            )
            === mb_strtolower(
                $threshold,
            );
    }
}
