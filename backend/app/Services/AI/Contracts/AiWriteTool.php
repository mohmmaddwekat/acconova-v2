<?php

namespace App\Services\AI\Contracts;

use App\Models\User;

/**
 * Same shape as `AiBusinessTool`, kept as a separate interface so
 * write-capable tools can never be accidentally registered in the
 * read-only tool registry.
 */
interface AiWriteTool
{
    public function name(): string;

    public function description(): string;

    /** @return array<string,mixed> */
    public function inputSchema(): array;

    public function allowed(User $user): bool;

    /** @param array<string,mixed> $arguments
     * @return array<string,mixed>
     */
    public function execute(User $user, array $arguments): array;
}
