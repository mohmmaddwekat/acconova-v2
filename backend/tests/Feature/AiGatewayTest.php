<?php

namespace Tests\Feature;

use App\Services\AI\AiAccessTokenProvider;
use App\Services\AI\AiGateway;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiGatewayTest extends TestCase
{
    protected function tearDown(): void
    {
        Cache::flush();
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_refresh_token_credentials_are_cached_before_expiry(): void
    {
        config([
            'ai.auth.mode' => 'oauth_refresh',
            'ai.auth.token_url' => 'https://auth.example.test/token',
            'ai.auth.client_id' => 'client-id',
            'ai.auth.client_secret' => 'client-secret',
            'ai.auth.refresh_token' => 'refresh-token',
            'ai.auth.scope' => null,
            'ai.auth.refresh_skew_seconds' => 60,
            'ai.provider' => 'test-provider',
            'ai.timeout_seconds' => 5,
        ]);

        Cache::flush();

        Http::preventStrayRequests();
        Http::fake([
            'https://auth.example.test/token' => Http::response([
                'access_token' => 'fresh-access-token',
                'expires_in' => 3600,
            ]),
        ]);

        $tokens = app(AiAccessTokenProvider::class);

        $this->assertSame('fresh-access-token', $tokens->token());
        $this->assertSame('fresh-access-token', $tokens->token());

        Http::assertSentCount(1);
        Http::assertSent(
            fn ($request): bool =>
                $request->url() === 'https://auth.example.test/token'
                && $request['grant_type'] === 'refresh_token'
                && $request['refresh_token'] === 'refresh-token',
        );
    }

    public function test_gateway_sends_secrets_only_from_the_server_and_tracks_usage(): void
    {
        config([
            'ai.enabled' => true,
            'ai.provider' => 'test-provider',
            'ai.base_url' => 'https://ai.example.test',
            'ai.chat_path' => '/v1/chat/completions',
            'ai.model' => 'test-model',
            'ai.max_tokens_field' => 'max_tokens',
            'ai.max_output_tokens' => 500,
            'ai.timeout_seconds' => 5,
            'ai.auth.mode' => 'api_key',
            'ai.auth.api_key' => 'server-only-key',
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::response([
                'model' => 'test-model',
                'choices' => [
                    [
                        'message' => [
                            'content' => 'Hello from AI',
                        ],
                    ],
                ],
                'usage' => [
                    'prompt_tokens' => 12,
                    'completion_tokens' => 8,
                    'total_tokens' => 20,
                ],
            ]),
        ]);

        $result = app(AiGateway::class)->chat([
            [
                'role' => 'user',
                'content' => 'Hello',
            ],
        ]);

        $this->assertSame('Hello from AI', $result['content']);
        $this->assertSame(20, $result['total_tokens']);

        Http::assertSent(
            fn ($request): bool =>
                $request->hasHeader('Authorization', 'Bearer server-only-key')
                && $request['model'] === 'test-model'
                && $request['messages'][0]['content'] === 'Hello',
        );
    }
}
