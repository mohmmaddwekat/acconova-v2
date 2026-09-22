<?php

namespace App\Services\AI\Tools;

use App\Models\CashMovement;
use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\FinanceAuthorization;

final class CashflowSummaryTool implements AiBusinessTool
{
    use NormalizesToolInput;

    public function name(): string
    {
        return 'cashflow_summary';
    }

    public function description(): string
    {
        return 'Summarize posted incoming and outgoing cash movements for a date range, grouped by currency.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'date_from' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
                'date_to' => ['type' => 'string', 'description' => 'YYYY-MM-DD'],
            ],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return FinanceAuthorization::allows($user, 'finance.cash.view');
    }

    public function execute(User $user, array $arguments): array
    {
        [$from, $to] = $this->dateRange($arguments, 30);

        $rows = CashMovement::query()
            ->where('status', 'posted')
            ->whereBetween('movement_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('currency', 'direction')
            ->selectRaw('currency, direction, COUNT(*) as movement_count, COALESCE(SUM(amount), 0) as total')
            ->get();

        $currencies = [];

        foreach ($rows as $row) {
            $currency = (string) $row->currency;

            $currencies[$currency] ??= [
                'currency' => $currency,
                'incoming' => 0.0,
                'outgoing' => 0.0,
                'incoming_count' => 0,
                'outgoing_count' => 0,
            ];

            $direction = (string) $row->direction;

            if ($direction === 'incoming') {
                $currencies[$currency]['incoming'] += (float) $row->total;
                $currencies[$currency]['incoming_count'] += (int) $row->movement_count;
            } elseif ($direction === 'outgoing') {
                $currencies[$currency]['outgoing'] += (float) $row->total;
                $currencies[$currency]['outgoing_count'] += (int) $row->movement_count;
            }
        }

        $currencies = array_values(array_map(function (array $row): array {
            $incoming = (float) $row['incoming'];
            $outgoing = (float) $row['outgoing'];

            return [
                'currency' => $row['currency'],
                'incoming' => number_format($incoming, 4, '.', ''),
                'outgoing' => number_format($outgoing, 4, '.', ''),
                'net' => number_format($incoming - $outgoing, 4, '.', ''),
                'incoming_count' => $row['incoming_count'],
                'outgoing_count' => $row['outgoing_count'],
            ];
        }, $currencies));

        return [
            'period' => [
                'date_from' => $from->toDateString(),
                'date_to' => $to->toDateString(),
            ],
            'currencies' => $currencies,
        ];
    }
}
