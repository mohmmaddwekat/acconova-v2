<?php

namespace App\Services\AI;

use App\Services\AI\Contracts\AiProvider;
use App\Services\AI\Providers\AnthropicProvider;
use App\Services\AI\Providers\GeminiProvider;
use App\Services\AI\Providers\OpenAiCompatibleProvider;
use RuntimeException;
use Throwable;

final class AiProviderManager
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
        ?string $preferredProvider = null,
    ): array {
        if (! (bool) config('ai.enabled', false)) {
            throw new RuntimeException('AI gateway is disabled.');
        }

        $order = $this->providerOrder($preferredProvider);
        $attempted = [];
        $lastException = null;

        foreach ($order as $key) {
            $provider = $this->provider($key);

            if (! $provider || ! $provider->configured()) {
                continue;
            }

            $attempted[] = $provider->key();

            try {
                return $provider->chat($messages, $maxOutputTokens);
            } catch (Throwable $exception) {
                report($exception);
                $lastException = $exception;
            }
        }

        if ($attempted === []) {
            throw new RuntimeException('No AI provider is configured.');
        }

        throw new RuntimeException(
            'All configured AI providers failed: '.implode(', ', $attempted).'.',
            previous: $lastException,
        );
    }

    public function configured(): bool
    {
        return (bool) config('ai.enabled', false)
            && $this->configuredProviderKeys() !== [];
    }

    /**
     * @return list<string>
     */
    public function configuredProviderKeys(): array
    {
        $configured = [];

        foreach ($this->allProviderKeys() as $key) {
            $provider = $this->provider($key);

            if ($provider?->configured()) {
                $configured[] = $provider->key();
            }
        }

        return array_values(array_unique($configured));
    }

    public function providerAvailable(string $key): bool
    {
        $provider = $this->provider($key);

        return (bool) config('ai.enabled', false)
            && $provider !== null
            && $provider->configured();
    }

    /**
     * @return array{
     *     enabled:bool,
     *     configured:bool,
     *     provider:string,
     *     model:string,
     *     auth_mode:string,
     *     fallbacks:list<string>,
     *     providers:list<array{
     *         key:string,
     *         label:string,
     *         driver:string,
     *         model:string,
     *         auth_mode:string,
     *         configured:bool,
     *         is_default:bool
     *     }>
     * }
     */
    public function status(): array
    {
        $default = $this->defaultProviderKey();
        $providers = [];

        foreach ($this->allProviderKeys() as $key) {
            $provider = $this->provider($key);

            if (! $provider) {
                continue;
            }

            $providers[] = [
                'key' => $provider->key(),
                'label' => $provider->label(),
                'driver' => $provider->driver(),
                'model' => $provider->model(),
                'auth_mode' => $provider->authMode(),
                'configured' => $provider->configured(),
                'is_default' => $provider->key() === $default,
            ];
        }

        $active = null;

        foreach ($this->providerOrder() as $key) {
            $candidate = $this->provider($key);

            if ($candidate?->configured()) {
                $active = $candidate;
                break;
            }
        }

        return [
            'enabled' => (bool) config('ai.enabled', false),
            'configured' => $this->configured(),
            'provider' => $active?->key() ?? $default,
            'model' => $active?->model() ?? '',
            'auth_mode' => $active?->authMode() ?? 'api_key',
            'fallbacks' => $this->fallbackProviderKeys(),
            'providers' => $providers,
        ];
    }

    public function provider(string $key): ?AiProvider
    {
        $key = $this->normalizeKey($key);
        $config = config("ai.providers.{$key}");

        if (! is_array($config)) {
            return null;
        }

        return match ((string) ($config['driver'] ?? '')) {
            'openai_compatible' => new OpenAiCompatibleProvider(
                $key,
                $config,
                $this->tokens,
            ),
            'anthropic' => new AnthropicProvider($key, $config),
            'gemini' => new GeminiProvider($key, $config),
            default => null,
        };
    }

    /**
     * @return list<string>
     */
    private function providerOrder(?string $preferredProvider = null): array
    {
        $keys = [];

        if ($preferredProvider !== null && trim($preferredProvider) !== '') {
            $keys[] = $this->normalizeKey($preferredProvider);
        }

        $keys[] = $this->defaultProviderKey();

        foreach ($this->fallbackProviderKeys() as $fallback) {
            $keys[] = $fallback;
        }

        foreach ($this->allProviderKeys() as $key) {
            $keys[] = $key;
        }

        return array_values(array_unique(array_filter($keys)));
    }

    private function defaultProviderKey(): string
    {
        return $this->normalizeKey(
            (string) config('ai.default_provider', 'openai'),
        );
    }

    /**
     * @return list<string>
     */
    private function fallbackProviderKeys(): array
    {
        $fallbacks = config('ai.fallback_providers', []);

        if (is_string($fallbacks)) {
            $fallbacks = explode(',', $fallbacks);
        }

        if (! is_array($fallbacks)) {
            return [];
        }

        return array_values(array_unique(array_filter(array_map(
            fn ($key): string => $this->normalizeKey((string) $key),
            $fallbacks,
        ))));
    }

    /**
     * @return list<string>
     */
    private function allProviderKeys(): array
    {
        $providers = config('ai.providers', []);

        if (! is_array($providers)) {
            return [];
        }

        return array_values(array_map('strval', array_keys($providers)));
    }

    private function normalizeKey(string $key): string
    {
        $key = strtolower(trim($key));

        return match ($key) {
            'openai-compatible', 'openai_compatible' => 'custom',
            'claude' => 'anthropic',
            'google', 'google-gemini' => 'gemini',
            default => $key,
        };
    }
}
