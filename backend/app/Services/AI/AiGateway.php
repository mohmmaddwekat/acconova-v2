<?php

namespace App\Services\AI;

use Illuminate\Http\Client\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Http;
use RuntimeException;

final class AiGateway
{
    public function __construct(
        private readonly AiAccessTokenProvider $tokens,
    ) {
    }

    /**
     * @param  list<array{role:string,content:string}>  $messages
     * @return array{
     *     content:string,
     *     provider:string,
     *     model:string,
     *     input_tokens:int,
     *     output_tokens:int,
     *     total_tokens:int
     * }
     */
    public function chat(
        array $messages,
        ?int $maxOutputTokens = null,
    ): array {
        $this->assertConfigured();

        $response = $this->send(
            $messages,
            $maxOutputTokens,
            false,
        );

        if (
            $response->status() === 401
            && $this->tokens->usesRefreshTokens()
        ) {
            $this->tokens->forget();

            $response = $this->send(
                $messages,
                $maxOutputTokens,
                true,
            );
        }

        if (! $response->successful()) {
            throw new RuntimeException('AI provider request failed.');
        }

        $content = $this->extractContent($response);

        if ($content === '') {
            throw new RuntimeException('AI provider returned an empty response.');
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
            'provider' => (string) config('ai.provider', 'openai-compatible'),
            'model' => (string) (
                $response->json('model')
                ?: config('ai.model', '')
            ),
            'input_tokens' => $inputTokens,
            'output_tokens' => $outputTokens,
            'total_tokens' => $totalTokens,
        ];
    }

    public function configured(): bool
    {
        if (! (bool) config('ai.enabled', false)) {
            return false;
        }

        if (
            (string) config('ai.base_url', '') === ''
            || (string) config('ai.model', '') === ''
        ) {
            return false;
        }

        $mode = (string) config('ai.auth.mode', 'api_key');

        if ($mode === 'api_key') {
            return (string) config('ai.auth.api_key', '') !== '';
        }

        if ($mode === 'oauth_refresh') {
            return
                (string) config('ai.auth.token_url', '') !== ''
                && (string) config('ai.auth.client_id', '') !== ''
                && (string) config('ai.auth.client_secret', '') !== ''
                && (string) config('ai.auth.refresh_token', '') !== '';
        }

        return false;
    }

    /**
     * @param  list<array{role:string,content:string}>  $messages
     */
    private function send(
        array $messages,
        ?int $maxOutputTokens,
        bool $afterRefresh,
    ): Response {
        $token = $this->tokens->token();
        $field = (string) config('ai.max_tokens_field', 'max_tokens');

        $payload = [
            'model' => (string) config('ai.model'),
            'messages' => $messages,
        ];

        if ($field !== '') {
            $payload[$field] =
                $maxOutputTokens
                ?? (int) config('ai.max_output_tokens', 1200);
        }

        $response = Http::baseUrl((string) config('ai.base_url'))
            ->withToken($token)
            ->acceptJson()
            ->asJson()
            ->timeout((int) config('ai.timeout_seconds', 45))
            ->post((string) config('ai.chat_path', '/v1/chat/completions'), $payload);

        /*
         * Never loop on authentication failures. A refresh-token flow gets
         * exactly one forced refresh and retry.
         */
        if ($afterRefresh && $response->status() === 401) {
            throw new RuntimeException('AI provider rejected refreshed credentials.');
        }

        return $response;
    }

    private function assertConfigured(): void
    {
        if (! $this->configured()) {
            throw new RuntimeException('AI gateway is not configured.');
        }
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

                $text =
                    $item['text']
                    ?? Arr::get($item, 'text.value');

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

        $output = $response->json('output');

        if (is_array($output)) {
            $parts = [];

            foreach ($output as $item) {
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

        return '';
    }
}
