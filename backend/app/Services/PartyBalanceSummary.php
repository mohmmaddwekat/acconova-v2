<?php

namespace App\Services;

use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyOpeningBalance;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

final class PartyBalanceSummary
{
    /**
     * Return current directional balances for the visible Party records.
     *
     * Positive customer position means the Party owes the workspace.
     * Negative customer position means the workspace holds customer credit.
     * Positive supplier position means the workspace owes the Party.
     * Negative supplier position means the workspace holds supplier credit.
     *
     * @param  Collection<int, Party>  $parties
     * @return array<int, array{
     *     customer_position: float,
     *     supplier_position: float,
     *     owed_to_us: float,
     *     we_owe: float
     * }>
     */
    public function forParties(
        Collection $parties,
        bool $canSales,
        bool $canPurchases,
        bool $canCash,
        ?Carbon $asOf = null,
    ): array {
        $ids = $parties
            ->pluck('id')
            ->map(
                fn ($id): int => (int) $id,
            )
            ->values()
            ->all();

        if ($ids === []) {
            return [];
        }

        $asOf ??= now()->endOfDay();

        $positions = [];

        foreach ($ids as $id) {
            $positions[$id] = [
                'customer_position' => 0.0,
                'supplier_position' => 0.0,
                'owed_to_us' => 0.0,
                'we_owe' => 0.0,
            ];
        }

        PartyOpeningBalance::query()
            ->whereIn(
                'party_id',
                $ids,
            )
            ->get([
                'party_id',
                'side',
                'amount',
            ])
            ->each(function (
                PartyOpeningBalance $opening,
            ) use (
                &$positions,
                $canSales,
                $canPurchases,
            ): void {
                $partyId =
                    (int) $opening->party_id;

                if (
                    $opening->side === 'customer'
                    && $canSales
                ) {
                    $positions[$partyId]['customer_position'] +=
                        (float) $opening->amount;
                }

                if (
                    $opening->side === 'supplier'
                    && $canPurchases
                ) {
                    $positions[$partyId]['supplier_position'] +=
                        (float) $opening->amount;
                }
            });

        if ($canSales) {
            $this->documentTotals(
                $ids,
                'sale_invoice',
                'customer',
                $asOf,
            )->each(function (
                $amount,
                $partyId,
            ) use (&$positions): void {
                $positions[(int) $partyId]['customer_position'] +=
                    (float) $amount;
            });
        }

        if ($canPurchases) {
            $this->documentTotals(
                $ids,
                'purchase_invoice',
                'supplier',
                $asOf,
            )->each(function (
                $amount,
                $partyId,
            ) use (&$positions): void {
                $positions[(int) $partyId]['supplier_position'] +=
                    (float) $amount;
            });
        }

        if ($canCash) {
            $this->cashTotals(
                $ids,
                'customer',
                $asOf,
            )->each(function (
                $amount,
                $partyId,
            ) use (&$positions): void {
                $positions[(int) $partyId]['customer_position'] +=
                    (float) $amount;
            });

            $this->cashTotals(
                $ids,
                'supplier',
                $asOf,
            )->each(function (
                $amount,
                $partyId,
            ) use (&$positions): void {
                $positions[(int) $partyId]['supplier_position'] +=
                    (float) $amount;
            });
        }

        foreach ($positions as &$position) {
            $customer =
                (float) $position['customer_position'];

            $supplier =
                (float) $position['supplier_position'];

            /*
             * Keep the two obligations separate instead of netting them.
             * This is essential for dual-role Parties. A supplier advance can
             * coexist with customer credit and both sides remain visible.
             */
            $position['owed_to_us'] =
                max(
                    $customer,
                    0,
                )
                + max(
                    -$supplier,
                    0,
                );

            $position['we_owe'] =
                max(
                    $supplier,
                    0,
                )
                + max(
                    -$customer,
                    0,
                );
        }

        unset($position);

        return $positions;
    }

    /**
     * Sum invoice effects after the Party-side carried-balance cutoff.
     *
     * @param  list<int>  $partyIds
     * @return Collection<int|string, numeric-string|float|int>
     */
    private function documentTotals(
        array $partyIds,
        string $kind,
        string $side,
        Carbon $asOf,
    ): Collection {
        $query =
            FinancialDocument::query()
                ->whereIn(
                    'financial_documents.party_id',
                    $partyIds,
                )
                ->where(
                    'financial_documents.kind',
                    $kind,
                )
                ->whereIn(
                    'financial_documents.status',
                    [
                        'issued',
                        'partially_paid',
                        'paid',
                        'overpaid',
                    ],
                )
                ->whereDate(
                    'financial_documents.issue_date',
                    '<=',
                    $asOf->toDateString(),
                );

        $this->afterOpeningCutoff(
            $query,
            'financial_documents',
            'issue_date',
            $side,
        );

        return $query
            ->select(
                'financial_documents.party_id',
            )
            ->selectRaw(
                'SUM(financial_documents.total) as aggregate',
            )
            ->groupBy(
                'financial_documents.party_id',
            )
            ->pluck(
                'aggregate',
                'financial_documents.party_id',
            );
    }

    /**
     * Sum posted cash effects using the same side/sign semantics as the Party
     * account statement.
     *
     * @param  list<int>  $partyIds
     * @return Collection<int|string, numeric-string|float|int>
     */
    private function cashTotals(
        array $partyIds,
        string $side,
        Carbon $asOf,
    ): Collection {
        $query =
            CashMovement::query()
                ->whereIn(
                    'cash_movements.party_id',
                    $partyIds,
                )
                ->where(
                    'cash_movements.status',
                    'posted',
                )
                ->whereDate(
                    'cash_movements.movement_date',
                    '<=',
                    $asOf->toDateString(),
                )
                ->where(function (
                    Builder $query,
                ): void {
                    $query
                        ->where(
                            'cash_movements.method',
                            '!=',
                            'check',
                        )
                        ->orWhereNull(
                            'cash_movements.check_status',
                        )
                        ->orWhereNotIn(
                            'cash_movements.check_status',
                            [
                                'bounced',
                                'cancelled',
                            ],
                        );
                });

        if ($side === 'customer') {
            $query->where(function (
                Builder $query,
            ): void {
                $query
                    ->where(
                        'cash_movements.category',
                        'customer_receipt',
                    )
                    ->orWhere(function (
                        Builder $query,
                    ): void {
                        $query
                            ->where(
                                'cash_movements.category',
                                'refund',
                            )
                            ->where(
                                'cash_movements.direction',
                                'outgoing',
                            );
                    });
            });
        } else {
            $query->where(function (
                Builder $query,
            ): void {
                $query
                    ->where(
                        'cash_movements.category',
                        'supplier_payment',
                    )
                    ->orWhere(function (
                        Builder $query,
                    ): void {
                        $query
                            ->where(
                                'cash_movements.category',
                                'refund',
                            )
                            ->where(
                                'cash_movements.direction',
                                'incoming',
                            );
                    });
            });
        }

        $this->afterOpeningCutoff(
            $query,
            'cash_movements',
            'movement_date',
            $side,
        );

        $signedExpression =
            $side === 'customer'
                ? "SUM(CASE WHEN cash_movements.category = 'customer_receipt' AND cash_movements.direction = 'incoming' THEN -cash_movements.amount ELSE cash_movements.amount END) as aggregate"
                : "SUM(CASE WHEN cash_movements.category = 'supplier_payment' AND cash_movements.direction = 'outgoing' THEN -cash_movements.amount ELSE cash_movements.amount END) as aggregate";

        return $query
            ->select(
                'cash_movements.party_id',
            )
            ->selectRaw(
                $signedExpression,
            )
            ->groupBy(
                'cash_movements.party_id',
            )
            ->pluck(
                'aggregate',
                'cash_movements.party_id',
            );
    }

    /**
     * Exclude activity at or before a carried-balance cutoff.
     *
     * The correlated subqueries keep this portable across MySQL and SQLite
     * while allowing each Party to have a different customer/supplier cutoff.
     */
    private function afterOpeningCutoff(
        Builder $query,
        string $table,
        string $dateColumn,
        string $side,
    ): void {
        $query->where(function (
            Builder $query,
        ) use (
            $table,
            $dateColumn,
            $side,
        ): void {
            $query
                ->whereNotExists(function (
                    $subquery,
                ) use (
                    $table,
                    $side,
                ): void {
                    $subquery
                        ->selectRaw('1')
                        ->from(
                            'party_opening_balances as opening_cutoff',
                        )
                        ->whereColumn(
                            'opening_cutoff.organization_id',
                            $table.'.organization_id',
                        )
                        ->whereColumn(
                            'opening_cutoff.party_id',
                            $table.'.party_id',
                        )
                        ->where(
                            'opening_cutoff.side',
                            $side,
                        );
                })
                ->orWhereExists(function (
                    $subquery,
                ) use (
                    $table,
                    $dateColumn,
                    $side,
                ): void {
                    $subquery
                        ->selectRaw('1')
                        ->from(
                            'party_opening_balances as opening_cutoff',
                        )
                        ->whereColumn(
                            'opening_cutoff.organization_id',
                            $table.'.organization_id',
                        )
                        ->whereColumn(
                            'opening_cutoff.party_id',
                            $table.'.party_id',
                        )
                        ->where(
                            'opening_cutoff.side',
                            $side,
                        )
                        ->whereColumn(
                            $table.'.'.$dateColumn,
                            '>',
                            'opening_cutoff.as_of_date',
                        );
                });
        });
    }
}
