<?php

namespace App\Services\AI;

final class AiGateway
{
    public function __construct(
        private readonly AiProviderManager $providers,
    ) {}

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
        return $this->providers->chat(
            $messages,
            $maxOutputTokens,
            $preferredProvider,
        );
    }

    public function configured(): bool
    {
        return $this->providers->configured();
    }

    /**
     * @return list<string>
     */
    public function configuredProviderKeys(): array
    {
        return $this->providers->configuredProviderKeys();
    }

    public function providerAvailable(string $provider): bool
    {
        return $this->providers->providerAvailable($provider);
    }

    /**
     * @return array<string,mixed>
     */
    public function status(): array
    {
        return $this->providers->status();
    }
}
