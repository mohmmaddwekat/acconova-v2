<?php

namespace App\Services\AI\Tools\Concerns;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

trait NormalizesToolInput
{
    /** @return array{0:CarbonImmutable,1:CarbonImmutable} */
    protected function dateRange(array $arguments, int $defaultDays = 30): array
    {
        $to = $this->date($arguments['date_to'] ?? null)
            ?? CarbonImmutable::now()->endOfDay();

        $from = $this->date($arguments['date_from'] ?? null)
            ?? $to->subDays(max(1, $defaultDays) - 1)->startOfDay();

        $from = $from->startOfDay();
        $to = $to->endOfDay();

        if ($from->greaterThan($to)) {
            throw new InvalidArgumentException('date_from must be before or equal to date_to.');
        }

        if ($from->diffInDays($to) > 731) {
            throw new InvalidArgumentException('The requested date range is too large.');
        }

        return [$from, $to];
    }

    protected function limit(array $arguments, int $default = 10, int $maximum = 25): int
    {
        return max(1, min($maximum, (int) ($arguments['limit'] ?? $default)));
    }

    protected function enum(array $arguments, string $key, array $allowed, string $default): string
    {
        $value = strtolower(trim((string) ($arguments[$key] ?? $default)));

        if (! in_array($value, $allowed, true)) {
            throw new InvalidArgumentException("Invalid {$key}.");
        }

        return $value;
    }

    protected function search(array $arguments): ?string
    {
        $value = trim((string) ($arguments['search'] ?? ''));

        return $value === ''
            ? null
            : mb_substr($value, 0, 100);
    }

    private function date(mixed $value): ?CarbonImmutable
    {
        if ($value === null || trim((string) $value) === '') {
            return null;
        }

        $value = trim((string) $value);

        if (! preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            throw new InvalidArgumentException('Dates must use YYYY-MM-DD.');
        }

        try {
            return CarbonImmutable::createFromFormat('!Y-m-d', $value);
        } catch (\Throwable) {
            throw new InvalidArgumentException('Invalid date.');
        }
    }
}
