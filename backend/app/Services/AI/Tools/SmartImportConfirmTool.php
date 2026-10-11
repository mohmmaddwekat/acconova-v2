<?php

namespace App\Services\AI\Tools;

use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportDestinationCatalog;
use App\Services\Workspace\WorkspaceFeaturePermissions;
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
        $draft = AiImportDraft::query()
            ->where('user_id', $user->id)
            ->findOrFail((int) $arguments['draft_id']);

        if ($draft->status !== AiImportDraft::STATUS_DRAFT || $draft->target_entity === null) {
            throw new RuntimeException(
                'Only drafts still in "draft" status with a resolved target entity can be confirmed.',
            );
        }

        $entity = $this->catalog->find($draft->target_entity);

        if ($entity === null) {
            throw new RuntimeException("Unknown import destination: {$draft->target_entity}.");
        }

        // Re-checked defensively: `allowed()` gates registry dispatch, but
        // `execute()` can be invoked directly, and zero rows must ever be
        // written without both the generic AI write permission and the
        // target entity's own permission.
        if (
            ! WorkspaceFeaturePermissions::allows($user, 'ai.business_data.write')
            || ! WorkspaceFeaturePermissions::allows($user, $entity->requiredPermission())
        ) {
            throw new RuntimeException('You do not have permission to commit this import.');
        }

        $fieldMapping = (array) $draft->field_mapping;

        $rows = collect((array) $draft->extracted_rows)
            ->map(fn (array $row): array => $this->remapRow($row, $fieldMapping));

        $result = $entity->commit($rows);

        $draft->status = AiImportDraft::STATUS_COMMITTED;
        $draft->commit_summary = $result;
        $draft->save();

        return $result;
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
