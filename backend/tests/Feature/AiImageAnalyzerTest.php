<?php

namespace Tests\Feature;

use App\Services\AI\AiImageAnalyzer;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AiImageAnalyzerTest extends TestCase
{
    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_image_analysis_uses_low_detail_and_separate_vision_model(): void
    {
        config([
            'ai.enabled' => true,
            'ai.providers.openai' => [
                'driver' => 'openai_compatible',
                'label' => 'OpenAI',
                'base_url' => 'https://ai.example.test',
                'chat_path' => '/v1/chat/completions',
                'model' => 'text-model',
                'timeout_seconds' => 5,
                'max_output_tokens' => 1200,
                'max_tokens_field' => 'max_completion_tokens',
                'auth' => [
                    'mode' => 'api_key',
                    'api_key' => 'server-only-key',
                ],
            ],
            'ai-image.enabled' => true,
            'ai-image.model' => 'vision-model',
            'ai-image.detail' => 'low',
            'ai-image.max_output_tokens' => 320,
            'ai-image.max_decoded_bytes' => 1000000,
            'ai-image.max_dimension' => 4096,
        ]);

        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::response([
                'model' => 'vision-model',
                'choices' => [
                    [
                        'message' => [
                            'content' => 'Visible total is 49.00 USD.',
                        ],
                    ],
                ],
                'usage' => [
                    'prompt_tokens' => 80,
                    'completion_tokens' => 12,
                    'total_tokens' => 92,
                ],
            ]),
        ]);

        $image = [
            'data_url' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+X9sAAAAASUVORK5CYII=',
            'name' => 'invoice.png',
            'mime' => 'image/png',
        ];

        $result = app(AiImageAnalyzer::class)->analyze(
            $image,
            'What is the total?',
        );

        $this->assertSame('Visible total is 49.00 USD.', $result['content']);
        $this->assertSame('vision-model', $result['model']);
        $this->assertSame(92, $result['total_tokens']);
        $this->assertSame(
            app(AiImageAnalyzer::class)->fingerprint($image),
            $result['image_hash'],
        );

        Http::assertSent(function ($request): bool {
            return $request->hasHeader('Authorization', 'Bearer server-only-key')
                && $request['model'] === 'vision-model'
                && $request['max_completion_tokens'] === 320
                && $request['messages'][1]['content'][1]['type'] === 'image_url'
                && $request['messages'][1]['content'][1]['image_url']['detail'] === 'low'
                && str_starts_with(
                    $request['messages'][1]['content'][1]['image_url']['url'],
                    'data:image/png;base64,',
                );
        });
    }

    public function test_invalid_image_is_rejected_before_provider_request(): void
    {
        config([
            'ai-image.enabled' => true,
            'ai-image.max_decoded_bytes' => 1000000,
            'ai-image.max_dimension' => 4096,
        ]);

        Http::preventStrayRequests();

        $this->expectException(\RuntimeException::class);

        app(AiImageAnalyzer::class)->fingerprint([
            'data_url' => 'data:text/plain;base64,SGVsbG8=',
            'name' => 'not-an-image.txt',
            'mime' => 'text/plain',
        ]);
    }
}
