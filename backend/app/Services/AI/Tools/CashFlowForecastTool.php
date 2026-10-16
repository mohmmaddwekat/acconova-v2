<?php

namespace App\Services\AI\Tools;

use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\Finance\CashFlowForecastService;
use App\Services\Finance\FinanceAuthorization;

final class CashFlowForecastTool implements AiBusinessTool
{
    use NormalizesToolInput;

    public function __construct(private readonly CashFlowForecastService $forecast) {}

    public function name(): string
    {
        return 'cash_flow_forecast';
    }

    public function description(): string
    {
        return 'Forecast cash by week: confirmed cash and certain outflows, expected customer receipts and pending cheques kept separate, with a late-collection scenario and the assumptions used.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'horizon_days' => ['type' => 'integer', 'minimum' => 7, 'maximum' => 180],
                'delay_days' => ['type' => 'integer', 'minimum' => 0, 'maximum' => 120, 'description' => 'How many days later receipts arrive in the late-collection scenario.'],
                'currency' => ['type' => 'string', 'description' => 'ISO code; defaults to the workspace currency.'],
            ],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return FinanceAuthorization::allows($user, 'finance.cash.view')
            && FinanceAuthorization::allows($user, 'finance.sales.view');
    }

    public function execute(User $user, array $arguments): array
    {
        $result = $this->forecast->forecast(
            max(7, min(180, (int) ($arguments['horizon_days'] ?? 60))),
            max(0, min(120, (int) ($arguments['delay_days'] ?? 30))),
            isset($arguments['currency']) ? (string) $arguments['currency'] : null,
        );

        unset($result['items']);

        return $result;
    }
}
