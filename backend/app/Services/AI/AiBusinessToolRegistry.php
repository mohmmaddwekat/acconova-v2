<?php

namespace App\Services\AI;

use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\CashflowSummaryTool;
use App\Services\AI\Tools\InventoryStatusTool;
use App\Services\AI\Tools\OverdueInvoicesTool;
use App\Services\AI\Tools\PartyBalancesTool;
use App\Services\AI\Tools\SalesSummaryTool;
use App\Services\AI\Tools\StaffSummaryTool;
use App\Services\WorkspaceFeaturePermissions;
use RuntimeException;

final class AiBusinessToolRegistry
{
    /** @var list<class-string<AiBusinessTool>> */
    private const TOOLS = [
        SalesSummaryTool::class,
        PartyBalancesTool::class,
        OverdueInvoicesTool::class,
        InventoryStatusTool::class,
        CashflowSummaryTool::class,
        StaffSummaryTool::class,
    ];

    /** @return list<array{name:string,description:string,input_schema:array<string,mixed>}> */
    public function definitionsFor(User $user): array
    {
        if (! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.use')) {
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
     *  @return array<string,mixed>
     */
    public function execute(User $user, string $name, array $arguments): array
    {
        if (! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.use')) {
            throw new RuntimeException('AI business data access is not permitted for this user.');
        }

        $tool = $this->find($name);

        if (! $tool || ! $tool->allowed($user)) {
            throw new RuntimeException('AI business tool is not available for this user.');
        }

        return $tool->execute($user, $arguments);
    }

    public function available(User $user, string $name): bool
    {
        if (! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.use')) {
            return false;
        }

        $tool = $this->find($name);

        return $tool !== null && $tool->allowed($user);
    }

    /** @return list<AiBusinessTool> */
    private function tools(): array
    {
        return array_map(
            fn (string $class): AiBusinessTool => app($class),
            self::TOOLS,
        );
    }

    private function find(string $name): ?AiBusinessTool
    {
        foreach ($this->tools() as $tool) {
            if (hash_equals($tool->name(), $name)) {
                return $tool;
            }
        }

        return null;
    }
}
