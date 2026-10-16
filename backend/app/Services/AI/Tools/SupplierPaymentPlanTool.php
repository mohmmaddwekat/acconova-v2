<?php

namespace App\Services\AI\Tools;

use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\Finance\FinanceAuthorization;
use App\Services\Finance\SupplierPaymentPlanService;

final class SupplierPaymentPlanTool implements AiBusinessTool
{
    use NormalizesToolInput;

    public function __construct(private readonly SupplierPaymentPlanService $plans) {}

    public function name(): string
    {
        return 'supplier_payment_proposal';
    }

    public function description(): string
    {
        return 'Propose whom to pay, how much and when, within the available cash after the operating reserve, with partial payments, cash-shortfall and late-collection warnings. A proposal only: it pays and records nothing.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'scenario' => ['type' => 'string', 'enum' => SupplierPaymentPlanService::SCENARIOS],
                'horizon_days' => ['type' => 'integer', 'minimum' => 7, 'maximum' => 90],
                'delay_days' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 120],
            ],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return FinanceAuthorization::allows($user, 'finance.cash.view')
            && FinanceAuthorization::allows($user, 'finance.purchases.view');
    }

    public function execute(User $user, array $arguments): array
    {
        $scenario = (string) ($arguments['scenario'] ?? 'expected');

        $proposal = $this->plans->propose(
            in_array($scenario, SupplierPaymentPlanService::SCENARIOS, true) ? $scenario : 'expected',
            max(7, min(90, (int) ($arguments['horizon_days'] ?? 30))),
            max(1, min(120, (int) ($arguments['delay_days'] ?? 14))),
        );

        unset($proposal['balance_path'], $proposal['assumptions']);

        return $proposal;
    }
}
