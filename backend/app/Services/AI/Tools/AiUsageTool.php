<?php

namespace App\Services\AI\Tools;

use App\Models\User;
use App\Services\AI\AiUsageService;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;

final class AiUsageTool implements AiBusinessTool
{
    public function __construct(private readonly AiUsageService $usage) {}

    public function name(): string
    {
        return 'ai_usage';
    }

    public function description(): string
    {
        return 'How much of the monthly AI allowance has been used: used, remaining, percent, when it resets, and the user\'s own usage.';
    }

    public function inputSchema(): array
    {
        return ['type' => 'object', 'properties' => [], 'additionalProperties' => false];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows($user, 'ai.assistant.use');
    }

    public function execute(User $user, array $arguments): array
    {
        $usage = $this->usage->forUser($user, app(TenantContext::class)->organization());

        return [
            'period' => $usage['period'],
            'allowance' => $usage['allowance'],
            'my_usage' => ['tokens' => $usage['me']['tokens'], 'messages' => $usage['me']['messages'], 'today_tokens' => $usage['me']['today_tokens']],
            'workspace_total_tokens' => $usage['workspace']['tokens'] ?? null,
        ];
    }
}
