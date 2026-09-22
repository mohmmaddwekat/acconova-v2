<?php

namespace App\Services\AI\Tools;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyOpeningBalance;
use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\FinanceAuthorization;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;

final class PartyBalancesTool implements AiBusinessTool
{
    use NormalizesToolInput;

    public function name(): string
    {
        return 'party_balances';
    }

    public function description(): string
    {
        return 'Return customer receivables or supplier payables, optionally filtered by party name, including carried opening balances.';
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
                'search' => [
                    'type' => 'string',
                    'description' => 'Optional customer or supplier name search.',
                ],
                'limit' => ['type' => 'integer', 'minimum' => 1, 'maximum' => 25],
            ],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows($user, 'parties.account.view')
            && (
                FinanceAuthorization::allows($user, 'finance.sales.view')
                || FinanceAuthorization::allows($user, 'finance.purchases.view')
            );
    }

    public function execute(User $user, array $arguments): array
    {
        $side = $this->enum($arguments, 'side', ['customer', 'supplier'], 'customer');
        $permission = $side === 'customer'
            ? 'finance.sales.view'
            : 'finance.purchases.view';

        if (
            ! WorkspaceFeaturePermissions::allows($user, 'parties.account.view')
            || ! FinanceAuthorization::allows($user, $permission)
        ) {
            throw new \RuntimeException('The user is not permitted to view this account scope.');
        }

        $kind = $side === 'customer'
            ? 'sale_invoice'
            : 'purchase_invoice';
        $limit = $this->limit($arguments, 10, 25);
        $search = $this->search($arguments);

        $partyQuery = Party::query()->select(['id', 'name', 'company_name']);

        if ($search !== null) {
            $partyQuery->where(function ($query) use ($search): void {
                $query
                    ->where('name', 'like', '%'.$search.'%')
                    ->orWhere('company_name', 'like', '%'.$search.'%');
            });
        }

        $partyIds = $partyQuery
            ->limit($search !== null ? 50 : 5000)
            ->pluck('id');

        if ($partyIds->isEmpty()) {
            return [
                'side' => $side,
                'balances' => [],
            ];
        }

        $documents = FinancialDocument::query()
            ->whereIn('party_id', $partyIds)
            ->where('kind', $kind)
            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
            ->where('balance_due', '>', 0)
            ->groupBy('party_id', 'currency')
            ->selectRaw(
                'party_id, currency, COUNT(*) as open_invoice_count, COALESCE(SUM(balance_due), 0) as invoice_outstanding'
            )
            ->get();

        $organizationCurrency = strtoupper((string) (
            app(TenantContext::class)->organization()->preferences['currency']
            ?? 'ILS'
        ));

        $opening = PartyOpeningBalance::query()
            ->whereIn('party_id', $partyIds)
            ->where('side', $side)
            ->get()
            ->keyBy('party_id');

        $parties = Party::withTrashed()
            ->whereIn('id', $partyIds)
            ->get(['id', 'name', 'company_name'])
            ->keyBy('id');

        $balances = [];

        foreach ($documents as $row) {
            $partyId = (int) $row->party_id;
            $currency = (string) $row->currency;
            $openingAmount = $currency === $organizationCurrency
                ? (float) ($opening->get($partyId)?->amount ?? 0)
                : 0.0;
            $invoiceOutstanding = (float) $row->invoice_outstanding;
            $party = $parties->get($partyId);

            $balances[$partyId.'|'.$currency] = [
                'party_id' => $partyId,
                'party' => $party?->company_name ?: $party?->name,
                'currency' => $currency,
                'open_invoice_count' => (int) $row->open_invoice_count,
                'invoice_outstanding' => number_format($invoiceOutstanding, 4, '.', ''),
                'opening_balance' => number_format($openingAmount, 4, '.', ''),
                'total_outstanding' => number_format($invoiceOutstanding + $openingAmount, 4, '.', ''),
            ];
        }

        foreach ($opening as $partyId => $row) {
            $key = ((int) $partyId).'|'.$organizationCurrency;

            if (isset($balances[$key])) {
                continue;
            }

            $party = $parties->get((int) $partyId);
            $amount = (float) $row->amount;

            if ($amount <= 0) {
                continue;
            }

            $balances[$key] = [
                'party_id' => (int) $partyId,
                'party' => $party?->company_name ?: $party?->name,
                'currency' => $organizationCurrency,
                'open_invoice_count' => 0,
                'invoice_outstanding' => '0.0000',
                'opening_balance' => number_format($amount, 4, '.', ''),
                'total_outstanding' => number_format($amount, 4, '.', ''),
            ];
        }

        $balances = array_values($balances);

        usort(
            $balances,
            fn (array $a, array $b): int =>
                (float) $b['total_outstanding'] <=> (float) $a['total_outstanding'],
        );

        return [
            'side' => $side,
            'balances' => array_slice($balances, 0, $limit),
        ];
    }
}
