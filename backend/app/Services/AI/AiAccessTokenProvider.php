<?php

namespace App\Services\AI;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class AiAccessTokenProvider
{
    /**
     * @param  array<string,mixed>  $auth
     */
    public function token(string $provider, array $auth): string
    {
        $mode = (string) ($auth['mode'] ?? 'api_key');

        if ($mode === 'api_key') {
            $token = (string) ($auth['api_key'] ?? '');

            if ($token === '') {
                throw new RuntimeException("AI credentials for [{$provider}] are not configured.");
            }

            return $token;
        }

        if ($mode !== 'oauth_refresh') {
            throw new RuntimeException("Unsupported AI authentication mode for [{$provider}].");
        }

        $cacheKey = $this->cacheKey($provider, $auth);
        $cached = Cache::get($cacheKey);

        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        return $this->refresh($provider, $auth);
    }

    /**
     * @param  array<string,mixed>  $auth
     */
    public function forget(string $provider, array $auth): void
    {
        if ($this->usesRefreshTokens($auth)) {
            Cache::forget($this->cacheKey($provider, $auth));
        }
    }

    /**
     * @param  array<string,mixed>  $auth
     */
    public function usesRefreshTokens(array $auth): bool
    {
        return (string) ($auth['mode'] ?? '') === 'oauth_refresh';
    }

    /**
     * @param  array<string,mixed>  $auth
     */
    private function refresh(string $provider, array $auth): string
    {
        $tokenUrl = (string) ($auth['token_url'] ?? '');
        $clientId = (string) ($auth['client_id'] ?? '');
        $clientSecret = (string) ($auth['client_secret'] ?? '');
        $refreshToken = (string) ($auth['refresh_token'] ?? '');

        if (
            $tokenUrl === ''
            || $clientId === ''
            || $clientSecret === ''
            || $refreshToken === ''
        ) {
            throw new RuntimeException("AI OAuth refresh credentials for [{$provider}] are incomplete.");
        }

        $payload = [
            'grant_type' => 'refresh_token',
            'client_id' => $clientId,
            'client_secret' => $clientSecret,
            'refresh_token' => $refreshToken,
        ];

        $scope = (string) ($auth['scope'] ?? '');

        if ($scope !== '') {
            $payload['scope'] = $scope;
        }

        $response = Http::asForm()
            ->acceptJson()
            ->timeout((int) config('ai.timeout_seconds', 45))
            ->post($tokenUrl, $payload);

        if (! $response->successful()) {
            throw new RuntimeException("AI access token refresh failed for [{$provider}].");
        }

        $token = (string) $response->json('access_token', '');

        if ($token === '') {
            throw new RuntimeException("AI token endpoint for [{$provider}] returned no access token.");
        }

        $expiresIn = max(120, (int) $response->json('expires_in', 3600));
        $skew = max(30, (int) ($auth['refresh_skew_seconds'] ?? 60));

        Cache::put(
            $this->cacheKey($provider, $auth),
            $token,
            now()->addSeconds(max(60, $expiresIn - $skew)),
        );

        return $token;
    }

    /**
     * @param  array<string,mixed>  $auth
     */
    private function cacheKey(string $provider, array $auth): string
    {
        return 'ai:oauth:access-token:'.hash(
            'sha256',
            implode('|', [
                $provider,
                (string) ($auth['token_url'] ?? ''),
                (string) ($auth['client_id'] ?? ''),
            ]),
        );
    }
}
