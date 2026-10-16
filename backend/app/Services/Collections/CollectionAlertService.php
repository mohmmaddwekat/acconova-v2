<?php

namespace App\Services\Collections;

use App\Models\CollectionAlert;
use App\Models\CollectionAlertRule;
use App\Models\CollectionContact;
use App\Models\FinancialDocument;
use App\Models\Party;
use App\Models\User;
use App\Services\Notifications\NotificationCenter;
use App\Services\Parties\PartyCollectionsStatement;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

/**
 * Collections alerts for customer receivables.
 *
 * Rules (late, stopped paying, missed promise) are configurable per workspace.
 * An alert records why it was raised, the last contact and a suggested next
 * step. To avoid noise, a party is notified again only after the rule's
 * cooling-off period without a logged contact, or when it crosses a higher
 * lateness band (30, 60, 90 days). Alerts only notify inside the application:
 * nothing is ever sent to a customer automatically, and any outbound message is
 * a suggestion that needs a person's approval and an approved channel.
 */
final class CollectionAlertService
{
    private const EXTERNAL_CHANNELS = ['email', 'whatsapp', 'sms'];

    public function __construct(
        private readonly PartyCollectionsStatement $statements,
        private readonly NotificationCenter $center,
    ) {}

    /**
     * @return Collection<string, CollectionAlertRule>
     */
    public function rules(): Collection
    {
        foreach (CollectionAlertRule::defaults() as $kind => $defaults) {
            CollectionAlertRule::query()->firstOrCreate(['kind' => $kind], [
                ...$defaults,
                'enabled' => true,
                'min_amount' => 0,
                'approved_channels' => ['call'],
            ]);
        }

        $all = CollectionAlertRule::query()->get()->keyBy('kind');

        return collect(CollectionAlertRule::KINDS)->mapWithKeys(fn (string $kind): array => [$kind => $all[$kind]]);
    }

    /**
     * @param  array<string, mixed>  $data
     */
    public function updateRule(string $kind, array $data): CollectionAlertRule
    {
        $validated = Validator::make($data, [
            'enabled' => ['sometimes', 'boolean'],
            'threshold_days' => ['sometimes', 'integer', 'between:0,365'],
            'min_amount' => ['sometimes', 'numeric', 'min:0', 'max:999999999999'],
            'repeat_after_days' => ['sometimes', 'integer', 'between:1,90'],
            'approved_channels' => ['sometimes', 'array', 'max:5'],
            'approved_channels.*' => ['string', 'distinct', Rule::in(CollectionAlertRule::CHANNELS)],
        ])->validate();

        $rule = $this->rules()->get($kind) ?? abort(404);
        $rule->fill($validated)->save();

        return $rule->refresh();
    }

    /**
     * Evaluates at most once per window; used by pages and chat tools.
     */
    public function evaluateIfStale(int $minutes = 10): void
    {
        if (Cache::add('collections:evaluated:'.app(TenantContext::class)->id(), true, now()->addMinutes($minutes))) {
            $this->evaluate();
        }
    }

    /**
     * @return array{raised:int, updated:int, resolved:int, notified:int}
     */
    public function evaluate(): array
    {
        $organizationId = (int) app(TenantContext::class)->id();
        $rules = $this->rules()->where('enabled', true);
        $today = CarbonImmutable::today();
        $counts = ['raised' => 0, 'updated' => 0, 'resolved' => 0, 'notified' => 0];
        $active = [];

        $partyIds = FinancialDocument::query()
            ->where('kind', 'sale_invoice')
            ->whereIn('status', ['issued', 'partially_paid'])
            ->where('balance_due', '>', 0)
            ->distinct()
            ->pluck('party_id');

        foreach (Party::query()->whereIn('id', $partyIds)->get() as $party) {
            $statement = $this->statements->forParty($party, 'customer', $today);
            $contact = CollectionContact::query()->where('party_id', $party->id)->latest('contacted_at')->first();
            $findings = $this->findings($statement, $rules);

            foreach ($findings as $kind => $finding) {
                $active[$party->id.'|'.$kind] = true;
                $alert = $this->store($party, $kind, $finding, $statement, $contact, $rules[$kind], $today);
                $counts[$alert['created'] ? 'raised' : 'updated']++;

                if ($this->notify($alert['model'], $rules[$kind], $contact, $party, $organizationId)) {
                    $counts['notified']++;
                }
            }
        }

        CollectionAlert::query()
            ->whereIn('status', [CollectionAlert::STATUS_OPEN, CollectionAlert::STATUS_SNOOZED])
            ->get()
            ->each(function (CollectionAlert $alert) use ($active, &$counts): void {
                if (! isset($active[$alert->party_id.'|'.$alert->kind])) {
                    $alert->forceFill(['status' => CollectionAlert::STATUS_RESOLVED, 'resolved_at' => now()])->save();
                    $counts['resolved']++;
                }
            });

        return $counts;
    }

    /**
     * Customers to follow up now, largest overdue amount first, then the
     * longest delay.
     *
     * @return list<array<string, mixed>>
     */
    public function followUps(): array
    {
        $rules = $this->rules();
        $today = CarbonImmutable::today();

        $alerts = CollectionAlert::query()
            ->with('party')
            ->whereIn('status', [CollectionAlert::STATUS_OPEN, CollectionAlert::STATUS_SNOOZED])
            ->get()
            ->filter(fn (CollectionAlert $alert): bool => $alert->status === CollectionAlert::STATUS_OPEN
                || ($alert->snoozed_until !== null && $alert->snoozed_until->lt($today)))
            ->groupBy('party_id');

        $contacts = CollectionContact::query()
            ->whereIn('party_id', $alerts->keys())
            ->orderByDesc('contacted_at')
            ->get()
            ->groupBy('party_id');

        return $alerts->map(function (Collection $partyAlerts, int|string $partyId) use ($contacts, $rules, $today): array {
            $party = $partyAlerts->first()->party;
            $contact = $contacts->get($partyId)?->first();
            $top = $partyAlerts->sortByDesc('days_late')->first();
            $channels = collect($rules->get($top->kind)?->approved_channels ?? ['call'])->values()->all();

            return [
                'party_id' => (int) $partyId,
                'party' => $party->company_name ?: $party->name,
                'phone' => $party->phone,
                'email' => $party->email,
                'overdue_amount' => $this->money((float) $partyAlerts->max('overdue_amount')),
                'outstanding' => $this->money((float) $partyAlerts->max('outstanding')),
                'days_late' => (int) $partyAlerts->max('days_late'),
                'last_payment_on' => $top->last_payment_on?->toDateString(),
                'alerts' => $partyAlerts->map(fn (CollectionAlert $alert): array => [
                    'id' => $alert->id,
                    'kind' => $alert->kind,
                    'severity' => $alert->severity,
                    'days_late' => $alert->days_late,
                    'reason' => $alert->reason,
                    'notified_count' => $alert->notified_count,
                ])->values()->all(),
                'last_contact' => $contact ? [
                    'contacted_at' => $contact->contacted_at->toIso8601String(),
                    'days_ago' => (int) $contact->contacted_at->startOfDay()->diffInDays($today, false),
                    'channel' => $contact->channel,
                    'outcome' => $contact->outcome,
                    'note' => $contact->note,
                    'by' => $contact->user_id,
                ] : null,
                'next_action' => $this->nextAction($top->next_action, $channels),
            ];
        })
            ->sort(fn (array $left, array $right): int => [(float) $right['overdue_amount'], $right['days_late']] <=> [(float) $left['overdue_amount'], $left['days_late']])
            ->values()
            ->all();
    }

    /**
     * Log a contact attempt. A planned next contact date quiets this party's
     * alerts until then, so the same person is not alerted about again.
     *
     * @param  array<string, mixed>  $data
     */
    public function logContact(Party $party, array $data, User $user): CollectionContact
    {
        $validated = Validator::make($data, [
            'channel' => ['required', Rule::in(CollectionAlertRule::CHANNELS)],
            'outcome' => ['required', Rule::in(CollectionContact::OUTCOMES)],
            'note' => ['nullable', 'string', 'max:1000'],
            'contacted_at' => ['nullable', 'date', 'before_or_equal:now'],
            'next_contact_on' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:today'],
        ])->validate();

        $contact = CollectionContact::create([
            'party_id' => $party->id,
            'user_id' => $user->id,
            'channel' => $validated['channel'],
            'outcome' => $validated['outcome'],
            'note' => $validated['note'] ?? null,
            'contacted_at' => $validated['contacted_at'] ?? now(),
            'next_contact_on' => $validated['next_contact_on'] ?? null,
        ]);

        if ($contact->next_contact_on !== null) {
            CollectionAlert::query()
                ->where('party_id', $party->id)
                ->where('status', CollectionAlert::STATUS_OPEN)
                ->update(['status' => CollectionAlert::STATUS_SNOOZED, 'snoozed_until' => $contact->next_contact_on->toDateString()]);
        }

        return $contact;
    }

    public function snooze(CollectionAlert $alert, string $until): CollectionAlert
    {
        Validator::make(['until' => $until], ['until' => ['required', 'date_format:Y-m-d', 'after:today']])->validate();

        $alert->forceFill(['status' => CollectionAlert::STATUS_SNOOZED, 'snoozed_until' => $until])->save();

        return $alert;
    }

    public function resolve(CollectionAlert $alert): CollectionAlert
    {
        $alert->forceFill(['status' => CollectionAlert::STATUS_RESOLVED, 'resolved_at' => now()])->save();

        return $alert;
    }

    /**
     * @param  array<string, mixed>  $statement
     * @param  Collection<string, CollectionAlertRule>  $rules
     * @return array<string, array<string, mixed>>
     */
    private function findings(array $statement, Collection $rules): array
    {
        $summary = $statement['summary'];
        $overdue = (float) $summary['overdue'];
        $outstanding = (float) $summary['outstanding'];
        $days = (int) $summary['oldest_overdue_days'];
        $found = [];

        $rule = $rules->get(CollectionAlertRule::KIND_OVERDUE);

        if ($rule && $overdue > 0 && $days >= max($rule->threshold_days, 1) && $overdue >= (float) $rule->min_amount) {
            $found[CollectionAlertRule::KIND_OVERDUE] = ['days' => $days, 'amount' => $overdue];
        }

        $rule = $rules->get(CollectionAlertRule::KIND_STOPPED_PAYING);
        $sinceLast = $summary['days_since_last_payment'];

        if ($rule && $overdue > 0 && $summary['last_payment'] !== null && $sinceLast !== null
            && $sinceLast >= max($rule->threshold_days, 1) && $outstanding >= (float) $rule->min_amount) {
            $found[CollectionAlertRule::KIND_STOPPED_PAYING] = ['days' => (int) $sinceLast, 'amount' => $overdue];
        }

        $rule = $rules->get(CollectionAlertRule::KIND_MISSED_PROMISE);

        if ($rule) {
            $missed = collect($statement['promises'])
                ->filter(fn (array $promise): bool => $promise['late']
                    && (int) CarbonImmutable::parse($promise['promised_on'])->diffInDays($statement['as_of']) >= $rule->threshold_days
                    && (float) $promise['amount'] >= (float) $rule->min_amount)
                ->sortBy('promised_on')
                ->first();

            if ($missed) {
                $found[CollectionAlertRule::KIND_MISSED_PROMISE] = [
                    'days' => (int) CarbonImmutable::parse($missed['promised_on'])->diffInDays($statement['as_of']),
                    'amount' => (float) $missed['amount'],
                    'promise' => ['promised_on' => $missed['promised_on'], 'amount' => $missed['amount']],
                ];
            }
        }

        return $found;
    }

    /**
     * @param  array<string, mixed>  $finding
     * @param  array<string, mixed>  $statement
     * @return array{model: CollectionAlert, created: bool}
     */
    private function store(Party $party, string $kind, array $finding, array $statement, ?CollectionContact $contact, CollectionAlertRule $rule, CarbonImmutable $today): array
    {
        $summary = $statement['summary'];
        $existing = CollectionAlert::query()->where('party_id', $party->id)->where('kind', $kind)->first();
        $reopened = $existing !== null && $existing->status === CollectionAlert::STATUS_RESOLVED;

        $status = $existing?->status;

        if ($existing === null || $reopened) {
            $status = CollectionAlert::STATUS_OPEN;
        } elseif ($status === CollectionAlert::STATUS_SNOOZED && ($existing->snoozed_until === null || $existing->snoozed_until->lt($today))) {
            $status = CollectionAlert::STATUS_OPEN;
        }

        $attributes = [
            'status' => $status,
            'severity' => $finding['days'] >= 90 ? 'critical' : ($finding['days'] >= 30 ? 'warning' : 'info'),
            'reason' => [
                'code' => $kind,
                'days' => $finding['days'],
                'amount' => $this->money($finding['amount']),
                'threshold_days' => $rule->threshold_days,
                'last_payment_on' => $summary['last_payment']['date'] ?? null,
                ...(isset($finding['promise']) ? ['promise' => $finding['promise']] : []),
            ],
            'outstanding' => $summary['outstanding'],
            'overdue_amount' => $summary['overdue'],
            'days_late' => $finding['days'],
            'last_payment_on' => $summary['last_payment']['date'] ?? null,
            'next_action' => $this->suggest($kind, $finding['days'], $contact, $today),
            'snoozed_until' => $status === CollectionAlert::STATUS_SNOOZED ? $existing?->snoozed_until : null,
        ];

        if ($existing === null) {
            $model = CollectionAlert::create([...$attributes, 'party_id' => $party->id, 'kind' => $kind, 'first_raised_at' => now()]);

            return ['model' => $model, 'created' => true];
        }

        if ($reopened) {
            $attributes += ['first_raised_at' => now(), 'resolved_at' => null, 'notified_count' => 0, 'last_notified_at' => null, 'last_notified_days_late' => 0];
        }

        $existing->forceFill($attributes)->save();

        return ['model' => $existing, 'created' => $reopened];
    }

    private function suggest(string $kind, int $days, ?CollectionContact $contact, CarbonImmutable $today): string
    {
        if ($kind === CollectionAlertRule::KIND_MISSED_PROMISE) {
            return 'call_about_missed_promise';
        }

        if ($days >= 90) {
            return 'escalate_to_manager';
        }

        if ($contact === null || $contact->contacted_at->startOfDay()->diffInDays($today) >= 7) {
            return 'contact_customer';
        }

        if ($contact->outcome === 'promised' && $contact->next_contact_on !== null && $contact->next_contact_on->gte($today)) {
            return 'wait_for_promise';
        }

        return $kind === CollectionAlertRule::KIND_STOPPED_PAYING ? 'ask_for_reason' : 'follow_up_again';
    }

    /**
     * Notify inside the app only when it is not noise: first time, a higher
     * lateness band, or after the cooling-off period with no contact since.
     */
    private function notify(CollectionAlert $alert, CollectionAlertRule $rule, ?CollectionContact $contact, Party $party, int $organizationId): bool
    {
        if ($alert->status !== CollectionAlert::STATUS_OPEN) {
            return false;
        }

        if ($alert->notified_count > 0) {
            $escalated = $this->band($alert->days_late) > $this->band($alert->last_notified_days_late);
            $cooled = $alert->last_notified_at !== null && $alert->last_notified_at->diffInDays(now()) >= $rule->repeat_after_days;
            $contactedSince = $contact !== null && $alert->last_notified_at !== null && $contact->contacted_at->gt($alert->last_notified_at);

            if (! $escalated && ! ($cooled && ! $contactedSince)) {
                return false;
            }
        }

        $this->center->publish(
            $organizationId,
            'collections:'.$alert->id.':'.($alert->notified_count + 1),
            'collection_alert',
            'payments',
            [
                'party' => $party->company_name ?: $party->name,
                'alert' => $alert->kind,
                'days_late' => $alert->days_late,
                'amount' => $this->money((float) $alert->overdue_amount),
                'next_action' => $alert->next_action,
            ],
            '/app/parties?focus='.$party->id,
            true,
        );

        $alert->forceFill([
            'notified_count' => $alert->notified_count + 1,
            'last_notified_at' => now(),
            'last_notified_days_late' => $alert->days_late,
        ])->save();

        return true;
    }

    private function band(int $days): int
    {
        return match (true) {
            $days >= 90 => 3,
            $days >= 60 => 2,
            $days >= 30 => 1,
            default => 0,
        };
    }

    /**
     * @param  list<string>  $approvedChannels
     * @return array<string, mixed>
     */
    private function nextAction(string $key, array $approvedChannels): array
    {
        $channel = $approvedChannels[0] ?? 'call';

        return [
            'key' => $key,
            'suggested_channel' => $channel,
            'approved_channels' => $approvedChannels,
            'requires_approval' => in_array($channel, self::EXTERNAL_CHANNELS, true),
            'outbound_message_allowed' => false,
            'note' => 'Nothing is sent automatically. An outbound message needs a person\'s approval and an approved channel.',
        ];
    }

    private function money(float $value): string
    {
        return number_format($value, 4, '.', '');
    }
}
