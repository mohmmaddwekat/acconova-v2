<?php

namespace App\Services\Mcp;

use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpKernel\Exception\HttpException;

final class McpTokenService
{
    /**
     * @return array{token: string, record: object}
     */
    public function create(int $organizationId, int $userId, array $attributes): array
    {
        $plain = 'acc_mcp_'.Str::random(48);
        $now = now();

        $id = DB::table('mcp_access_tokens')->insertGetId([
            'organization_id' => $organizationId,
            'user_id' => $userId,
            'name' => trim((string) ($attributes['name'] ?? 'MCP key')),
            'kind' => in_array(($attributes['kind'] ?? 'agent'), ['agent', 'partner'], true) ? $attributes['kind'] : 'agent',
            'token_prefix' => substr($plain, 0, 16),
            'token_hash' => hash('sha256', $plain),
            'mode' => in_array(($attributes['mode'] ?? 'read'), ['read', 'write', 'approve'], true) ? $attributes['mode'] : 'read',
            'scopes' => json_encode(array_values(array_unique($attributes['scopes'] ?? ['*']))),
            'daily_call_limit' => $this->positiveNullable($attributes['daily_call_limit'] ?? null),
            'monthly_call_limit' => $this->positiveNullable($attributes['monthly_call_limit'] ?? null),
            'expires_at' => $this->normalizeExpiry($attributes['expires_at'] ?? null),
            'metadata' => json_encode($attributes['metadata'] ?? []),
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return [
            'token' => $plain,
            'record' => DB::table('mcp_access_tokens')->where('id', $id)->firstOrFail(),
        ];
    }

    public function resolveRequest(Request $request): object
    {
        $plain = trim((string) $request->bearerToken());
        if ($plain === '' || ! str_starts_with($plain, 'acc_mcp_')) {
            throw new HttpException(401, 'A valid MCP bearer token is required.');
        }

        $record = DB::table('mcp_access_tokens')
            ->where('token_hash', hash('sha256', $plain))
            ->first();

        if (! $record || $record->revoked_at !== null) {
            throw new HttpException(401, 'The MCP token is invalid or revoked.');
        }

        if ($record->expires_at !== null && Carbon::parse($record->expires_at)->isPast()) {
            throw new HttpException(401, 'The MCP token has expired.');
        }

        $settings = DB::table('mcp_workspace_settings')
            ->where('organization_id', $record->organization_id)
            ->first();

        if ($settings && ! (bool) $settings->enabled) {
            throw new HttpException(403, 'MCP is disabled for this workspace.');
        }

        if ($record->kind === 'partner' && (! $settings || ! (bool) $settings->allow_partner_tokens)) {
            throw new HttpException(403, 'Partner MCP access is disabled for this workspace.');
        }

        $this->assertQuota($record, $settings);

        DB::table('mcp_access_tokens')
            ->where('id', $record->id)
            ->update(['last_used_at' => now(), 'updated_at' => now()]);

        return $record;
    }

    public function canUse(object $token, string $capability): bool
    {
        $scopes = json_decode((string) ($token->scopes ?? '[]'), true) ?: [];

        return in_array('*', $scopes, true) || in_array($capability, $scopes, true);
    }

    public function revoke(int $organizationId, int $tokenId): bool
    {
        return DB::table('mcp_access_tokens')
            ->where('organization_id', $organizationId)
            ->where('id', $tokenId)
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'updated_at' => now()]) > 0;
    }

    private function assertQuota(object $token, ?object $settings): void
    {
        $dailyLimit = $token->daily_call_limit ?: ($settings->daily_call_limit ?? null);
        $monthlyLimit = $token->monthly_call_limit ?: ($settings->monthly_call_limit ?? null);

        if ($dailyLimit) {
            $usedToday = DB::table('mcp_audit_logs')
                ->where('mcp_access_token_id', $token->id)
                ->where('created_at', '>=', now()->startOfDay())
                ->sum('cost_units');

            if ($usedToday >= $dailyLimit) {
                throw new HttpException(429, 'Daily MCP usage limit reached.');
            }
        }

        if ($monthlyLimit) {
            $usedThisMonth = DB::table('mcp_audit_logs')
                ->where('mcp_access_token_id', $token->id)
                ->where('created_at', '>=', now()->startOfMonth())
                ->sum('cost_units');

            if ($usedThisMonth >= $monthlyLimit) {
                throw new HttpException(429, 'Monthly MCP usage limit reached.');
            }
        }
    }

    private function normalizeExpiry(mixed $value): ?Carbon
    {
        if ($value === null || $value === '') {
            return null;
        }

        $date = Carbon::parse((string) $value);
        if ($date->isPast()) {
            throw new HttpException(422, 'MCP token expiry must be in the future.');
        }

        return $date;
    }

    private function positiveNullable(mixed $value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        $number = (int) $value;

        return $number > 0 ? $number : null;
    }
}
