<?php

namespace App\Services\AI\Records;

use App\Models\User;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;

/**
 * One business entity the chat may create, update, archive or restore.
 * Every write goes through the entity's existing domain actions, so the
 * assistant gets the same validation side effects and events as the UI.
 */
interface AiRecordEntity
{
    /** Stable key used in tool names, e.g. `party` gives `party_create`. */
    public function key(): string;

    /**
     * Field name => short hint, shown to the model in the tool schema.
     *
     * @return array<string, string>
     */
    public function fieldHints(): array;

    /** @return list<string> */
    public function allowedFields(): array;

    /**
     * Normalize raw model-provided values (trim, case, empty to null).
     *
     * @param  array<string, mixed>  $input
     * @return array<string, mixed>
     */
    public function normalize(array $input): array;

    /**
     * Validate a full payload. For an update, `$existing` is the record being
     * changed and `$changes` are merged over its current values first.
     *
     * @param  array<string, mixed>  $changes
     * @return array{errors: array<string, list<string>>, payload: array<string, mixed>}
     */
    public function validate(array $changes, ?Model $existing): array;

    /**
     * Records that already look like this payload. `hard` matches on a
     * unique key (never created); `soft` matches on the name only.
     *
     * @param  array<string, mixed>  $payload
     * @return list<array{record: Model, level: 'hard'|'soft'}>
     */
    public function duplicates(array $payload, ?Model $except): array;

    /**
     * Records matching a free-text lookup: exact matches first, otherwise
     * partial matches, capped at six.
     *
     * @return Collection<int, Model>
     */
    public function candidates(string $lookup, bool $onlyTrashed): Collection;

    public function find(int $id, bool $onlyTrashed): ?Model;

    /** @param array<string, mixed> $payload */
    public function create(array $payload, User $user): Model;

    /** @param array<string, mixed> $payload */
    public function update(Model $record, array $payload, User $user): Model;

    public function archive(Model $record, User $user): void;

    public function restore(Model $record, User $user): Model;

    public function label(Model $record): string;

    /** @return array<string, mixed> */
    public function snapshot(Model $record): array;
}
