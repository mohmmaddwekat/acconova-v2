<?php

namespace App\Services\AI\Contracts;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
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

    /**
     * A fixed property of this action type, never a per-tenant
     * configurable threshold: used by `AiToolPlanner` to decide whether
     * this call may ever be batched alongside another write call.
     */
    public function severity(): WriteActionSeverity;

    /** @param array<string,mixed> $arguments
     * @return array<string,mixed>
     */
    public function execute(User $user, array $arguments, AiConversation $conversation): array;
}
