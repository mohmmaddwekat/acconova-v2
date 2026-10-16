<?php

namespace App\Services\AI\Records;

use App\Actions\Parties\CreateParty;
use App\Actions\Parties\DeleteParty;
use App\Actions\Parties\RestoreParty;
use App\Actions\Parties\UpdateParty;
use App\Enums\PartyRole;
use App\Enums\PartyType;
use App\Models\Party;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Arr;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

final class PartyRecords implements AiRecordEntity
{
    private const FIELDS = [
        'type', 'name', 'company_name', 'email', 'phone', 'tax_number', 'address_line_1',
        'address_line_2', 'city', 'state', 'postal_code', 'country_code', 'roles',
    ];

    public function __construct(
        private readonly CreateParty $createParty,
        private readonly UpdateParty $updateParty,
        private readonly DeleteParty $deleteParty,
        private readonly RestoreParty $restoreParty,
    ) {}

    public function key(): string
    {
        return 'party';
    }

    public function fieldHints(): array
    {
        return [
            'type' => 'person, company or other',
            'name' => 'required for person/other',
            'company_name' => 'required for company',
            'email' => 'unique per workspace',
            'phone' => 'text',
            'tax_number' => 'text',
            'roles' => 'list of customer, supplier, contact',
            'country_code' => '2-letter code',
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
            if ($field === 'roles') {
                $roles = is_array($value) ? $value : preg_split('/[;,|]+/', (string) $value, -1, PREG_SPLIT_NO_EMPTY);
                $out[$field] = collect($roles ?: [])->map(fn ($role): string => strtolower(trim((string) $role)))->filter()->unique()->values()->all();

                continue;
            }

            $text = $value === null ? '' : trim((string) $value);
            $out[$field] = $text === '' ? null : match ($field) {
                'type' => strtolower($text),
                'email' => strtolower($text),
                'country_code' => strtoupper($text),
                default => $text,
            };
        }

        return $out;
    }

    public function validate(array $changes, ?Model $existing): array
    {
        $payload = $changes;

        if ($existing instanceof Party) {
            $current = Arr::only($existing->getAttributes(), array_diff(self::FIELDS, ['roles']));
            $current['roles'] = $existing->roles()->get()->map(fn ($role): string => $role->role->value)->all();

            if (isset($changes['type']) && $changes['type'] !== $existing->getRawOriginal('type')) {
                $current['name'] = null;
                $current['company_name'] = null;
            }

            $payload = [...$current, ...$changes];
        }

        $validator = Validator::make($payload, [
            'type' => ['required', Rule::enum(PartyType::class)],
            'name' => ['nullable', 'string', 'max:255', 'required_if:type,person,other', 'prohibited_if:type,company'],
            'company_name' => ['nullable', 'string', 'max:255', 'required_if:type,company', 'prohibited_if:type,person,other'],
            'email' => ['nullable', 'email', 'max:255'],
            'phone' => ['nullable', 'string', 'max:50'],
            'tax_number' => ['nullable', 'string', 'max:100'],
            'address_line_1' => ['nullable', 'string', 'max:255'],
            'address_line_2' => ['nullable', 'string', 'max:255'],
            'city' => ['nullable', 'string', 'max:100'],
            'state' => ['nullable', 'string', 'max:100'],
            'postal_code' => ['nullable', 'string', 'max:30'],
            'country_code' => ['nullable', 'string', 'size:2'],
            'roles' => ['required', 'array', 'min:1', 'max:3'],
            'roles.*' => ['required', 'distinct', Rule::enum(PartyRole::class)],
        ]);

        return ['errors' => $validator->errors()->toArray(), 'payload' => $payload];
    }

    public function duplicates(array $payload, ?Model $except): array
    {
        $found = [];
        $ignore = fn (Builder $query) => $except ? $query->whereKeyNot($except->getKey()) : $query;

        if (! empty($payload['email'])) {
            $match = $ignore(Party::query()->withTrashed()->where('email', $payload['email']))->first();

            if ($match) {
                $found[] = ['record' => $match, 'level' => 'hard'];
            }
        }

        $name = $payload['name'] ?? $payload['company_name'] ?? null;

        if ($name !== null) {
            $soft = $ignore(Party::query()->withTrashed()->where(fn ($query) => $query
                ->whereRaw('LOWER(name) = ?', [mb_strtolower($name)])
                ->orWhereRaw('LOWER(company_name) = ?', [mb_strtolower($name)])))->limit(3)->get();

            foreach ($soft as $match) {
                if (! collect($found)->contains(fn (array $hit): bool => $hit['record']->is($match))) {
                    $found[] = ['record' => $match, 'level' => 'soft'];
                }
            }
        }

        return $found;
    }

    public function candidates(string $lookup, bool $onlyTrashed): Collection
    {
        $base = fn () => $onlyTrashed ? Party::onlyTrashed() : Party::query();
        $needle = mb_strtolower(trim($lookup));

        $exact = $base()->where(fn ($query) => $query
            ->where('email', $needle)
            ->orWhere('phone', trim($lookup))
            ->orWhereRaw('LOWER(name) = ?', [$needle])
            ->orWhereRaw('LOWER(company_name) = ?', [$needle]))->limit(6)->get();

        if ($exact->isNotEmpty()) {
            return $exact;
        }

        $like = '%'.str_replace(['%', '_'], ['\\%', '\\_'], $needle).'%';

        return $base()->where(fn ($query) => $query
            ->whereRaw('LOWER(name) LIKE ?', [$like])
            ->orWhereRaw('LOWER(company_name) LIKE ?', [$like])
            ->orWhereRaw('LOWER(email) LIKE ?', [$like]))->limit(6)->get();
    }

    public function find(int $id, bool $onlyTrashed): ?Model
    {
        return ($onlyTrashed ? Party::onlyTrashed() : Party::query())->find($id);
    }

    public function create(array $payload, User $user): Model
    {
        return $this->createParty->execute(Arr::only($payload, self::FIELDS));
    }

    public function update(Model $record, array $payload, User $user): Model
    {
        return $this->updateParty->execute($record, Arr::only($payload, self::FIELDS));
    }

    public function archive(Model $record, User $user): void
    {
        $this->deleteParty->execute($record);
    }

    public function restore(Model $record, User $user): Model
    {
        return $this->restoreParty->execute($record);
    }

    public function label(Model $record): string
    {
        $name = $record->name ?: $record->company_name;

        return trim($name.($record->email ? " <{$record->email}>" : ''));
    }

    public function snapshot(Model $record): array
    {
        return [
            'id' => $record->getKey(),
            ...Arr::only($record->getAttributes(), ['type', 'name', 'company_name', 'email', 'phone', 'tax_number', 'city', 'country_code']),
            'roles' => $record->roles()->get()->map(fn ($role): string => $role->role->value)->all(),
            'archived' => $record->trashed(),
        ];
    }
}
