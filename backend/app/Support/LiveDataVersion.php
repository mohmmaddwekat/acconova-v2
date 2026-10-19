<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * A cheap per-organization "something changed" marker.
 *
 * Every successful write bumps it with one cache put; browsers compare it with
 * a single cache read, so detecting stale pages never scans the data itself.
 */
final class LiveDataVersion
{
    public static function current(int $organizationId): string
    {
        return (string) Cache::get(self::key($organizationId), '0');
    }

    public static function bump(int $organizationId): string
    {
        $version = (string) (int) (microtime(true) * 1000000);

        Cache::put(self::key($organizationId), $version, now()->addDays(30));

        return $version;
    }

    private static function key(int $organizationId): string
    {
        return 'live-data-version:'.$organizationId;
    }
}
