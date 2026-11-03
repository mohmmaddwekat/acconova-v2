<?php

namespace App\Services\Finance;

use App\Models\CashMovement;
use App\Models\FinancialDocument;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Plans and applies bulk allocation of customer receipts and supplier
 * payments onto open invoices.
 *
 * For every cash movement the plan starts with invoices dated on or before the
 * movement date (nearest first, then older and older) and optionally continues
 * with newer invoices. The same movement, invoice and currency rules that
 * apply to a manual allocation are enforced by CashMovementService.
 */
class AutoAllocationService
{
    private const EPSILON = 0.00005;

    public function __construct(
        private readonly CashMovementService $cashMovements,
    ) {}

    /**
     * @return Collection<int, CashMovement>
     */
    public function eligibleMovements(?string $kind = null, ?array $ids = null): Collection
    {
        $query = CashMovement::query()
            ->with('party')
            ->withSum('allocations as allocated_total', 'amount')
            ->where('status', 'posted')
            ->whereNull('reversal_of_id')
            ->where(function ($query) use ($kind): void {
                if ($kind !== 'purchase') {
                    $query->orWhere(function ($sale): void {
                        $sale->where('direction', 'incoming')
                            ->where('category', 'customer_receipt');
                    });
                }

                if ($kind !== 'sale') {
                    $query->orWhere(function ($purchase): void {
                        $purchase->where('direction', 'outgoing')
                            ->where('category', 'supplier_payment');
                    });
                }
            })
            ->where(function ($query): void {
                $query->where('method', '!=', 'check')
                    ->orWhereNull('check_status')
                    ->orWhereNotIn('check_status', ['bounced', 'cancelled']);
            })
            ->orderBy('movement_date')
            ->orderBy('id');

        if ($ids !== null) {
            $query->whereIn('id', $ids);
        }

        return $query->get()->filter(
            fn (CashMovement $movement): bool => $this->unallocated($movement) > self::EPSILON,
        )->values();
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function movementRows(?string $kind = null): array
    {
        return $this->eligibleMovements($kind)
            ->sortByDesc(fn (CashMovement $movement): string => $movement->movement_date->toDateString().'-'.str_pad((string) $movement->id, 12, '0', STR_PAD_LEFT))
            ->map(fn (CashMovement $movement): array => $this->movementRow($movement))
            ->values()
            ->all();
    }

    /**
     * @param  list<int>|null  $movementIds
     * @return list<array<string, mixed>>
     */
    public function plan(?array $movementIds, ?string $kind, bool $continueNewer): array
    {
        $movements = $this->eligibleMovements($kind, $movementIds);

        $partyIds = $movements->pluck('party_id')->filter()->unique()->all();

        $documents = $partyIds === []
            ? collect()
            : FinancialDocument::query()
                ->whereIn('party_id', $partyIds)
                ->whereIn('kind', ['sale_invoice', 'purchase_invoice'])
                ->whereIn('status', ['issued', 'partially_paid'])
                ->where('balance_due', '>', 0)
                ->orderBy('issue_date')
                ->orderBy('id')
                ->toBase()
                ->get(['id', 'party_id', 'kind', 'currency', 'number', 'issue_date', 'total', 'balance_due']);

        $balances = [];
        /** @var array<string, list<array{id: int, number: string, issue_date: string, total: float}>> $ascending */
        $ascending = [];

        foreach ($documents as $document) {
            $balances[$document->id] = (float) $document->balance_due;
            $ascending[$document->party_id.'|'.$document->kind.'|'.$document->currency][] = [
                'id' => (int) $document->id,
                'number' => (string) $document->number,
                'issue_date' => substr((string) $document->issue_date, 0, 10),
                'total' => (float) $document->total,
            ];
        }

        $descending = array_map('array_reverse', $ascending);

        $results = [];

        foreach ($movements as $movement) {
            $unallocated = round($this->unallocated($movement), 4);
            $result = [
                'movement' => $this->movementRow($movement),
                'lines' => [],
                'remaining' => $unallocated,
                'warning' => null,
            ];

            if (! $movement->party_id) {
                $result['warning'] = 'no_party';
                $results[] = $this->formatResult($result);

                continue;
            }

            $kindOfDocument = $movement->direction === 'incoming' ? 'sale_invoice' : 'purchase_invoice';

            $groupKey = $movement->party_id.'|'.$kindOfDocument.'|'.$movement->currency;
            $date = $movement->movement_date->toDateString();

            /*
             * Nearest older invoices first, then (optionally) the oldest newer
             * invoices. Each group is pre-sorted once, so a movement only walks
             * its own party's invoices.
             */
            $walk = [
                ...array_filter($descending[$groupKey] ?? [], fn (array $document): bool => $document['issue_date'] <= $date),
                ...($continueNewer
                    ? array_filter($ascending[$groupKey] ?? [], fn (array $document): bool => $document['issue_date'] > $date)
                    : []),
            ];

            foreach ($walk as $document) {
                if ($result['remaining'] <= self::EPSILON) {
                    break;
                }

                $before = $balances[$document['id']];

                if ($before <= self::EPSILON) {
                    continue;
                }

                $amount = round(min($result['remaining'], $before), 4);

                $result['lines'][] = [
                    'document_id' => $document['id'],
                    'number' => $document['number'],
                    'issue_date' => $document['issue_date'],
                    'total' => $document['total'],
                    'balance_before' => $before,
                    'amount' => $amount,
                    'full' => $amount >= $before - self::EPSILON,
                ];

                $balances[$document['id']] = round($before - $amount, 4);
                $result['remaining'] = round($result['remaining'] - $amount, 4);
            }

            $hasCandidates = $result['lines'] !== []
                || array_filter($ascending[$groupKey] ?? [], fn (array $document): bool => $balances[$document['id']] > self::EPSILON) !== [];

            if (! $hasCandidates) {
                $result['warning'] = 'no_open_invoices';
            } elseif ($result['remaining'] > self::EPSILON) {
                $result['warning'] = 'advance_left';
            }

            $results[] = $this->formatResult($result);
        }

        return $results;
    }

    /**
     * Applies a previously computed plan inside one transaction. Every line is
     * re-validated and locked by CashMovementService, so a stale plan fails the
     * whole batch instead of leaving it half applied.
     *
     * @param  list<array<string, mixed>>  $plan
     * @return array{movements: int, lines: int, allocated: string, advance_left: string}
     */
    public function apply(array $plan, int $actorId): array
    {
        return DB::transaction(function () use ($plan, $actorId): array {
            $movements = 0;
            $lines = 0;
            $allocated = 0.0;
            $advance = 0.0;

            foreach ($plan as $result) {
                if ($result['lines'] === []) {
                    continue;
                }

                $movement = CashMovement::query()->findOrFail($result['movement']['id']);
                $movements++;

                foreach ($result['lines'] as $line) {
                    $document = FinancialDocument::query()->findOrFail($line['document_id']);

                    $this->cashMovements->applyAvailableCredit(
                        $movement,
                        $document,
                        $line['amount'],
                        $actorId,
                    );

                    $lines++;
                    $allocated += (float) $line['amount'];
                }

                if ($result['movement']['party_id']) {
                    $advance += (float) $result['remaining'];
                }
            }

            return [
                'movements' => $movements,
                'lines' => $lines,
                'allocated' => number_format($allocated, 4, '.', ''),
                'advance_left' => number_format($advance, 4, '.', ''),
            ];
        });
    }

    private function unallocated(CashMovement $movement): float
    {
        return (float) $movement->amount - (float) ($movement->allocated_total ?? 0);
    }

    /**
     * @return array<string, mixed>
     */
    private function movementRow(CashMovement $movement): array
    {
        $unallocated = $this->unallocated($movement);

        return [
            'id' => $movement->id,
            'number' => $movement->number,
            'kind' => $movement->direction === 'incoming' ? 'sale' : 'purchase',
            'date' => $movement->movement_date->toDateString(),
            'party_id' => $movement->party_id,
            'party' => $movement->party?->company_name ?: $movement->party?->name,
            'amount' => number_format((float) $movement->amount, 4, '.', ''),
            'unallocated' => number_format($unallocated, 4, '.', ''),
            'currency' => $movement->currency,
            'method' => $movement->method,
            'url' => '/app/'.($movement->direction === 'incoming' ? 'receipts' : 'payments').'/'.$movement->id,
        ];
    }

    /**
     * @param  array<string, mixed>  $result
     * @return array<string, mixed>
     */
    private function formatResult(array $result): array
    {
        $result['remaining'] = number_format($result['remaining'], 4, '.', '');
        $result['lines'] = array_map(
            fn (array $line): array => [
                ...$line,
                'total' => number_format($line['total'], 4, '.', ''),
                'balance_before' => number_format($line['balance_before'], 4, '.', ''),
                'amount' => number_format($line['amount'], 4, '.', ''),
            ],
            $result['lines'],
        );

        return $result;
    }
}
