<?php

namespace App\Services\AI;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Tools\SmartImportCancelTool;
use App\Services\AI\Tools\SmartImportConfirmTool;
use App\Services\AI\Tools\SmartImportProposeTool;
use App\Services\AI\Tools\SmartImportReviseTool;
use App\Services\AI\Tools\SmartImportRollbackTool;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use RuntimeException;

final class AiWriteToolRegistry
{
    /** @var list<class-string<AiWriteTool>> */
    private const TOOLS = [
        SmartImportProposeTool::class,
        SmartImportReviseTool::class,
        SmartImportConfirmTool::class,
        SmartImportCancelTool::class,
        SmartImportRollbackTool::class,
    ];

    /** @return list<array{name:string,description:string,input_schema:array<string,mixed>}> */
    public function definitionsFor(User $user): array
    {
        if (! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.write')) {
            return [];
        }

        $definitions = [];

        foreach ($this->tools() as $tool) {
            if (! $tool->allowed($user)) {
                continue;
            }

            $definitions[] = [
                'name' => $tool->name(),
                'description' => $tool->description(),
                'input_schema' => $tool->inputSchema(),
            ];
        }

        return $definitions;
    }

    /** @param array<string,mixed> $arguments
     * @return array<string,mixed>
     */
    public function execute(User $user, string $name, array $arguments, AiConversation $conversation): array
    {
        if (! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.write')) {
            throw new RuntimeException('AI business data access is not permitted for this user.');
        }

        $tool = $this->find($name);

        if (! $tool || ! $tool->allowed($user)) {
            throw new RuntimeException('AI business tool is not available for this user.');
        }

        return $tool->execute($user, $arguments, $conversation);
    }

    public function available(User $user, string $name): bool
    {
        if (! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.write')) {
            return false;
        }

        $tool = $this->find($name);

        return $tool !== null && $tool->allowed($user);
    }

    /**
     * Resolves a registered tool by name and returns its `severity()`, or
     * `null` if the name isn't registered. Does not check `allowed()` —
     * callers that need an availability check should use `available()`
     * first.
     */
    public function severityOf(string $name): ?WriteActionSeverity
    {
        return $this->find($name)?->severity();
    }

    /** @return list<AiWriteTool> */
    private function tools(): array
    {
        return array_map(
            fn (string $class): AiWriteTool => app($class),
            self::TOOLS,
        );
    }

    private function find(string $name): ?AiWriteTool
    {
        foreach ($this->tools() as $tool) {
            if (hash_equals($tool->name(), $name)) {
                return $tool;
            }
        }

        return null;
    }
}
