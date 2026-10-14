<?php

namespace Tests\Feature\AI\Import;

use App\Services\AI\Import\ImageRowExtractor;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\TestCase;

/**
 * `AiImageAnalyzer` is a `final` class, so it cannot be mocked with
 * `$this->mock()` (Mockery cannot subclass a final class, and the
 * constructor's `AiImageAnalyzer` type hint would reject a non-instance
 * stand-in). Every existing test that exercises AI-image behaviour
 * (`tests/Feature/AiImageAnalyzerTest.php`) instead fakes the HTTP call
 * the vision provider makes, so these tests follow that same established
 * convention and drive the real `AiImageAnalyzer` through a faked
 * response.
 */
class ImageRowExtractorTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'ai-image.enabled' => true,
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
            'ai-image.model' => 'vision-model',
            'ai-image.detail' => 'low',
            'ai-image.max_output_tokens' => 320,
            'ai-image.max_decoded_bytes' => 1000000,
            'ai-image.max_dimension' => 4096,
        ]);
    }

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_parses_json_rows_from_image_analysis(): void
    {
        $this->fakeAnalysisResponse('[{"name":"Jane"}]');

        $result = app(ImageRowExtractor::class)->extract($this->fixtureImage());

        $this->assertSame([['name' => 'Jane']], $result['rows']->toArray());

        Http::assertSent(fn ($request): bool => str_contains(
            $request['messages'][1]['content'][0]['text'],
            'Extract every record visible in this image as a JSON array of objects. Respond with JSON only.',
        ));
    }

    public function test_extract_returns_usage_alongside_rows(): void
    {
        $this->fakeAnalysisResponse('[{"name":"Jane"}]');

        $result = app(ImageRowExtractor::class)->extract($this->fixtureImage());

        $this->assertArrayHasKey('rows', $result);
        $this->assertArrayHasKey('usage', $result);
        $this->assertArrayHasKey('total_tokens', $result['usage']);
        $this->assertSame(80, $result['usage']['input_tokens']);
        $this->assertSame(12, $result['usage']['output_tokens']);
        $this->assertSame(92, $result['usage']['total_tokens']);
    }

    public function test_throws_on_non_json_response(): void
    {
        $this->fakeAnalysisResponse('not json');

        $this->expectException(RuntimeException::class);

        app(ImageRowExtractor::class)->extract($this->fixtureImage());
    }

    /**
     * An LLM asked for JSON may still wrap it in a markdown code fence
     * (e.g. ```json ... ```). That is imperfect but genuinely parseable
     * JSON, and must still be accepted.
     */
    public function test_parses_rows_wrapped_in_a_markdown_code_fence(): void
    {
        $fence = chr(96).chr(96).chr(96);
        $this->fakeAnalysisResponse("{$fence}json\n[{\"name\":\"Jane\"}]\n{$fence}");

        $result = app(ImageRowExtractor::class)->extract($this->fixtureImage());

        $this->assertSame([['name' => 'Jane']], $result['rows']->toArray());
    }

    /**
     * A genuinely non-JSON sentence that merely contains stray brackets
     * must still be rejected: leniency for wrapped JSON must not become
     * leniency for prose that happens to include "[" and "]" characters.
     */
    public function test_throws_on_prose_containing_stray_brackets(): void
    {
        $this->fakeAnalysisResponse('The image shows a list [not parseable] of items.');

        $this->expectException(RuntimeException::class);

        app(ImageRowExtractor::class)->extract($this->fixtureImage());
    }

    /**
     * A JSON object (not an array of objects) must also be rejected: the
     * extractor's contract is specifically a JSON array of row objects.
     */
    public function test_throws_on_json_object_instead_of_array(): void
    {
        $this->fakeAnalysisResponse('{"name":"Jane"}');

        $this->expectException(RuntimeException::class);

        app(ImageRowExtractor::class)->extract($this->fixtureImage());
    }

    private function fakeAnalysisResponse(string $content): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::response([
                'model' => 'vision-model',
                'choices' => [
                    [
                        'message' => [
                            'content' => $content,
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
    }

    /** @return array{data_url:string,name:string,mime:string} */
    private function fixtureImage(): array
    {
        return [
            'data_url' => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl+X9sAAAAASUVORK5CYII=',
            'name' => 'scan.png',
            'mime' => 'image/png',
        ];
    }
}
