<?php

namespace Tests\Feature\AI\Import;

use App\Services\AI\Import\PdfRowExtractor;
use Illuminate\Support\Facades\Http;
use Mpdf\Mpdf;
use Mpdf\Output\Destination;
use RuntimeException;
use Tests\TestCase;

/**
 * `AiGateway` sits on top of `AiProviderManager`, which is `final`, so it
 * cannot be mocked with `$this->mock()`. Every existing test that exercises
 * `AiGateway::chat()` (e.g. `ImportClassifierTest`, `ImageRowExtractorTest`)
 * instead fakes the HTTP call the configured provider makes, so this test
 * follows that same established convention.
 */
class PdfRowExtractorTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

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
    }

    protected function tearDown(): void
    {
        Http::preventStrayRequests(false);

        parent::tearDown();
    }

    public function test_extract_turns_pdf_text_into_rows_via_the_ai_gateway(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::sequence()
                ->push($this->chatResponse('[{"name":"Acme Co","amount":"120"}]')),
        ]);

        // mpdf collapses whitespace and smalot/pdfparser trims the result,
        // so the extracted text layer must clear the 20-character
        // scanned-PDF threshold on its own merits, not just the raw HTML.
        $path = $this->makeTextPdf('Acme Co    120.00 units shipped on Monday');

        $result = app(PdfRowExtractor::class)->extract($path);

        $this->assertEquals([['name' => 'Acme Co', 'amount' => '120']], $result['rows']->all());
        $this->assertSame(['input_tokens' => 5, 'output_tokens' => 7, 'total_tokens' => 12], $result['usage']);
    }

    public function test_extract_rejects_a_scanned_pdf_without_spending_an_ai_call(): void
    {
        Http::preventStrayRequests(); // any HTTP call at all now fails the test

        $path = $this->makeBlankPdf();

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessageMatches('/scanned|image/i');

        app(PdfRowExtractor::class)->extract($path);
    }

    public function test_extract_rejects_a_corrupt_file_cleanly(): void
    {
        Http::preventStrayRequests();

        $path = tempnam(sys_get_temp_dir(), 'bad_pdf_');
        file_put_contents($path, 'not a real pdf');

        $this->expectException(RuntimeException::class);

        app(PdfRowExtractor::class)->extract($path);
    }

    /**
     * An LLM asked for JSON may still wrap it in a markdown code fence
     * (e.g. ```json ... ```). That is imperfect but genuinely parseable
     * JSON, and must still be accepted.
     */
    public function test_extract_parses_rows_wrapped_in_a_markdown_code_fence(): void
    {
        Http::preventStrayRequests();
        $fence = chr(96).chr(96).chr(96);
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::sequence()
                ->push($this->chatResponse("{$fence}json\n[{\"name\":\"Acme Co\"}]\n{$fence}")),
        ]);

        $path = $this->makeTextPdf('Acme Co appears on this invoice as the billed party');

        $result = app(PdfRowExtractor::class)->extract($path);

        $this->assertSame([['name' => 'Acme Co']], $result['rows']->toArray());
    }

    /**
     * A genuinely non-JSON response must still be rejected: leniency for
     * wrapped JSON must not become leniency for prose that happens to
     * include "[" and "]" characters.
     */
    public function test_extract_throws_on_non_json_response(): void
    {
        Http::preventStrayRequests();
        Http::fake([
            'https://ai.example.test/v1/chat/completions' => Http::sequence()
                ->push($this->chatResponse('not json')),
        ]);

        $path = $this->makeTextPdf('Acme Co    120.00 units shipped on Monday');

        $this->expectException(RuntimeException::class);

        app(PdfRowExtractor::class)->extract($path);
    }

    private function makeTextPdf(string $text): string
    {
        $mpdf = new Mpdf;
        $mpdf->WriteHTML('<p>'.e($text).'</p>');
        $path = tempnam(sys_get_temp_dir(), 'test_pdf_').'.pdf';
        $mpdf->Output($path, Destination::FILE);

        return $path;
    }

    private function makeBlankPdf(): string
    {
        $mpdf = new Mpdf;
        $mpdf->AddPage(); // a page with no WriteHTML call has no text content
        $path = tempnam(sys_get_temp_dir(), 'test_pdf_').'.pdf';
        $mpdf->Output($path, Destination::FILE);

        return $path;
    }

    /** @return array<string,mixed> */
    private function chatResponse(string $content): array
    {
        return [
            'model' => 'test-model',
            'choices' => [
                [
                    'message' => [
                        'content' => $content,
                    ],
                ],
            ],
            'usage' => [
                'prompt_tokens' => 5,
                'completion_tokens' => 7,
                'total_tokens' => 12,
            ],
        ];
    }
}
