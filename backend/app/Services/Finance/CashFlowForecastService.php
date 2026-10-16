<?php

namespace App\Services\Finance;

use App\Models\CashMovement;
use App\Models\FinancialDocument;
use App\Models\GovernmentObligation;
use App\Models\Party;
use App\Models\PaymentPlan;
use App\Services\Credit\CreditRecommendationService;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * A dated cash forecast that keeps three kinds of money apart:
 *
 * - confirmed: cleared cash today, and obligations that are certain to leave;
 * - expected: customer invoices and promises, weighted by how reliably that
 *   customer has paid, and dated by how late they usually pay;
 * - pending cheques: cheques in hand (or issued) that have not cleared.
 *
 * A promise or a cheque in hand is never counted as confirmed cash. A second
 * scenario delays every expected receipt to show the effect of late collection.
 */
final class CashFlowForecastService
{
    public const DEFAULT_RELIABILITY = 0.5;

    public const CHEQUE_PROBABILITY = 0.85;

    public const CHEQUE_PROBABILITY_AFTER_BOUNCE = 0.4;

    public function __construct(private readonly CreditRecommendationService $credit) {}

    /**
     * @return array<string, mixed>
     */
    public function forecast(int $horizonDays = 60, int $delayDays = 30, ?string $currency = null, ?CarbonImmutable $today = null): array
    {
        $today ??= CarbonImmutable::today();
        $horizonDays = max(7, min(180, $horizonDays));
        $delayDays = max(0, min(120, $delayDays));
        $currency = strtoupper($currency ?: $this->baseCurrency());
        $end = $today->addDays($horizonDays);

        $opening = $this->openingCash($currency, $today);
        $reliability = [];
        $items = [
            ...$this->customerInvoices($currency, $today, $reliability),
            ...$this->promises($currency, $today, $reliability),
            ...$this->cheques($currency, $today),
            ...$this->supplierInvoices($currency, $today),
            ...$this->obligations($currency, $today),
            ...$this->recurring($currency, $today, $end),
        ];

        $items = collect($items)->sortBy([['date', 'asc'], ['kind', 'asc']])->values();
        $inside = $items->filter(fn (array $item): bool => $item['date'] <= $end->toDateString())->values();
        $beyond = $items->count() - $inside->count();

        $timeline = $this->timeline($opening, $inside, $today, $end, $delayDays);

        return [
            'as_of' => $today->toDateString(),
            'horizon_days' => $horizonDays,
            'currency' => $currency,
            'delay_days' => $delayDays,
            'opening' => [
                'confirmed_cash' => $this->money($opening['cash']),
                'excluded_pending_cheques_in' => $this->money($opening['pending_in']),
                'excluded_pending_cheques_out' => $this->money($opening['pending_out']),
            ],
            'totals' => $this->totals($inside, $opening['cash']),
            'timeline' => $timeline['buckets'],
            'scenarios' => $timeline['scenarios'],
            'items' => $inside->map(fn (array $item): array => $this->present($item))->all(),
            'beyond_horizon_items' => $beyond,
            'assumptions' => $this->assumptions($delayDays),
        ];
    }

    /**
     * Cash that has actually cleared. Cheques not yet cleared stay out, both
     * those received and those we issued.
     *
     * @return array{cash: float, pending_in: float, pending_out: float}
     */
    private function openingCash(string $currency, CarbonImmutable $today): array
    {
        $movements = CashMovement::query()
            ->where('status', 'posted')
            ->where('currency', $currency)
            ->whereDate('movement_date', '<=', $today->toDateString())
            ->get(['direction', 'amount', 'method', 'check_status']);

        $cash = 0.0;
        $pendingIn = 0.0;
        $pendingOut = 0.0;

        foreach ($movements as $movement) {
            $sign = $movement->direction === 'incoming' ? 1 : -1;
            $amount = (float) $movement->amount;

            if ($movement->method === 'check' && $movement->check_status === 'pending') {
                $movement->direction === 'incoming' ? $pendingIn += $amount : $pendingOut += $amount;

                continue;
            }

            if ($movement->method === 'check' && in_array($movement->check_status, ['bounced', 'cancelled'], true)) {
                continue;
            }

            $cash += $sign * $amount;
        }

        return ['cash' => $cash, 'pending_in' => $pendingIn, 'pending_out' => $pendingOut];
    }

    /**
     * Open sales balances. A cheque in hand is already inside the finance
     * balance, so it appears only under pending cheques, never twice.
     *
     * @param  array<int, array{probability: float, avg_days_late: int, known: bool, note: string}>  $reliability
     * @return list<array<string, mixed>>
     */
    private function customerInvoices(string $currency, CarbonImmutable $today, array &$reliability): array
    {
        $promised = $this->openPromises($currency, $today)->groupBy('financial_document_id')->map(fn (Collection $rows): float => (float) $rows->sum('amount'));

        return FinancialDocument::query()
            ->with('party:id,company_name,name')
            ->where('kind', 'sale_invoice')
            ->whereIn('status', ['issued', 'partially_paid'])
            ->where('currency', $currency)
            ->where('balance_due', '>', 0)
            ->get()
            ->map(function (FinancialDocument $document) use ($today, &$reliability, $promised): ?array {
                $remaining = (float) $document->balance_due - min((float) $document->balance_due, (float) ($promised[$document->id] ?? 0));

                if ($remaining <= 0.00005) {
                    return null;
                }

                $profile = $this->reliability((int) $document->party_id, $reliability, $today);
                $due = $document->due_date ? CarbonImmutable::parse($document->due_date) : CarbonImmutable::parse($document->issue_date);
                $daysLate = max(0, (int) $due->diffInDays($today, false));
                $factor = $daysLate > 90 ? 0.5 : ($daysLate > 30 ? 0.75 : 1.0);
                $expected = $due->addDays($profile['avg_days_late']);
                $expected = $expected->lessThanOrEqualTo($today) ? $today->addDay() : $expected;

                return [
                    'layer' => 'expected', 'kind' => 'customer_invoice', 'direction' => 'in',
                    'label' => $this->partyName($document->party).' · '.($document->number ?? '#'.$document->id),
                    'party_id' => (int) $document->party_id,
                    'amount' => $remaining, 'probability' => round($profile['probability'] * $factor, 2),
                    'date' => $expected->toDateString(), 'contractual_date' => $due->toDateString(),
                    'days_late' => $daysLate, 'basis' => $profile['note'],
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * Promises still in the future. A missed promise is not counted as a
     * promise: its amount stays on the invoice at the invoice's own odds.
     *
     * @param  array<int, array{probability: float, avg_days_late: int, known: bool, note: string}>  $reliability
     * @return list<array<string, mixed>>
     */
    private function promises(string $currency, CarbonImmutable $today, array &$reliability): array
    {
        return $this->openPromises($currency, $today)
            ->map(function (object $promise) use ($today, &$reliability): array {
                $profile = $this->reliability((int) $promise->party_id, $reliability, $today);

                return [
                    'layer' => 'expected', 'kind' => 'promise', 'direction' => 'in',
                    'label' => $this->partyName(Party::query()->find($promise->party_id)).' · promise',
                    'party_id' => (int) $promise->party_id,
                    'amount' => (float) $promise->amount,
                    'probability' => round(max(0.3, min(0.9, $profile['probability'])), 2),
                    'date' => $promise->promised_on, 'contractual_date' => $promise->promised_on,
                    'days_late' => 0, 'basis' => 'A promise is not cash: weighted by '.$profile['note'],
                ];
            })
            ->values()
            ->all();
    }

    /**
     * @return Collection<int, object>
     */
    private function openPromises(string $currency, CarbonImmutable $today): Collection
    {
        return DB::table('payment_promises')
            ->join('financial_documents', 'financial_documents.id', '=', 'payment_promises.financial_document_id')
            ->where('payment_promises.organization_id', app(TenantContext::class)->id())
            ->where('payment_promises.status', 'open')
            ->where('payment_promises.promised_on', '>=', $today->toDateString())
            ->where('financial_documents.currency', $currency)
            ->get(['payment_promises.id', 'payment_promises.party_id', 'payment_promises.financial_document_id', 'payment_promises.amount', 'payment_promises.promised_on']);
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function cheques(string $currency, CarbonImmutable $today): array
    {
        return CashMovement::query()
            ->where('status', 'posted')
            ->where('method', 'check')
            ->where('check_status', 'pending')
            ->where('currency', $currency)
            ->get()
            ->map(function (CashMovement $movement) use ($today): array {
                $incoming = $movement->direction === 'incoming';
                $bounced = $incoming && $movement->party_id !== null
                    && CashMovement::query()->where('party_id', $movement->party_id)->where('method', 'check')->where('check_status', 'bounced')->exists();
                $date = $movement->check_due_date ? CarbonImmutable::parse($movement->check_due_date) : $today;

                return [
                    'layer' => 'pending_cheque', 'kind' => $incoming ? 'cheque_in' : 'cheque_out', 'direction' => $incoming ? 'in' : 'out',
                    'label' => 'Cheque '.($movement->check_number ?: '#'.$movement->id),
                    'party_id' => $movement->party_id,
                    'amount' => (float) $movement->amount,
                    'probability' => $incoming ? ($bounced ? self::CHEQUE_PROBABILITY_AFTER_BOUNCE : self::CHEQUE_PROBABILITY) : 1.0,
                    'date' => ($date->lessThan($today) ? $today : $date)->toDateString(), 'contractual_date' => $date->toDateString(),
                    'days_late' => 0,
                    'basis' => $incoming
                        ? ($bounced ? 'Cheque in hand, not cleared; this customer has bounced a cheque before.' : 'Cheque in hand, not cleared: not cash until it clears.')
                        : 'Cheque we issued; leaves the bank on its due date.',
                ];
            })
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function supplierInvoices(string $currency, CarbonImmutable $today): array
    {
        return FinancialDocument::query()
            ->with('party:id,company_name,name')
            ->where('kind', 'purchase_invoice')
            ->whereIn('status', ['issued', 'partially_paid'])
            ->where('currency', $currency)
            ->where('balance_due', '>', 0)
            ->get()
            ->map(function (FinancialDocument $document) use ($today): array {
                $due = $document->due_date ? CarbonImmutable::parse($document->due_date) : CarbonImmutable::parse($document->issue_date);

                return [
                    'layer' => 'confirmed', 'kind' => 'supplier_invoice', 'direction' => 'out',
                    'label' => $this->partyName($document->party).' · '.($document->number ?? '#'.$document->id),
                    'party_id' => (int) $document->party_id, 'document_id' => (int) $document->id,
                    'amount' => (float) $document->balance_due, 'probability' => 1.0,
                    'date' => ($due->lessThan($today) ? $today : $due)->toDateString(), 'contractual_date' => $due->toDateString(),
                    'days_late' => max(0, (int) $due->diffInDays($today, false)),
                    'basis' => $due->lessThan($today) ? 'Already overdue: assumed payable now.' : 'Due date of the supplier invoice.',
                ];
            })
            ->all();
    }

    /**
     * @return list<array<string, mixed>>
     */
    private function obligations(string $currency, CarbonImmutable $today): array
    {
        return GovernmentObligation::query()
            ->where('currency', $currency)
            ->where('balance_due', '>', 0)
            ->whereNotIn('status', ['paid', 'cancelled'])
            ->get()
            ->map(function (GovernmentObligation $obligation) use ($today): array {
                $due = CarbonImmutable::parse($obligation->due_date);

                return [
                    'layer' => 'confirmed', 'kind' => 'government_obligation', 'direction' => 'out',
                    'label' => $obligation->title ?: $obligation->authority_name,
                    'party_id' => null,
                    'amount' => (float) $obligation->balance_due, 'probability' => 1.0,
                    'date' => ($due->lessThan($today) ? $today : $due)->toDateString(), 'contractual_date' => $due->toDateString(),
                    'days_late' => max(0, (int) $due->diffInDays($today, false)),
                    'basis' => 'Statutory obligation with a due date.',
                ];
            })
            ->all();
    }

    /**
     * Recurring payments expanded over the horizon. Outgoing ones are
     * commitments; incoming ones are expected, never confirmed.
     *
     * @return list<array<string, mixed>>
     */
    private function recurring(string $currency, CarbonImmutable $today, CarbonImmutable $end): array
    {
        $rows = [];

        foreach (PaymentPlan::query()->where('active', true)->where('currency', $currency)->get() as $plan) {
            $date = CarbonImmutable::parse($plan->next_due_on);
            $step = max(1, (int) ($plan->interval_count ?: 1));
            $guard = 0;

            while ($date->lessThanOrEqualTo($end) && $guard++ < 400) {
                if ($date->greaterThanOrEqualTo($today)) {
                    $outgoing = $plan->direction === 'outgoing';
                    $rows[] = [
                        'layer' => $outgoing ? 'confirmed' : 'expected', 'kind' => $outgoing ? 'recurring_out' : 'recurring_in', 'direction' => $outgoing ? 'out' : 'in',
                        'label' => $plan->title, 'party_id' => null,
                        'amount' => (float) $plan->amount, 'probability' => $outgoing ? 1.0 : 0.8,
                        'date' => $date->toDateString(), 'contractual_date' => $date->toDateString(),
                        'days_late' => 0, 'basis' => 'Recurring payment ('.$plan->frequency.').',
                    ];
                }

                $next = match ($plan->frequency) {
                    'daily' => $date->addDays($step),
                    'weekly' => $date->addWeeks($step),
                    'monthly' => $date->addMonthsNoOverflow($step),
                    'yearly' => $date->addYears($step),
                    default => null,
                };

                if ($next === null) {
                    break;
                }

                $date = $next;
            }
        }

        return $rows;
    }

    /**
     * @param  array<int, array{probability: float, avg_days_late: int, known: bool, note: string}>  $cache
     * @return array{probability: float, avg_days_late: int, known: bool, note: string}
     */
    private function reliability(int $partyId, array &$cache, CarbonImmutable $today): array
    {
        if (isset($cache[$partyId])) {
            return $cache[$partyId];
        }

        $party = Party::query()->find($partyId);
        $assessment = $party ? $this->credit->assess($party, $today) : null;
        $ratio = $assessment['data']['on_time_ratio'] ?? null;

        if ($assessment === null || $ratio === null || ! $assessment['sufficiency']['enough']) {
            return $cache[$partyId] = [
                'probability' => self::DEFAULT_RELIABILITY, 'avg_days_late' => 0, 'known' => false,
                'note' => 'not enough payment history, so a neutral '.(int) (self::DEFAULT_RELIABILITY * 100).'% is assumed',
            ];
        }

        return $cache[$partyId] = [
            'probability' => max(0.2, min(0.95, (float) $ratio)),
            'avg_days_late' => max(0, (int) round((float) ($assessment['data']['avg_days_late'] ?? 0))),
            'known' => true,
            'note' => 'paid '.(int) round($ratio * 100).'% of past invoices on time, averaging '.(int) round((float) ($assessment['data']['avg_days_late'] ?? 0)).' days late',
        ];
    }

    /**
     * @param  array{cash: float, pending_in: float, pending_out: float}  $opening
     * @param  Collection<int, array<string, mixed>>  $items
     * @return array{buckets: list<array<string, mixed>>, scenarios: array<string, mixed>}
     */
    private function timeline(array $opening, Collection $items, CarbonImmutable $today, CarbonImmutable $end, int $delayDays): array
    {
        $buckets = [];
        $confirmed = $opening['cash'];
        $expected = $opening['cash'];
        $delayed = $opening['cash'];
        $low = ['confirmed' => null, 'expected' => null, 'delayed' => null];
        $firstGap = ['confirmed' => null, 'expected' => null, 'delayed' => null];

        for ($start = $today; $start->lessThan($end); $start = $start->addDays(7)) {
            $stop = $start->addDays(6)->min($end);
            $within = fn (array $item, int $shift = 0): bool => CarbonImmutable::parse($item['date'])->addDays($shift)->betweenIncluded($start, $stop)
                || ($start->equalTo($today) && CarbonImmutable::parse($item['date'])->addDays($shift)->lessThan($today));

            $row = ['confirmed_out' => 0.0, 'expected_in' => 0.0, 'expected_out' => 0.0, 'cheques_in' => 0.0, 'cheques_out' => 0.0, 'delayed_in' => 0.0];

            foreach ($items as $item) {
                $weighted = $item['amount'] * $item['probability'];

                if ($within($item)) {
                    match (true) {
                        $item['layer'] === 'confirmed' => $row['confirmed_out'] += $item['amount'],
                        $item['layer'] === 'pending_cheque' && $item['direction'] === 'in' => $row['cheques_in'] += $weighted,
                        $item['layer'] === 'pending_cheque' => $row['cheques_out'] += $item['amount'],
                        default => $row['expected_in'] += $weighted,
                    };
                }

                if ($item['direction'] === 'in' && $item['layer'] !== 'confirmed' && $within($item, $delayDays)) {
                    $row['delayed_in'] += $weighted;
                }
            }

            $outflow = $row['confirmed_out'] + $row['cheques_out'];
            $confirmed -= $outflow;
            $expected += $row['expected_in'] + $row['cheques_in'] - $outflow;
            $delayed += $row['delayed_in'] - $outflow;

            foreach (['confirmed' => $confirmed, 'expected' => $expected, 'delayed' => $delayed] as $name => $balance) {
                $low[$name] = $low[$name] === null ? $balance : min($low[$name], $balance);
                $firstGap[$name] ??= $balance < 0 ? $stop->toDateString() : null;
            }

            $buckets[] = [
                'from' => $start->toDateString(), 'to' => $stop->toDateString(),
                'confirmed_outflows' => $this->money($outflow),
                'expected_receipts' => $this->money($row['expected_in']),
                'pending_cheque_receipts' => $this->money($row['cheques_in']),
                'confirmed_balance' => $this->money($confirmed),
                'expected_balance' => $this->money($expected),
                'late_collection_balance' => $this->money($delayed),
            ];
        }

        $scenario = fn (string $key, float $final, string $description): array => [
            'description' => $description,
            'ending_balance' => $this->money($final),
            'lowest_balance' => $this->money((float) $low[$key]),
            'first_negative_week_ending' => $firstGap[$key],
        ];

        return [
            'buckets' => $buckets,
            'scenarios' => [
                'confirmed_only' => $scenario('confirmed', $confirmed, 'Cleared cash minus every certain outflow; no receipt is assumed.'),
                'expected' => $scenario('expected', $expected, 'Adds weighted customer receipts, promises and cheques on their expected dates.'),
                'late_collection' => $scenario('delayed', $delayed, "Same as expected, but every receipt arrives {$delayDays} days later."),
            ],
        ];
    }

    /**
     * @param  Collection<int, array<string, mixed>>  $items
     * @return array<string, mixed>
     */
    private function totals(Collection $items, float $cash): array
    {
        $sum = fn (callable $filter, bool $weighted = false): float => (float) $items->filter($filter)->sum(fn (array $item): float => $item['amount'] * ($weighted ? $item['probability'] : 1));

        return [
            'confirmed' => [
                'cash_today' => $this->money($cash),
                'outflows' => $this->money($sum(fn (array $item): bool => $item['layer'] === 'confirmed')),
            ],
            'expected' => [
                'gross_receipts' => $this->money($sum(fn (array $item): bool => $item['layer'] === 'expected' && $item['direction'] === 'in')),
                'weighted_receipts' => $this->money($sum(fn (array $item): bool => $item['layer'] === 'expected' && $item['direction'] === 'in', true)),
            ],
            'pending_cheques' => [
                'receivable_gross' => $this->money($sum(fn (array $item): bool => $item['kind'] === 'cheque_in')),
                'receivable_weighted' => $this->money($sum(fn (array $item): bool => $item['kind'] === 'cheque_in', true)),
                'payable' => $this->money($sum(fn (array $item): bool => $item['kind'] === 'cheque_out')),
            ],
        ];
    }

    /**
     * @param  array<string, mixed>  $item
     * @return array<string, mixed>
     */
    private function present(array $item): array
    {
        return [
            'layer' => $item['layer'], 'kind' => $item['kind'], 'direction' => $item['direction'], 'label' => $item['label'],
            'party_id' => $item['party_id'], 'document_id' => $item['document_id'] ?? null, 'amount' => $this->money($item['amount']), 'probability' => $item['probability'],
            'weighted_amount' => $this->money($item['amount'] * $item['probability']),
            'expected_date' => $item['date'], 'contractual_date' => $item['contractual_date'], 'days_late' => $item['days_late'],
            'basis' => $item['basis'],
        ];
    }

    /**
     * @return list<string>
     */
    private function assumptions(int $delayDays): array
    {
        return [
            'Only cleared cash counts as confirmed. Cheques not yet cleared, promises and unpaid invoices are never confirmed cash.',
            'A customer invoice is weighted by that customer\'s share of invoices paid on time and dated by their average delay; with too little history a neutral '.(int) (self::DEFAULT_RELIABILITY * 100).'% is used.',
            'Invoices more than 30 days late are weighted down by 25%, more than 90 days by 50%.',
            'Cheques in hand are weighted '.(int) (self::CHEQUE_PROBABILITY * 100).'% (or '.(int) (self::CHEQUE_PROBABILITY_AFTER_BOUNCE * 100).'% after a bounced cheque) and dated by the cheque due date.',
            'A promise is weighted by customer reliability (30%-90%); a missed promise is not counted, its amount stays on the invoice.',
            'Supplier invoices, statutory obligations and cheques we issued are treated as certain outflows on their due dates; overdue ones are assumed payable now.',
            "The late-collection scenario moves every expected receipt {$delayDays} days later.",
            'Payroll is included only when it is recorded as a recurring payment. Amounts are in a single currency; other currencies are left out.',
        ];
    }

    private function partyName(?Party $party): string
    {
        return $party === null ? 'Unknown party' : (string) ($party->company_name ?: $party->name);
    }

    private function baseCurrency(): string
    {
        return strtoupper((string) (app(TenantContext::class)->organization()?->preferences['currency'] ?? 'ILS'));
    }

    private function money(float $value): string
    {
        return number_format($value, 4, '.', '');
    }
}
