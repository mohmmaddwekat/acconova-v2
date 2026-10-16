<?php

namespace App\Services\AI\Records;

use App\Models\PaymentPlan;
use App\Models\PaymentRecord;
use App\Models\User;
use App\Tenancy\TenantContext;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Recurring payments (rent, subscriptions, periodic obligations). The same
 * policy and rules as the Recurring Payments page apply: the assistant only
 * adds a plan, changes it, pauses it (archive) or resumes it (restore).
 */
final class RecurringPaymentRecords implements AiRecordEntity
{
    private const FIELDS = ['title', 'direction', 'amount', 'frequency', 'interval_count', 'next_due_on', 'reminder_days', 'counterparty'];

    public function key(): string
    {
        return 'recurring_payment';
    }

    public function fieldHints(): array
    {
        return [
            'title' => 'obligation name, for example office rent',
            'direction' => 'outgoing (we pay) or incoming (we receive)',
            'amount' => 'number greater than 0, in the workspace currency',
            'frequency' => 'once, daily, weekly, monthly or yearly',
            'interval_count' => 'every how many periods, default 1',
            'next_due_on' => 'first due date, YYYY-MM-DD',
            'reminder_days' => 'remind this many days before, 0 to 30, default 3',
            'counterparty' => 'optional name of the other side',
        ];
    }

    public function allowedFields(): array
    {
        return self::FIELDS;
    }

    public function normalize(array $input): array
    {
        $out = [];

        foreach (Arr::only($input, self::FIELDS) as $field => $value) {
            $text = $value === null ? '' : trim((string) $value);
            $out[$field] = $text === '' ? null : (in_array($field, ['direction', 'frequency'], true) ? strtolower($text) : $text);
        }

        return $out;
    }

    public function validate(array $changes, ?Model $existing): array
    {
        $payload = $existing instanceof PaymentPlan
            ? [...Arr::only($existing->getAttributes(), self::FIELDS), 'next_due_on' => $existing->next_due_on->toDateString(), ...$changes]
            : ['interval_count' => 1, 'reminder_days' => 3, ...array_filter($changes, fn ($value): bool => $value !== null)];

        $payload['currency'] = strtoupper((string) (app(TenantContext::class)->organization()->preferences['currency'] ?? 'ILS'));

        $validator = Validator::make($payload, [
            'title' => ['required', 'string', 'max:255'],
            'direction' => ['required', Rule::in(['outgoing', 'incoming'])],
            'amount' => ['required', 'numeric', 'gt:0', 'regex:/^\d{1,10}(?:\.\d{1,4})?$/'],
            'currency' => ['required', 'regex:/^[A-Z]{3}$/'],
            'interval_count' => ['required', 'integer', 'between:1,365'],
            'frequency' => ['required', Rule::in(['once', 'daily', 'weekly', 'monthly', 'yearly'])],
            'next_due_on' => ['required', 'date_format:Y-m-d'],
            'reminder_days' => ['required', 'integer', 'between:0,30'],
            'counterparty' => ['nullable', 'string', 'max:255'],
        ]);

        return ['errors' => $validator->errors()->toArray(), 'payload' => $payload];
    }

    public function duplicates(array $payload, ?Model $except): array
    {
        $query = PaymentPlan::query()
            ->where('active', true)
            ->where('direction', $payload['direction'])
            ->whereRaw('LOWER(title) = ?', [mb_strtolower((string) $payload['title'])]);

        if ($except) {
            $query->whereKeyNot($except->getKey());
        }

        return $query->limit(3)->get()->map(fn (PaymentPlan $plan): array => ['record' => $plan, 'level' => 'soft'])->all();
    }

    public function candidates(string $lookup, bool $onlyTrashed): Collection
    {
        $base = fn (): Builder => PaymentPlan::query()->where('active', ! $onlyTrashed);
        $needle = mb_strtolower(trim($lookup));

        $exact = $base()->where(fn ($query) => $query
            ->whereRaw('LOWER(title) = ?', [$needle])
            ->orWhereRaw('LOWER(counterparty) = ?', [$needle]))->limit(6)->get();

        if ($exact->isNotEmpty()) {
            return $exact;
        }

        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $needle).'%';

        return $base()->where(fn ($query) => $query
            ->whereRaw('LOWER(title) LIKE ?', [$like])
            ->orWhereRaw('LOWER(counterparty) LIKE ?', [$like]))->limit(6)->get();
    }

    public function find(int $id, bool $onlyTrashed): ?Model
    {
        return PaymentPlan::query()->where('active', ! $onlyTrashed)->find($id);
    }

    public function create(array $payload, User $user): Model
    {
        Gate::forUser($user)->authorize('create', PaymentPlan::class);

        $data = Arr::only($payload, [...self::FIELDS, 'currency']);
        $data['interval_count'] = $data['frequency'] === 'once' ? 1 : (int) $data['interval_count'];
        $data['anchor_day'] = CarbonImmutable::parse($data['next_due_on'])->day;

        return PaymentPlan::create($data);
    }

    public function update(Model $record, array $payload, User $user): Model
    {
        Gate::forUser($user)->authorize('update', $record);

        $data = Arr::only($payload, self::FIELDS);
        $data['interval_count'] = $data['frequency'] === 'once' ? 1 : (int) $data['interval_count'];
        $data['anchor_day'] = CarbonImmutable::parse($data['next_due_on'])->day;
        $record->update($data);

        return $record->refresh();
    }

    public function archive(Model $record, User $user): void
    {
        Gate::forUser($user)->authorize('update', $record);

        $record->update(['active' => false]);
    }

    public function restore(Model $record, User $user): Model
    {
        Gate::forUser($user)->authorize('update', $record);

        if ($record->frequency === 'once' && PaymentRecord::query()->where('payment_plan_id', $record->id)->exists()) {
            throw ValidationException::withMessages(['record' => ['A one-time payment that was already recorded cannot be resumed.']]);
        }

        $record->update(['active' => true]);

        return $record->refresh();
    }

    public function label(Model $record): string
    {
        return trim("{$record->title} ({$record->direction} {$record->amount} {$record->frequency})");
    }

    public function snapshot(Model $record): array
    {
        return [
            'id' => $record->getKey(),
            ...Arr::only($record->getAttributes(), ['title', 'direction', 'currency', 'frequency', 'interval_count', 'reminder_days', 'counterparty']),
            'amount' => (string) $record->amount,
            'next_due_on' => $record->next_due_on?->toDateString(),
            'archived' => ! $record->active,
        ];
    }
}
