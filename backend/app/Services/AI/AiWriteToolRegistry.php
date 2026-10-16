<?php

namespace App\Services\AI;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Tools\PartyArchiveTool;
use App\Services\AI\Tools\PartyCreateTool;
use App\Services\AI\Tools\PartyRestoreTool;
use App\Services\AI\Tools\PartyUpdateTool;
use App\Services\AI\Tools\ProductArchiveTool;
use App\Services\AI\Tools\ProductCreateTool;
use App\Services\AI\Tools\ProductRestoreTool;
use App\Services\AI\Tools\ProductUpdateTool;
use App\Services\AI\Tools\RecurringPaymentArchiveTool;
use App\Services\AI\Tools\RecurringPaymentCreateTool;
use App\Services\AI\Tools\RecurringPaymentRestoreTool;
use App\Services\AI\Tools\RecurringPaymentUpdateTool;
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
        RecurringPaymentArchiveTool::class,
        RecurringPaymentRestoreTool::class,
        RecurringPaymentCreateTool::class,
        RecurringPaymentUpdateTool::class,
        PartyCreateTool::class,
        PartyUpdateTool::class,
        PartyArchiveTool::class,
        PartyRestoreTool::class,
        ProductCreateTool::class,
        ProductUpdateTool::class,
        ProductArchiveTool::class,
        ProductRestoreTool::class,
    ];

    /** @return list<array{name:string,description:string,input_schema:array<string,mixed>}> */
    public function definitionsFor(User $user): array
    {
        if (! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.write')) {
            return [];
        }

        $definitions = [];

        foreach ($this->tools() as $tool) {
            if (! $this->permitted($user, $tool)) {
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

        if (! $tool || ! $this->permitted($user, $tool)) {
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

        return $tool !== null && $this->permitted($user, $tool);
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

    /**
     * Deny by default: a tool runs only if the action matrix lists it and
     * the user holds the matrix permissions as well as the tool's own check.
     */
    private function permitted(User $user, AiWriteTool $tool): bool
    {
        return AiActionMatrix::userMayRun($user, $tool->name()) && $tool->allowed($user);
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
