<?php

namespace App\Services\AI\Providers;

use App\Services\AI\Contracts\AiProvider;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class AnthropicProvider implements AiProvider
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
        return (string) ($this->config['label'] ?? 'Anthropic');
    }

    public function driver(): string
    {
        return 'anthropic';
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

        [$system, $conversation] = $this->normalizeMessages($messages);

        $payload = [
            'model' => $this->model(),
            'max_tokens' => $maxOutputTokens
                ?? (int) ($this->config['max_output_tokens'] ?? config('ai.max_output_tokens', 1200)),
            'messages' => $conversation,
        ];

        if ($system !== '') {
            $payload['system'] = $system;
        }

        $response = Http::baseUrl(rtrim((string) $this->config['base_url'], '/'))
            ->withHeaders([
                'x-api-key' => (string) $this->config['api_key'],
                'anthropic-version' => (string) ($this->config['version'] ?? '2023-06-01'),
            ])
            ->acceptJson()
            ->asJson()
            ->timeout((int) ($this->config['timeout_seconds'] ?? config('ai.timeout_seconds', 45)))
            ->post((string) ($this->config['messages_path'] ?? '/v1/messages'), $payload);

        if (! $response->successful()) {
            throw new RuntimeException(
                "AI provider [{$this->providerKey}] request failed with status {$response->status()}."
            );
        }

        $parts = [];

        foreach ((array) $response->json('content', []) as $item) {
            if (
                is_array($item)
                && ($item['type'] ?? null) === 'text'
                && is_string($item['text'] ?? null)
            ) {
                $parts[] = $item['text'];
            }
        }

        $content = trim(implode("\n", $parts));

        if ($content === '') {
            throw new RuntimeException("AI provider [{$this->providerKey}] returned an empty response.");
        }

        $inputTokens = (int) $response->json('usage.input_tokens', 0);
        $outputTokens = (int) $response->json('usage.output_tokens', 0);

        return [
            'content' => $content,
            'provider' => $this->providerKey,
            'model' => (string) ($response->json('model') ?: $this->model()),
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
            'total_tokens' => $inputTokens + $outputTokens,
        ];
    }

    /**
     * @param  list<array{role:string,content:string}>  $messages
     * @return array{0:string,1:list<array{role:string,content:string}>}
     */
    private function normalizeMessages(array $messages): array
    {
        $system = [];
        $conversation = [];

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

            $role = $role === 'assistant' ? 'assistant' : 'user';
            $last = array_key_last($conversation);

            if ($last !== null && $conversation[$last]['role'] === $role) {
                $conversation[$last]['content'] .= "\n\n".$content;

                continue;
            }

            $conversation[] = [
                'role' => $role,
                'content' => $content,
            ];
        }

        if ($conversation === []) {
            throw new RuntimeException("AI provider [{$this->providerKey}] received no conversation messages.");
        }

        return [implode("\n\n", $system), $conversation];
    }
}
