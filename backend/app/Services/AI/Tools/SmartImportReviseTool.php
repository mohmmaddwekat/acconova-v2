<?php

namespace App\Services\AI\Tools;

use App\Models\AiImportDraft;
use App\Models\User;
use App\Services\AI\Contracts\AiWriteTool;
use App\Services\AI\Import\ImportClassifier;
use App\Services\Workspace\WorkspaceFeaturePermissions;
use RuntimeException;

/**
 * Re-classifies a previously proposed `AiImportDraft` using a user-supplied
 * correction instruction (e.g. "actually these are products"), overwriting
 * the draft's target entity and field mapping with the new classification.
 * Only drafts still in `draft` status may be revised — once committed or
 * cancelled, a draft is no longer editable.
 */
final class SmartImportReviseTool implements AiWriteTool
{
    public function __construct(
        private readonly ImportClassifier $classifier,
    ) {}

    public function name(): string
    {
        return 'smart_import_revise';
    }

    public function description(): string
    {
        return 'Re-classify a previously proposed smart-import draft using a correction '.
            "instruction, updating the draft's proposed target entity and field mapping.";
    }

    public function inputSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'draft_id' => [
                    'type' => 'integer',
                    'description' => 'The id of the AiImportDraft to revise.',
                ],
                'instruction' => [
                    'type' => 'string',
                    'description' => 'The user-supplied correction instruction describing what the uploaded data actually represents.',
                ],
            ],
            'required' => ['draft_id', 'instruction'],
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

        if ($draft->status !== AiImportDraft::STATUS_DRAFT) {
            throw new RuntimeException('Only drafts still in "draft" status can be revised.');
        }

        $classification = $this->classifier->classify(
            $user,
            $draft,
            (string) $arguments['instruction'],
        );

        $draft->target_entity = $classification['target_entity'];
        $draft->field_mapping = $classification['field_mapping'];
        $draft->ai_notes = $classification['notes'];
        $draft->save();

        $rows = (array) $draft->extracted_rows;

        return [
            'draft_id' => $draft->id,
            'target_entity' => $draft->target_entity,
            'sample_rows' => array_slice($rows, 0, 5),
            'row_count' => count($rows),
            'notes' => $draft->ai_notes,
        ];
    }
}
