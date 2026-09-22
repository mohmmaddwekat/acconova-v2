<?php

namespace App\Services\AI\Tools;

use App\Models\PartyOpeningBalance;
use App\Models\User;
use App\Services\AI\Contracts\AiBusinessTool;
use App\Services\AI\Tools\Concerns\NormalizesToolInput;
use App\Services\FinanceAuthorization;
use App\Services\WorkspaceFeaturePermissions;
use App\Tenancy\TenantContext;
use Illuminate\Support\Facades\DB;

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
                'limit' => [
                    'type' => 'integer',
                    'minimum' => 1,
                    'maximum' => 25,
                ],
            ],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows(
            $user,
            'parties.account.view',
        ) && (
            FinanceAuthorization::allows(
                $user,
                'finance.sales.view',
            )
            || FinanceAuthorization::allows(
                $user,
                'finance.purchases.view',
            )
        );
    }

    public function execute(
        User $user,
        array $arguments,
    ): array {
        $side = $this->enum(
            $arguments,
            'side',
            ['customer', 'supplier'],
            'customer',
        );

        $permission =
            $side === 'customer'
                ? 'finance.sales.view'
                : 'finance.purchases.view';

        if (
            ! WorkspaceFeaturePermissions::allows(
                $user,
                'parties.account.view',
            )
            || ! FinanceAuthorization::allows(
                $user,
                $permission,
            )
        ) {
            throw new \RuntimeException(
                'The user is not permitted to view this account scope.',
            );
        }

        $kind =
            $side === 'customer'
                ? 'sale_invoice'
                : 'purchase_invoice';

        $limit =
            $this->limit(
                $arguments,
                10,
                25,
            );

        $search =
            $this->search(
                $arguments,
            );

        $context =
            app(
                TenantContext::class,
            );

        $organizationId =
            $context->id();

        $organizationCurrency =
            strtoupper(
                (string) (
                    $context
                        ->organization()
                        ->preferences[
                            'currency'
                        ]
                    ?? 'ILS'
                ),
            );

        /*
         * This query is deliberately fixed by the server. The model never
         * receives table names, columns, joins, sort expressions or SQL.
         * The opening-balance cutoff mirrors PartyAccountController so
         * historical invoices are not double-counted after a carried balance.
         */
        $documentRows =
            DB::table(
                'financial_documents as d',
            )
                ->join(
                    'parties as p',
                    function (
                        $join,
                    ): void {
                        $join
                            ->on(
                                'p.id',
                                '=',
                                'd.party_id',
                            )
                            ->on(
                                'p.organization_id',
                                '=',
                                'd.organization_id',
                            );
                    },
                )
                ->leftJoin(
                    'party_opening_balances as ob',
                    function (
                        $join,
                    ) use (
                        $side,
                    ): void {
                        $join
                            ->on(
                                'ob.party_id',
                                '=',
                                'd.party_id',
                            )
                            ->on(
                                'ob.organization_id',
                                '=',
                                'd.organization_id',
                            )
                            ->where(
                                'ob.side',
                                '=',
                                $side,
                            );
                    },
                )
                ->where(
                    'd.organization_id',
                    $organizationId,
                )
                ->where(
                    'p.organization_id',
                    $organizationId,
                )
                ->where(
                    'd.kind',
                    $kind,
                )
                ->whereIn(
                    'd.status',
                    [
                        'issued',
                        'partially_paid',
                        'paid',
                        'overpaid',
                    ],
                )
                ->where(
                    'd.balance_due',
                    '>',
                    0,
                )
                ->where(
                    function (
                        $query,
                    ): void {
                        $query
                            ->whereNull(
                                'ob.as_of_date',
                            )
                            ->orWhereColumn(
                                'd.issue_date',
                                '>',
                                'ob.as_of_date',
                            );
                    },
                )
                ->when(
                    $search,
                    function (
                        $query,
                        string $search,
                    ): void {
                        $query->where(
                            function (
                                $partyQuery,
                            ) use (
                                $search,
                            ): void {
                                $partyQuery
                                    ->where(
                                        'p.name',
                                        'like',
                                        '%'.$search.'%',
                                    )
                                    ->orWhere(
                                        'p.company_name',
                                        'like',
                                        '%'.$search.'%',
                                    );
                            },
                        );
                    },
                )
                ->groupBy(
                    'd.party_id',
                    'p.name',
                    'p.company_name',
                    'd.currency',
                )
                ->selectRaw(
                    'd.party_id, p.name, p.company_name, d.currency, '.
                    'COUNT(*) as open_invoice_count, '.
                    'COALESCE(SUM(d.balance_due), 0) as invoice_outstanding',
                )
                ->get();

        $opening =
            PartyOpeningBalance::query()
                ->with(
                    'party:id,name,company_name',
                )
                ->where(
                    'side',
                    $side,
                )
                ->when(
                    $search,
                    fn ($query) =>
                        $query->whereHas(
                            'party',
                            fn ($partyQuery) =>
                                $partyQuery
                                    ->where(
                                        'name',
                                        'like',
                                        '%'.$search.'%',
                                    )
                                    ->orWhere(
                                        'company_name',
                                        'like',
                                        '%'.$search.'%',
                                    ),
                        ),
                )
                ->get()
                ->keyBy(
                    'party_id',
                );

        $balances = [];

        foreach (
            $documentRows
            as $row
        ) {
            $partyId =
                (int) $row
                    ->party_id;

            $currency =
                (string) $row
                    ->currency;

            $openingAmount =
                $currency
                === $organizationCurrency
                    ? (float) (
                        $opening
                            ->get(
                                $partyId,
                            )
                            ?->amount
                        ?? 0
                    )
                    : 0.0;

            $invoiceOutstanding =
                (float) $row
                    ->invoice_outstanding;

            $balances[
                $partyId
                .'|'
                .$currency
            ] = [
                'party_id' =>
                    $partyId,
                'party' =>
                    $row
                        ->company_name
                    ?: $row
                        ->name,
                'currency' =>
                    $currency,
                'open_invoice_count' =>
                    (int) $row
                        ->open_invoice_count,
                'invoice_outstanding' =>
                    number_format(
                        $invoiceOutstanding,
                        4,
                        '.',
                        '',
                    ),
                'opening_balance' =>
                    number_format(
                        $openingAmount,
                        4,
                        '.',
                        '',
                    ),
                'total_outstanding' =>
                    number_format(
                        $invoiceOutstanding
                        + $openingAmount,
                        4,
                        '.',
                        '',
                    ),
            ];
        }

        foreach (
            $opening
            as $partyId => $row
        ) {
            $key =
                ((int) $partyId)
                .'|'
                .$organizationCurrency;

            if (
                isset(
                    $balances[
                        $key
                    ],
                )
            ) {
                continue;
            }

            $amount =
                (float) $row
                    ->amount;

            if (
                $amount <= 0
            ) {
                continue;
            }

            $balances[
                $key
            ] = [
                'party_id' =>
                    (int) $partyId,
                'party' =>
                    $row
                        ->party
                        ?->company_name
                    ?: $row
                        ->party
                        ?->name,
                'currency' =>
                    $organizationCurrency,
                'open_invoice_count' =>
                    0,
                'invoice_outstanding' =>
                    '0.0000',
                'opening_balance' =>
                    number_format(
                        $amount,
                        4,
                        '.',
                        '',
                    ),
                'total_outstanding' =>
                    number_format(
                        $amount,
                        4,
                        '.',
                        '',
                    ),
            ];
        }

        $balances =
            array_values(
                $balances,
            );

        usort(
            $balances,
            fn (
                array $a,
                array $b,
            ): int =>
                (float) $b[
                    'total_outstanding'
                ]
                <=>
                (float) $a[
                    'total_outstanding'
                ],
        );

        return [
            'side' =>
                $side,
            'balances' =>
                array_slice(
                    $balances,
                    0,
                    $limit,
                ),
        ];
    }
}
