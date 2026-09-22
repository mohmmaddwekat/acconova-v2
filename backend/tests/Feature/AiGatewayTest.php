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

    public function test_refresh_token_credentials_are_cached_per_provider_before_expiry(): void
    {
        config([
            'ai.timeout_seconds' => 5,
        ]);

        $auth = [
            'mode' => 'oauth_refresh',
            'token_url' => 'https://auth.example.test/token',
            'client_id' => 'client-id',
            'client_secret' => 'client-secret',
            'refresh_token' => 'refresh-token',
            'scope' => null,
            'refresh_skew_seconds' => 60,
        ];

        Cache::flush();

        Http::preventStrayRequests();
        Http::fake([
            'https://auth.example.test/token' => Http::response([
                'access_token' => 'fresh-access-token',
                'expires_in' => 3600,
            ]),
        ]);

        $tokens = app(AiAccessTokenProvider::class);

        $this->assertSame('fresh-access-token', $tokens->token('custom', $auth));
        $this->assertSame('fresh-access-token', $tokens->token('custom', $auth));

        Http::assertSentCount(1);
        Http::assertSent(
            fn ($request): bool => $request->url() === 'https://auth.example.test/token'
                && $request['grant_type'] === 'refresh_token'
                && $request['refresh_token'] === 'refresh-token',
        );
    }

    public function test_openai_compatible_provider_keeps_secret_server_side_and_tracks_usage(): void
    {
        config([
            'ai.enabled' => true,
            'ai.default_provider' => 'openai',
            'ai.fallback_providers' => [],
            'ai.max_output_tokens' => 500,
            'ai.timeout_seconds' => 5,
            'ai.providers' => [
                'openai' => [
                    'driver' => 'openai_compatible',
                    'label' => 'OpenAI',
                    'base_url' => 'https://ai.example.test',
                    'chat_path' => '/v1/chat/completions',
                    'model' => 'test-model',
                    'max_tokens_field' => 'max_completion_tokens',
                    'auth' => [
                        'mode' => 'api_key',
                        'api_key' => 'server-only-key',
                    ],
                ],
            ],
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
        $this->assertSame('openai', $result['provider']);
        $this->assertSame(20, $result['total_tokens']);

        Http::assertSent(
            fn ($request): bool => $request->hasHeader('Authorization', 'Bearer server-only-key')
                && $request['model'] === 'test-model'
                && $request['max_completion_tokens'] === 500
                && $request['messages'][0]['content'] === 'Hello',
        );
    }

    public function test_gateway_falls_back_from_openai_to_anthropic(): void
    {
        config([
            'ai.enabled' => true,
            'ai.default_provider' => 'openai',
            'ai.fallback_providers' => ['anthropic'],
            'ai.max_output_tokens' => 600,
            'ai.timeout_seconds' => 5,
            'ai.providers' => [
                'openai' => [
                    'driver' => 'openai_compatible',
                    'label' => 'OpenAI',
                    'base_url' => 'https://openai.example.test',
                    'chat_path' => '/v1/chat/completions',
                    'model' => 'openai-model',
                    'max_tokens_field' => 'max_completion_tokens',
                    'auth' => [
                        'mode' => 'api_key',
                        'api_key' => 'openai-key',
                    ],
                ],
                'anthropic' => [
                    'driver' => 'anthropic',
                    'label' => 'Claude',
                    'base_url' => 'https://anthropic.example.test',
                    'messages_path' => '/v1/messages',
                    'version' => '2023-06-01',
                    'model' => 'claude-model',
                    'api_key' => 'anthropic-key',
                ],
            ],
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://openai.example.test/v1/chat/completions' => Http::response([
                'error' => ['message' => 'temporary outage'],
            ], 503),
            'https://anthropic.example.test/v1/messages' => Http::response([
                'model' => 'claude-model',
                'content' => [
                    [
                        'type' => 'text',
                        'text' => 'Claude fallback worked',
                    ],
                ],
                'usage' => [
                    'input_tokens' => 9,
                    'output_tokens' => 6,
                ],
            ]),
        ]);

        $result = app(AiGateway::class)->chat([
            [
                'role' => 'system',
                'content' => 'Be concise.',
            ],
            [
                'role' => 'user',
                'content' => 'Hello',
            ],
        ]);

        $this->assertSame('anthropic', $result['provider']);
        $this->assertSame('Claude fallback worked', $result['content']);
        $this->assertSame(15, $result['total_tokens']);

        Http::assertSent(
            fn ($request): bool => $request->url() === 'https://anthropic.example.test/v1/messages'
                && $request->hasHeader('x-api-key', 'anthropic-key')
                && $request->hasHeader('anthropic-version', '2023-06-01')
                && $request['system'] === 'Be concise.'
                && $request['messages'][0]['role'] === 'user',
        );
    }

    public function test_gemini_can_be_selected_explicitly(): void
    {
        config([
            'ai.enabled' => true,
            'ai.default_provider' => 'gemini',
            'ai.fallback_providers' => [],
            'ai.max_output_tokens' => 700,
            'ai.timeout_seconds' => 5,
            'ai.providers' => [
                'gemini' => [
                    'driver' => 'gemini',
                    'label' => 'Gemini',
                    'base_url' => 'https://gemini.example.test',
                    'api_version' => 'v1beta',
                    'model' => 'gemini-test',
                    'api_key' => 'gemini-key',
                ],
            ],
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://gemini.example.test/v1beta/models/gemini-test:generateContent' => Http::response([
                'candidates' => [
                    [
                        'content' => [
                            'parts' => [
                                ['text' => 'Gemini response'],
                            ],
                        ],
                    ],
                ],
                'usageMetadata' => [
                    'promptTokenCount' => 7,
                    'candidatesTokenCount' => 5,
                    'totalTokenCount' => 12,
                ],
            ]),
        ]);

        $gateway = app(AiGateway::class);
        $result = $gateway->chat([
            [
                'role' => 'system',
                'content' => 'AccoNova system prompt',
            ],
            [
                'role' => 'user',
                'content' => 'Analyze this',
            ],
        ], preferredProvider: 'gemini');

        $this->assertTrue($gateway->providerAvailable('gemini'));
        $this->assertSame('gemini', $result['provider']);
        $this->assertSame('Gemini response', $result['content']);
        $this->assertSame(12, $result['total_tokens']);

        Http::assertSent(
            fn ($request): bool => $request->hasHeader('x-goog-api-key', 'gemini-key')
                && $request['systemInstruction']['parts'][0]['text'] === 'AccoNova system prompt'
                && $request['contents'][0]['role'] === 'user',
        );
    }
}
