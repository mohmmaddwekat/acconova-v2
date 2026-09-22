<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class AiAccessTokenProvider
{
    public function token(): string
    {
        $mode = (string) config('ai.auth.mode', 'api_key');

        if ($mode === 'api_key') {
            $token = (string) config('ai.auth.api_key', '');

            if ($token === '') {
                throw new RuntimeException('AI credentials are not configured.');
            }

            return $token;
        }

        if ($mode !== 'oauth_refresh') {
            throw new RuntimeException('Unsupported AI authentication mode.');
        }

        $cacheKey = $this->cacheKey();
        $cached = Cache::get($cacheKey);

        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        return $this->refresh();
    }

    public function forget(): void
    {
        if ((string) config('ai.auth.mode') === 'oauth_refresh') {
            Cache::forget($this->cacheKey());
        }
    }

    public function usesRefreshTokens(): bool
    {
        return (string) config('ai.auth.mode') === 'oauth_refresh';
    }

    private function refresh(): string
    {
        $tokenUrl = (string) config('ai.auth.token_url', '');
        $clientId = (string) config('ai.auth.client_id', '');
        $clientSecret = (string) config('ai.auth.client_secret', '');
        $refreshToken = (string) config('ai.auth.refresh_token', '');

        if (
            $tokenUrl === ''
            || $clientId === ''
            || $clientSecret === ''
            || $refreshToken === ''
        ) {
            throw new RuntimeException('AI OAuth refresh credentials are incomplete.');
        }

        $payload = [
            'grant_type' => 'refresh_token',
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'refresh_token' => $refreshToken,
        ];

        $scope = (string) config('ai.auth.scope', '');

        if ($scope !== '') {
            $payload['scope'] = $scope;
        }

        $response = Http::asForm()
            ->acceptJson()
            ->timeout((int) config('ai.timeout_seconds', 45))
            ->post($tokenUrl, $payload);

        if (! $response->successful()) {
            throw new RuntimeException('AI access token refresh failed.');
        }

        $token = (string) $response->json('access_token', '');

        if ($token === '') {
            throw new RuntimeException('AI token endpoint returned no access token.');
        }

        $expiresIn = max(
            120,
            (int) $response->json('expires_in', 3600),
        );

        $skew = max(
            30,
            (int) config('ai.auth.refresh_skew_seconds', 60),
        );

        Cache::put(
            $this->cacheKey(),
            $token,
            now()->addSeconds(max(60, $expiresIn - $skew)),
        );

        return $token;
    }

    private function cacheKey(): string
    {
        return 'ai:oauth:access-token:'.hash(
            'sha256',
            implode('|', [
                (string) config('ai.auth.token_url', ''),
                (string) config('ai.auth.client_id', ''),
                (string) config('ai.provider', ''),
            ]),
        );
    }
}
