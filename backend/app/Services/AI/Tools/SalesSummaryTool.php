<?php

namespace App\Services\AI\Tools;

use App\Models\FinancialDocument;
use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\FinanceAuthorization;

final class SalesSummaryTool implements AiBusinessTool
{
    use NormalizesToolInput;

    public function name(): string
    {
        return 'sales_summary';
    }

    public function description(): string
    {
        return 'Summarize issued sales invoices for a date range, grouped by currency, including invoiced, paid and outstanding totals.';
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
        return FinanceAuthorization::allows($user, 'finance.sales.view');
    }

    public function execute(User $user, array $arguments): array
    {
        [$from, $to] = $this->dateRange($arguments, 30);

        $rows = FinancialDocument::query()
            ->where('kind', 'sale_invoice')
            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
            ->whereBetween('issue_date', [$from->toDateString(), $to->toDateString()])
            ->groupBy('currency')
            ->orderBy('currency')
            ->selectRaw(
                'currency, COUNT(*) as invoice_count, '.
                'COALESCE(SUM(total), 0) as invoiced_total, '.
                'COALESCE(SUM(paid_total), 0) as paid_total, '.
                'COALESCE(SUM(balance_due), 0) as outstanding_total'
            )
            ->get()
            ->map(fn ($row): array => [
                'currency' => (string) $row->currency,
                'invoice_count' => (int) $row->invoice_count,
                'invoiced_total' => number_format((float) $row->invoiced_total, 4, '.', ''),
                'paid_total' => number_format((float) $row->paid_total, 4, '.', ''),
                'outstanding_total' => number_format((float) $row->outstanding_total, 4, '.', ''),
            ])
            ->values()
            ->all();

        return [
            'period' => [
                'date_from' => $from->toDateString(),
                'date_to' => $to->toDateString(),
            ],
            'currencies' => $rows,
        ];
    }
}
