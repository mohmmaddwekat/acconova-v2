<?php

namespace App\Services\AI\Import;

use App\Services\AI\AiImageAnalyzer;
use Illuminate\Support\Collection;
use RuntimeException;

class ImageRowExtractor
{
    /**
     * Fixed instruction sent to the vision model so its free-text
     * response is a JSON array of row objects we can parse directly.
     */
    private const EXTRACTION_PROMPT = 'Extract every record visible in this image as a JSON array of objects. Respond with JSON only.';

    public function __construct(
        private readonly AiImageAnalyzer $analyzer,
    ) {}

    /**
     * Turn a photo/scan into generic rows by asking the vision model to
     * describe its content as JSON, then parsing that JSON. The vision
     * call's token usage is returned alongside the rows so the caller can
     * bill it, the same way every other AI call in this codebase is billed.
     *
     * @param  array{data_url:string,name?:string,mime?:string}  $image
     * @return array{
     *     rows: Collection<int, array<string, mixed>>,
     *     usage: array{input_tokens:int, output_tokens:int, total_tokens:int}
     * }
     */
    public function extract(array $image): array
    {
        $result = $this->analyzer->analyze($image, self::EXTRACTION_PROMPT);

        return [
            'rows' => Collection::make($this->decodeRows((string) $result['content'])),
            'usage' => [
                'input_tokens' => (int) ($result['input_tokens'] ?? 0),
                'output_tokens' => (int) ($result['output_tokens'] ?? 0),
                'total_tokens' => (int) ($result['total_tokens'] ?? 0),
            ],
        ];
    }

    /**
     * Parse the analyzer's free-text response into a list of row arrays.
     *
     * The response comes from an LLM instructed to return JSON, but it may
     * still wrap the JSON in a markdown code fence (```json ... ```) or add
     * stray whitespace around it. This applies the same leniency
     * `AiToolPlanner::decodePlan()` already applies to the identical
     * problem elsewhere in this codebase: strip a wrapping code fence, then
     * fall back to pulling out the outermost `[...]` slice if the content
     * isn't pure JSON on its own. Anything that still doesn't decode to a
     * JSON array of objects after that cleanup is rejected as genuinely
     * unparseable, rather than guessed at.
     *
     * @return list<array<string, mixed>>
     */
    private function decodeRows(string $content): array
    {
        $content = trim($content);
        $fence = chr(96).chr(96).chr(96);

        if (str_starts_with($content, $fence)) {
            $content = preg_replace(
                '/^'.preg_quote($fence, '/').'(?:json)?\s*|\s*'.preg_quote($fence, '/').'$/i',
                '',
                $content,
            ) ?? $content;
        }

        $decoded = json_decode($content, true);

        if (! $this->isListOfRows($decoded)) {
            $start = strpos($content, '[');
            $end = strrpos($content, ']');

            if ($start !== false && $end !== false && $end > $start) {
                $decoded = json_decode(substr($content, $start, $end - $start + 1), true);
            }
        }

        if (! $this->isListOfRows($decoded)) {
            throw new RuntimeException('AI image analysis returned invalid JSON.');
        }

        return $decoded;
    }

    /**
     * Confirm the decoded JSON is a list of row objects (a sequential array
     * of arrays), not a JSON object, scalar, or a list of scalars.
     */
    private function isListOfRows(mixed $decoded): bool
    {
        if (! is_array($decoded) || ! array_is_list($decoded)) {
            return false;
        }

        foreach ($decoded as $row) {
            if (! is_array($row)) {
                return false;
            }
        }

        return true;
    }
}
