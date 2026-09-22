<?php

namespace App\Services\AI\Providers;

use App\Services\AI\AiAccessTokenProvider;
use App\Services\AI\Contracts\AiProvider;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class OpenAiCompatibleProvider implements AiProvider
{
    /**
     * @param  array<string,mixed>  $config
     */
    public function __construct(
        private readonly string $providerKey,
        private readonly array $config,
        private readonly AiAccessTokenProvider $tokens,
    ) {
    }

    public function key(): string
    {
        return $this->providerKey;
    }

    public function label(): string
    {
        return (string) ($this->config['label'] ?? $this->providerKey);
    }

    public function driver(): string
    {
        return 'openai_compatible';
    }

    public function model(): string
    {
        return (string) ($this->config['model'] ?? '');
    }

    public function authMode(): string
    {
        return (string) Arr::get($this->config, 'auth.mode', 'api_key');
    }

    public function configured(): bool
    {
        if (
            $this->model() === ''
            || (string) ($this->config['base_url'] ?? '') === ''
        ) {
            return false;
        }

        $auth = (array) ($this->config['auth'] ?? []);

        if ($this->authMode() === 'api_key') {
            return (string) ($auth['api_key'] ?? '') !== '';
        }

        if ($this->authMode() === 'oauth_refresh') {
            return
                (string) ($auth['token_url'] ?? '') !== ''
                && (string) ($auth['client_id'] ?? '') !== ''
                && (string) ($auth['client_secret'] ?? '') !== ''
                && (string) ($auth['refresh_token'] ?? '') !== '';
        }

        return false;
    }

    public function chat(array $messages, ?int $maxOutputTokens = null): array
    {
        if (! $this->configured()) {
            throw new RuntimeException("AI provider [{$this->providerKey}] is not configured.");
        }

        $response = $this->send($messages, $maxOutputTokens, false);

        $auth = (array) ($this->config['auth'] ?? []);

        if (
            $response->status() === 401
            && $this->tokens->usesRefreshTokens($auth)
        ) {
            $this->tokens->forget($this->providerKey, $auth);
            $response = $this->send($messages, $maxOutputTokens, true);
        }

        if (! $response->successful()) {
            throw new RuntimeException(
                "AI provider [{$this->providerKey}] request failed with status {$response->status()}."
            );
        }

        $content = $this->extractContent($response);

        if ($content === '') {
            throw new RuntimeException("AI provider [{$this->providerKey}] returned an empty response.");
        }

        $inputTokens = (int) (
            $response->json('usage.prompt_tokens')
            ?? $response->json('usage.input_tokens')
            ?? 0
        );

        $outputTokens = (int) (
            $response->json('usage.completion_tokens')
            ?? $response->json('usage.output_tokens')
            ?? 0
        );

        $totalTokens = (int) (
            $response->json('usage.total_tokens')
            ?? ($inputTokens + $outputTokens)
        );

        return [
            'content' => $content,
            'provider' => $this->providerKey,
            'model' => (string) ($response->json('model') ?: $this->model()),
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
            'total_tokens' => $totalTokens,
        ];
    }

    /**
     * @param  list<array{role:string,content:string}>  $messages
     */
    private function send(
        array $messages,
        ?int $maxOutputTokens,
        bool $afterRefresh,
    ): Response {
        $auth = (array) ($this->config['auth'] ?? []);
        $token = $this->tokens->token($this->providerKey, $auth);
        $field = (string) ($this->config['max_tokens_field'] ?? 'max_tokens');

        $payload = [
            'model' => $this->model(),
            'messages' => $messages,
        ];

        if ($field !== '') {
            $payload[$field] =
                $maxOutputTokens
                ?? (int) ($this->config['max_output_tokens'] ?? config('ai.max_output_tokens', 1200));
        }

        $response = Http::baseUrl(rtrim((string) $this->config['base_url'], '/'))
            ->withToken($token)
            ->acceptJson()
            ->asJson()
            ->timeout((int) ($this->config['timeout_seconds'] ?? config('ai.timeout_seconds', 45)))
            ->post((string) ($this->config['chat_path'] ?? '/v1/chat/completions'), $payload);

        if ($afterRefresh && $response->status() === 401) {
            throw new RuntimeException(
                "AI provider [{$this->providerKey}] rejected refreshed credentials."
            );
        }

        return $response;
    }

    private function extractContent(Response $response): string
    {
        $direct = $response->json('choices.0.message.content');

        if (is_string($direct)) {
            return trim($direct);
        }

        if (is_array($direct)) {
            $parts = [];

            foreach ($direct as $item) {
                if (! is_array($item)) {
                    continue;
                }

                $text = $item['text'] ?? Arr::get($item, 'text.value');

                if (is_string($text) && $text !== '') {
                    $parts[] = $text;
                }
            }

            if ($parts !== []) {
                return trim(implode("\n", $parts));
            }
        }

        $outputText = $response->json('output_text');

        if (is_string($outputText)) {
            return trim($outputText);
        }

        $parts = [];

        foreach ((array) $response->json('output', []) as $item) {
            foreach ((array) ($item['content'] ?? []) as $content) {
                if (! is_array($content)) {
                    continue;
                }

                $text = $content['text'] ?? null;

                if (is_string($text) && $text !== '') {
                    $parts[] = $text;
                }
            }
        }

        return trim(implode("\n", $parts));
    }
}
