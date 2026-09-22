<?php

namespace App\Services\AI\Tools;

use App\Models\FinancialDocument;
use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\FinanceAuthorization;

final class OverdueInvoicesTool implements AiBusinessTool
{
    use NormalizesToolInput;

    public function name(): string
    {
        return 'overdue_invoices';
    }

    public function description(): string
    {
        return 'List overdue customer sales invoices or overdue supplier purchase invoices with remaining balances.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'side' => [
                    'type' => 'string',
                    'enum' => ['customer', 'supplier'],
                ],
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 25],
            ],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return FinanceAuthorization::allows($user, 'finance.sales.view')
            || FinanceAuthorization::allows($user, 'finance.purchases.view');
    }

    public function execute(User $user, array $arguments): array
    {
        $side = $this->enum($arguments, 'side', ['customer', 'supplier'], 'customer');
        $permission = $side === 'customer'
            ? 'finance.sales.view'
            : 'finance.purchases.view';

        if (! FinanceAuthorization::allows($user, $permission)) {
            throw new \RuntimeException('The user is not permitted to view this invoice scope.');
        }

        $kind = $side === 'customer'
            ? 'sale_invoice'
            : 'purchase_invoice';

        $limit = $this->limit($arguments, 10, 25);
        $today = now()->toDateString();

        $rows = FinancialDocument::query()
            ->with('party:id,name,company_name')
            ->where('kind', $kind)
            ->whereIn('status', ['issued', 'partially_paid', 'overpaid'])
            ->whereNotNull('due_date')
            ->whereDate('due_date', '<', $today)
            ->where('balance_due', '>', 0)
            ->orderBy('due_date')
            ->orderByDesc('balance_due')
            ->limit($limit)
            ->get()
            ->map(fn (FinancialDocument $document): array => [
                'id' => $document->id,
                'number' => $document->number,
                'party' => $document->party?->company_name ?: $document->party?->name,
                'currency' => $document->currency,
                'issue_date' => $document->issue_date?->toDateString(),
                'due_date' => $document->due_date?->toDateString(),
                'days_overdue' => $document->due_date
                    ? $document->due_date->startOfDay()->diffInDays(now()->startOfDay())
                    : 0,
                'total' => (string) $document->total,
                'paid_total' => (string) $document->paid_total,
                'balance_due' => (string) $document->balance_due,
            ])
            ->values()
            ->all();

        return [
            'side' => $side,
            'as_of' => $today,
            'invoices' => $rows,
        ];
    }
}
