<?php

namespace App\Services\AI\Import;

use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\AiGateway;
use RuntimeException;

class ImportClassifier
{
    /**
     * Cap how many extracted rows are sent to the model so a draft with
     * thousands of rows doesn't blow the prompt budget. Mirrors how
     * `AiToolPlanner::plan()` bounds its own transcript before sending it.
     */
    private const MAX_SAMPLE_ROWS = 20;

    public function __construct(
        private readonly AiGateway $gateway,
        private readonly ImportDestinationCatalog $catalog,
    ) {}

    /**
     * Ask the model which catalog entity (if any) a draft's extracted rows
     * represent, and how its columns map to that entity's fields.
     *
     * @return array{
     *     target_entity:?string,
     *     field_mapping:?array<string,string>,
     *     confidence:float,
     *     notes:string,
     *     usage: array{input_tokens:int, output_tokens:int, total_tokens:int}
     * }
     */
    public function classify(User $user, AiImportDraft $draft, ?string $hint): array
    {
        $definitions = $this->catalog->definitionsFor($user);

        $sample = array_slice((array) $draft->extracted_rows, 0, self::MAX_SAMPLE_ROWS);

        $messages = [
            [
                'role' => 'system',
                'content' => 'You are the AccoNova smart-import classifier. Given a sample of rows '.
                    'extracted from an uploaded file, decide which catalog entity the rows represent '.
                    "and how the rows' columns map to that entity's fields. ".
                    'Only choose a target_entity value that is one of the "key" values in the supplied '.
                    'catalog; never invent one. If you are not confident which catalog entity the rows '.
                    'represent, return target_entity: null and field_mapping: null rather than guessing. '.
                    'Return JSON only, exactly in this shape: {"target_entity":"string or null",'.
                    '"field_mapping":{"source_column":"destination_field"} or null,'.
                    '"confidence":0.0,"notes":"string"}.',
            ],
            [
                'role' => 'user',
                'content' => "Catalog:\n".
                    json_encode(
                        $definitions,
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                    ).
                    "\n\nSample rows extracted from the uploaded file:\n".
                    json_encode(
                        $sample,
                        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
                    ).
                    $this->hintSection($hint),
            ],
        ];

        $result = $this->gateway->chat($messages);

        $decoded = $this->decodeClassification((string) $result['content']);

        $catalogKeys = array_column($definitions, 'key');
        $targetEntity = $decoded['target_entity'] ?? null;

        if (! is_string($targetEntity) || ! in_array($targetEntity, $catalogKeys, true)) {
            $targetEntity = null;
        }

        return [
            'target_entity' => $targetEntity,
            'field_mapping' => $targetEntity === null ? null : $this->normalizeFieldMapping($decoded['field_mapping'] ?? null),
            'confidence' => (float) ($decoded['confidence'] ?? 0.0),
            'notes' => (string) ($decoded['notes'] ?? ''),
            'usage' => [
                'input_tokens' => (int) ($result['input_tokens'] ?? 0),
                'output_tokens' => (int) ($result['output_tokens'] ?? 0),
                'total_tokens' => (int) ($result['total_tokens'] ?? 0),
            ],
        ];
    }

    private function hintSection(?string $hint): string
    {
        $hint = trim((string) $hint);

        if ($hint === '') {
            return '';
        }

        return "\n\nUser-supplied hint about what this data is: {$hint}";
    }

    /** @return ?array<string,string> */
    private function normalizeFieldMapping(mixed $fieldMapping): ?array
    {
        if (! is_array($fieldMapping)) {
            return null;
        }

        $normalized = [];

        foreach ($fieldMapping as $source => $destination) {
            $normalized[(string) $source] = (string) $destination;
        }

        return $normalized;
    }

    /**
     * Parse the model's free-text response into the decoded classification
     * payload. The response comes from an LLM instructed to return JSON,
     * but it may still wrap the JSON in a markdown code fence
     * (```json ... ```) or add stray whitespace around it. This mirrors
     * the same leniency `AiToolPlanner::decodePlan()` and
     * `ImageRowExtractor::decodeRows()` already apply to the identical
     * problem elsewhere in this codebase: strip a wrapping code fence,
     * then fall back to pulling out the outermost `{...}` slice if the
     * content isn't pure JSON on its own. Anything that still doesn't
     * decode to a JSON object after that cleanup is rejected as genuinely
     * unparseable, rather than guessed at.
     *
     * @return array<string,mixed>
     */
    private function decodeClassification(string $content): array
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

        if (! is_array($decoded)) {
            $start = strpos($content, '{');
            $end = strrpos($content, '}');

            if ($start !== false && $end !== false && $end > $start) {
                $decoded = json_decode(substr($content, $start, $end - $start + 1), true);
            }
        }

        if (! is_array($decoded)) {
            throw new RuntimeException('AI import classifier returned invalid JSON.');
        }

        return $decoded;
    }
}
