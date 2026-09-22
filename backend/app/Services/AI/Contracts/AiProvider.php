<?php

namespace App\Services\AI\Contracts;

interface AiProvider
{
    public function key(): string;

    public function label(): string;

    public function driver(): string;

    public function model(): string;

    public function authMode(): string;

    public function configured(): bool;

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
    public function chat(array $messages, ?int $maxOutputTokens = null): array;
}
