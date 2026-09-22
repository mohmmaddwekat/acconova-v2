<?php

namespace App\Services\AI\Contracts;

use App\Models\User;

interface AiBusinessTool
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
