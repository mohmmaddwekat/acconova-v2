<?php

namespace App\Services\Parties;

use App\Models\CashAllocation;
use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyOpeningBalance;
use Carbon\Carbon;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * The collections view of one Party on one side (customer receivables or
 * supplier payables): what is outstanding, how much of it is not yet due or
 * already late, when the last payment arrived, and what is only promised or
 * still a pending cheque.
 *
 * It reads the same documents and cash movements as the finance ledger and
 * ends with a reconciliation against `PartyBalanceSummary`, so a difference
 * between this statement and finance is always visible instead of hidden.
 */
final class PartyCollectionsStatement
{
    public const SIDES = ['customer', 'supplier'];

    public function __construct(private readonly PartyBalanceSummary $balances) {}

    /**
     * @return array<string, mixed>
     */
    public function forParty(Party $party, string $side, ?CarbonImmutable $asOf = null): array
    {
        $asOf ??= CarbonImmutable::today();
        $kind = $side === 'customer' ? 'sale_invoice' : 'purchase_invoice';
        $opening = PartyOpeningBalance::query()->where('party_id', $party->id)->where('side', $side)->first();
        $cutoff = $opening?->as_of_date?->toDateString();

        $documents = FinancialDocument::query()
            ->where('party_id', $party->id)
            ->where('kind', $kind)
            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
            ->whereDate('issue_date', '<=', $asOf->toDateString())
            ->when($cutoff, fn ($query) => $query->whereDate('issue_date', '>', $cutoff))
            ->orderBy('due_date')
            ->orderBy('id')
            ->get();

        $allocations = CashAllocation::query()
            ->whereIn('financial_document_id', $documents->pluck('id'))
            ->with('movement')
            ->get()
            ->filter(fn (CashAllocation $allocation): bool => $this->counts($allocation->movement, $asOf))
            ->groupBy('financial_document_id');

        /*
         * Balances are rebuilt from the allocations that counted on the as-of
         * date, so a past statement does not show today's stored balance.
         */
        $position = $documents->mapWithKeys(function (FinancialDocument $document) use ($allocations): array {
            $paid = (float) $allocations->get($document->id, collect())->sum('amount');
            $total = (float) $document->total;

            return [$document->id => ['balance' => max($total - $paid, 0.0), 'credit' => max($paid - $total, 0.0)]];
        });

        $rows = $documents
            ->filter(fn (FinancialDocument $document): bool => $position[$document->id]['balance'] > 0.00005)
            ->map(fn (FinancialDocument $document): array => $this->documentRow($document, $allocations->get($document->id, collect()), $asOf, $position[$document->id]['balance']))
            ->values();

        $outstanding = (float) $rows->sum('balance_due');
        $overdue = (float) $rows->where('state', 'overdue')->sum('balance_due');

        $movements = $this->movements($party, $side, $asOf, $cutoff);
        $last = $movements->sortByDesc(fn (CashMovement $movement): string => $movement->movement_date->format('Y-m-d').'|'.str_pad((string) $movement->id, 12, '0', STR_PAD_LEFT))->first();
        $cheques = $this->cheques($movements, $party, $side, $asOf);

        return [
            'party_id' => $party->id,
            'side' => $side,
            'as_of' => $asOf->toDateString(),
            'currencies' => $documents->pluck('currency')->unique()->values()->all(),
            'summary' => [
                'outstanding' => $this->money($outstanding),
                'not_due' => $this->money($outstanding - $overdue),
                'overdue' => $this->money($overdue),
                'oldest_overdue_days' => (int) $rows->max('days_overdue'),
                'open_documents' => $rows->count(),
                'last_payment' => $last ? [
                    'date' => $last->movement_date->toDateString(),
                    'amount' => $this->money((float) $last->amount),
                    'method' => $last->method,
                    'cheque_status' => $last->method === 'check' ? $last->check_status : null,
                    'is_pending_cheque' => $this->isPendingCheque($last),
                ] : null,
                'days_since_last_payment' => $last ? (int) $last->movement_date->startOfDay()->diffInDays($asOf, false) : null,
            ],
            'aging' => $this->aging($rows),
            'documents' => $rows->all(),
            'partial_payments' => $rows->where('partially_paid', true)->values()->all(),
            'cheques' => $cheques,
            'promises' => $side === 'customer' ? $this->promises($party, $asOf) : [],
            'follow_ups' => $this->followUps($party, $asOf),
            'reconciliation' => $this->reconciliation($party, $side, $asOf, $opening, $position, $movements),
        ];
    }

    /**
     * @param  Collection<int, CashAllocation>  $allocations
     * @return array<string, mixed>
     */
    private function documentRow(FinancialDocument $document, Collection $allocations, CarbonImmutable $asOf, float $balance): array
    {
        $due = CarbonImmutable::parse(($document->due_date ?: $document->issue_date)->toDateString());
        $daysOverdue = $due->lt($asOf) ? (int) $due->diffInDays($asOf) : 0;
        $pending = (float) $allocations->filter(fn (CashAllocation $allocation): bool => $this->isPendingCheque($allocation->movement))->sum('amount');
        $paid = (float) $allocations->sum('amount');
        $lastPaid = $allocations->map(fn (CashAllocation $allocation) => $allocation->movement->movement_date)->max();

        return [
            'id' => $document->id,
            'number' => $document->number,
            'issue_date' => $document->issue_date->toDateString(),
            'due_date' => $due->toDateString(),
            'total' => $this->money((float) $document->total),
            'paid_total' => $this->money($paid),
            'cleared_paid' => $this->money($paid - $pending),
            'pending_cheque_paid' => $this->money($pending),
            'balance_due' => $this->money($balance),
            'balance_if_cheques_bounce' => $this->money($balance + $pending),
            'days_overdue' => $daysOverdue,
            'state' => $due->gt($asOf) ? 'not_due' : ($due->eq($asOf) ? 'due_today' : 'overdue'),
            'partially_paid' => $paid > 0 && $balance > 0,
            'last_payment_on' => $lastPaid?->toDateString(),
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $rows
     * @return array<string, string>
     */
    private function aging(Collection $rows): array
    {
        $buckets = ['not_due' => 0.0, 'days_1_30' => 0.0, 'days_31_60' => 0.0, 'days_61_90' => 0.0, 'over_90' => 0.0];

        foreach ($rows as $row) {
            $days = $row['days_overdue'];
            $key = match (true) {
                $days <= 0 => 'not_due',
                $days <= 30 => 'days_1_30',
                $days <= 60 => 'days_31_60',
                $days <= 90 => 'days_61_90',
                default => 'over_90',
            };
            $buckets[$key] += (float) $row['balance_due'];
        }

        return array_map(fn (float $value): string => $this->money($value), $buckets);
    }

    /**
     * Posted receipts (customer) or payments (supplier) that still count for
     * the ledger, with refunds kept apart by the caller.
     *
     * @return Collection<int, CashMovement>
     */
    private function movements(Party $party, string $side, CarbonImmutable $asOf, ?string $cutoff): Collection
    {
        $category = $side === 'customer' ? 'customer_receipt' : 'supplier_payment';

        return CashMovement::query()
            ->where('party_id', $party->id)
            ->where('status', 'posted')
            ->whereIn('category', [$category, 'refund'])
            ->whereDate('movement_date', '<=', $asOf->toDateString())
            ->when($cutoff, fn ($query) => $query->whereDate('movement_date', '>', $cutoff))
            ->withSum('allocations as allocated_total', 'amount')
            ->get()
            ->filter(fn (CashMovement $movement): bool => $this->counts($movement, $asOf));
    }

    /**
     * Cash that is collected versus cheques still in hand. Pending cheques
     * reduce the ledger balance like cash, so they are listed explicitly.
     *
     * @param  Collection<int, CashMovement>  $movements
     * @return array<string, mixed>
     */
    private function cheques(Collection $movements, Party $party, string $side, CarbonImmutable $asOf): array
    {
        $category = $side === 'customer' ? 'customer_receipt' : 'supplier_payment';
        $pending = $movements->filter(fn (CashMovement $movement): bool => $movement->category === $category && $this->isPendingCheque($movement))->values();
        $bounced = CashMovement::query()
            ->where('party_id', $party->id)
            ->where('category', $category)
            ->where('method', 'check')
            ->where('check_status', 'bounced')
            ->whereDate('movement_date', '<=', $asOf->toDateString())
            ->get();
        $received = $movements->filter(fn (CashMovement $movement): bool => $movement->category === $category && ! $this->isPendingCheque($movement));

        return [
            'cash_collected' => $this->money((float) $received->sum('amount')),
            'pending_total' => $this->money((float) $pending->sum('amount')),
            'pending_count' => $pending->count(),
            'bounced_total' => $this->money((float) $bounced->sum('amount')),
            'pending' => $pending->map(fn (CashMovement $movement): array => [
                'movement_id' => $movement->id,
                'number' => $movement->number,
                'check_number' => $movement->check_number,
                'bank' => $movement->check_bank,
                'amount' => $this->money((float) $movement->amount),
                'received_on' => $movement->movement_date->toDateString(),
                'due_date' => $movement->check_due_date?->toDateString(),
                'days_to_due' => $movement->check_due_date ? (int) $asOf->diffInDays($movement->check_due_date->startOfDay(), false) : null,
            ])->all(),
        ];
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function promises(Party $party, CarbonImmutable $asOf): array
    {
        return DB::table('payment_promises')
            ->where('organization_id', $party->organization_id)
            ->where('party_id', $party->id)
            ->whereIn('status', ['open', 'missed'])
            ->orderBy('promised_on')
            ->get()
            ->map(fn (object $promise): array => [
                'id' => $promise->id,
                'document_id' => $promise->financial_document_id,
                'promised_on' => $promise->promised_on,
                'amount' => $this->money((float) $promise->amount),
                'status' => $promise->status,
                'late' => $promise->promised_on < $asOf->toDateString(),
                'note' => $promise->note,
            ])
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function followUps(Party $party, CarbonImmutable $asOf): array
    {
        return DB::table('record_reminders')
            ->where('organization_id', $party->organization_id)
            ->where('record_type', 'party')
            ->where('record_id', $party->id)
            ->orderByRaw('completed_at IS NOT NULL')
            ->orderBy('due_at')
            ->limit(15)
            ->get()
            ->map(fn (object $reminder): array => [
                'id' => $reminder->id,
                'note' => $reminder->note,
                'due_at' => $reminder->due_at,
                'owner_id' => $reminder->user_id,
                'completed' => $reminder->completed_at !== null,
                'overdue' => $reminder->completed_at === null && substr((string) $reminder->due_at, 0, 10) < $asOf->toDateString(),
            ])
            ->all();
    }

    /**
     * Rebuilds the ledger position from the documents view and compares it
     * with the finance ledger. A non-zero difference is reported, not hidden.
     *
     * @param  Collection<int, array{balance: float, credit: float}>  $position
     * @param  Collection<int, CashMovement>  $movements
     * @return array<string, mixed>
     */
    private function reconciliation(Party $party, string $side, CarbonImmutable $asOf, ?PartyOpeningBalance $opening, Collection $position, Collection $movements): array
    {
        $ledger = $this->balances->forParties(
            collect([$party]),
            $side === 'customer',
            $side === 'supplier',
            true,
            Carbon::parse($asOf->endOfDay()->toDateTimeString()),
        )[$party->id][$side.'_position'] ?? 0.0;

        $balanceDue = (float) $position->sum('balance');
        $credits = (float) $position->sum('credit');
        $unapplied = (float) $movements
            ->filter(fn (CashMovement $movement): bool => $movement->category !== 'refund')
            ->sum(fn (CashMovement $movement): float => max((float) $movement->amount - (float) ($movement->allocated_total ?? 0), 0));
        $refunds = (float) $movements->filter(fn (CashMovement $movement): bool => $movement->category === 'refund')->sum('amount');
        $settlements = (float) DB::table('party_settlements')
            ->where('organization_id', $party->organization_id)
            ->where('party_id', $party->id)
            ->where('status', 'posted')
            ->whereDate('settlement_date', '<=', $asOf->toDateString())
            ->sum('amount');
        $openingAmount = (float) ($opening?->amount ?? 0);

        $expected = $openingAmount + $balanceDue - $credits - $unapplied + $refunds - $settlements;
        $difference = $ledger - $expected;

        return [
            'opening_balance' => $this->money($openingAmount),
            'documents_outstanding' => $this->money($balanceDue),
            'overpayment_credits' => $this->money($credits),
            'unapplied_receipts' => $this->money($unapplied),
            'refunds' => $this->money($refunds),
            'settlements' => $this->money($settlements),
            'expected_position' => $this->money($expected),
            'ledger_position' => $this->money((float) $ledger),
            'difference' => $this->money($difference),
            'reconciled' => abs($difference) < 0.00005,
        ];
    }

    /**
     * A movement counts for the ledger when it is posted, not after the
     * as-of date and not a bounced or cancelled cheque.
     */
    private function counts(?CashMovement $movement, CarbonImmutable $asOf): bool
    {
        if ($movement === null || $movement->status !== 'posted' || $movement->movement_date->toDateString() > $asOf->toDateString()) {
            return false;
        }

        return ! ($movement->method === 'check' && in_array($movement->check_status, ['bounced', 'cancelled'], true));
    }

    private function isPendingCheque(?CashMovement $movement): bool
    {
        return $movement !== null && $movement->method === 'check' && $movement->check_status === 'pending';
    }

    private function money(float $value): string
    {
        return number_format($value, 4, '.', '');
    }
}
