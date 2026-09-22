<?php

namespace App\Services\AI\Providers;

use App\Services\AI\Contracts\AiProvider;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class GeminiProvider implements AiProvider
{
    /**
     * @param  array<string,mixed>  $config
     */
    public function __construct(
        private readonly string $providerKey,
        private readonly array $config,
    ) {}

    public function key(): string
    {
        return $this->providerKey;
    }

    public function label(): string
    {
        return (string) ($this->config['label'] ?? 'Google Gemini');
    }

    public function driver(): string
    {
        return 'gemini';
    }

    public function model(): string
    {
        return (string) ($this->config['model'] ?? '');
    }

    public function authMode(): string
    {
        return 'api_key';
    }

    public function configured(): bool
    {
        return
            $this->model() !== ''
            && (string) ($this->config['api_key'] ?? '') !== ''
            && (string) ($this->config['base_url'] ?? '') !== '';
    }

    public function chat(array $messages, ?int $maxOutputTokens = null): array
    {
        if (! $this->configured()) {
            throw new RuntimeException("AI provider [{$this->providerKey}] is not configured.");
        }

        [$system, $contents] = $this->normalizeMessages($messages);

        $payload = [
            'contents' => $contents,
            'generationConfig' => [
                'maxOutputTokens' => $maxOutputTokens
                    ?? (int) ($this->config['max_output_tokens'] ?? config('ai.max_output_tokens', 1200)),
            ],
        ];

        if ($system !== '') {
            $payload['systemInstruction'] = [
                'parts' => [
                    ['text' => $system],
                ],
            ];
        }

        $apiVersion = trim((string) ($this->config['api_version'] ?? 'v1beta'), '/');
        $path = sprintf(
            '/%s/models/%s:generateContent',
            $apiVersion,
            rawurlencode($this->model()),
        );

        $response = Http::baseUrl(rtrim((string) $this->config['base_url'], '/'))
            ->withHeaders([
                'x-goog-api-key' => (string) $this->config['api_key'],
            ])
            ->acceptJson()
            ->asJson()
            ->timeout((int) ($this->config['timeout_seconds'] ?? config('ai.timeout_seconds', 45)))
            ->post($path, $payload);

        if (! $response->successful()) {
            throw new RuntimeException(
                "AI provider [{$this->providerKey}] request failed with status {$response->status()}."
            );
        }

        $parts = [];

        foreach ((array) $response->json('candidates.0.content.parts', []) as $part) {
            if (is_array($part) && is_string($part['text'] ?? null)) {
                $parts[] = $part['text'];
            }
        }

        $content = trim(implode("\n", $parts));

        if ($content === '') {
            throw new RuntimeException("AI provider [{$this->providerKey}] returned an empty response.");
        }

        $inputTokens = (int) $response->json('usageMetadata.promptTokenCount', 0);
        $outputTokens = (int) $response->json('usageMetadata.candidatesTokenCount', 0);
        $totalTokens = (int) (
            $response->json('usageMetadata.totalTokenCount')
            ?? ($inputTokens + $outputTokens)
        );

        return [
            'content' => $content,
            'provider' => $this->providerKey,
            'model' => $this->model(),
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
            'total_tokens' => $totalTokens,
        ];
    }

    /**
     * @param  list<array{role:string,content:string}>  $messages
     * @return array{0:string,1:list<array{role:string,parts:list<array{text:string}>}>}
     */
    private function normalizeMessages(array $messages): array
    {
        $system = [];
        $contents = [];

        foreach ($messages as $message) {
            $role = (string) ($message['role'] ?? '');
            $content = trim((string) ($message['content'] ?? ''));

            if ($content === '') {
                continue;
            }

            if ($role === 'system') {
                $system[] = $content;

                continue;
            }

            $role = $role === 'assistant' ? 'model' : 'user';
            $last = array_key_last($contents);

            if ($last !== null && $contents[$last]['role'] === $role) {
                $contents[$last]['parts'][] = ['text' => $content];

                continue;
            }

            $contents[] = [
                'role' => $role,
                'parts' => [
                    ['text' => $content],
                ],
            ];
        }

        if ($contents === []) {
            throw new RuntimeException("AI provider [{$this->providerKey}] received no conversation messages.");
        }

        return [implode("\n\n", $system), $contents];
    }
}
