<?php

namespace App\Services\AI\Tools;

use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\Collections\CollectionAlertService;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Workspace\WorkspaceFeaturePermissions;

final class CollectionFollowUpsTool implements AiBusinessTool
{
    use NormalizesToolInput;

    public function __construct(private readonly CollectionAlertService $alerts) {}

    public function name(): string
    {
        return 'collection_follow_ups';
    }

    public function description(): string
    {
        return 'List the customers to follow up on collections, largest overdue amount first, with the alert reason, last contact and suggested next step.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 25],
            ],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows($user, 'operations.collections.view')
            && FinanceAuthorization::allows($user, 'finance.sales.view');
    }

    public function execute(User $user, array $arguments): array
    {
        $this->alerts->evaluateIfStale();

        $items = $this->alerts->followUps();

        return [
            'total' => count($items),
            'items' => array_map(fn (array $item): array => [
                'party' => $item['party'],
                'overdue_amount' => $item['overdue_amount'],
                'days_late' => $item['days_late'],
                'reasons' => array_column($item['alerts'], 'kind'),
                'last_contact' => $item['last_contact'] === null ? null : [
                    'days_ago' => $item['last_contact']['days_ago'],
                    'channel' => $item['last_contact']['channel'],
                    'outcome' => $item['last_contact']['outcome'],
                ],
                'next_action' => $item['next_action']['key'],
                'needs_approval_to_send' => $item['next_action']['requires_approval'],
            ], array_slice($items, 0, $this->limit($arguments, 10, 25))),
            'note' => 'Nothing is sent to customers automatically.',
        ];
    }
}
