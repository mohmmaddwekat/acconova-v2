<?php

namespace App\Services\Credit;

use App\Actions\Parties\UpdateParty;
use App\Models\CashAllocation;
use App\Models\CashMovement;
use App\Models\CreditDecision;
use App\Models\CreditPolicy;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Explained credit recommendation for one customer.
 *
 * The result is advice only: the reasons, the checks that were made and the
 * reference data behind them are always returned, "insufficient data" is
 * stated instead of guessed, and the final decision is recorded separately by
 * an authorized person (see `decide`). Nothing here changes a customer's
 * terms by itself.
 */
final class CreditRecommendationService
{
    public const RECOMMENDATIONS = ['credit', 'cheque_with_conditions', 'advance_payment', 'cash_only', 'stop_credit', 'insufficient_data'];

    public const DISCLAIMER = 'Recommendation only. The final decision belongs to an authorized merchant.';

    public function __construct(private readonly UpdateParty $updateParty) {}

    public function policy(): CreditPolicy
    {
        return CreditPolicy::query()->firstOrCreate([], [])->refresh();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updatePolicy(array $data): CreditPolicy
    {
        $validated = Validator::make($data, [
            'min_history_invoices' => ['sometimes', 'integer', 'between:1,100'],
            'min_history_days' => ['sometimes', 'integer', 'between:0,730'],
            'min_on_time_ratio' => ['sometimes', 'numeric', 'between:0,1'],
            'max_avg_days_late' => ['sometimes', 'integer', 'between:0,365'],
            'max_overdue_ratio' => ['sometimes', 'numeric', 'between:0,1'],
            'stop_credit_overdue_days' => ['sometimes', 'integer', 'between:1,365'],
            'stop_credit_bounced_cheques' => ['sometimes', 'integer', 'between:1,20'],
            'stop_credit_missed_promises' => ['sometimes', 'integer', 'between:1,20'],
            'lookback_days' => ['sometimes', 'integer', 'between:30,730'],
            'credit_days' => ['sometimes', 'integer', 'between:1,365'],
            'advance_percent' => ['sometimes', 'integer', 'between:1,100'],
            'limit_months_of_sales' => ['sometimes', 'numeric', 'between:0.1,24'],
            'max_credit_limit' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:999999999999'],
            'new_customer_terms' => ['sometimes', Rule::in(CreditPolicy::NEW_CUSTOMER_TERMS)],
            'cheque_max_postdated_days' => ['sometimes', 'integer', 'between:1,365'],
            'cheque_exposure_ratio' => ['sometimes', 'numeric', 'between:0,1'],
        ])->validate();

        $policy = $this->policy();
        $policy->fill($validated)->save();

        return $policy->refresh();
    }

    /**
     * @return array<string, mixed>
     */
    public function assess(Party $party, ?CarbonImmutable $asOf = null): array
    {
        $asOf ??= CarbonImmutable::today();
        $policy = $this->policy();
        $facts = $this->facts($party, $asOf, $policy);
        $checks = $this->checks($facts, $policy);
        $recommendation = $this->recommend($facts, $checks, $policy);

        return [
            'party_id' => $party->id,
            'as_of' => $asOf->toDateString(),
            'recommendation' => $recommendation['recommendation'],
            'reasons' => $recommendation['reasons'],
            'checks' => $checks,
            'sufficiency' => $facts['sufficiency'],
            'data' => $facts['data'],
            'latest_decision' => $this->latestDecision($party),
            'disclaimer' => self::DISCLAIMER,
        ];
    }

    /**
     * Record the authorized person's final decision. It may differ from the
     * recommendation; the recommendation and its data are kept alongside.
     *
     * @param  array<string, mixed>  $input
     */
    public function decide(Party $party, array $input, User $decider): CreditDecision
    {
        $validated = Validator::make($input, [
            'decision' => ['required', Rule::in(['credit', 'cheque_with_conditions', 'advance_payment', 'cash_only', 'stop_credit'])],
            'credit_limit' => ['nullable', 'numeric', 'min:0', 'max:999999999999'],
            'credit_days' => ['nullable', 'integer', 'between:1,365'],
            'advance_percent' => ['nullable', 'integer', 'between:1,100'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'apply_credit_limit' => ['sometimes', 'boolean'],
        ])->validate();

        $assessment = $this->assess($party);

        return DB::transaction(function () use ($party, $validated, $decider, $assessment): CreditDecision {
            $applyLimit = (bool) ($validated['apply_credit_limit'] ?? false) && isset($validated['credit_limit']);

            if ($applyLimit) {
                $this->updateParty->execute($party, ['credit_limit' => $validated['credit_limit']]);
            }

            return CreditDecision::create([
                'party_id' => $party->id,
                'recommended' => $assessment['recommendation']['key'],
                'decision' => $validated['decision'],
                'overrides_recommendation' => $validated['decision'] !== $assessment['recommendation']['key'],
                'credit_limit' => $validated['credit_limit'] ?? null,
                'credit_days' => $validated['credit_days'] ?? null,
                'advance_percent' => $validated['advance_percent'] ?? null,
                'applied_credit_limit' => $applyLimit,
                'notes' => $validated['notes'] ?? null,
                'snapshot' => ['recommendation' => $assessment['recommendation'], 'reasons' => $assessment['reasons'], 'data' => $assessment['data'], 'sufficiency' => $assessment['sufficiency']],
                'decided_by' => $decider->id,
                'decided_at' => now(),
            ]);
        });
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function decisions(Party $party): array
    {
        return CreditDecision::query()->where('party_id', $party->id)->latest('decided_at')->latest('id')->limit(20)->get()
            ->map(fn (CreditDecision $decision): array => $this->decisionPayload($decision))->all();
    }

    /**
     * @return array<string, mixed>|null
     */
    private function latestDecision(Party $party): ?array
    {
        $decision = CreditDecision::query()->where('party_id', $party->id)->latest('decided_at')->latest('id')->first();

        return $decision ? $this->decisionPayload($decision) : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function decisionPayload(CreditDecision $decision): array
    {
        return [
            'id' => $decision->id,
            'recommended' => $decision->recommended,
            'decision' => $decision->decision,
            'overrides_recommendation' => $decision->overrides_recommendation,
            'credit_limit' => $decision->credit_limit,
            'credit_days' => $decision->credit_days,
            'advance_percent' => $decision->advance_percent,
            'applied_credit_limit' => $decision->applied_credit_limit,
            'notes' => $decision->notes,
            'decided_by' => $decision->decided_by,
            'decided_at' => $decision->decided_at->toIso8601String(),
        ];
    }

    /**
     * @return array{data: array<string, mixed>, sufficiency: array<string, mixed>, raw: array<string, mixed>}
     */
    private function facts(Party $party, CarbonImmutable $asOf, CreditPolicy $policy): array
    {
        $documents = FinancialDocument::query()
            ->where('party_id', $party->id)
            ->where('kind', 'sale_invoice')
            ->whereIn('status', ['issued', 'partially_paid', 'paid', 'overpaid'])
            ->whereDate('issue_date', '<=', $asOf->toDateString())
            ->whereDate('issue_date', '>=', $asOf->subMonths(24)->toDateString())
            ->get();

        $allocations = CashAllocation::query()
            ->whereIn('financial_document_id', $documents->pluck('id'))
            ->with('movement')
            ->get()
            ->filter(fn (CashAllocation $allocation): bool => $this->counts($allocation->movement, $asOf))
            ->groupBy('financial_document_id');

        $rows = $documents->map(function (FinancialDocument $document) use ($allocations, $asOf): array {
            $paid = $allocations->get($document->id, collect());
            $total = (float) $document->total;
            $paidAmount = (float) $paid->sum('amount');
            $due = CarbonImmutable::parse(($document->due_date ?: $document->issue_date)->toDateString());
            $settled = $paidAmount >= $total - 0.00005;
            $lastPaid = $paid->map(fn (CashAllocation $allocation) => $allocation->movement->movement_date)->max();
            $daysLate = $settled
                ? ($lastPaid ? max(0, (int) $due->diffInDays(CarbonImmutable::parse($lastPaid->toDateString()), false)) : 0)
                : ($due->lt($asOf) ? (int) $due->diffInDays($asOf) : 0);

            return [
                'issue_date' => $document->issue_date->toDateString(),
                'total' => $total,
                'balance' => max($total - $paidAmount, 0.0),
                'settled' => $settled,
                'days_late' => $daysLate,
                'overdue' => ! $settled && $due->lt($asOf),
            ];
        });

        $settled = $rows->where('settled', true);
        $open = $rows->where('settled', false);
        $overdueRows = $open->where('overdue', true);
        $outstanding = (float) $open->sum('balance');
        $overdue = (float) $overdueRows->sum('balance');
        $first = $rows->min('issue_date');
        $spanDays = $first ? (int) CarbonImmutable::parse($first)->diffInDays($asOf) : 0;
        $monthsActive = max(1, min(12, (int) ceil($spanDays / 30)));
        $turnover12 = (float) $rows->filter(fn (array $row): bool => $row['issue_date'] >= $asOf->subMonths(12)->toDateString())->sum('total');
        $lookbackFrom = $asOf->subDays($policy->lookback_days)->toDateString();

        $cheques = CashMovement::query()
            ->where('party_id', $party->id)
            ->where('category', 'customer_receipt')
            ->where('method', 'check')
            ->whereDate('movement_date', '<=', $asOf->toDateString())
            ->get();
        $bounced = $cheques->filter(fn (CashMovement $movement): bool => $movement->check_status === 'bounced' && $movement->movement_date->toDateString() >= $lookbackFrom);
        $pending = $cheques->filter(fn (CashMovement $movement): bool => $movement->status === 'posted' && $movement->check_status === 'pending');

        $missedPromises = (int) DB::table('payment_promises')
            ->where('organization_id', $party->organization_id)
            ->where('party_id', $party->id)
            ->whereDate('promised_on', '>=', $lookbackFrom)
            ->where(fn ($query) => $query->where('status', 'missed')
                ->orWhere(fn ($open) => $open->where('status', 'open')->whereDate('promised_on', '<', $asOf->toDateString())))
            ->count();

        $limit = $party->credit_limit !== null ? (float) $party->credit_limit : null;
        $exposure = $outstanding + (float) $pending->sum('amount');
        $onTime = $settled->isEmpty() ? null : $settled->where('days_late', 0)->count() / $settled->count();

        $data = [
            'invoices' => $rows->count(),
            'history_days' => $spanDays,
            'first_invoice_date' => $first,
            'settled_invoices' => $settled->count(),
            'on_time_ratio' => $onTime === null ? null : round($onTime, 2),
            'avg_days_late' => $settled->isEmpty() ? null : round((float) $settled->avg('days_late'), 1),
            'max_days_late' => $settled->isEmpty() ? null : (int) $settled->max('days_late'),
            'outstanding' => $this->money($outstanding),
            'overdue' => $this->money($overdue),
            'overdue_ratio' => $outstanding > 0 ? round($overdue / $outstanding, 2) : 0.0,
            'oldest_overdue_days' => (int) $overdueRows->max('days_late'),
            'turnover_12m' => $this->money($turnover12),
            'avg_monthly_sales' => $this->money($turnover12 / $monthsActive),
            'credit_limit' => $limit === null ? null : $this->money($limit),
            'exposure' => $this->money($exposure),
            'limit_utilization' => $limit !== null && $limit > 0 ? round($exposure / $limit, 2) : null,
            'bounced_cheques' => $bounced->count(),
            'bounced_cheques_amount' => $this->money((float) $bounced->sum('amount')),
            'pending_cheques' => $pending->count(),
            'pending_cheques_amount' => $this->money((float) $pending->sum('amount')),
            'missed_promises' => $missedPromises,
            'lookback_days' => $policy->lookback_days,
        ];

        $missing = [];

        if ($rows->count() < $policy->min_history_invoices) {
            $missing[] = ['code' => 'history_invoices', 'have' => $rows->count(), 'need' => $policy->min_history_invoices];
        }

        if ($spanDays < $policy->min_history_days) {
            $missing[] = ['code' => 'history_days', 'have' => $spanDays, 'need' => $policy->min_history_days];
        }

        if ($settled->isEmpty()) {
            $missing[] = ['code' => 'paid_invoices', 'have' => 0, 'need' => 1];
        }

        return [
            'data' => $data,
            'sufficiency' => ['enough' => $missing === [], 'missing' => $missing],
            'raw' => compact('limit', 'exposure', 'onTime'),
        ];
    }

    /**
     * @param  array<string, mixed>  $facts
     * @return list<array<string, mixed>>
     */
    private function checks(array $facts, CreditPolicy $policy): array
    {
        $d = $facts['data'];
        $limit = $facts['raw']['limit'];
        $exposure = $facts['raw']['exposure'];
        $items = [];
        $add = function (string $code, bool $ok, mixed $value, mixed $threshold, string $text) use (&$items): void {
            $items[] = ['code' => $code, 'ok' => $ok, 'value' => $value, 'threshold' => $threshold, 'text' => $text];
        };

        $add('overdue_days', $d['oldest_overdue_days'] < $policy->stop_credit_overdue_days, $d['oldest_overdue_days'], $policy->stop_credit_overdue_days,
            "Oldest overdue invoice is {$d['oldest_overdue_days']} days late (stop credit at {$policy->stop_credit_overdue_days}).");
        $add('bounced_cheques', $d['bounced_cheques'] < $policy->stop_credit_bounced_cheques, $d['bounced_cheques'], $policy->stop_credit_bounced_cheques,
            "{$d['bounced_cheques']} bounced cheque(s) in the last {$policy->lookback_days} days (stop credit at {$policy->stop_credit_bounced_cheques}).");
        $add('missed_promises', $d['missed_promises'] < $policy->stop_credit_missed_promises, $d['missed_promises'], $policy->stop_credit_missed_promises,
            "{$d['missed_promises']} missed payment promise(s) in the last {$policy->lookback_days} days (stop credit at {$policy->stop_credit_missed_promises}).");
        $add('over_limit', ! ($limit !== null && $limit > 0 && $exposure > $limit && (float) $d['overdue'] > 0), $d['exposure'], $d['credit_limit'],
            'Exposure (balance plus pending cheques) '.($limit !== null && $exposure > $limit ? 'exceeds' : 'is within').' the current credit limit'.($limit === null ? ' (no limit set)' : '').'.');

        if ($d['on_time_ratio'] !== null) {
            $add('on_time_ratio', $d['on_time_ratio'] >= $policy->min_on_time_ratio, $d['on_time_ratio'], $policy->min_on_time_ratio,
                'Share of invoices paid on time: '.(int) round($d['on_time_ratio'] * 100).'% (policy minimum '.(int) round($policy->min_on_time_ratio * 100).'%).');
            $add('avg_days_late', $d['avg_days_late'] <= $policy->max_avg_days_late, $d['avg_days_late'], $policy->max_avg_days_late,
                "Average delay on paid invoices: {$d['avg_days_late']} days (policy maximum {$policy->max_avg_days_late}).");
        }

        $add('overdue_ratio', $d['overdue_ratio'] <= $policy->max_overdue_ratio, $d['overdue_ratio'], $policy->max_overdue_ratio,
            'Overdue share of the outstanding balance: '.(int) round($d['overdue_ratio'] * 100).'% (policy maximum '.(int) round($policy->max_overdue_ratio * 100).'%).');

        return $items;
    }

    /**
     * @param  array<string, mixed>  $facts
     * @param  list<array<string, mixed>>  $checks
     * @return array{recommendation: array<string, mixed>, reasons: list<array<string, mixed>>}
     */
    private function recommend(array $facts, array $checks, CreditPolicy $policy): array
    {
        $d = $facts['data'];
        $byCode = collect($checks)->keyBy('code');
        $failed = fn (string ...$codes): array => collect($codes)->map(fn (string $code) => $byCode->get($code))->filter(fn ($check): bool => $check !== null && ! $check['ok'])->values()->all();

        $stop = $failed('overdue_days', 'bounced_cheques', 'missed_promises', 'over_limit');

        if ($stop !== []) {
            return $this->result('stop_credit', $stop, [
                'summary' => 'Pause credit sales until the overdue balance and the issues above are resolved.',
                'conditions' => ['Collect the overdue balance first', 'Review again after a full payment'],
            ]);
        }

        if (! $facts['sufficiency']['enough']) {
            $fallback = $policy->new_customer_terms;
            $reasons = array_map(fn (array $item): array => [
                'code' => 'insufficient_'.$item['code'],
                'text' => match ($item['code']) {
                    'history_invoices' => "Only {$item['have']} invoice(s); the policy needs {$item['need']} for a reliable view.",
                    'history_days' => "Customer history spans {$item['have']} day(s); the policy needs {$item['need']}.",
                    default => 'No invoice has been fully paid yet, so payment behavior is unknown.',
                },
                'value' => $item['have'],
                'threshold' => $item['need'],
            ], $facts['sufficiency']['missing']);

            return [
                'recommendation' => [
                    'key' => 'insufficient_data',
                    'summary' => 'Not enough history to recommend credit. Suggested terms until there is more data: '.str_replace('_', ' ', $fallback).'.',
                    'fallback' => $fallback,
                    'advance_percent' => $fallback === 'advance_payment' ? $policy->advance_percent : null,
                    'credit_limit' => null,
                    'credit_days' => null,
                    'conditions' => [],
                ],
                'reasons' => $reasons,
            ];
        }

        $poor = $d['on_time_ratio'] < 0.4 || $d['avg_days_late'] > 2 * $policy->max_avg_days_late;
        $chequeIssue = $d['bounced_cheques'] >= 1;
        $moderate = $failed('on_time_ratio', 'avg_days_late', 'overdue_ratio') !== [];

        if ($poor) {
            return $this->result('cash_only', $failed('on_time_ratio', 'avg_days_late', 'overdue_ratio'), [
                'summary' => 'Payment record is weak: sell for cash only.',
                'conditions' => [],
            ]);
        }

        if ($chequeIssue) {
            $basis = (float) ($d['credit_limit'] ?? $d['avg_monthly_sales']) * $policy->cheque_exposure_ratio;

            return $this->result('cheque_with_conditions', [[
                'code' => 'bounced_cheques', 'ok' => false, 'value' => $d['bounced_cheques'], 'threshold' => 0,
                'text' => "{$d['bounced_cheques']} bounced cheque(s) in the last {$policy->lookback_days} days, below the stop level.",
            ]], [
                'summary' => 'Accept cheques only under conditions.',
                'conditions' => [
                    "Post-dated at most {$policy->cheque_max_postdated_days} days",
                    'Verify the bank and account before accepting',
                    'Keep pending cheques at or below '.$this->money($basis),
                ],
                'pending_cheque_limit' => $this->money($basis),
            ]);
        }

        if ($moderate) {
            return $this->result('advance_payment', $failed('on_time_ratio', 'avg_days_late', 'overdue_ratio'), [
                'summary' => "Ask for an advance of {$policy->advance_percent}% before delivery.",
                'advance_percent' => $policy->advance_percent,
                'conditions' => [],
            ]);
        }

        $computed = (float) $d['avg_monthly_sales'] * $policy->limit_months_of_sales;
        $recommended = $policy->max_credit_limit !== null ? min($computed, (float) $policy->max_credit_limit) : $computed;
        $days = $d['on_time_ratio'] >= 0.9 && $d['avg_days_late'] <= 3 ? $policy->credit_days : max(7, (int) round($policy->credit_days / 2));

        return $this->result('credit', [], [
            'summary' => "Sell on credit up to {$this->money($recommended)} with {$days} days.",
            'credit_limit' => $this->money($recommended),
            'credit_days' => $days,
            'current_limit' => $d['credit_limit'],
            'conditions' => [],
        ], [
            ['code' => 'good_record', 'text' => 'Payment record is within every policy threshold.', 'value' => $d['on_time_ratio'], 'threshold' => $policy->min_on_time_ratio],
            ['code' => 'limit_basis', 'text' => "Limit = average monthly sales {$d['avg_monthly_sales']} × {$policy->limit_months_of_sales} months".($policy->max_credit_limit !== null ? ", capped at {$this->money((float) $policy->max_credit_limit)}" : '').'.', 'value' => $this->money($recommended), 'threshold' => null],
        ]);
    }

    /**
     * @param  list<array<string, mixed>>  $failedChecks
     * @param  array<string, mixed>  $details
     * @param  list<array<string, mixed>>  $extraReasons
     * @return array{recommendation: array<string, mixed>, reasons: list<array<string, mixed>>}
     */
    private function result(string $key, array $failedChecks, array $details, array $extraReasons = []): array
    {
        return [
            'recommendation' => ['key' => $key, 'credit_limit' => null, 'credit_days' => null, 'advance_percent' => null, ...$details],
            'reasons' => [
                ...array_map(fn (array $check): array => ['code' => $check['code'], 'text' => $check['text'], 'value' => $check['value'], 'threshold' => $check['threshold']], $failedChecks),
                ...$extraReasons,
            ],
        ];
    }

    private function counts(?CashMovement $movement, CarbonImmutable $asOf): bool
    {
        if ($movement === null || $movement->status !== 'posted' || $movement->movement_date->toDateString() > $asOf->toDateString()) {
            return false;
        }

        return ! ($movement->method === 'check' && in_array($movement->check_status, ['bounced', 'cancelled'], true));
    }

    private function money(float $value): string
    {
        return number_format($value, 4, '.', '');
    }
}
