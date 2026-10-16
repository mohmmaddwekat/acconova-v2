<?php

namespace App\Services\Finance;

use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\PartyOpeningBalance;
use App\Models\SupplierPaymentPlan;
use App\Models\SupplierPaymentPlanItem;
use App\Models\SupplierPaymentPolicy;
use App\Models\User;
use App\Services\Parties\PartyBalanceSummary;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;

/**
 * Proposes whom to pay, how much and when, from the cash forecast.
 *
 * The plan never pays more than the cash available in the chosen scenario
 * after the operating reserve, at any day of the horizon. Payments that only
 * work if expected receipts arrive are marked. Nothing here transfers money
 * or records a payment: approval records the merchant's decision, nothing else.
 */
final class SupplierPaymentPlanService
{
    public const SCENARIOS = ['confirmed_only', 'expected', 'late_collection'];

    public const DISCLAIMER = 'Proposal only. No transfer is made and no payment is recorded from this plan.';

    public function __construct(
        private readonly CashFlowForecastService $forecast,
        private readonly PartyBalanceSummary $balances,
        private readonly FinanceAuditService $audit,
    ) {}

    public function policy(): SupplierPaymentPolicy
    {
        return SupplierPaymentPolicy::query()->firstOrCreate([], [])->refresh();
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updatePolicy(array $data): SupplierPaymentPolicy
    {
        $validated = Validator::make($data, [
            'operating_reserve' => ['sometimes', 'numeric', 'min:0', 'max:999999999999'],
            'min_partial_percent' => ['sometimes', 'integer', 'between:1,100'],
            'pay_days_before_due' => ['sometimes', 'integer', 'between:0,60'],
            'overdue_first' => ['sometimes', 'boolean'],
            'party_priorities' => ['sometimes', 'array', 'max:500'],
            'party_priorities.*' => ['in:'.implode(',', array_keys(SupplierPaymentPolicy::PRIORITIES))],
        ])->validate();

        if (isset($validated['party_priorities'])) {
            $known = Party::query()->whereIn('id', array_keys($validated['party_priorities']))->pluck('id')->all();
            $validated['party_priorities'] = array_intersect_key($validated['party_priorities'], array_flip($known));
        }

        $policy = $this->policy();
        $policy->fill($validated)->save();

        return $policy->refresh();
    }

    /**
     * Build a proposal without saving it.
     *
     * @return array<string, mixed>
     */
    public function propose(string $scenario = 'expected', int $horizonDays = 30, int $delayDays = 14, ?string $currency = null, ?CarbonImmutable $today = null): array
    {
        if (! in_array($scenario, self::SCENARIOS, true)) {
            throw ValidationException::withMessages(['scenario' => ['Unknown scenario.']]);
        }

        $today ??= CarbonImmutable::today();
        $horizonDays = max(7, min(90, $horizonDays));
        $delayDays = max(1, min(120, $delayDays));
        $policy = $this->policy();
        $reserve = (float) $policy->operating_reserve;

        $cash = $this->forecast->forecast($horizonDays, $delayDays, $currency, $today);
        $opening = (float) $cash['opening']['confirmed_cash'];
        $days = $horizonDays;

        $fixed = array_fill(0, $days + 1, 0.0);
        $inflowOn = array_fill(0, $days + 1, 0.0);
        $inflowKinds = array_fill(0, $days + 1, []);
        $inflowLate = array_fill(0, $days + 1, 0.0);

        foreach ($cash['items'] as $item) {
            if ($item['kind'] === 'supplier_invoice') {
                continue;
            }

            $day = $this->dayOf($today, $item['expected_date']);

            if ($item['direction'] === 'out') {
                if ($day <= $days) {
                    $fixed[$day] -= (float) $item['amount'];
                }

                continue;
            }

            $weighted = (float) $item['weighted_amount'];

            if ($day <= $days) {
                $inflowOn[$day] += $weighted;
                $inflowKinds[$day][$item['kind']] = true;
            }

            if ($day + $delayDays <= $days) {
                $inflowLate[$day + $delayDays] += $weighted;
            }
        }

        $flowFor = fn (string $name): array => match ($name) {
            'confirmed_only' => $fixed,
            'late_collection' => array_map(fn (float $a, float $b): float => $a + $b, $fixed, $inflowLate),
            default => array_map(fn (float $a, float $b): float => $a + $b, $fixed, $inflowOn),
        };

        $flow = $flowFor($scenario);
        $candidates = $this->candidates($cash['items'], $policy, $today);
        $balance = $this->balanceSeries($opening, $flow);
        $payments = [];

        // Most important first: each supplier takes the earliest day the cash allows, so a lower-ranked
        // supplier due earlier can never use up the money a more important one needs.
        foreach ($candidates as $index => $candidate) {
            for ($day = $candidate['eligible_day']; $day <= $days; $day++) {
                $remaining = $candidates[$index]['remaining'];

                if ($remaining <= 0.004) {
                    break;
                }

                $headroom = $this->headroom($balance, $day, $reserve);

                if ($headroom >= $remaining - 0.004) {
                    $amount = $remaining;
                    $kind = $candidates[$index]['paid'] > 0 ? 'remainder' : 'full';
                } else {
                    $threshold = min($remaining, max(0.01, $candidate['original'] * $policy->min_partial_percent / 100));
                    $amount = floor($headroom * 100) / 100;

                    if ($headroom < $threshold || $amount < 0.01) {
                        continue;
                    }

                    $kind = 'partial';
                }

                for ($k = $day; $k <= $days; $k++) {
                    $balance[$k] -= $amount;
                }

                $candidates[$index]['remaining'] -= $amount;
                $candidates[$index]['paid'] += $amount;
                $payments[] = ['candidate' => $index, 'day' => $day, 'amount' => $amount, 'kind' => $kind];
            }
        }

        $confirmedBalance = $this->balanceSeries($opening, $fixed);
        $paidCumulative = array_fill(0, $days + 1, 0.0);
        $rows = [];

        usort($payments, fn (array $a, array $b): int => [$a['day'], $a['candidate']] <=> [$b['day'], $b['candidate']]);

        foreach ($payments as $payment) {
            for ($k = $payment['day']; $k <= $days; $k++) {
                $paidCumulative[$k] += $payment['amount'];
            }

            $confirmedHeadroom = INF;

            for ($k = $payment['day']; $k <= $days; $k++) {
                $confirmedHeadroom = min($confirmedHeadroom, $confirmedBalance[$k] - $paidCumulative[$k] - $reserve);
            }

            $dependsOnExpected = $scenario !== 'confirmed_only' && $confirmedHeadroom < -0.004;
            $kinds = [];

            for ($k = 0; $k <= $payment['day']; $k++) {
                $kinds = [...$kinds, ...array_keys($inflowKinds[$k])];
            }

            $rows[] = $this->paymentRow($candidates[$payment['candidate']], $payment, $today, $dependsOnExpected, array_values(array_unique($kinds)), $policy);
        }

        $unfunded = $this->unfunded($candidates, $days, $today);
        $balancePath = $this->path($balance, $confirmedBalance, $paidCumulative, $today, $days);
        $late = $this->lateRisk($opening, $flowFor('late_collection'), $paidCumulative, $reserve, $delayDays, $today, $days);
        $warnings = $this->warnings($opening, $reserve, $confirmedBalance, $rows, $unfunded, $late, $today);

        $plannedTotal = array_sum(array_column($rows, 'amount_value'));
        $rows = array_map(function (array $row): array {
            unset($row['amount_value']);

            return $row;
        }, $rows);

        return [
            'as_of' => $today->toDateString(),
            'currency' => $cash['currency'],
            'scenario' => $scenario,
            'horizon_days' => $horizonDays,
            'delay_days' => $delayDays,
            'policy' => [
                'operating_reserve' => $this->money($reserve), 'min_partial_percent' => $policy->min_partial_percent,
                'pay_days_before_due' => $policy->pay_days_before_due, 'overdue_first' => $policy->overdue_first,
            ],
            'opening' => ['confirmed_cash' => $this->money($opening), 'operating_reserve' => $this->money($reserve), 'available_now' => $this->money(max(0, $opening - $reserve))],
            'payments' => $rows,
            'totals' => [
                'planned' => $this->money($plannedTotal),
                'depends_on_expected_receipts' => $this->money(array_sum(array_map(fn (array $row): float => $row['depends_on_expected'] ? (float) $row['amount'] : 0.0, $rows))),
                'unfunded' => $this->money(array_sum(array_column($unfunded, 'amount_value'))),
            ],
            'shortfalls' => array_map(function (array $row): array {
                unset($row['amount_value']);

                return $row;
            }, $unfunded),
            'warnings' => $warnings,
            'late_collection_risk' => $late,
            'balance_path' => $balancePath,
            'assumptions' => [
                ...$cash['assumptions'],
                'Each payment keeps the balance at or above the operating reserve on every day of the horizon in the chosen scenario.',
                'Suppliers are ordered by their importance, then by lateness and due date; a payment smaller than the invoice is proposed only when it is at least '.$policy->min_partial_percent.'% of it.',
                'Statutory obligations, recurring payments and cheques we issued are treated as already committed; supplier invoices are the payments this plan decides.',
            ],
            'disclaimer' => self::DISCLAIMER,
        ];
    }

    /**
     * Save a proposal as a draft the merchant can review and approve.
     */
    public function generate(User $actor, string $scenario = 'expected', int $horizonDays = 30, int $delayDays = 14, ?string $currency = null, ?SupplierPaymentPlan $previous = null): SupplierPaymentPlan
    {
        $proposal = $this->propose($scenario, $horizonDays, $delayDays, $currency);

        return DB::transaction(function () use ($proposal, $actor, $previous): SupplierPaymentPlan {
            SupplierPaymentPlan::query()->where('status', 'draft')->update(['status' => 'superseded']);

            $plan = SupplierPaymentPlan::create([
                'as_of' => $proposal['as_of'], 'scenario' => $proposal['scenario'], 'horizon_days' => $proposal['horizon_days'],
                'delay_days' => $proposal['delay_days'], 'currency' => $proposal['currency'], 'status' => 'draft',
                'planned_total' => $proposal['totals']['planned'], 'unfunded_total' => $proposal['totals']['unfunded'],
                'payload' => $proposal, 'previous_plan_id' => $previous?->id, 'created_by' => $actor->id,
            ]);

            foreach ($proposal['payments'] as $payment) {
                SupplierPaymentPlanItem::create([
                    'supplier_payment_plan_id' => $plan->id, 'party_id' => $payment['party_id'], 'financial_document_id' => $payment['document_id'],
                    'item_key' => $payment['key'], 'kind' => $payment['kind'], 'amount' => $payment['amount'], 'pay_on' => $payment['pay_on'],
                    'due_date' => $payment['due_date'], 'depends_on_expected' => $payment['depends_on_expected'], 'detail' => $payment,
                ]);
            }

            $this->audit->record($plan, 'generated', $actor->id, null, null, ['scenario' => $plan->scenario, 'planned' => $proposal['totals']['planned'], 'unfunded' => $proposal['totals']['unfunded']]);

            return $plan->load('items');
        });
    }

    public function approve(SupplierPaymentPlan $plan, User $approver): SupplierPaymentPlan
    {
        return DB::transaction(function () use ($plan, $approver): SupplierPaymentPlan {
            $locked = SupplierPaymentPlan::query()->lockForUpdate()->findOrFail($plan->id);

            if ($locked->status !== 'draft') {
                throw ValidationException::withMessages(['plan' => ['Only a current draft plan can be approved.']]);
            }

            if ($locked->as_of->toDateString() !== CarbonImmutable::today()->toDateString()) {
                throw ValidationException::withMessages(['plan' => ['This plan is out of date. Refresh it with the latest collections before approving.']]);
            }

            $locked->forceFill(['status' => 'approved', 'approved_by' => $approver->id, 'approved_at' => now()])->save();
            $this->audit->record($locked, 'approved', $approver->id, 'Approved as a plan. No transfer or payment was made.', ['status' => 'draft'], ['status' => 'approved']);

            return $locked->load('items');
        });
    }

    /**
     * Rebuild the plan from today's actual state (collections that arrived,
     * payments made) and report what changed against the old plan.
     *
     * @return array{plan: SupplierPaymentPlan, changes: list<array<string, mixed>>}
     */
    public function refresh(SupplierPaymentPlan $plan, User $actor): array
    {
        $new = $this->generate($actor, $plan->scenario, (int) $plan->horizon_days, (int) $plan->delay_days, $plan->currency, $plan);
        $plan->forceFill(['status' => 'superseded'])->save();
        $before = $plan->items->keyBy('item_key');
        $changes = [];

        foreach ($before as $key => $old) {
            $now = $new->items->firstWhere('item_key', $key);
            $open = $old->financial_document_id ? (float) FinancialDocument::query()->whereKey($old->financial_document_id)->value('balance_due') : null;

            $changes[] = [
                'key' => $key, 'party_id' => $old->party_id, 'was' => $this->money((float) $old->amount),
                'now' => $now ? $this->money((float) $now->amount) : null,
                'status' => $now === null ? ($open !== null && $open <= 0.004 ? 'settled' : 'dropped') : ((float) $now->amount === (float) $old->amount ? 'unchanged' : 'changed'),
            ];
        }

        foreach ($new->items as $item) {
            if (! $before->has($item->item_key)) {
                $changes[] = ['key' => $item->item_key, 'party_id' => $item->party_id, 'was' => null, 'now' => $this->money((float) $item->amount), 'status' => 'new'];
            }
        }

        $this->audit->record($new, 'refreshed', $actor->id, null, null, ['previous_plan_id' => $plan->id, 'changes' => count($changes)]);

        return ['plan' => $new, 'changes' => $changes];
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @return list<array<string, mixed>>
     */
    private function candidates(array $items, SupplierPaymentPolicy $policy, CarbonImmutable $today): array
    {
        $byParty = [];

        foreach ($items as $item) {
            if ($item['kind'] === 'supplier_invoice') {
                $byParty[(int) $item['party_id']][] = $item;
            }
        }

        $carried = PartyOpeningBalance::query()->where('side', 'supplier')->pluck('party_id')->map(fn ($id): int => (int) $id)->all();
        $partyIds = array_values(array_unique([...array_keys($byParty), ...$carried]));
        $parties = Party::query()->whereIn('id', $partyIds)->get()->keyBy('id');
        $owed = $this->balances->forParties($parties->values(), true, true, true);
        $candidates = [];

        foreach ($partyIds as $partyId) {
            $party = $parties->get($partyId);

            if ($party === null) {
                continue;
            }

            $weOwe = max(0.0, (float) ($owed[$partyId]['we_owe'] ?? 0.0));
            $owedToUs = (float) ($owed[$partyId]['owed_to_us'] ?? 0.0);
            $importance = $policy->party_priorities[(string) $partyId] ?? 'normal';
            $name = (string) ($party->company_name ?: $party->name);
            $invoices = collect($byParty[$partyId] ?? [])->sortBy('contractual_date')->values();
            $left = $weOwe;

            foreach ($invoices as $invoice) {
                $amount = min((float) $invoice['amount'], $left);

                if ($amount <= 0.004) {
                    continue;
                }

                $left -= $amount;
                $due = CarbonImmutable::parse($invoice['contractual_date']);
                $candidates[] = $this->candidate($partyId, $name, $importance, $invoice['document_id'], 'invoice', (string) $invoice['label'], $amount, $due, $today, $policy, $owedToUs);
            }

            if ($left > 0.004) {
                $candidates[] = $this->candidate($partyId, $name, $importance, null, 'carried', $name.' · carried balance', $left, $today, $today, $policy, $owedToUs);
            }
        }

        usort($candidates, fn (array $a, array $b): int => [$b['score'], $a['due']] <=> [$a['score'], $b['due']]);

        return $candidates;
    }

    /**
     * @return array<string, mixed>
     */
    private function candidate(int $partyId, string $name, string $importance, ?int $documentId, string $kind, string $label, float $amount, CarbonImmutable $due, CarbonImmutable $today, SupplierPaymentPolicy $policy, float $owedToUs): array
    {
        $overdue = max(0, (int) $due->diffInDays($today, false));
        $untilDue = max(0, (int) $today->diffInDays($due, false));
        $weight = SupplierPaymentPolicy::PRIORITIES[$importance] ?? 2;
        $score = $weight * 100 + ($policy->overdue_first && $overdue > 0 ? 50 + min($overdue, 60) : 0) + max(0, 14 - $untilDue);

        return [
            'key' => $documentId ? 'doc:'.$documentId : 'carried:'.$partyId, 'party_id' => $partyId, 'party' => $name, 'importance' => $importance,
            'document_id' => $documentId, 'kind' => $kind, 'label' => $label, 'original' => $amount, 'remaining' => $amount, 'paid' => 0.0,
            'due' => $due->toDateString(), 'overdue_days' => $overdue, 'score' => $score, 'owed_to_us' => $owedToUs,
            'eligible_day' => $kind === 'carried' ? 0 : max(0, (int) $today->diffInDays($due->subDays($policy->pay_days_before_due), false)),
        ];
    }

    /**
     * @param  array<string, mixed>  $candidate
     * @param  array<string, mixed>  $payment
     * @param  list<string>  $inflowKinds
     * @return array<string, mixed>
     */
    private function paymentRow(array $candidate, array $payment, CarbonImmutable $today, bool $dependsOnExpected, array $inflowKinds, SupplierPaymentPolicy $policy): array
    {
        $reasons = [];
        $reasons[] = ['code' => 'importance', 'text' => 'Supplier importance: '.$candidate['importance'].'.'];

        if ($candidate['overdue_days'] > 0) {
            $reasons[] = ['code' => 'overdue', 'text' => 'Already '.$candidate['overdue_days'].' days past its due date.'];
        } else {
            $reasons[] = ['code' => 'due', 'text' => 'Due on '.$candidate['due'].'.'];
        }

        if ($payment['kind'] === 'partial') {
            $reasons[] = ['code' => 'partial', 'text' => 'Only part of the invoice fits the cash available above the reserve; at least '.$policy->min_partial_percent.'% is paid now and the rest is proposed when cash allows.'];
        }

        if ($candidate['kind'] === 'carried') {
            $reasons[] = ['code' => 'carried_balance', 'text' => 'Balance carried forward without an invoice date.'];
        }

        if ($candidate['owed_to_us'] > 0.004) {
            $reasons[] = ['code' => 'also_customer', 'text' => 'This party also owes you '.$this->money($candidate['owed_to_us']).' as a customer; an approved settlement could offset up to that amount before paying. Nothing is netted automatically.'];
        }

        if ($dependsOnExpected) {
            $reasons[] = ['code' => 'depends_on_expected', 'text' => 'Only affordable if expected receipts arrive ('.implode(', ', $inflowKinds ?: ['expected receipts']).'); it is not covered by confirmed cash.'];
        }

        return [
            'key' => $candidate['key'], 'party_id' => $candidate['party_id'], 'party' => $candidate['party'], 'document_id' => $candidate['document_id'],
            'label' => $candidate['label'], 'kind' => $payment['kind'], 'amount' => $this->money($payment['amount']), 'amount_value' => $payment['amount'],
            'pay_on' => $today->addDays($payment['day'])->toDateString(), 'due_date' => $candidate['due'], 'importance' => $candidate['importance'],
            'overdue_days' => $candidate['overdue_days'], 'depends_on_expected' => $dependsOnExpected, 'depends_on' => $inflowKinds, 'reasons' => $reasons,
        ];
    }

    /**
     * @param  list<array<string, mixed>>  $candidates
     * @return list<array<string, mixed>>
     */
    private function unfunded(array $candidates, int $days, CarbonImmutable $today): array
    {
        $rows = [];

        foreach ($candidates as $candidate) {
            $dueDay = $this->dayOf($today, $candidate['due']);

            if ($candidate['remaining'] <= 0.004 || $dueDay > $days) {
                continue;
            }

            $rows[] = [
                'key' => $candidate['key'], 'party_id' => $candidate['party_id'], 'party' => $candidate['party'], 'label' => $candidate['label'],
                'amount' => $this->money($candidate['remaining']), 'amount_value' => $candidate['remaining'], 'due_date' => $candidate['due'],
                'importance' => $candidate['importance'], 'overdue_days' => $candidate['overdue_days'],
                'reason' => 'Not enough cash above the operating reserve in this scenario within the horizon.',
            ];
        }

        return $rows;
    }

    /**
     * @param  list<float>  $balance
     * @param  list<float>  $confirmedBalance
     * @param  list<float>  $paidCumulative
     * @return list<array<string, mixed>>
     */
    private function path(array $balance, array $confirmedBalance, array $paidCumulative, CarbonImmutable $today, int $days): array
    {
        $rows = [];

        for ($day = 0; $day <= $days; $day += 7) {
            $rows[] = [
                'date' => $today->addDays($day)->toDateString(),
                'balance_in_scenario' => $this->money($balance[$day]),
                'balance_confirmed_only' => $this->money($confirmedBalance[$day] - $paidCumulative[$day]),
            ];
        }

        return $rows;
    }

    /**
     * What happens to the reserve if every receipt arrives later than planned.
     *
     * @param  list<float>  $flow
     * @param  list<float>  $paidCumulative
     * @return array<string, mixed>
     */
    private function lateRisk(float $opening, array $flow, array $paidCumulative, float $reserve, int $delayDays, CarbonImmutable $today, int $days): array
    {
        $balance = $this->balanceSeries($opening, $flow);
        $lowest = INF;
        $first = null;

        for ($day = 0; $day <= $days; $day++) {
            $net = $balance[$day] - $paidCumulative[$day];
            $lowest = min($lowest, $net);

            if ($first === null && $net < $reserve - 0.004) {
                $first = $today->addDays($day)->toDateString();
            }
        }

        return [
            'delay_days' => $delayDays,
            'breaches_reserve' => $first !== null,
            'first_date' => $first,
            'lowest_balance' => $this->money($lowest === INF ? $opening : $lowest),
            'shortfall_against_reserve' => $this->money(max(0.0, $reserve - ($lowest === INF ? $opening : $lowest))),
        ];
    }

    /**
     * @param  list<float>  $confirmedBalance
     * @param  list<array<string, mixed>>  $rows
     * @param  list<array<string, mixed>>  $unfunded
     * @param  array<string, mixed>  $late
     * @return list<array<string, mixed>>
     */
    private function warnings(float $opening, float $reserve, array $confirmedBalance, array $rows, array $unfunded, array $late, CarbonImmutable $today): array
    {
        $warnings = [];

        if ($opening < $reserve) {
            $warnings[] = ['code' => 'below_reserve_now', 'text' => 'Confirmed cash ('.$this->money($opening).') is already below the operating reserve ('.$this->money($reserve).'), so nothing can be proposed without eating into the reserve.'];
        }

        if ($unfunded !== []) {
            $warnings[] = ['code' => 'cash_shortfall', 'text' => 'Cash is not enough to pay '.$this->money(array_sum(array_column($unfunded, 'amount_value'))).' of what falls due within the horizon. Consider chasing collections or asking suppliers for later dates.', 'amount' => $this->money(array_sum(array_column($unfunded, 'amount_value')))];
        }

        $dependent = array_filter($rows, fn (array $row): bool => $row['depends_on_expected']);

        if ($dependent !== []) {
            $warnings[] = ['code' => 'depends_on_expected', 'text' => count($dependent).' payment(s) depend on receipts that are expected, not confirmed. Do not make them until the money is actually collected.'];
        }

        if ($late['breaches_reserve']) {
            $warnings[] = ['code' => 'late_collection_risk', 'text' => 'If collections arrive '.$late['delay_days'].' days late, the balance falls below the reserve from '.$late['first_date'].' (short by '.$late['shortfall_against_reserve'].').'];
        }

        foreach ($confirmedBalance as $day => $balance) {
            if ($balance < $reserve - 0.004) {
                $warnings[] = ['code' => 'reserve_at_risk', 'text' => 'Even before any supplier payment, committed outflows take confirmed cash below the reserve from '.$today->addDays($day)->toDateString().'.'];

                break;
            }
        }

        return $warnings;
    }

    /**
     * @param  list<float>  $flow
     * @return list<float>
     */
    private function balanceSeries(float $opening, array $flow): array
    {
        $balance = [];
        $running = $opening;

        foreach ($flow as $day => $value) {
            $running += $value;
            $balance[$day] = $running;
        }

        return $balance;
    }

    /**
     * @param  list<float>  $balance
     */
    private function headroom(array $balance, int $from, float $reserve): float
    {
        $lowest = INF;

        for ($k = $from; $k < count($balance); $k++) {
            $lowest = min($lowest, $balance[$k] - $reserve);
        }

        return $lowest === INF ? 0.0 : $lowest;
    }

    private function dayOf(CarbonImmutable $today, string $date): int
    {
        return max(0, (int) $today->diffInDays(CarbonImmutable::parse($date), false));
    }

    private function money(float $value): string
    {
        return number_format($value, 4, '.', '');
    }
}
