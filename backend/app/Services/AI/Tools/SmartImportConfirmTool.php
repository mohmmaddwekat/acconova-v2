<?php

namespace App\Services\AI\Tools;

use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Commits a previously proposed `AiImportDraft` to its classified target
 * entity. This is the only AI tool that writes real business data, so it
 * re-checks both the generic AI write permission and the target entity's
 * own permission immediately before calling `commit()`, and only ever
 * touches the database through that entity's existing domain import action.
 */
final class SmartImportConfirmTool implements AiWriteTool
{
    public function __construct(
        private readonly ImportDestinationCatalog $catalog,
    ) {}

    public function name(): string
    {
        return 'smart_import_confirm';
    }

    public function description(): string
    {
        return 'Commit a previously proposed smart-import draft, writing its rows to the '.
            'classified target entity.';
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'draft_id' => [
                    'type' => 'integer',
                    'description' => 'The id of the AiImportDraft to confirm.',
                ],
            ],
            'required' => ['draft_id'],
            'additionalProperties' => false,
        ];
    }

    public function allowed(User $user): bool
    {
        return WorkspaceFeaturePermissions::allows(
            $user,
            'ai.business_data.write',
        );
    }

    public function execute(User $user, array $arguments): array
    {
        $draftId = (int) $arguments['draft_id'];

        // Fast-path rejection only (draft missing, wrong owner, already
        // finalized): cheap enough to fail before opening a transaction,
        // but nothing here determines WHAT gets written or WHETHER it is
        // permitted — all of that is re-derived from the locked reload
        // below, because this unlocked draft can go stale (e.g. a
        // concurrent `smart_import_revise` changing its `target_entity`
        // or `field_mapping`) before the lock is acquired.
        $draft = AiImportDraft::query()
            ->where('user_id', $user->id)
            ->findOrFail($draftId);

        $this->guardDraftIsConfirmable($draft);

        return DB::transaction(function () use ($user, $draftId): array {
            /*
             * Everything that decides what gets written or whether it's
             * permitted — the target entity, both permission checks, and
             * the field mapping — is derived fresh from this locked
             * reload, never from the unlocked `$draft` above. Locking the
             * row for the duration of this transaction also serializes
             * concurrent confirms of the same draft: a second caller that
             * passed the fast-path check above before the first caller's
             * commit lands will see the now-`committed` status once it
             * acquires the lock here and reject instead of importing a
             * second time. It also means a failed `save()` after a
             * successful `commit()` rolls the entity's write back too, so
             * a retry can never double-import. This is independent of
             * (and does not duplicate) the transaction the target
             * entity's own `commit()` already wraps its row writes in.
             */
            $lockedDraft = AiImportDraft::query()
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->findOrFail($draftId);

            $this->guardDraftIsConfirmable($lockedDraft);

            $entity = $this->catalog->find($lockedDraft->target_entity);

            if ($entity === null) {
                throw new RuntimeException("Unknown import destination: {$lockedDraft->target_entity}.");
            }

            // Re-checked defensively: `allowed()` gates registry dispatch,
            // but `execute()` can be invoked directly, and zero rows must
            // ever be written without both the generic AI write
            // permission and the target entity's own permission.
            if (
                ! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.write')
                || ! WorkspaceFeaturePermissions::allows($user, $entity->requiredPermission())
            ) {
                throw new RuntimeException('You do not have permission to commit this import.');
            }

            $fieldMapping = (array) $lockedDraft->field_mapping;

            $rows = collect((array) $lockedDraft->extracted_rows)
                ->map(fn (array $row): array => $this->remapRow($row, $fieldMapping));

            $result = $entity->commit($rows);

            $lockedDraft->status = AiImportDraft::STATUS_COMMITTED;
            $lockedDraft->commit_summary = $result;
            $lockedDraft->save();

            return $result;
        });
    }

    /**
     * Only a draft still in "draft" status with a resolved target entity
     * may be confirmed. Shared by the initial (unlocked) check and the
     * re-check made under `lockForUpdate` immediately before committing.
     */
    private function guardDraftIsConfirmable(AiImportDraft $draft): void
    {
        if ($draft->status !== AiImportDraft::STATUS_DRAFT || $draft->target_entity === null) {
            throw new RuntimeException(
                'Only drafts still in "draft" status with a resolved target entity can be confirmed.',
            );
        }
    }

    /**
     * Translate one source-file row into the target entity's field
     * contract: `$fieldMapping` maps source column name -> target field
     * name, so only mapped columns reach `commit()`, keyed by the target
     * name rather than the original source column name.
     *
     * @param  array<string, mixed>  $row
     * @param  array<string, string>  $fieldMapping
     * @return array<string, mixed>
     */
    private function remapRow(array $row, array $fieldMapping): array
    {
        $remapped = [];

        foreach ($fieldMapping as $sourceColumn => $targetField) {
            if (array_key_exists($sourceColumn, $row)) {
                $remapped[$targetField] = $row[$sourceColumn];
            }
        }

        return $remapped;
    }
}
