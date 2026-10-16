<?php

namespace App\Services\AI\Tools;

use App\Enums\WriteActionSeverity;
use App\Models\AiConversation;
use App\Models\User;
use App\Services\AI\AiActionMatrix;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Records\AiRecordEntity;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Collection;
use RuntimeException;

/**
 * Create, update, archive or restore one record of an `AiRecordEntity`.
 *
 * Contract with the model:
 *  - the server re-checks the matrix permissions on every call;
 *  - the record is identified by `record_id` or an exact `lookup`; a lookup
 *    that matches several records returns `needs_clarification` with the
 *    candidates and changes nothing;
 *  - invalid or duplicate data returns a structured result and changes
 *    nothing; only a `created` / `updated` / `archived` / `restored`
 *    status means a write happened.
 *
 * Deletion is archive-only: there is deliberately no permanent-delete tool.
 */
abstract class RecordWriteTool implements AiWriteTool
{
    abstract protected function entity(): AiRecordEntity;

    /** @return 'create'|'update'|'archive'|'restore' */
    abstract protected function operation(): string;

    public function name(): string
    {
        return $this->entity()->key().'_'.$this->operation();
    }

    public function description(): string
    {
        $key = $this->entity()->key();

        return match ($this->operation()) {
            'create' => "Create one {$key} record. Call only when the user asked to add it, with the values they gave. ".
                'If required values are missing, ask the user instead of guessing. A duplicate is reported, never created silently.',
            'update' => "Change fields of one existing {$key} record. Identify it with record_id or an exact lookup; ".
                'if several match you receive candidates and must ask the user which one.',
            'archive' => "Archive (soft-delete) one {$key} record; it can be restored. Call only on an explicit request to ".
                'delete or archive. Never guess the record: if several match, ask the user which one.',
            default => "Restore one archived {$key} record. Identify it with record_id or an exact lookup.",
        };
    }

    public function inputSchema(): array
    {
        $fields = [
            'type' => 'object',
            'description' => 'Field values. Allowed: '.implode(', ', array_map(
                fn (string $field, string $hint): string => "{$field} ({$hint})",
                array_keys($this->entity()->fieldHints()),
                $this->entity()->fieldHints(),
            )),
        ];

        $identify = [
            'record_id' => ['type' => 'integer', 'description' => 'Exact id when known.'],
            'lookup' => ['type' => 'string', 'description' => 'Exact name, email, phone or sku to find the record.'],
        ];

        return match ($this->operation()) {
            'create' => [
                'type' => 'object',
                'properties' => [
                    'fields' => $fields,
                    'allow_duplicate' => ['type' => 'boolean', 'description' => 'Only after the user confirmed a same-name record may be duplicated.'],
                ],
                'required' => ['fields'],
                'additionalProperties' => false,
            ],
            'update' => [
                'type' => 'object',
                'properties' => [...$identify, 'changes' => $fields],
                'required' => ['changes'],
                'additionalProperties' => false,
            ],
            default => [
                'type' => 'object',
                'properties' => $identify,
                'additionalProperties' => false,
            ],
        };
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows($user, 'ai.business_data.write');
    }

    public function severity(): WriteActionSeverity
    {
        return $this->operation() === 'archive'
            ? WriteActionSeverity::Destructive
            : WriteActionSeverity::Standard;
    }

    public function execute(User $user, array $arguments, AiConversation $conversation): array
    {
        if (! AiActionMatrix::userMayRun($user, $this->name())) {
            throw new RuntimeException('You do not have permission to perform this action.');
        }

        return $this->operation() === 'create'
            ? $this->create($user, $arguments)
            : $this->changeExisting($user, $arguments);
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    private function create(User $user, array $arguments): array
    {
        $entity = $this->entity();
        $payload = $entity->normalize((array) ($arguments['fields'] ?? []));

        if ($unknown = $this->unknownFields((array) ($arguments['fields'] ?? []))) {
            return $this->invalid(['fields' => ['Unknown fields: '.implode(', ', $unknown)]]);
        }

        $checked = $entity->validate($payload, null);

        if ($checked['errors'] !== []) {
            return $this->invalid($checked['errors']);
        }

        $duplicates = $entity->duplicates($checked['payload'], null);
        $hard = array_filter($duplicates, fn (array $hit): bool => $hit['level'] === 'hard');

        if ($hard !== [] || ($duplicates !== [] && empty($arguments['allow_duplicate']))) {
            return [
                'status' => 'duplicate',
                'message' => $hard !== []
                    ? 'A record with the same unique value already exists; nothing was created.'
                    : 'A record with the same name exists. Ask the user whether to create another one anyway.',
                'existing' => array_map(fn (array $hit): array => $this->candidate($hit['record']), $duplicates),
            ];
        }

        $record = $entity->create($checked['payload'], $user);
        $after = $entity->snapshot($record);

        return ['status' => 'created', 'record' => $after, 'audit' => ['before' => null, 'after' => $after]];
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return array<string, mixed>
     */
    private function changeExisting(User $user, array $arguments): array
    {
        $entity = $this->entity();
        $resolved = $this->resolve($arguments);

        if (! $resolved instanceof Model) {
            return $resolved;
        }

        $before = $entity->snapshot($resolved);

        if ($this->operation() === 'archive') {
            $entity->archive($resolved, $user);
            $after = ['id' => $before['id'], 'archived' => true];

            return ['status' => 'archived', 'record' => $entity->label($resolved), 'audit' => ['before' => $before, 'after' => $after]];
        }

        if ($this->operation() === 'restore') {
            $restored = $entity->restore($resolved, $user);
            $after = $entity->snapshot($restored);

            return ['status' => 'restored', 'record' => $after, 'audit' => ['before' => $before, 'after' => $after]];
        }

        $rawChanges = (array) ($arguments['changes'] ?? []);

        if ($rawChanges === []) {
            return $this->invalid(['changes' => ['Provide at least one field to change.']]);
        }

        if ($unknown = $this->unknownFields($rawChanges)) {
            return $this->invalid(['changes' => ['Unknown fields: '.implode(', ', $unknown)]]);
        }

        $changes = $entity->normalize($rawChanges);
        $checked = $entity->validate($changes, $resolved);

        if ($checked['errors'] !== []) {
            return $this->invalid($checked['errors']);
        }

        $hard = array_filter($entity->duplicates($checked['payload'], $resolved), fn (array $hit): bool => $hit['level'] === 'hard');

        if ($hard !== []) {
            return [
                'status' => 'duplicate',
                'message' => 'Another record already uses that unique value; nothing was changed.',
                'existing' => array_map(fn (array $hit): array => $this->candidate($hit['record']), array_values($hard)),
            ];
        }

        $updated = $entity->update($resolved, $checked['payload'], $user);
        $after = $entity->snapshot($updated);

        return ['status' => 'updated', 'record' => $after, 'audit' => ['before' => $before, 'after' => $after]];
    }

    /**
     * @param  array<string, mixed>  $arguments
     * @return Model|array<string, mixed>
     */
    private function resolve(array $arguments): Model|array
    {
        $entity = $this->entity();
        $onlyTrashed = $this->operation() === 'restore';

        if (! empty($arguments['record_id'])) {
            $record = $entity->find((int) $arguments['record_id'], $onlyTrashed);

            return $record ?? ['status' => 'not_found', 'message' => 'No matching record in this workspace; nothing was changed.'];
        }

        $lookup = trim((string) ($arguments['lookup'] ?? ''));

        if ($lookup === '') {
            return ['status' => 'needs_clarification', 'message' => 'Which record? Provide record_id or an exact name, email, phone or sku.', 'candidates' => []];
        }

        /** @var Collection<int, Model> $matches */
        $matches = $entity->candidates($lookup, $onlyTrashed);

        return match ($matches->count()) {
            0 => ['status' => 'not_found', 'message' => 'No record matches that lookup; nothing was changed.'],
            1 => $matches->first(),
            default => [
                'status' => 'needs_clarification',
                'message' => 'Several records match. Ask the user which one, then call again with its record_id.',
                'candidates' => $matches->map(fn (Model $record): array => $this->candidate($record))->all(),
            ],
        };
    }

    /**
     * @param  array<string, mixed>  $fields
     * @return list<string>
     */
    private function unknownFields(array $fields): array
    {
        return array_values(array_diff(array_keys($fields), $this->entity()->allowedFields()));
    }

    /**
     * @param  array<string, list<string>>  $errors
     * @return array<string, mixed>
     */
    private function invalid(array $errors): array
    {
        return ['status' => 'invalid', 'errors' => $errors, 'message' => 'Nothing was changed. Ask the user to correct the values.'];
    }

    /**
     * @return array{id: mixed, label: string}
     */
    private function candidate(Model $record): array
    {
        return ['id' => $record->getKey(), 'label' => $this->entity()->label($record)];
    }
}
